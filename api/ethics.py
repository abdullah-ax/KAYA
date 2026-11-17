"""Rule-based ethics check on drafts before the founder sees them.

Hard lines block and can't be overridden. Manipulative design asks for a fix.
Persuasion is fine; deception isn't.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

_BRANDS = (
    r"stripe|paypal|apple|google|amazon|microsoft|meta|facebook|instagram|whatsapp|"
    r"netflix|fawry|vodafone|instapay|gumroad|shopify"
)

# Words that make a brand name a speaker ("Stripe support"), not a place ("Google search").
_ROLE = r"(support|team|security|billing|help ?desk|customer service|staff|official)\b"

_EARN = r"(make|makes|making|earn|earns|earning|bring in|brings in|take home)"
_PERIOD = r"((a|per|every|each) (day|week|month|year)|daily|weekly|monthly|yearly|annually)"
_MONEY_UNIT = r"(\$|€|£|egp|le|pounds?|euros?|usd|dollars?|riyals?|sar|aed|dirhams?|جنيه)"
_PEOPLE = r"(students|customers|users|buyers|learners|members|people|clients|founders|readers|parents)"

# (pattern, issue text). Any match blocks.
_BLOCK: list[tuple[str, str]] = [
    (r"\b(fake|made[- ]up|invented)\b.{0,20}\b(reviews?|ratings?)\b|\breviews? (we|i) (wrote|made)\b",
     "Fake reviews: only real customers may review."),
    (r"\b(fake|made[- ]up|invented)\b.{0,20}\btestimonials?\b|\btestimonials? (we|i) (wrote|made)\b",
     "Fake testimonial: quote only real customers who agreed."),
    (r"\bcountdown\b|\b(offer|sale|deal) (ends|expires) in\b",
     "Fake countdown timer: show a real date or nothing."),
    (r"\b(make|earn|making|earning)\b.{0,25}\$\s?\d|\$\s?[\d,]+\s*(a|per) (day|week|month|year)\b|"
     rf"\b{_EARN}\b.{{0,25}}\d[\d,.]*\s*k?\b.{{0,20}}\b{_PERIOD}|\b{_EARN}\b.{{0,25}}\d[\d,.]*\s*k?\s*{_MONEY_UNIT}|"
     r"\bguarantee\w*\b.{0,30}\b(income|profit|earnings|results?|success|returns?|pass|passing|job|hired|rich)\b|"
     r"\b(results?|success|income|profits?|earnings|returns?)\b.{0,15}\b(is |are )?guaranteed\b|"
     r"\b(six|seven|[67])[- ]figures?\b|\bpays? for itself\b|\bquit (their|your|my) (day )?jobs?\b|"
     r"(هتكسب|هيكسبوا|هتكسبوا|تكسب|يكسبوا)\S*.{0,20}\d|\d+\s*(جنيه|الف|ألف).{0,15}(في الشهر|شهريا|في اليوم|يوميا)",
     "Income promise: describe what the product does, with no earnings claims."),
    (rf"\bthis is (the )?({_BRANDS}) {_ROLE}|\bon behalf of (the )?({_BRANDS})\b|"
     rf"\b(i am|i'm|we are|we're) (the )?({_BRANDS}) {_ROLE}|"
     rf"\b(sent|message|email|notice|alert)s? from (the )?({_BRANDS}) {_ROLE}|"
     r"\b(pretend(ing)? to be|posing as|pose as)\b",
     "Impersonation: write as the founder's own brand only."),
    (r"\bsell\b.{0,30}\b(emails?|e-mail address\w*|phone numbers?|data|contacts?|list|information)\b",
     "Selling personal data: collect only with consent and never sell."),
    (r"\b(crypto\w*|bitcoin|forex|trading signals?|investment|stock picks?|loans?)\b",
     "Disallowed category: financial, investment or crypto product."),
    (r"\b(supplements?|physical (goods|products?)|shipped to your door|t-?shirts?|dropship\w*)\b|"
     r"\bprint(ed)?\b.{0,15}\b(and|to) (sell|ship)\b|\bprinted\b|\bprint[- ]on[- ]demand\b|"
     r"\b(posters?|handmade|stickers?|merch(andise)?|etsy shop)\b",
     "Disallowed category: physical goods."),
    (r"\b(legal|medical|health|diet|therapy|nutrition) advice\b|"
     r"\b(diet|meal|keto|weight[- ]loss) (plan|program)\b|\blose \d+\s?(kg|kilos?|pounds|lbs)\b|"
     r"\b(cures?|treats?|heals?)\b.{0,20}\b(diabetes|cancer|disease|anxiety|depression|obesity)\b",
     "Disallowed category: health or legal advice product."),
]

# (pattern, issue text). Any match asks for a fix.
_FIX: list[tuple[str, str]] = [
    (r"\b(hurry|last chance|selling fast|ends tonight|limited time)\b|\bonly \d+ (left|spots?|seats?)\b",
     "Fake urgency: remove it unless the limit is real and shown with proof."),
    (r"\b(fees?|charges?|tax(es)?)\b.{0,30}\b(at checkout|at the last step|added later|not included)\b|"
     r"\bhidden fees?\b",
     "Hidden fee: show the full price up front."),
    (r"\bpre[- ]?(ticked|checked|selected)\b|\[x\]",
     "Pre-ticked box: leave it unticked and say what it costs."),
    (r"\b(styled|disguised|dressed up) as (a )?news\b|\bbreaking news\b|\badvertorial\b|\blooks? like (a )?news\b",
     "Ad disguised as news: label the ad clearly."),
]


# A rating or a head count with no source on the same line asks for a fix.
_UNSOURCED = (
    r"\brated \d|\b\d(\.\d)?\s*(/\s*5|out of 5|stars?)\b|"
    rf"\b(join|joined by|trusted by|loved by|used by|chosen by)\s+(over |more than )?\d[\d,]*\+?\s*(\w+ )?{_PEOPLE}\b|"
    rf"\b\d[\d,]*\+?\s*(happy |satisfied )?{_PEOPLE} (already )?(joined|enrolled|bought|signed up|love|trust)\b",
    "Unsourced rating or count: cite the source or remove it.",
)
_SOURCED = re.compile(r"https?://|\bsource\b|\bassumption\b", re.IGNORECASE)


@dataclass
class EthicsVerdict:
    outcome: Literal["pass", "fix", "block"]
    issues: list[str] = field(default_factory=list)


_NEGATION = re.compile(r"\b(no|not|never|don't|dont|won't|wont|without|avoid|against|zero)\b")


def _clauses(text: str) -> list[str]:
    """Split on punctuation, but keep numbers like 4.9 and 2,000 whole."""
    parts = re.split(r"(?:(?<!\d)[.,]|[.,](?!\d)|[;!?\n\u060c])+", text)
    return [c for c in parts if c.strip()]


def _matches(rules: list[tuple[str, str]], text: str) -> list[str]:
    """Issues found clause by clause. A clause that says no, not, never or against
    before the match is the writer refusing the thing, so it is not an issue."""
    found: list[str] = []
    for clause in _clauses(text):
        for pattern, issue in rules:
            m = re.search(pattern, clause)
            if m and not _NEGATION.search(clause[:m.start()]) and issue not in found:
                found.append(issue)
    return found


def check_draft(text: str) -> EthicsVerdict:
    """Return block for any hard line, fix for manipulative design, else pass."""
    lowered = text.lower()
    blocks, fixes = _matches(_BLOCK, lowered), _matches(_FIX, lowered)
    for line in lowered.splitlines():
        if not _SOURCED.search(line) and _UNSOURCED[1] not in fixes and _matches([_UNSOURCED], line):
            fixes.append(_UNSOURCED[1])
    if blocks:
        return EthicsVerdict("block", blocks + fixes)
    if fixes:
        return EthicsVerdict("fix", fixes)
    return EthicsVerdict("pass", [])
