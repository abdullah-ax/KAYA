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

# (pattern, issue text). Any match blocks.
_BLOCK: list[tuple[str, str]] = [
    (r"\b(fake|made[- ]up|invented)\b.{0,20}\b(reviews?|ratings?)\b|\breviews? (we|i) (wrote|made)\b",
     "Fake reviews: only real customers may review."),
    (r"\b(fake|made[- ]up|invented)\b.{0,20}\btestimonials?\b|\btestimonials? (we|i) (wrote|made)\b",
     "Fake testimonial: quote only real customers who agreed."),
    (r"\bcountdown\b|\b(offer|sale|deal) (ends|expires) in\b",
     "Fake countdown timer: show a real date or nothing."),
    (r"\b(make|earn|making|earning)\b.{0,25}\$\s?\d|\$\s?[\d,]+\s*(a|per) (day|week|month|year)\b|"
     r"\bguarantee(d)?\b.{0,15}\b(income|profit|earnings|results|success)\b",
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
    (r"\b(supplements?|physical (goods|products?)|shipped to your door|t-?shirts?|dropship\w*)\b",
     "Disallowed category: physical goods."),
    (r"\b(legal|medical|health|diet|therapy|nutrition) advice\b",
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


@dataclass
class EthicsVerdict:
    outcome: Literal["pass", "fix", "block"]
    issues: list[str] = field(default_factory=list)


def _matches(rules: list[tuple[str, str]], text: str) -> list[str]:
    return [issue for pattern, issue in rules if re.search(pattern, text)]


def check_draft(text: str) -> EthicsVerdict:
    """Return block for any hard line, fix for manipulative design, else pass."""
    lowered = text.lower()
    blocks, fixes = _matches(_BLOCK, lowered), _matches(_FIX, lowered)
    if blocks:
        return EthicsVerdict("block", blocks + fixes)
    if fixes:
        return EthicsVerdict("fix", fixes)
    return EthicsVerdict("pass", [])
