"""End-to-end Checkpoint 1 runs with a fake model, fake search and a scripted founder."""
import json
from pathlib import Path

import pipeline_fakes as fx
from api.log import DecisionLog
from api.orchestrator import Ctx, ScriptedAnswers, run_pipeline

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = {"timestamp", "agent", "action", "sources", "model", "cost", "approved_by", "founder_input"}
REASON1 = "My WhatsApp group of 420 students asks for speaking practice every single week"
REASON3 = "The three must-have stories fit in my two weeks so I will build the manual version first"
REASON2 = "We got more sign-ups than the target in two weeks so building is the next step"


REASON4 = "Four hundred pounds is what my students already pay for two private lessons, so it feels fair"
REASON_REFUND = "The buyer booked the wrong exam date and asked within a day, so a refund is the fair thing"
REASON5 = "Six people paid and the books match, so I will keep selling to the rest of my group"
REASON6 = "Half of the buyers came back for more practice, so the product is worth growing carefully"


def strong_answers(**changes):
    script = {"intake": ["I can reach 420 students today", "I can spend EGP 2,000"],
              "phase1_option": "Speaking drills", "phase1_reason": REASON1,
              "unfair_advantage": "I coached 300 students and scored band 8.5",
              "publish_option": "Publish the sign-up page", "publish_reason": REASON1,
              "signups": "130",
              "phase2_option": "Continue to Build", "phase2_reason": REASON2,
              "phase3_option": "Build this MVP", "phase3_reason": REASON3,
              "price": "400",
              "phase4_option": "Open the MOCKED checkout", "phase4_reason": REASON4,
              "buyers": "6",
              "refund_option": "Approve the refund", "refund_reason": REASON_REFUND,
              "phase5_option": "Keep selling", "phase5_reason": REASON5,
              "came_back": "3",
              "feedback": "They want more mock tests and feedback on pronunciation",
              "phase6_option": "Keep going and grow", "phase6_reason": REASON6}
    script.update(changes)
    return ScriptedAnswers(script)


def run(tmp_run, brief, llm, answers):
    ctx = Ctx(cfg=fx.config(), llm=llm, search=fx.fake_search(),
              log=DecisionLog(tmp_run / "decision_log.json"), answers=answers,
              run_dir=tmp_run, say=lambda text: None)
    return ctx, run_pipeline(ctx, (ROOT / "briefs" / brief).read_text(encoding="utf-8"))


def out(tmp_run, name):
    return (tmp_run / "outputs" / name).read_text(encoding="utf-8")


def test_strong_brief_reaches_phase2_go(tmp_run):
    ctx, result = run(tmp_run, "strong.md", fx.scripted_llm(fx.strong_opportunities()), strong_answers())

    assert result.phase1.outcome == "go" and result.phase2.outcome == "go"
    assert result.outcome == "go"
    for name in ["phase1_step1_founder_profile.json", "phase1_step2_opportunities.md",
                 "phase1_step2_sources.json", "phase2_step1_lean_canvas.md",
                 "phase2_step1_sources.json", "phase2_step2_signup_page.md"]:
        assert (tmp_run / "outputs" / name).exists(), name
    gate1 = out(tmp_run, "phase1_gate_decision.md")
    assert "go: 3 sourced problems" in gate1 and "- Picked: Speaking drills" in gate1
    assert "| Speaking drills | EGP 0 and 5 hours. |" in gate1
    gate2 = out(tmp_run, "phase2_gate_decision.md")
    assert "go: 130 of 100 sign-ups" in gate2 and "founder-entered" in gate2
    assert json.loads((tmp_run / "state.json").read_text())["outcome"] == "go"


def test_weak_brief_gets_a_phase1_stop_recommendation_and_ends_in_stop(tmp_run):
    # One sourced problem (need 3) and founder fit 2 (need 3): both weak, so the gate says stop.
    answers = strong_answers(phase1_option="Stop here",
                             phase1_reason="The gate says stop and I agree there is no proof here")
    ctx, result = run(tmp_run, "weak.md", fx.scripted_llm(fx.weak_opportunities()), answers)

    assert result.phase1.outcome == "stop"
    assert result.outcome == "stop" and result.stopped_at == "phase1_gate"
    assert result.phase2 is None
    assert "ASSUMPTION" in out(tmp_run, "phase1_step2_opportunities.md")
    assert "stop: 1 sourced problems" in out(tmp_run, "phase1_gate_decision.md")
    stops = [e for e in ctx.log.entries() if e.get("outcome") == "stop" and e["agent"] == "gate"]
    assert len(stops) == 1


def test_founder_can_override_a_phase1_stop_and_phase2_can_still_stop(tmp_run):
    answers = strong_answers(phase1_option="To-do list with AI",
                             phase1_reason="I still want to test it once with real people before I drop it",
                             signups="12", phase2_option="Stop or pivot",
                             phase2_reason="Twelve sign-ups is far below the target so this idea should stop now")
    ctx, result = run(tmp_run, "weak.md", fx.scripted_llm(fx.weak_opportunities()), answers)

    assert result.phase1.outcome == "stop"
    assert result.phase2.outcome == "stop" and result.outcome == "stop"
    assert "stop: 12 of 100 sign-ups in 14 days (12%)" in out(tmp_run, "phase2_gate_decision.md")


def test_founder_can_stop_at_phase1_gate(tmp_run):
    answers = strong_answers(phase1_option="Stop here",
                             phase1_reason="None of these problems has real proof and I have no group to ask")
    _, result = run(tmp_run, "weak.md", fx.scripted_llm(fx.weak_opportunities()), answers)

    assert result.outcome == "stop" and result.stopped_at == "phase1_gate"
    assert "- Picked: Stop here" in out(tmp_run, "phase1_gate_decision.md")
    assert not (tmp_run / "outputs" / "phase2_step1_lean_canvas.md").exists()


def test_bare_yes_at_gate_is_rejected_and_reasked_in_a_run(tmp_run):
    answers = strong_answers(phase2_reason=["yes", REASON2])
    ctx, result = run(tmp_run, "strong.md", fx.scripted_llm(fx.strong_opportunities()), answers)

    assert result.outcome == "go"
    assert [k for k, _ in answers.asked].count("phase2_reason") == 2
    assert f'"{REASON2}"' in out(tmp_run, "phase2_gate_decision.md")


def test_every_log_entry_has_required_keys_and_gated_ones_name_the_founder(tmp_run):
    ctx, _ = run(tmp_run, "strong.md", fx.scripted_llm(fx.strong_opportunities()), strong_answers())

    entries = ctx.log.entries()
    assert entries and all(REQUIRED <= set(e) for e in entries)
    decisions = [e for e in entries if e["action"].endswith("_decision") or e["action"] == "publish_signup_page"]
    assert len(decisions) == 7
    assert all(e["approved_by"] == "founder" and e["founder_input"] for e in decisions)
    assert {e["model"] for e in entries if e["agent"] in ("profiler", "research_intern", "boss")} >= {"fake"}


def test_nothing_is_published_when_the_founder_says_no(tmp_run):
    answers = strong_answers(publish_option="Keep it private",
                             publish_reason="I want to show the page to three students first before it goes out")
    ctx, result = run(tmp_run, "strong.md", fx.scripted_llm(fx.strong_opportunities()), answers)

    assert result.outcome == "go"
    assert not (tmp_run / "outputs" / "phase2_step2_signup_page.md").exists()
    assert not any(e["action"] == "publish_signup_page" for e in ctx.log.entries())


def test_boss_sends_slop_back_once_and_accepts_the_redraft(tmp_run):
    sloppy = fx.strong_opportunities()
    sloppy["opportunities"][0]["who"] = "Students who want to leverage their time."
    llm = fx.scripted_llm(fx.strong_opportunities(), overrides={"OpportunityDraft": [sloppy]})
    ctx, result = run(tmp_run, "strong.md", llm, strong_answers())

    actions = [e["action"] for e in ctx.log.entries()]
    assert actions.count("draft_opportunities") == 2
    assert actions.index("reject_draft") < actions.index("accept_phase1_step2")
    assert "leverage" not in out(tmp_run, "phase1_step2_opportunities.md")
    drafts = [user for _, user in llm.calls if "Give 2 or 3 opportunities" in user]
    assert "Banned phrase: leverage" in drafts[1] and result.outcome == "go"


def test_draft_still_failing_after_one_redraft_goes_to_founder_with_notes(tmp_run):
    sloppy = fx.strong_opportunities()
    sloppy["opportunities"][0]["who"] = "Students who want to leverage their time."
    llm = fx.scripted_llm(fx.strong_opportunities(), overrides={"OpportunityDraft": [sloppy, sloppy]})
    ctx, result = run(tmp_run, "strong.md", llm, strong_answers())

    assert [e["action"] for e in ctx.log.entries()].count("draft_opportunities") == 2
    assert "## Boss notes (did not pass)" in out(tmp_run, "phase1_step2_opportunities.md")
    assert result.outcome == "go"


def test_ethics_block_after_redraft_stops_the_run(tmp_run):
    bad = fx.strong_opportunities()
    bad["opportunities"][0]["risk"] = "Buyers make $500 a month, so demand is safe."
    llm = fx.scripted_llm(fx.strong_opportunities(), overrides={"OpportunityDraft": [bad, bad]})
    ctx, result = run(tmp_run, "strong.md", llm, strong_answers())

    assert result.outcome == "stop" and result.stopped_at == "phase1_step2"
    assert result.phase1 is None
    assert not (tmp_run / "outputs" / "phase1_step2_opportunities.md").exists()


def test_refused_brief_runs_nothing_else(tmp_run):
    ctx = Ctx(cfg=fx.config(), llm=fx.scripted_llm(fx.strong_opportunities()), search=fx.fake_search(),
              log=DecisionLog(tmp_run / "decision_log.json"), answers=ScriptedAnswers({}),
              run_dir=tmp_run, say=lambda text: None)

    result = run_pipeline(ctx, "Help me sell a crypto investment course")

    assert result.outcome == "refused" and ctx.llm.calls == []
    assert [e["action"] for e in ctx.log.entries()] == ["refuse_request"]


def test_signup_question_says_the_page_stayed_private():
    from api.orchestrator import signup_question

    assert signup_question(14, published=True) == "How many real people signed up in 14 days?"
    private = signup_question(14, published=False)
    assert private.startswith("You kept the page private.") and "showed it to them yourself" in private
