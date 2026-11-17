"""Co-founder: talks to the founder. Guards every message and never takes a bare yes.

No model here: these are the code rules the co-founder prompt describes.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Any

from api.approval import Approval, ApprovalError, _normalize, _real_words, check_approval
from api.guardrail import check_answer
from api.research import clean_cell

if TYPE_CHECKING:
    from api.orchestrator import Ctx

MAX_ASKS = 3


class NoFounderDecision(RuntimeError):
    """The founder gave no usable answer after MAX_ASKS tries."""


def ask_founder(ctx: Ctx, key: str, prompt: str, choice: dict[str, Any] | None = None) -> str:
    """Ask once; if the guardrail refuses the answer, say why and ask again.

    choice is the structured question and options, for a screen that shows a gate.
    """
    for _ in range(MAX_ASKS):
        said = (ctx.answers.ask(key, prompt, choice=choice) if choice else ctx.answers.ask(key, prompt)).strip()
        verdict = check_answer(said)
        if verdict.allowed:
            return said
        ctx.log.append("guardrail", "refuse_request", founder_input=said, outcome=verdict.rule)
        ctx.say(f"{verdict.reason} Instead: {verdict.alternative}.")
    raise NoFounderDecision(f"No usable answer for: {prompt}")


NO_ANSWER = "ASSUMPTION: no answer"
MORE_WORDS = "Tell me in a few more words."


def is_bare(ctx: Ctx, text: str) -> bool:
    """True for an empty answer or one made only of filler like yes, ok or looks good."""
    rejected = {_normalize(a) for a in ctx.cfg.approval.rejected_answers}
    return not _real_words(text, rejected)


def ask_profile_answer(ctx: Ctx, key: str, question: str) -> str:
    """Ask a Profiler question. A bare answer is re-asked once; a second one is an ASSUMPTION."""
    said = ask_founder(ctx, key, question)
    if not is_bare(ctx, said):
        return said
    ctx.log.append("cofounder", "reask_bare_answer", founder_input=said)
    said = ask_founder(ctx, key, f"{question}\n{MORE_WORDS}")
    return NO_ANSWER if is_bare(ctx, said) else said


@dataclass(frozen=True)
class Option:
    name: str
    cost: str
    risk: str
    source: str
    id: str = ""  # a reserved id (such as "stop") that no idea title can take

    def __post_init__(self) -> None:
        """One line, no pipes or backticks, so an option can't break a table or the list."""
        for name in ("name", "cost", "risk", "source"):
            object.__setattr__(self, name, clean_cell(getattr(self, name)))
        if not self.id:  # every option needs its own id so the UI can tell them apart
            object.__setattr__(self, "id", re.sub(r"[^a-z0-9]+", "_", self.name.lower()).strip("_"))


def _same(a: str, b: str) -> bool:
    def norm(text: str) -> str:
        return " ".join(re.sub(r"[^\w\s]", " ", text.lower()).split())
    return norm(a) == norm(b)


def show_options(options: list[Option]) -> str:
    return "\n".join(f"- {o.name} (cost: {o.cost}; risk: {o.risk}; source: {o.source})" for o in options)


def ask_choice(ctx: Ctx, key: str, question: str, options: list[Option]) -> Approval:
    """Ask for one option and a reason. Re-ask on a bare yes, a short reason or an unknown option."""
    names = [o.name for o in options]
    ctx.say(f"{question}\n{show_options(options)}")
    choice = {"question": question, "options": [asdict(o) for o in options]}
    option: str | None = None
    for _ in range(MAX_ASKS):
        if option is None:
            option = ask_founder(ctx, f"{key}_option", "Which option? Type its name.", choice)
        reason = ask_founder(ctx, f"{key}_reason", "Why that one? Use your own words.")
        try:
            return check_approval(option, reason, names, ctx.cfg)
        except ApprovalError as err:
            ctx.log.append("cofounder", "reject_answer", founder_input=reason, outcome=str(err))
            ctx.say(str(err))
            if not any(_same(option, n) for n in names):
                option = None
    raise NoFounderDecision(f"No valid choice for: {question}")


def ask_number(ctx: Ctx, key: str, prompt: str) -> int:
    """Ask for a whole number of 0 or more, such as a sign-up count."""
    for _ in range(MAX_ASKS):
        said = ask_founder(ctx, key, prompt)
        if re.fullmatch(r"[0-9]+", said):
            ctx.log.append("founder", f"enter_{key}", founder_input=said)
            return int(said)
        ctx.say("Type a whole number, like 12.")
    raise NoFounderDecision(f"No number given for: {prompt}")
