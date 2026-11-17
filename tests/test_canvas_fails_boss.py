"""A Lean Canvas the boss fails twice is not turned into a sign-up page to publish."""
from pathlib import Path

import pipeline_fakes as fx
from api.log import DecisionLog
from api.orchestrator import Ctx, run_pipeline
from test_pipeline import strong_answers

ROOT = Path(__file__).resolve().parent.parent
PASS = {"verdict": "pass", "checks": [], "delete_lines": []}
FAIL = {"verdict": "fail", "delete_lines": [],
        "checks": [{"name": "clarity", "pass": False, "reason": "The value line says nothing specific."}]}


def _run(tmp_run, boss_replies):
    llm = fx.scripted_llm(fx.strong_opportunities(), overrides={"BossVerdict": boss_replies})
    said: list[str] = []
    answers = strong_answers()
    ctx = Ctx(cfg=fx.config(), llm=llm, search=fx.fake_search(),
              log=DecisionLog(tmp_run / "decision_log.json"), answers=answers,
              run_dir=tmp_run, say=said.append)
    result = run_pipeline(ctx, (ROOT / "briefs" / "strong.md").read_text(encoding="utf-8"))
    return ctx, result, said, answers


def test_canvas_failing_the_boss_twice_does_not_offer_publishing(tmp_run):
    ctx, result, said, answers = _run(tmp_run, [PASS, FAIL, FAIL])

    assert result.outcome == "repeat" and result.stopped_at == "phase2_step1"
    assert result.phase2 is None
    assert "publish_option" not in [k for k, _ in answers.asked]
    assert not (tmp_run / "outputs" / "phase2_step2_signup_page.md").exists()
    assert not any("Publish this sign-up page?" in m for m in said)


def test_founder_is_told_plainly_and_the_reasons_are_logged(tmp_run):
    ctx, result, said, _ = _run(tmp_run, [PASS, FAIL, FAIL])

    assert any("Lean Canvas" in m and "did not pass" in m and "value line says nothing specific" in m for m in said)
    entry = next(e for e in ctx.log.entries() if e["action"] == "stop_canvas_failed_review")
    assert entry["agent"] == "orchestrator" and entry["outcome"] == "repeat"
    assert any("value line says nothing specific" in r for r in entry["reasons"])


def test_canvas_passing_after_one_redraft_still_offers_publishing(tmp_run):
    ctx, result, said, answers = _run(tmp_run, [PASS, FAIL, PASS])

    assert result.outcome == "go"
    assert "publish_option" in [k for k, _ in answers.asked]
