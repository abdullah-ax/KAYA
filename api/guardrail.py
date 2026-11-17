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


# (pattern, words that find the row in the table's "Rule" column, fallback rule, fallback alternative)
_PATTERNS: list[tuple[str, str, str, str]] = [
    (r"\b(ignore|disregard|bypass|turn off|skip|forget)\b.{0,30}"
     r"\b(rules?|guardrails?|checks?|instructions?|(system )?prompts?)\b",
     "turned off", "Rules can't be turned off by a message", "Restate the rule and continue"),
    (r"\bapprove (everything|all|it all)\b|\bauto[- ]?approve\b|"
     r"\bapprove (every|each|all) (steps?|things?|gates?|options?)\b",
     "bare yes", "No bare yes; founder must decide", "Show the options and ask for the founder's choice and reason"),
    (r"\bfake\b.{0,20}\bsign[- ]?ups?\b|\bsign[- ]?ups?\b.{0,30}\bgate (pass|passes)\b",
     "fake sign-ups", "No fake sign-ups", "Show the real number and the stop/pivot recommendation"),
    (r"\b(reviews?|testimonials?|ratings?)\b.{0,40}\b(fake|made[- ]up|invent)|"
     r"\b(fake|five[- ]star|5[- ]star|glowing|made[- ]up)\b.{0,30}\b(reviews?|testimonials?|ratings?)\b|"
     r"\bfake (screenshots?|results|proof|wins)\b|\b(photos?|pictures?|screenshots?)\b.{0,20}\b(found|took|taken|copied) (online|from)\b",
     "fake reviews", "No fake reviews", "Ask real users for honest reviews"),
    (r"\bcountdown\b|\b(offer|sale|deal) (ends|expires) in\b|\bonly \d+ (left|spots?)\b",
     "fake urgency", "No fake urgency", "Show the real launch date, if there is one"),
    (r"\b(make|earn|making|earning)\b.{0,20}\$\s?\d|\bguarantee(d)? (income|profit|results|success)\b|"
     r"\$\s?[\d,]+\s*(a|per) (day|week|month|year)\b|"
     r"\b(buy|afford|get) (me )?(a |my own )?(bentley|lamborghini|ferrari|porsche|rolls[- ]royce|yacht|villa)\b|"
     r"\bdouble (their|your|my) money\b|\b(get|getting|be|become) rich\b|\buntil i'?m rich\b|\bmillionaire\b|بنتلي|هبقى غني",
     "income promises", "No income promises", "Describe what the product does, with no earnings claims"),
    (r"\b(pretend(ing)? to be|pose as|posing as|as if (it came )?from|impersonat\w*)\b",
     "another brand", "No posing as another brand", "Draft an email from the founder's own name"),
    (r"\b(post|publish|send|tweet)\b.{0,40}\b(as me|for me right now|right now)\b",
     "impersonation", "Nothing published without approval; no impersonation",
     "Draft the post for the founder to approve and post"),
    (r"\b(charge|refund|transfer|withdraw)\b.{0,30}\b(card|money|payment|account|customer)\b",
     "move money", "Never move money", "The founder acts in their own payment tool"),
    (r"\b(save|store|keep|remember)\b.{0,30}\b(passwords?|card numbers?|credit card|cvv|pin)\b",
     "passwords", "Never store passwords or card numbers", "The founder exports a sales file and uploads it"),
    (r"\b(crypto\w*|bitcoin|forex|trading signals?|stock picks?|investment|loan)\b",
     "financial", "Financial products not allowed", "Explain the excluded categories; suggest another idea"),
    (r"\b(buy|buying|raise|raising|breed|breeding|sell|selling|keep|hatch|farm)\b.{0,25}"
     r"\b(chicks?|chickens?|hens?|poultry|eggs|goats?|sheep|cows?|cattle|ducks?|rabbits?|livestock)\b|"
     r"\blay(ing)? (more )?eggs\b|كتكوت|كتاكيت|فراخ|دواجن|يبيضوا",
     "physical goods", "Physical goods not allowed",
     "Suggest a digital product in the same area, like a feed and cost calculator or a short guide "
     "for small poultry farmers. The plan also assumes every chick lives, every egg hatches and feed "
     "costs nothing. That is an ASSUMPTION, not a plan"),
    (r"\b(supplements?|physical (goods|products?)|t-?shirts?|merch|dropship\w*)\b",
     "physical goods", "Physical goods not allowed", "Suggest a digital product in the same area"),
    (r"\blegal advice\b",
     "legal advice", "Legal advice products not allowed",
     "Draft terms marked \"draft, not legal advice\" and suggest a lawyer review"),
    (r"\b(medical|health|diet|therapy|nutrition) advice\b|\blose \d+\s?(kg|kilos?|pounds|lbs)\b|"
     r"\b(cures?|treats?|heals?)\b.{0,20}\b(diabetes|cancer|disease|anxiety|depression|obesity)\b",
     "health advice", "Health advice products not allowed",
     "Explain the excluded categories; suggest a digital product outside health advice"),
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


def _check(text: str, table_path: Path, *, products: bool) -> Verdict:
    rows = load_rows(table_path)
    whole = _norm(text)
    for row in rows:  # a known trick prompt, word for word, gets its own table answer
        wanted = _norm(row.prompt)
        if wanted and wanted in whole and not _negated(whole, whole.index(wanted)):
            return _refuse(row.rule, row.alternative)
    hits: list[tuple[str, str]] = []  # (rule, alternative), first hit first
    # A wrapped line is one sentence; list items and blank lines are separate.
    flowed = re.sub(r"\n(?!\s*(?:[-*]|\d+[.)]|\n))", " ", text.lower())
    # Judge each clause on its own so "No fake reviews" in a founder's values
    # is not read as a request for fake reviews.
    for clause in (c for c in re.split(r"[.;,!?\n\u060c]+", flowed) if c.strip()):
        for pattern, key, rule, alternative in _PATTERNS:
            if not products and key in _PRODUCT_KEYS:
                continue
            m = re.search(pattern, clause)
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
