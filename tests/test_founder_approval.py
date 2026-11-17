"""The founder decides. No bare yes, no action without founder input, no publish without approval."""
import pytest

import pipeline_fakes as fx
from api.agents import cofounder
from api.agents.cofounder import NoFounderDecision, Option
from api.approval import Approval, ApprovalError
from api.log import DecisionLog
from api.orchestrator import Ctx, ScriptedAnswers, publish_signup_page, run_gated

OPTIONS = [Option("Speaking drills", "EGP 0", "Low demand", "https://x.org"),
           Option("Stop here", "EGP 0", "Lose the work so far", "none")]
REASON = "My WhatsApp group of 420 students keeps asking for speaking practice every week"


def make_ctx(run_dir, answers):
    return Ctx(cfg=fx.config(), llm=fx.scripted_llm(fx.strong_opportunities()),
               search=fx.fake_search(), log=DecisionLog(run_dir / "decision_log.json"),
               answers=answers, run_dir=run_dir, say=lambda text: None)


def test_bare_yes_at_a_gate_is_rejected_and_asked_again(tmp_run):
    answers = ScriptedAnswers({"phase1_option": "speaking drills", "phase1_reason": ["yes", REASON]})
    ctx = make_ctx(tmp_run, answers)

    approval = cofounder.ask_choice(ctx, "phase1", "Which option, and why?", OPTIONS)

    assert approval.option == "Speaking drills" and approval.reason == REASON
    assert [k for k, _ in answers.asked] == ["phase1_option", "phase1_reason", "phase1_reason"]
    rejected = [e for e in ctx.log.entries() if e["action"] == "reject_answer"]
    assert rejected and rejected[0]["founder_input"] == "yes"


def test_unknown_option_is_asked_again(tmp_run):
    answers = ScriptedAnswers({"phase1_option": ["Option Z", "Stop here"], "phase1_reason": ["no", REASON]})
    approval = cofounder.ask_choice(make_ctx(tmp_run, answers), "phase1", "Which?", OPTIONS)
    assert approval.option == "Stop here"


def test_no_decision_after_three_bad_answers(tmp_run):
    answers = ScriptedAnswers({"phase1_option": "Stop here", "phase1_reason": ["ok", "fine", "sure"]})
    with pytest.raises(NoFounderDecision):
        cofounder.ask_choice(make_ctx(tmp_run, answers), "phase1", "Which?", OPTIONS)


def test_signup_count_must_be_a_whole_number(tmp_run):
    answers = ScriptedAnswers({"signups": ["about twelve", "12"]})
    assert cofounder.ask_number(make_ctx(tmp_run, answers), "signups", "How many?") == 12


def test_action_without_founder_input_does_not_run(tmp_run):
    ctx = make_ctx(tmp_run, ScriptedAnswers({}))
    ran = []
    for approval in (None, Approval("Speaking drills", "")):
        with pytest.raises(ApprovalError):
            run_gated(ctx, "founder", "phase1_decision", approval, lambda: ran.append(1))
    assert ran == [] and ctx.log.entries() == []


def test_gated_action_with_founder_approval_runs_and_is_logged(tmp_run):
    answers = ScriptedAnswers({"phase1_option": "Speaking drills", "phase1_reason": REASON})
    ctx = make_ctx(tmp_run, answers)
    approval = cofounder.ask_choice(ctx, "phase1", "Which?", OPTIONS)

    assert run_gated(ctx, "founder", "phase1_decision", approval, lambda: "done") == "done"
    entry = ctx.log.entries()[-1]
    assert entry["approved_by"] == "founder" and REASON in entry["founder_input"]


def test_publish_without_approval_does_not_run(tmp_run):
    ctx = make_ctx(tmp_run, ScriptedAnswers({}))
    for approval in (None, Approval("Publish the sign-up page", REASON)):
        with pytest.raises(ApprovalError):
            publish_signup_page(ctx, "# Practice IELTS speaking", approval=approval)
    assert not (tmp_run / "outputs").exists()
