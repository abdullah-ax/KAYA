"""Every row of evals/guardrail_paraphrases.md: reworded tricks are refused under the
right rule, and honest near-misses pass."""
from pathlib import Path

import pytest

from api.ethics import check_draft
from api.guardrail import check_answer, check_request

EVAL = Path(__file__).resolve().parent.parent / "evals" / "guardrail_paraphrases.md"

# Family name -> words one of which the rule text must contain.
FAMILY_WORDS = {
    "review": ["review", "testimonial"],
    "signup": ["sign-up"],
    "urgency": ["urgency"],
    "income": ["income"],
    "impersonation": ["brand", "impersonation", "posing"],
    "money": ["money"],
    "accounts": ["account"],
    "passwords": ["password", "card number"],
    "physical": ["physical"],
    "financial": ["financial"],
    "health": ["health"],
    "legal": ["legal"],
}
PRODUCT_FAMILIES = {"physical", "financial", "health", "legal"}


def _table(heading: str) -> list[tuple[str, str, str]]:
    """Rows of the 3-column table under `## heading`."""
    rows, inside = [], False
    for line in EVAL.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            inside = line[3:].strip() == heading
            continue
        if not inside or not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 3 or set(cells[0]) <= set("-: ") or cells[1] == "Expected":
            continue
        rows.append((cells[0], cells[1], cells[2]))
    return rows


REQUESTS = _table("Requests")
DRAFTS = _table("Drafts")
REFUSE = [(p, f) for p, e, f in REQUESTS if e == "refuse"]
ALLOW = [p for p, e, _ in REQUESTS if e == "allow"]


def test_eval_is_big_enough():
    assert len(REFUSE) >= 60 and len(ALLOW) >= 25
    assert all(e in {"refuse", "allow"} for _, e, _ in REQUESTS)
    assert all(fam in FAMILY_WORDS for _, f in REFUSE for fam in f.split("/"))


def _right_family(verdict, family: str) -> bool:
    words = [w for fam in family.split("/") for w in FAMILY_WORDS[fam]]
    rules = [verdict.rule or "", *verdict.also]
    return any(w in r.lower() for r in rules for w in words)


@pytest.mark.parametrize("prompt,family", REFUSE, ids=[p[:40] for p, _ in REFUSE])
def test_paraphrase_is_refused_under_its_rule(prompt, family):
    verdict = check_request(prompt)
    assert not verdict.allowed, prompt
    assert _right_family(verdict, family), (prompt, verdict.rule, verdict.also)
    assert verdict.alternative
    if not set(family.split("/")) <= PRODUCT_FAMILIES:
        answer = check_answer(prompt)
        assert not answer.allowed, prompt


@pytest.mark.parametrize("prompt", ALLOW, ids=[p[:40] for p in ALLOW])
def test_honest_near_miss_is_allowed(prompt):
    assert check_request(prompt).allowed, (prompt, check_request(prompt).rule)
    assert check_answer(prompt).allowed, prompt


@pytest.mark.parametrize("draft,expected,issue", DRAFTS, ids=[d[:40] for d, _, _ in DRAFTS])
def test_draft_row(draft, expected, issue):
    verdict = check_draft(draft)
    assert verdict.outcome == expected, (draft, verdict)
    if issue:
        assert any(issue in i.lower() for i in verdict.issues), (draft, verdict.issues)
