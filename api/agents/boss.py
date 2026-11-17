"""Boss: code checks first (slop and ethics), then the model votes on the draft."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from api.ethics import check_draft
from api.slop_check import check_text

if TYPE_CHECKING:
    from api.agents.intern import Draft
    from api.orchestrator import Ctx


class BossCheck(BaseModel):
    name: str
    passed: bool = Field(alias="pass")
    reason: str


class BossVerdict(BaseModel):
    verdict: Literal["pass", "fail"]
    checks: list[BossCheck] = []
    delete_lines: list[str] = []


@dataclass
class Review:
    passed: bool
    blocked: bool
    reasons: list[str] = field(default_factory=list)


def _code_checks(ctx: Ctx, draft: Draft) -> tuple[list[str], bool]:
    """Return (reasons, blocked). Slop and ethics run on model-written text only, never on founder quotes."""
    prose = "\n\n".join(t if t.rstrip().endswith((".", "!", "?")) else t + "." for t in draft.texts)
    slop = check_text(prose, ctx.cfg)
    reasons = [f"Banned phrase: {p}" for p in slop.banned]
    if slop.grade > ctx.cfg.writing.max_reading_grade:
        reasons.append(f"Reading grade {slop.grade} is above {ctx.cfg.writing.max_reading_grade}.")
    if slop.em_dash_paragraphs:
        reasons.append(f"Too many em dashes in {slop.em_dash_paragraphs} paragraph(s).")
    ethics = check_draft("\n".join(draft.texts))
    reasons += [f"Ethics ({ethics.outcome}): {issue}" for issue in ethics.issues]
    return reasons, ethics.outcome == "block"


def review(ctx: Ctx, draft: Draft, step: str) -> Review:
    reasons, blocked = _code_checks(ctx, draft)
    if not reasons:
        verdict = ctx.complete("boss", f"review_{step}", ctx.prompt("boss"),
                               f"Code checks passed. Vote on this draft:\n\n{draft.markdown}", BossVerdict)
        reasons = [f"{c.name}: {c.reason}" for c in verdict.checks if not c.passed]
        reasons += [f"Delete: {line}" for line in verdict.delete_lines]
        if verdict.verdict == "pass":
            ctx.log.append("boss", f"accept_{step}", outcome="pass")
            return Review(True, False, reasons)
        reasons = reasons or ["The boss voted fail with no reason given."]
    outcome = "block" if blocked else "fail"
    ctx.log.append("boss", "reject_draft", outcome=outcome, reasons=reasons)
    return Review(False, blocked, reasons)
