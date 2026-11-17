"""Checkpoint 1 pipeline. Our code owns the loop; agents are small functions."""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Protocol, TextIO, TypeVar

import yaml
from pydantic import BaseModel

from api.agents import boss, cofounder, intern, profiler
from api.agents.cofounder import NoFounderDecision, Option
from api.agents.intern import Draft
from api.approval import Approval, ensure_approved, require_approval
from api.config import Config
from api.ethics import check_draft
from api.gates import GateResult, phase1_gate, phase2_gate, write_gate_decision
from api.guardrail import check_request
from api.llm import LLM
from api.log import DecisionLog
from api.research import Search, SourceRegistry, write_sources

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
M = TypeVar("M", bound=BaseModel)


def load_prompt(*names: str, prompts_dir: Path = PROMPTS_DIR) -> str:
    """House voice first, then each named file from prompts/."""
    return "\n\n".join((prompts_dir / f"{n}.md").read_text(encoding="utf-8") for n in ("house_voice", *names))


class AnswersExhausted(RuntimeError):
    """The founder gave no more answers (end of file or end of script)."""


class AnswerSource(Protocol):
    def ask(self, key: str, prompt: str, choice: dict[str, Any] | None = None) -> str: ...


class ScriptedAnswers:
    """Replays founder answers from a dict or YAML file. Each key holds one answer or a list."""

    def __init__(self, script: dict[str, Any]) -> None:
        self._queues = {k: [str(v) for v in (vals if isinstance(vals, list) else [vals])]
                        for k, vals in script.items()}
        self.asked: list[tuple[str, str]] = []

    @classmethod
    def from_file(cls, path: str | Path) -> ScriptedAnswers:
        return cls(yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {})

    def ask(self, key: str, prompt: str, choice: dict[str, Any] | None = None) -> str:
        self.asked.append((key, prompt))
        queue = self._queues.get(key)
        if not queue:
            raise AnswersExhausted(f"No scripted answer left for '{key}': {prompt}")
        return queue.pop(0)


class InteractiveAnswers:
    """Asks the founder on the terminal."""

    def __init__(self, stdin: TextIO | None = None, stdout: TextIO | None = None) -> None:
        self._in = stdin or sys.stdin
        self._out = stdout or sys.stdout

    def ask(self, key: str, prompt: str, choice: dict[str, Any] | None = None) -> str:
        self._out.write(f"\n{prompt}\n> ")
        self._out.flush()
        line = self._in.readline()
        if not line:
            raise AnswersExhausted(f"No answer for '{key}'.")
        return line.strip()


@dataclass
class Ctx:
    """Everything one run needs. Agents get this and nothing else."""

    cfg: Config
    llm: LLM
    search: Search
    log: DecisionLog
    answers: AnswerSource
    run_dir: Path
    registry: SourceRegistry = field(default_factory=SourceRegistry)
    say: Callable[[str], None] = print

    def prompt(self, *names: str) -> str:
        return load_prompt(*names)

    def output(self, phase: int, step: int, name: str, ext: str = "md") -> Path:
        path = self.run_dir / "outputs" / f"phase{phase}_step{step}_{name}.{ext}"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def complete(self, agent: str, action: str, system: str, user: str, schema: type[M],
                 sources: list[str] | None = None) -> M:
        """One model call, logged with the model name and token use. Local models cost 0."""
        reply, usage = self.llm.complete(system, user, schema)
        self.log.append(agent, action, sources=sources, model=self.llm.name, cost=0,
                        tokens={"prompt": usage.prompt_tokens, "completion": usage.completion_tokens})
        return reply  # type: ignore[return-value]


T = TypeVar("T")


def run_gated(ctx: Ctx, agent: str, action: str, approval: Approval | None, fn: Callable[[], T]) -> T:
    """Run fn only with a founder approval made by check_approval. Logged once it has run."""
    approved = ensure_approved(approval, action)
    try:
        value = fn()
    except Exception:
        ctx.log.append(agent, action, approved_by=approved.approved_by, founder_input=approved.reason,
                       outcome="failed", gated=True)
        raise
    ctx.log.append(agent, action, approved_by=approved.approved_by, founder_input=approved.reason,
                   outcome=approved.option, gated=True)
    return value


@require_approval("publish sign-up page")
def publish_signup_page(ctx: Ctx, page: str, *, approval: Approval) -> Path:
    """STUBBED: writes the approved page locally. Nothing is posted online."""
    path = ctx.output(2, 2, "signup_page")
    path.write_text(page + "\n\nSTUBBED: approved by the founder, saved here only. "
                    "Nothing was posted online.\n", encoding="utf-8")
    return path


STOP_HERE = Option("Stop here", "EGP 0", "The work so far is not used", "none", id="stop")
PUBLISH = [Option("Publish the sign-up page", "EGP 0", "Few people may sign up",
                  "STUBBED: saved locally, not posted"),
           Option("Keep it private", "EGP 0", "No sign-ups to count", "none")]
PHASE2 = {"Continue to Build": "go", "Repeat the test": "repeat", "Stop or pivot": "stop"}
PHASE2_OPTIONS = [Option("Continue to Build", "Your time", "Building before demand is clear", "gate result"),
                  Option("Repeat the test", "14 more days", "Same result twice", "gate result"),
                  Option("Stop or pivot", "EGP 0", "Dropping an idea that needed more time", "gate result")]


@dataclass
class RunResult:
    outcome: str = "running"
    stopped_at: str = "start"
    phase1: GateResult | None = None
    phase2: GateResult | None = None


def _save(ctx: Ctx, result: RunResult, step: str, outcome: str | None = None) -> RunResult:
    """Record progress in state.json so a run can be read back or replayed."""
    result.stopped_at = step
    result.outcome = outcome or result.outcome
    state = {"outcome": result.outcome, "step": step,
             "phase1": result.phase1.outcome if result.phase1 else None,
             "phase2": result.phase2.outcome if result.phase2 else None}
    ctx.run_dir.mkdir(parents=True, exist_ok=True)
    (ctx.run_dir / "state.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    return result


def _reviewed(ctx: Ctx, step: str, make: Callable[[list[str]], Draft]) -> Draft | None:
    """Boss review with one redraft. None means ethics blocked it twice."""
    draft = make([])
    review = boss.review(ctx, draft, step)
    if review.passed:
        return draft
    draft = make(review.reasons)
    review = boss.review(ctx, draft, step)
    if review.blocked:
        ctx.say("The ethics check blocked this draft twice, so the run stops here.")
        return None
    if not review.passed:
        draft.markdown += "\n## Boss notes (did not pass)\n\n" + "\n".join(f"- {r}" for r in review.reasons) + "\n"
    return draft


def _write_draft(ctx: Ctx, phase: int, step: int, name: str, draft: Draft) -> None:
    ctx.output(phase, step, name).write_text(draft.markdown, encoding="utf-8")
    write_sources(ctx.output(phase, step, "sources", "json"), draft.cards)


def _write_gate(ctx: Ctx, phase: int, result: GateResult, approval: Approval,
                options: list[Option]) -> Path:
    path = write_gate_decision(ctx.run_dir / "outputs" / f"phase{phase}_gate_decision.md", result, approval)
    header = "| Option | Cost | Risk | Source |\n|---|---|---|---|\n"
    rows = "".join(f"| {o.name} | {o.cost} | {o.risk} | {o.source} |\n" for o in options)
    path.write_text(path.read_text(encoding="utf-8").replace(header, header + rows), encoding="utf-8")
    return path


def _gate(ctx: Ctx, phase: int, result: GateResult, options: list[Option]) -> Approval:
    """Log the gate, show the options, take the founder's choice, write the decision file."""
    ctx.log.append("gate", f"phase{phase}_gate", outcome=result.outcome)
    approval = cofounder.ask_choice(ctx, f"phase{phase}", f"{result.recommendation}\nWhich option, and why?",
                                    options)
    run_gated(ctx, "founder", f"phase{phase}_decision", approval,
              lambda: _write_gate(ctx, phase, result, approval, options))
    return approval


def _signup_page(opportunity: intern.Opportunity, canvas: Draft) -> str:
    data: intern.LeanCanvas = canvas.data
    return (f"# {data.uvp.content}\n\n{data.solution.content}\n\n"
            f"For: {opportunity.who}\n\nLeave your email to hear when it is ready. "
            "We email you once. We will not share it.\n")


def run_pipeline(ctx: Ctx, brief: str) -> RunResult:
    """Brief -> profile -> research -> boss -> Phase 1 gate -> Lean Canvas -> Phase 2 gate."""
    result = RunResult()
    try:
        return _run(ctx, brief, result)
    except (NoFounderDecision, AnswersExhausted) as err:
        ctx.say(f"Paused: {err}")
        ctx.log.append("orchestrator", "pause_run", outcome="paused")
        return _save(ctx, result, result.stopped_at, "paused")


def _run(ctx: Ctx, brief: str, result: RunResult) -> RunResult:
    verdict = check_request(brief)
    if not verdict.allowed:
        ctx.log.append("guardrail", "refuse_request", founder_input=brief, outcome=verdict.rule)
        ctx.say(f"{verdict.reason} Instead: {verdict.alternative}.")
        return _save(ctx, result, "brief", "refused")

    profile = profiler.run(ctx, brief)
    _save(ctx, result, "phase1_step1")
    found = intern.search(ctx, brief, profile)
    opps = _reviewed(ctx, "phase1_step2",
                     lambda notes: intern.draft_opportunities(ctx, brief, profile, found, notes))
    if opps is None:
        return _save(ctx, result, "phase1_step2", "stop")
    _write_draft(ctx, 1, 2, "opportunities", opps)

    result.phase1 = phase1_gate(opps.sourced, opps.founder_fit, ctx.cfg)
    options = [Option(*row, id=f"option_{i}") for i, row in enumerate(opps.rows, 1)] + [STOP_HERE]
    pick = _gate(ctx, 1, result.phase1, options)
    if pick.option == STOP_HERE.name:
        return _save(ctx, result, "phase1_gate", "stop")
    _save(ctx, result, "phase1_gate")
    chosen = next(o for o in opps.data.opportunities if o.title == pick.option)

    advantage = cofounder.ask_founder(
        ctx, "unfair_advantage", "Lean Canvas box 9: what do you have that others can't copy or buy?")
    ctx.log.append("founder", "write_unfair_advantage", founder_input=advantage)
    canvas = _reviewed(ctx, "phase2_step1",
                       lambda notes: intern.draft_lean_canvas(ctx, chosen, profile, advantage, notes))
    if canvas is None:
        return _save(ctx, result, "phase2_step1", "stop")
    _write_draft(ctx, 2, 1, "lean_canvas", canvas)
    _save(ctx, result, "phase2_step1")

    page = _signup_page(chosen, canvas)
    page_check = check_draft(page)
    if page_check.outcome != "pass":
        ctx.say("We did not offer to publish the sign-up page. It failed the ethics check:\n"
                + "\n".join(f"- {issue}" for issue in page_check.issues))
        ctx.log.append("orchestrator", "skip_publish", outcome=page_check.outcome)
    else:
        ctx.say(page)
        choice = cofounder.ask_choice(ctx, "publish", "Publish this sign-up page?", PUBLISH)
        if choice.option == PUBLISH[0].name:
            run_gated(ctx, "cofounder", "publish_signup_page", choice,
                      lambda: publish_signup_page(ctx, page, approval=choice))
        else:
            ctx.log.append("founder", "keep_page_private", founder_input=choice.reason)

    window = ctx.cfg.gates.phase2_validate.window_days
    signups = cofounder.ask_number(ctx, "signups", f"How many real people signed up in {window} days?")
    result.phase2 = phase2_gate(signups, ctx.cfg)
    result.phase2.evidence["source"] = "founder-entered count"
    pick = _gate(ctx, 2, result.phase2, PHASE2_OPTIONS)
    return _save(ctx, result, "phase2_gate", PHASE2[pick.option])
