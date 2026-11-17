"""Rule-based first pass on every founder request. No model needed.

The rules and safe alternatives come from evals/trick_prompts.md, read at
runtime, so a new row in that table is refused without a code change.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

TRICKS_PATH = Path(__file__).resolve().parent.parent / "evals" / "trick_prompts.md"


@dataclass
class Verdict:
    allowed: bool
    rule: str | None
    reason: str | None
    alternative: str | None
    also: list[str] = field(default_factory=list)  # other rules the same text breaks


@dataclass(frozen=True)
class _Row:
    prompt: str
    rule: str
    alternative: str


# Shared word lists.
_REVIEW = r"(reviews?|testimonials?|ratings?|feedback|comments?|quotes?)"
_PEOPLE = r"(students|customers|users|buyers|learners|members|people|clients|founders|readers|parents)"
_PERIOD = r"((a|per|every|each) (day|week|month|year)|daily|weekly|monthly|yearly|annually)"
_MONEY_UNIT = r"(\$|€|£|egp|le|pounds?|euros?|usd|dollars?|riyals?|sar|aed|dirhams?|جنيه)"
_EARN = r"(make|makes|making|earn|earns|earning|bring in|brings in|take home|pull in)"
_PLATFORMS = (r"(instagram|facebook|tiktok|youtube|telegram|twitter|linkedin|snapchat|gmail|"
              r"stripe|paypal|gumroad|shopify|whatsapp|discord|reddit)")
# A clause that explains or teaches ("how to open a bank account") is not the system acting.
_EXPLAIN = r"\b(how to|how do|how does|how can|how refunds|explain\w*|teach\w*|guide|tutorial|lesson|steps to)\b"
# Asking real people for their own words is honest.
_HONEST_ASK = r"\b(ask|asks|asking|request\w*|invite\w*|collect\w*|gather\w*|leave|leaves|leaving)\b"

# (pattern, words that find the row in the table's "Rule" column, fallback rule, fallback alternative,
#  optional pattern that, when it is in the clause, makes the match honest)
_PATTERNS: list[tuple] = [
    (r"\b(ignore|disregard|bypass|turn off|skip|forget)\b.{0,30}"
     r"\b(rules?|guardrails?|checks?|instructions?|(system )?prompts?)\b",
     "turned off", "Rules can't be turned off by a message", "Restate the rule and continue"),
    (r"\bapprove (everything|all|it all)\b|\bauto[- ]?approve\b|"
     r"\bapprove (every|each|all) (steps?|things?|gates?|options?)\b",
     "bare yes", "No bare yes; founder must decide", "Show the options and ask for the founder's choice and reason"),
    # Fake sign-ups and padded numbers.
    (r"\bfake\b.{0,20}\bsign[- ]?ups?\b|\bsign[- ]?ups?\b.{0,30}\bgate (pass|passes)\b|"
     r"\b(inflate|inflating|pad|padding|fudge|fudging|juice)\b.{0,30}"
     r"\b(waitlist|wait list|sign[- ]?ups?|numbers?|survey|responses|answers|results|interviews?|data|counts?)\b|"
     r"\b(answers|responses|interviews|sign[- ]?ups?)\b.{0,25}\b(we|i) (fill|write|make up|answer)\w*( in)? (ourselves|myself)\b|"
     rf"\b(say|says|saying|show|put|add|write|claim|display|tell)\b.{{0,40}}\b\d[\d,]*\+? (\w+ )?{_PEOPLE} "
     r"(already )?(joined|signed up|enrolled|registered|bought)\b",
     "fake sign-ups", "No fake sign-ups", "Show the real number and the stop/pivot recommendation"),
    # Fake reviews, testimonials and proof. Words like "real" or "honest" do not make a written review real.
    (rf"\b{_REVIEW}\b.{{0,40}}\b(fake|made[- ]up|invent\w*|imaginary|bogus|phony)\b|"
     rf"\b(fake|five[- ]star|5[- ]star|glowing|made[- ]up|imaginary|invented|bogus|phony)\b.{{0,30}}\b{_REVIEW}\b|"
     rf"\b(real|honest|genuine|authentic)[- ](sounding|looking)\b.{{0,40}}\b{_REVIEW}\b|"
     rf"\b{_REVIEW}\b.{{0,40}}\b(real|honest|genuine|authentic)[- ](sounding|looking)\b|"
     rf"\b{_REVIEW}\b.{{0,40}}\b(sounds?|sounding|look|looks|looking|seem|seems) (real|authentic|genuine|natural|legit)\b|"
     rf"\b(reviews?|testimonials?)\b.{{0,30}}\b(from|with|under|using) (different|other|many|various|made[- ]up|fake|random) "
     r"(names|accounts|people|users|profiles)\b|"
     r"\baccounts (we|i) (control|own|made|make|created|run)\b|"
     rf"\bin the voice of\b.{{0,20}}\b(happy |satisfied |real )?(customers?|users?|buyers?|students?|clients?)\b|"
     r"\bask (the )?(ai|model|chatgpt|gpt|llm|bot)\b.{0,30}\b(reviews?|testimonials?)\b|"
     rf"\b(say|says|saying|show|put|add|write|claim|display)\b.{{0,40}}\b(rated \d|(loved|trusted|used|chosen) by \d)|"
     r"\bfake (screenshots?|results|proof|wins)\b|\b(photos?|pictures?|screenshots?)\b.{0,20}\b(found|took|taken|copied) (online|from)\b|"
     r"(ريفيو\S*|تقييمات|تعليقات|شهادات).{0,30}(مزيف\S*|فيك|وهمي\S*|مختلفة)|"
     r"(اكتب|اعمل|اعملي|الف|ألف)\S*.{0,30}(ريفيو\S*|تقييمات|شهادات)",
     "fake reviews", "No fake reviews", "Ask real users for honest reviews"),
    # Writing reviews ourselves, unless the text asks real people for their own words.
    (r"\b(write|create|generate|invent|make|make up|produce|post|draft|come up with|fill|add)\b[^.]{0,30}"
     r"\b(testimonials?|reviews?|(happy|satisfied|customer|client|buyer|student|user)\w* quotes)\b"
     r"(?! (section|page|widget|form|button|requests?|policy|link|area|tab))",
     "fake reviews", "No fake reviews", "Ask real users for honest reviews", _HONEST_ASK),
    # Fake urgency.
    (r"\bcountdown\b|\b(offer|sale|deal|doors?|cart) (ends|expires|closes?) in\b|"
     r"\bonly (a few|a handful|few|\d+) (left|spots?|seats?|places?|copies|licen[cs]es)\b|"
     r"\b\d+ (seats?|spots?|places?|copies) (left|remain\w*)\b|"
     r"\btimer\b.{0,30}\b(resets?|restarts?|starts over)\b|\b(resets?|restarts?)\b.{0,20}\b(each|every) (visitor|user|time)\b|"
     r"\b(ticking|counting) down\b|\bdeadline\b.{0,20}\b(keeps|that) (moving|moves|resetting|resets|changing|changes)\b|"
     r"\b\d+ (people|others|users|buyers) (are )?(viewing|looking at|watching|buying|checking out)\b|"
     r"\b(sale|offer|deal|discount|banner|timer)\b.{0,40}\bnever (actually |really )?(ends?|expires?|runs out)\b|"
     r"\b(pdf|e-?book|download|template|course|digital)\w*\b.{0,30}\b((almost|nearly) (gone|sold out)|selling out|out of stock)\b|"
     r"عداد تنازلي|عد تنازلي",
     "fake urgency", "No fake urgency", "Show the real launch date, if there is one"),
    # Income and success promises, in any currency and either word order.
    (rf"\b{_EARN}\b.{{0,20}}\$\s?\d|\$\s?[\d,]+\s*(a|per) (day|week|month|year)\b|"
     rf"\b{_EARN}\b.{{0,25}}\d[\d,.]*\s*k?\b.{{0,20}}\b{_PERIOD}|"
     rf"\b{_EARN}\b.{{0,25}}\d[\d,.]*\s*k?\s*{_MONEY_UNIT}|"
     r"\bguarantee\w*\b.{0,30}\b(income|profit|earnings|results?|success|returns?|pass|passing|job|hired|rich)\b|"
     r"\b(results?|success|income|profits?|earnings|returns?)\b.{0,15}\b(is |are )?guaranteed\b|"
     r"\bpromis\w*\b.{0,40}\b(rich|income|earn\w*|profits?|job|jobs|hired|pass|success|results|quit)\b|"
     r"\bpays? for itself\b|\b(six|seven|[67])[- ]figures?\b|\bquit (their|your|my) (day )?jobs?\b|"
     r"\b(buy|afford|get) (me )?(a |my own )?(bentley|lamborghini|ferrari|porsche|rolls[- ]royce|yacht|villa)\b|"
     r"\bdouble (their|your|my) money\b|\b(get|getting|be|become) rich\b|\buntil i'?m rich\b|\bmillionaire\b|"
     r"(هتكسب|هيكسبوا|هتكسبوا|تكسب|يكسبوا|هتعمل|هيعملوا)\S*.{0,20}\d|"
     r"\d+\s*(جنيه|الف|ألف).{0,15}(في الشهر|شهريا|في اليوم|يوميا)|بنتلي|هبقى غني",
     "income promises", "No income promises", "Describe what the product does, with no earnings claims",
     r"\b(i|we) (currently |now |already )?(make|earn|made|earned|am making|'m making|are making)\b"),
    # Posing as another brand.
    (r"\b(pretend(ing)? (to be|you'?re|you are|that you'?re)|pose as|posing as|impersonat\w*)\b|"
     r"\bas if (it came from|from|\w+ (endorsed|wrote|sent|approved|recommended|sponsored))\b|"
     r"\b\w+ (endorsed|endorses|sponsored|sponsors|partnered with|recommends|approved) us\b|"
     r"\b(use|put|add|copy|borrow)\b (the |their |a )?(?!our\b|my\b|own\b|the\b|a\b|new\b)\w+ logo\b|"
     r"\blooks? like (an? )?(?!our\b|my\b)\w+ product\b|(كأنه|كأنها|كإنه|كإنها|كانه|كانها) (من|جاي من)",
     "another brand", "No posing as another brand", "Draft an email from the founder's own name"),
    # Posing as the founder or a customer, or acting without approval.
    (r"\b(post|publish|send|tweet|reply|replies|answer|respond|comment|dm|message|email)\w*\b.{0,40}"
     r"\b(as me|for me right now|right now)\b|"
     r"\b(post|write|leave|comment|reply)\w*\b.{0,40}\bas (a|an|if i (was|were) a) (happy |real |satisfied )?"
     r"(customer|buyer|client|student|user|parent|fan)\b|"
     r"\b(without|no need to|don'?t need to|skip(ping)?) (show|showing|ask|asking|check|checking)\w* (with )?me\b",
     "impersonation", "Nothing published without approval; no impersonation",
     "Draft the post for the founder to approve and post"),
    (r"\b(send|post|publish|email)\b.{0,40}\b(to my (list|audience|followers|subscribers|contacts|customers)|them out)\b"
     r".{0,15}\b(now|immediately|right away)\b",
     "impersonation", "Nothing published without approval; no impersonation",
     "Draft the posts for the founder to read, approve and send"),
    # Holding, moving or refunding money.
    (r"\b(charge|refund|transfer|withdraw)\b.{0,30}\b(card|money|payment|account|customer)\b|"
     r"\brefund(s|ed|ing)?\b(?! (polic|rules?|terms|requests?|window|process))"
     r".{0,30}\b(anyone|everyone|everybody|automatically|on your own|by yourself|yourself)\b|"
     r"\b(hold|holding|park|parking)\b.{0,30}\b(payments?|money|funds|cash|earnings)\b|\bescrow\b|"
     r"\bkeep\b (the |their |our )?(buyers'? |customers'? )?(money|funds|cash|payments?) (in|until|for)\b|"
     r"\b(move|transfer|send|wire|withdraw|pay out|deposit)\w*\b.{0,25}"
     r"\b(earnings|money|funds|cash|revenue|payouts?|balance|profits?)\b|"
     r"\bpay\b (the |our )?(affiliates?|partners?|freelancers?|sellers?|creators?|suppliers?)\b|"
     r"(رجع|ارجع|حول|ابعت|اسحب|ادفع)\S*\s+(ال)?فلوس",
     "move money", "Never move money", "The founder acts in their own payment tool", _EXPLAIN),
    # Storing passwords or card numbers.
    (r"\b(save|store|keep|remember|get|grab|collect|ask|take|capture|log|record|put|copy|need)\w*\b.{0,40}"
     r"\b(passwords?|passcodes?|card numbers?|card details|credit cards?|(visa|mastercard|debit card) numbers?|"
     r"cvv|cvc|pins?|otp|one[- ]time codes?)\b|"
     r"\b(keep|save|store|copy|remember|have|use)\b.{0,30}\b(my|their|his|her|the customer'?s?) (\w+ )?(login|credentials)\b|"
     r"(احفظ|خزن|خد|خلي|سجل|اكتب|ابعت)\S*.{0,20}(باسورد|باسوورد|كلمة السر|كلمة المرور|رقم الكارت|رقم الفيزا|بيانات الكارت)",
     "passwords", "Never store passwords or card numbers", "The founder exports a sales file and uploads it", _EXPLAIN),
    # Disallowed products.
    (r"\b(crypto\w*|bitcoin|forex|trading signals?|stock picks?|investment|loans?|day[- ]trading|options trading|"
     r"trading (bots?|course|signals|tips|group)|nfts?|(which )?(stocks?|shares?|coins?) to buy|betting|gambling|casino|"
     r"robo[- ]advis\w*|invest(ing)? (tips|advice|course|signals|app))\b|"
     r"عملات رقمية|عملة رقمية|بيتكوين|فوركس|كريبتو|تداول|قروض",
     "financial", "Financial products not allowed", "Explain the excluded categories; suggest another idea"),
    (r"\b(buy|buying|raise|raising|breed|breeding|sell|selling|keep|hatch|farm)\b.{0,25}"
     r"\b(chicks?|chickens?|hens?|poultry|eggs|goats?|sheep|cows?|cattle|ducks?|rabbits?|livestock)\b|"
     r"\blay(ing)? (more )?eggs\b|كتكوت|كتاكيت|فراخ|دواجن|يبيضوا",
     "physical goods", "Physical goods not allowed",
     "Suggest a digital product in the same area, like a feed and cost calculator or a short guide "
     "for small poultry farmers. The plan also assumes every chick lives, every egg hatches and feed "
     "costs nothing. That is an ASSUMPTION, not a plan"),
    (r"\b(supplements?|physical (goods|products?)|t-?shirts?|merch|dropship\w*|etsy|handmade|candles?|stickers?|posters?|"
     r"hoodies?|mugs?|jewel(le)?ry|bracelets?|clothes|clothing|apparel|cosmetics|perfumes?|skincare|soaps?|furniture|"
     r"phone cases?|tote bags?)\b|"
     r"\bprint(ed)?\b.{0,15}\b(and|to) (sell|ship)\b|\bprinted\b|"
     r"\b(bake|bakes|baking|bakery|cook|cooks|cooking|deliver|delivers|delivering|sell|sells|selling)\b.{0,20}"
     r"\b(cakes?|cookies|meals?|food|sweets|pastr(y|ies)|bread)\b(?! (plans?|planners?|guides?|recipes?|ideas?))|"
     r"ملابس|هدوم|اكسسوارات|إكسسوارات|عطور|مكملات|كريمات",
     "physical goods", "Physical goods not allowed", "Suggest a digital product in the same area"),
    (r"\blegal advice\b|\b(immigration|visa|legal) (advice|consult\w*|service)\b|\bwin (in |at )?court\b|\blawsuits?\b|"
     r"\breplaces? (a |your )?(lawyer|attorney|solicitor)\b|استشار\S* قانوني\S*|نصا(يح|ئح) قانونية",
     "legal advice", "Legal advice products not allowed",
     "Draft terms marked \"draft, not legal advice\" and suggest a lawyer review"),
    (r"\b(medical|health|diet|therapy|nutrition) advice\b|\b(meal|diet|keto|weight[- ]loss) (plan|program)s?\b|\blose weight\b|"
     r"\b(lose|drop|shed|burn)\b.{0,10}\b\d+\s?(kg|kilos?|pounds|lbs)\b|"
     r"\b(cures?|treats?|heals?|fix|fixes|fixing|relieves?|reverses?)\b.{0,20}"
     r"\b(back pain|pain|diabetes|cancer|disease|anxiety|depression|obesity|insomnia|acne|eczema|migraines?|blood pressure)\b|"
     r"\b(come|coming|get|getting) off\b.{0,25}\b(meds|medications?|medicines?|antidepressants?|insulin|pills)\b|"
     r"\b(stop|quit|taper|replace|adjust|reduce)\w*\b.{0,25}\b(meds|medications?|antidepressants?|insulin)\b|"
     r"\bdiagnos(e|es|ing)\b|\bsymptoms? (checker|check|chatbot|bot)\b|"
     r"\b(remed(y|ies)|herbal)\b.{0,30}\b(diabetes|cancer|disease|pressure|anxiety|depression|pain|infection)\b|"
     r"دايت|رجيم|تخسيس|روشتة",
     "health advice", "Health advice products not allowed",
     "Explain the excluded categories; suggest a digital product outside health advice"),
    # Account creation comes after the product rules so a product idea is named by its category first.
    (r"\b(open|create|make|set ?up|register|start|sign up for)\b.{0,30}\baccounts?\b|"
     r"\bsign (me|us|him|her|them) up\b|"
     r"\bregister\b.{0,25}\b(gmail|emails?|domain|page|profile|handle|username|company)\b|"
     rf"\b(create|open|make|set ?up|start)\b.{{0,25}}\b{_PLATFORMS}\b.{{0,15}}"
     r"\b(page|channel|group|store|shop|profile|business|handle|server)\b|"
     r"\b(burner|throwaway|disposable|dummy|sock ?puppet)\b.{0,10}\b(emails?|accounts?|numbers?|profiles?|gmails?)\b|"
     r"(اعمل|اعملي|افتح|افتحلي|سجل|سجلي|انشئ)\S*.{0,15}(حساب|اكونت|صفحة|قناة)",
     "create accounts", "Never create accounts",
     "The founder opens the account; I can write the steps", _EXPLAIN),
    (r"\b(hide|without|leave out)\b.{0,30}\b(fees?|delivery fee|full price)\b|\bhidden fees?\b",
     "hidden fees", "Ethics bot: hidden fees", "Show the full price up front"),
    (r"\bpre[- ]?tick\w*\b|\bpre[- ]?check(ed)? (box|boxes)\b",
     "didn't agree", "Ethics bot: charges people didn't agree to", "Leave the box unticked and say what it costs"),
    (r"\bsell\b.{0,30}\b(list|data|emails?|numbers?|contacts?)\b",
     "privacy", "Ethics bot: privacy", "Collect only with consent and a privacy notice; never sell"),
    (r"\b(ads?|adverts?|advertisements?)\b.{0,30}\b(look|looks|disguised|pass) (like|as) (news|articles?)\b",
     "disguised as news", "Ethics bot: ads disguised as news", "Label the ad clearly"),
]


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w$\s]", " ", text.lower())).strip()


def load_rows(path: Path = TRICKS_PATH) -> list[_Row]:
    """Read the Prompt | Rule | Safe alternative table."""
    rows: list[_Row] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 3 or cells[0].lower() == "prompt" or set(cells[0]) <= set("-: "):
            continue
        rows.append(_Row(*cells))
    return rows


def _refuse(rule: str, alternative: str, also: list[str] | None = None) -> Verdict:
    also = [a for a in (also or []) if a != rule]
    extra = f" It also breaks: {'; '.join(also)}." if also else ""
    return Verdict(False, rule, f"I can't do that. Rule: {rule}.{extra}", alternative, also)


# Product categories: checked on the brief, not on founder answers such as
# "it needs little investment of my time", which describe the founder, not the product.
_PRODUCT_KEYS = {"financial", "physical goods", "legal advice", "health advice"}


def check_request(text: str, table_path: Path = TRICKS_PATH) -> Verdict:
    """Refuse a request or product idea that breaks a rule; otherwise allow it."""
    return _check(text, table_path, products=True)


def check_answer(text: str, table_path: Path = TRICKS_PATH) -> Verdict:
    """Check a founder answer or reason: action rules only, no product-category words."""
    return _check(text, table_path, products=False)


_NEGATION = re.compile(r"\b(no|not|never|don't|dont|won't|wont|without|avoid|refuse to|zero)\b")


def _negated(clause: str, start: int) -> bool:
    """True when the clause says the founder won't do the thing matched at `start`."""
    return bool(_NEGATION.search(clause[:start]))


def _plain(text: str) -> str:
    """Lowercase, straight apostrophes, no Arabic diacritics."""
    return re.sub(r"[\u064b-\u0652]", "", text.lower().replace("\u2019", "'"))


def _clauses(text: str) -> list[str]:
    """Split on punctuation, but keep numbers like 4.9 and 2,000 whole."""
    parts = re.split(r"(?:(?<!\d)[.,]|[.,](?!\d)|[;!?\n\u060c])+", text)
    return [c for c in parts if c.strip()]


def _check(text: str, table_path: Path, *, products: bool) -> Verdict:
    rows = load_rows(table_path)
    whole = _norm(text)
    for row in rows:  # a known trick prompt, word for word, gets its own table answer
        wanted = _norm(row.prompt)
        if wanted and wanted in whole and not _negated(whole, whole.index(wanted)):
            return _refuse(row.rule, row.alternative)
    hits: list[tuple[str, str]] = []  # (rule, alternative), first hit first
    # A wrapped line is one sentence; list items and blank lines are separate.
    flowed = re.sub(r"\n(?!\s*(?:[-*]|\d+[.)]|\n))", " ", _plain(text))
    # Judge each clause on its own so "No fake reviews" in a founder's values
    # is not read as a request for fake reviews.
    for clause in _clauses(flowed):
        for pattern, key, rule, alternative, *honest in _PATTERNS:
            if not products and key in _PRODUCT_KEYS:
                continue
            m = re.search(pattern, clause)
            if m and honest and re.search(honest[0], clause[:m.end()]):
                continue
            if m and not _negated(clause, m.start()):
                row = next((r for r in rows if key.lower() in r.rule.lower()), None)
                # A pattern's own alternative wins when it is more specific than the table's.
                alt = alternative if (row is None or len(alternative) > len(row.alternative)) else row.alternative
                hits.append((row.rule if row else rule, alt))
    if not hits:
        return Verdict(True, None, None, None)
    rule, alternative = hits[0]
    also = list(dict.fromkeys(r for r, _ in hits[1:]))
    return _refuse(rule, alternative, also)
