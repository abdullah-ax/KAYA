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
from api.gates import (GateResult, phase1_gate, phase2_gate, phase3_gate, phase4_gate, phase5_gate, phase6_gate,
                       write_gate_decision)
from api.payments import Order, PaymentProcessor, expected_fee
from api.reconcile import reconcile
from api.refunds import request_refund
from api.guardrail import check_request
from api.llm import LLM
from api.log import DecisionLog
from api.plan import snapshot
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
    snapshot(ctx.run_dir, "draft", "Sign-up page saved after your approval (not posted online)")
    return path


STOP_HERE = Option("Stop here", "EGP 0", "The work so far is not used", "none", id="stop")
PUBLISH = [Option("Publish the sign-up page", "EGP 0", "Few people may sign up",
                  "STUBBED: saved locally, not posted"),
           Option("Keep it private", "EGP 0", "No sign-ups to count", "none")]
PHASE2 = {"Continue to Build": "go", "Repeat the test": "repeat", "Stop or pivot": "stop"}
PHASE2_OPTIONS = [Option("Continue to Build", "Your time", "Building before demand is clear", "gate result"),
                  Option("Repeat the test", "14 more days", "Same result twice", "gate result"),
                  Option("Stop or pivot", "EGP 0", "Dropping an idea that needed more time", "gate result")]
PHASE3 = {"Build this MVP": "go", "Cut the scope further": "repeat", "Go back to validation": "pivot"}
PHASE3_OPTIONS = [Option("Build this MVP", "Your time, 2 weeks", "The stories may take longer than the guess",
                         "gate result"),
                  Option("Cut the scope further", "A few more hours of planning", "A smaller first version",
                         "gate result"),
                  Option("Go back to validation", "More time before you build", "Waiting longer for proof",
                         "gate result")]
STAGES = ["Ideation", "Validation", "Build", "Commercial setup", "Sell and get paid", "Operate and learn"]
NEXT_STAGE = "__next_stage__"  # sent only by POST /runs/{id}/next
MAX_CHAT = 30
BUILD_DONE = "Your MVP plan is ready. Next: pricing and setup."
BUILD_CUT = "Cut the must-have list, then plan the build again. Keep only what the first ten users need."
BUILD_BACK = "Go back to validation: talk to more people before you build."


@dataclass
class RunResult:
    outcome: str = "running"
    stopped_at: str = "start"
    phase1: GateResult | None = None
    phase2: GateResult | None = None
    phase3: GateResult | None = None
    phase4: GateResult | None = None
    phase5: GateResult | None = None
    phase6: GateResult | None = None


def _save(ctx: Ctx, result: RunResult, step: str, outcome: str | None = None) -> RunResult:
    """Record progress in state.json so a run can be read back or replayed."""
    result.stopped_at = step
    result.outcome = outcome or result.outcome
    state = {"outcome": result.outcome, "step": step,
             "phase1": result.phase1.outcome if result.phase1 else None,
             "phase2": result.phase2.outcome if result.phase2 else None,
             **{f"phase{n}": (g.outcome if g else None) for n, g in
                ((3, result.phase3), (4, result.phase4), (5, result.phase5), (6, result.phase6))}}
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
    draft.redrafted = True
    review = boss.review(ctx, draft, step)
    if review.blocked:
        kept = ctx.run_dir / "outputs" / f"{step}_rejected_draft.md"
        kept.parent.mkdir(parents=True, exist_ok=True)
        kept.write_text(draft.markdown + "\n## Why it was blocked\n\n" + "\n".join(f"- {r}" for r in review.reasons) + "\n",
                        encoding="utf-8")
        top = "; ".join(review.reasons[:2])
        ctx.say(f"The ethics check blocked this draft twice, so the run stops here. Why: {top}")
        snapshot(ctx.run_dir, "stop", f"The ethics check blocked the {step} draft twice")
        return None
    if not review.passed:
        draft.review_failed, draft.review_reasons = True, list(review.reasons)
        draft.markdown += "\n## Boss notes (did not pass)\n\n" + "\n".join(f"- {r}" for r in review.reasons) + "\n"
    return draft


def _write_draft(ctx: Ctx, phase: int, step: int, name: str, draft: Draft) -> None:
    ctx.output(phase, step, name).write_text(draft.markdown, encoding="utf-8")
    write_sources(ctx.output(phase, step, "sources", "json"), draft.cards)
    snapshot(ctx.run_dir, "redraft" if draft.redrafted else "draft",
             f"{name.replace('_', ' ').capitalize()} written"
             + (" after the boss asked for a redraft" if draft.redrafted else ""))


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
    snapshot(ctx.run_dir, "decision", f"Phase {phase} gate: you picked {approval.option}", option=approval.option)
    return approval


def level_up(ctx: Ctx, done: int, proof: str) -> None:
    """Pause after a passed stage: the founder can chat with the co-founder, then moves on.

    Only answer sources that support it pause (the web). Scripted and CLI runs carry on.
    """
    if not getattr(ctx.answers, "level_up", False):
        return
    stage, nxt = STAGES[done - 1], STAGES[done]
    prompt = f"{stage} is done. {proof} Ask me anything about it, or move on to {nxt}."
    choice = {"done": done, "stage": stage, "next": nxt, "proof": proof}
    for _ in range(MAX_CHAT):
        said = ctx.answers.ask("level_up", prompt, choice=choice)
        if said == NEXT_STAGE:
            break
        ctx.say(cofounder.chat(ctx, said, stage))
    ctx.log.append("founder", "move_to_next_stage", approved_by="founder",
                   founder_input=f"Moved on to {nxt} after finishing {stage}.")


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

    hours, known = intern.weekly_hours(profile)
    result.phase1 = phase1_gate(opps.sourced, opps.founder_fit, ctx.cfg, reach=len(profile.access),
                                hours=hours if known else None)
    options = [Option(*row, id=f"option_{i}") for i, row in enumerate(opps.rows, 1)] + [STOP_HERE]
    pick = _gate(ctx, 1, result.phase1, options)
    if pick.option == STOP_HERE.name:
        return _save(ctx, result, "phase1_gate", "stop")
    _save(ctx, result, "phase1_gate")
    chosen = next(o for o in opps.data.opportunities if o.title == pick.option)
    level_up(ctx, 1, f"You picked {chosen.title} from {opps.sourced} sourced problems.")

    script = _reviewed(ctx, "phase1_step3",
                       lambda notes: intern.draft_interview_script(ctx, chosen, profile, notes))
    if script is None:
        return _save(ctx, result, "phase1_step3", "stop")
    ctx.output(1, 3, "interview_script").write_text(script.markdown, encoding="utf-8")
    _save(ctx, result, "phase1_step3")

    advantage = cofounder.ask_founder(
        ctx, "unfair_advantage", "What do you have that others can't easily copy or buy? For example your skills, your group, or what people trust you for.")
    ctx.log.append("founder", "write_unfair_advantage", founder_input=advantage)
    canvas = _reviewed(ctx, "phase2_step1",
                       lambda notes: intern.draft_lean_canvas(ctx, chosen, profile, advantage, notes))
    if canvas is None:
        return _save(ctx, result, "phase2_step1", "stop")
    _write_draft(ctx, 2, 1, "lean_canvas", canvas)
    if canvas.review_failed:
        top = "; ".join(canvas.review_reasons[:3])
        ctx.say("Warning: the boss did not pass the Lean Canvas, even after a second try. "
                f"Fix these before you share it. Why: {top}")
        ctx.log.append("orchestrator", "warn_canvas_failed_review", outcome="warn",
                       reasons=canvas.review_reasons)
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
    _save(ctx, result, "phase2_gate", PHASE2[pick.option])
    if result.outcome != "go":
        return result
    ev = result.phase2.evidence
    level_up(ctx, 2, f"{ev['actual']} of {ev['target']} people signed up.")
    return _build(ctx, result, profile, chosen, canvas, page)


def _build(ctx: Ctx, result: RunResult, profile: Any, chosen: intern.Opportunity, canvas: Draft,
           page: str) -> RunResult:
    """Phase 3: user stories, a 2-week MVP plan, then the build gate. Only after a Phase 2 go."""
    stories = _reviewed(ctx, "phase3_step1",
                        lambda notes: intern.draft_user_stories(ctx, chosen, profile, canvas, page, notes))
    if stories is None:
        return _save(ctx, result, "phase3_step1", "stop")
    _write_draft(ctx, 3, 1, "user_stories", stories)
    _save(ctx, result, "phase3_step1")
    mvp = _reviewed(ctx, "phase3_step2", lambda notes: intern.draft_mvp_plan(ctx, chosen, profile, stories, notes))
    if mvp is None:
        return _save(ctx, result, "phase3_step2", "stop")
    _write_draft(ctx, 3, 2, "mvp_spec", mvp)
    _save(ctx, result, "phase3_step2")

    weekly, _known = intern.weekly_hours(profile)
    result.phase3 = phase3_gate(intern.must_hours(stories), weekly * 2, weekly)
    pick = _gate(ctx, 3, result.phase3, PHASE3_OPTIONS)
    ctx.say({"go": BUILD_DONE, "repeat": BUILD_CUT, "pivot": BUILD_BACK}[PHASE3[pick.option]])
    _save(ctx, result, "phase3_gate", PHASE3[pick.option])
    if result.outcome != "go":
        return result
    level_up(ctx, 3, f"The must-have stories fit in {weekly * 2} hours over two weeks.")
    return _commercial(ctx, result, chosen)


# -- Phases 4 to 6: no model calls. Money is MOCKED: no provider, no real payments. ------------
PHASE4 = {"Open the MOCKED checkout": "go", "Change the price": "repeat", "Stop here": "stop"}
PHASE4_OPTIONS = [Option("Open the MOCKED checkout", "EGP 0, test mode", "The price may be wrong", "gate result"),
                  Option("Change the price", "A day of asking buyers", "Waiting longer to sell", "gate result"),
                  STOP_HERE]
REFUND = [Option("Approve the refund", "The order amount, MOCKED", "Less revenue", "refund policy"),
          Option("Keep the order", "EGP 0", "An unhappy buyer", "refund policy")]
PHASE5 = {"Keep selling": "go", "Fix the offer": "repeat", "Stop here": "stop"}
PHASE5_OPTIONS = [Option("Keep selling", "Your time", "Selling before delivery is smooth", "gate result"),
                  Option("Fix the offer", "A week", "Fewer sales this week", "gate result"), STOP_HERE]
PHASE6 = {"Keep going and grow": "go", "Improve and measure again": "repeat", "Pivot": "pivot", "Stop here": "stop"}
PHASE6_OPTIONS = [Option("Keep going and grow", "Your time", "Growing before the product is ready", "gate result"),
                  Option("Improve and measure again", "Two more weeks", "Slower growth", "gate result"),
                  Option("Pivot", "A new test", "Dropping what works", "gate result"), STOP_HERE]
MAX_TEST_ORDERS = 20


def _offer(chosen: intern.Opportunity, price: int) -> str:
    return (f"# Offer: {chosen.title}\n\n"
            f"- For: {chosen.who}\n"
            f"- Price: EGP {price} per buyer\n"
            "- Refund policy: a full refund within 7 days if you ask. Access ends when the refund is made.\n"
            "- Results: we do not promise any score, income or outcome.\n"
            "- Payment: MOCKED checkout. No payment provider is connected and no real money moves.\n"
            "- Delivery: an access link per order, issued once after payment (MOCKED).\n"
            "- Price source: ASSUMPTION, entered by the founder. Check it with 5 buyers before real sales.\n")


def _commercial(ctx: Ctx, result: RunResult, chosen: intern.Opportunity) -> RunResult:
    """Phase 4: price and policies, then the founder decides whether to open the MOCKED checkout."""
    price = cofounder.ask_number(ctx, "price", "What will you charge per buyer, in EGP? Use a number you would say "
                                               "out loud to a customer.")
    offer = _offer(chosen, price)
    check = check_draft(offer)
    ctx.output(4, 1, "offer").write_text(offer, encoding="utf-8")
    ctx.log.append("cofounder", "draft_offer", founder_input=str(price), outcome=check.outcome)
    ctx.say(offer)
    _save(ctx, result, "phase4_step1")
    result.phase4 = phase4_gate(price, check.outcome == "pass")
    pick = _gate(ctx, 4, result.phase4, PHASE4_OPTIONS)
    _save(ctx, result, "phase4_gate", PHASE4[pick.option])
    if result.outcome != "go":
        return result
    level_up(ctx, 4, f"Your offer is set at EGP {price} with a 7-day refund policy.")
    return _sell(ctx, result, chosen, price)


def _sell(ctx: Ctx, result: RunResult, chosen: intern.Opportunity, price: int) -> RunResult:
    """Phase 5: a MOCKED sale-to-cash test. Payment triggers delivery once; a refund needs the founder."""
    buyers = min(MAX_TEST_ORDERS, cofounder.ask_number(
        ctx, "buyers", "How many people told you they would buy at that price? We run that many test orders "
                       f"through the MOCKED checkout (at most {MAX_TEST_ORDERS})."))
    proc = PaymentProcessor(ctx.log)
    amount = price * 100  # piastres
    rows: list[str] = []
    for i in range(1, buyers + 1):
        oid = f"order-{i}"
        proc.create_order(Order(oid, amount, chosen.title))
        rows.append(f"| {oid} | payment_succeeded | {proc.handle_event({'event_id': f'pay-{i}', 'order_id': oid, 'type': 'payment_succeeded', 'amount': amount, 'fee': expected_fee(amount)})} |")
        if i == 1:  # the provider sends the same webhook twice: it must not deliver twice
            rows.append(f"| {oid} | payment_succeeded again (duplicate webhook) | {proc.handle_event({'event_id': 'pay-1', 'order_id': oid, 'type': 'payment_succeeded', 'amount': amount, 'fee': expected_fee(amount)})} |")
        rows.append(f"| {oid} | payout_paid | {proc.handle_event({'event_id': f'out-{i}', 'order_id': oid, 'type': 'payout_paid', 'amount': amount - expected_fee(amount)})} |")
    if buyers:
        ctx.say("A buyer asked for a refund on order-1. Refunds always need your approval.")
        pick = cofounder.ask_choice(ctx, "refund", "A buyer asked for a refund on order-1. Approve it?", REFUND)
        if pick.option == REFUND[0].name:
            rows.append(f"| order-1 | refund (founder approved) | {request_refund(proc, 'order-1', approval=pick)} |")
        else:
            ctx.log.append("founder", "keep_order", founder_input=pick.reason, approved_by="founder")
            rows.append("| order-1 | refund declined by the founder | kept |")
    report = reconcile(proc)
    paid = sum(1 for o in proc.orders.values() if o.status in ("paid", "refunded"))
    refunded = sum(1 for o in proc.orders.values() if o.status == "refunded")
    active = sum(1 for d in proc.fulfilment.deliveries if d.active)
    ctx.output(5, 1, "sales_log").write_text(
        "# Sales log (MOCKED)\n\nMOCKED: simulated checkout events. No payment provider, no real money.\n\n"
        "| Order | Event | Result |\n|---|---|---|\n" + "\n".join(rows) + "\n\n"
        f"- Paid orders: {paid}\n- Refunded: {refunded}\n- Access links still active: {active}\n"
        f"- Duplicate webhooks ignored: {proc.duplicates}\n", encoding="utf-8")
    ctx.output(5, 2, "reconciliation").write_text(
        "# Reconciliation (MOCKED)\n\nOrders, payments, fees and payouts matched line by line.\n\n"
        f"- Orders: {len(proc.orders)}\n- Mismatches: {len(report.mismatches)}\n"
        + "".join(f"- {m.order_id}: {m.kind}, {m.detail}\n" for m in report.mismatches), encoding="utf-8")
    _save(ctx, result, "phase5_step2")
    result.phase5 = phase5_gate(paid, len(report.mismatches))
    pick = _gate(ctx, 5, result.phase5, PHASE5_OPTIONS)
    _save(ctx, result, "phase5_gate", PHASE5[pick.option])
    if result.outcome != "go":
        return result
    level_up(ctx, 5, f"{paid} MOCKED orders were paid and delivered once each, {refunded} refunded, and the books match.")
    return _operate(ctx, result, paid)


def _operate(ctx: Ctx, result: RunResult, paid: int) -> RunResult:
    """Phase 6: what buyers did next, in the founder's numbers and words, then keep, fix, pivot or stop."""
    came_back = cofounder.ask_number(ctx, "came_back", "Of your buyers, how many came back, renewed or asked for "
                                                       "more within two weeks?")
    feedback = cofounder.ask_founder(ctx, "feedback", "What did buyers complain about or ask for most? Use their words.")
    ctx.log.append("founder", "enter_feedback", founder_input=feedback)
    result.phase6 = phase6_gate(min(came_back, paid), paid)
    ctx.output(6, 1, "learning_review").write_text(
        "# Learning review\n\n"
        f"- Buyers who came back in 14 days: {min(came_back, paid)} of {paid} (founder-entered)\n"
        f"- What buyers said most (founder-entered): {feedback}\n"
        f"- System read: {result.phase6.recommendation}\n"
        "- Next experiment: fix the most common complaint first, then measure repeat buyers again in 14 days.\n",
        encoding="utf-8")
    _save(ctx, result, "phase6_step1")
    pick = _gate(ctx, 6, result.phase6, PHASE6_OPTIONS)
    ctx.say("All six stages are done. Open the map to look back at each one.")
    return _save(ctx, result, "phase6_gate", PHASE6[pick.option])
