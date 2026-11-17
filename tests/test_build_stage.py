"""Phase 3 Build: user stories, a 2-week MVP plan and the build gate, after a Phase 2 go."""
import json

import pytest
from fastapi.testclient import TestClient

import pipeline_fakes as fx
from api.app import create_app
from api.gates import phase3_gate
from api.log import DecisionLog
from api.orchestrator import Ctx, run_pipeline
from api.plan import build_plan
from test_app import BRIEF, REASON1, REASON2, REASON3, answer, decide, start
from test_pipeline import out, run, strong_answers


def go_run(tmp_run, stories=None, **changes):
    overrides = {"UserStories": [stories]} if stories else None
    llm = fx.scripted_llm(fx.strong_opportunities(), overrides=overrides)
    return run(tmp_run, "strong.md", llm, strong_answers(**changes))


def test_go_at_phase2_continues_into_build_and_writes_both_files_and_the_gate(tmp_run):
    ctx, result = go_run(tmp_run)

    assert result.outcome == "go" and result.stopped_at == "phase3_gate"
    assert result.phase3.outcome == "go"
    stories = out(tmp_run, "phase3_step1_user_stories.md")
    assert stories.count("As a ") >= 5 and "Acceptance criteria" in stories
    assert "Priority: must" in stories and "Priority: should" in stories and "Priority: could" in stories
    assert "Smallest way to deliver it first" in stories and "ASSUMPTION" in stories
    plan = out(tmp_run, "phase3_step2_mvp_spec.md")
    for part in ("What to build", "What not to build", "Tools", "Checklist", "First 10 users", "One number to watch"):
        assert part in plan
    assert "IELTS Alexandria WhatsApp group" in plan
    gate = out(tmp_run, "phase3_gate_decision.md")
    assert "- Picked: Build this MVP" in gate and REASON3 in gate and "go:" in gate


def test_run_ends_with_the_next_step_message_and_done_state(tmp_run):
    said: list[str] = []
    run_dir = tmp_run / "b"
    ctx = Ctx(cfg=fx.config(), llm=fx.scripted_llm(fx.strong_opportunities()), search=fx.fake_search(),
              log=DecisionLog(run_dir / "decision_log.json"), answers=strong_answers(),
              run_dir=run_dir, say=said.append)

    run_pipeline(ctx, BRIEF)

    assert any("Your MVP plan is ready. Next: pricing and setup." in m for m in said)
    state = json.loads((run_dir / "state.json").read_text())
    assert state["outcome"] == "go" and state["phase3"] == "go"


def test_build_gate_is_logged_gated_with_the_founders_words(tmp_run):
    ctx, _ = go_run(tmp_run)

    entry = next(e for e in ctx.log.entries() if e["action"] == "phase3_decision")
    assert entry["approved_by"] == "founder" and entry["founder_input"] == REASON3
    actions = [e["action"] for e in ctx.log.entries()]
    assert actions.count("draft_user_stories") == 1 and actions.count("draft_mvp_plan") == 1
    assert "accept_phase3_step1" in actions and "accept_phase3_step2" in actions


def test_must_stories_over_two_weeks_of_hours_recommend_cutting_scope(tmp_run):
    ctx, result = go_run(tmp_run, stories=fx.user_stories(must_hours=30), phase3_option="Cut the scope further",
                         phase3_reason="Thirty hours is too much for my two weeks so I will cut the list down")

    assert result.phase3.outcome == "repeat" and result.outcome == "repeat"
    gate = out(tmp_run, "phase3_gate_decision.md")
    assert "repeat: 30 hours" in gate and "20 hours" in gate and "cut" in gate.lower()
    assert "- Picked: Cut the scope further" in gate


def test_gate_rule_fits_exactly_and_just_over():

    assert phase3_gate(20, 20).outcome == "go"
    assert phase3_gate(21, 20).outcome == "repeat"
    with pytest.raises(ValueError):
        phase3_gate(5, 0)


def test_bare_yes_at_the_build_gate_is_rejected_and_reasked(tmp_run):
    answers = strong_answers(phase3_reason=["yes", REASON3])
    ctx, result = run(tmp_run, "strong.md", fx.scripted_llm(fx.strong_opportunities()), answers)

    assert result.outcome == "go"
    assert [k for k, _ in answers.asked].count("phase3_reason") == 2
    assert f'"{REASON3}"' in out(tmp_run, "phase3_gate_decision.md")


@pytest.mark.parametrize("changes", [
    {"signups": "12", "phase2_option": "Stop or pivot",
     "phase2_reason": "Twelve sign-ups is far below the target so this idea should stop now"},
    {"signups": "60", "phase2_option": "Repeat the test",
     "phase2_reason": "Sixty is above the stop line but below the target so I will run one more window"}])
def test_no_build_phase_on_stop_or_repeat(tmp_run, changes):
    ctx, result = go_run(tmp_run, **changes)

    assert result.phase3 is None and result.outcome in ("stop", "repeat")
    assert not list((tmp_run / "outputs").glob("phase3_*"))
    assert not any("phase3" in e["action"] or "user_stories" in e["action"] for e in ctx.log.entries())


def test_ethics_block_on_the_stories_stops_before_the_gate(tmp_run):
    bad = fx.user_stories()
    bad["stories"][0]["first_version"] = "Students make $500 a month, so demand is safe."
    llm = fx.scripted_llm(fx.strong_opportunities(), overrides={"UserStories": [bad, bad]})

    ctx, result = run(tmp_run, "strong.md", llm, strong_answers())

    assert result.outcome == "stop" and result.stopped_at == "phase3_step1"
    assert not (tmp_run / "outputs" / "phase3_gate_decision.md").exists()


def test_back_to_validation_ends_the_run_as_a_pivot(tmp_run):
    ctx, result = go_run(tmp_run, phase3_option="Go back to validation",
                         phase3_reason="I want to talk to five more students before I spend two weeks building")

    assert result.outcome == "pivot" and result.phase3.outcome == "go"


def test_plan_has_a_build_section_with_stories_and_mvp_plan(tmp_run):
    go_run(tmp_run)

    plan = build_plan(tmp_run, {"stage": "phase3_gate", "status": "done", "outcome": "go"})
    sections = {s["id"]: s for s in plan["sections"]}

    assert [s["id"] for s in plan["sections"]][-2:] == ["build", "decisions"]
    assert sections["build"]["title"] == "Build" and sections["build"]["status"] == "written"
    assert "As a " in sections["build"]["body_markdown"] and "What not to build" in sections["build"]["body_markdown"]
    assert "Phase 3 gate" in sections["decisions"]["body_markdown"]


def test_api_phase3_gate_is_pending_with_three_options_then_run_is_done(tmp_run):
    app = create_app(llm_factory=lambda *a: fx.scripted_llm(fx.strong_opportunities()),
                     search_factory=lambda cfg: fx.fake_search())
    with TestClient(app) as client:
        run_id = start(client)
        answer(client, run_id, "I can reach 420 students today")
        answer(client, run_id, "I can spend EGP 2,000")
        decide(client, run_id, "Speaking drills", REASON1)
        answer(client, run_id, "I coached 300 students and scored band 8.5")
        decide(client, run_id, "Publish the sign-up page", REASON1)
        answer(client, run_id, "130")
        state = decide(client, run_id, "Continue to Build", REASON2)

        assert state["status"] == "gate" and state["stage"] == "phase3_gate"
        assert state["pending"]["key"] == "phase3"
        assert [o["name"] for o in state["pending"]["options"]] == [
            "Build this MVP", "Cut the scope further", "Go back to validation"]
        assert state["pending"]["prompt"].startswith("go:")
        assert {"phase3_step1_user_stories.md", "phase3_step2_mvp_spec.md"} <= set(state["outputs"])

        bad = client.post(f"/runs/{run_id}/gate", json={"option": "Build this MVP", "reason": "yes"})
        assert bad.status_code == 422
        state = decide(client, run_id, "Build this MVP", REASON3)
        assert state["status"] == "done" and state["outcome"] == "go" and state["phase3"] == "go"


@pytest.mark.parametrize("constraints,expected", [
    (["10 hours a week", "EGP 2,000 to spend"], (10, True)),
    (["I have 5-8 hrs per week"], (5, True)),
    (["2 hours a day"], (5, False)),
    ([], (5, False))])
def test_weekly_hours_reads_the_profile_and_falls_back_to_five(constraints, expected):
    from api.agents.intern import weekly_hours
    from api.agents.profiler import FounderProfile

    profile = FounderProfile.model_validate({**fx.PROFILE, "constraints": constraints})

    assert weekly_hours(profile) == expected
