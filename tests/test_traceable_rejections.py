"""A rejected draft must be traceable: the log says why, and the draft is kept."""
from pathlib import Path

import pipeline_fakes as fx
from api.log import DecisionLog
from api.orchestrator import Ctx, ScriptedAnswers, run_pipeline

ROOT = Path(__file__).resolve().parent.parent


def promise_opps():
    opp = fx.opportunity("Exam kit", fx.URLS[0])
    opp["problem"] = "Students who buy this will make $500 a month guaranteed."
    return {"opportunities": [opp, fx.opportunity("Flashcards", fx.URLS[1])]}


def blocked_run(tmp_run):
    said = []
    ctx = Ctx(cfg=fx.config(), llm=fx.scripted_llm(promise_opps()), search=fx.fake_search(),
              log=DecisionLog(tmp_run / "decision_log.json"),
              answers=ScriptedAnswers({"intake": ["I tutor 40 students", "15 hours a week"]}),
              run_dir=tmp_run, say=said.append)
    result = run_pipeline(ctx, (ROOT / "briefs" / "strong.md").read_text(encoding="utf-8"))
    return ctx, result, said


def test_reject_entries_carry_the_reasons(tmp_run):
    ctx, _, _ = blocked_run(tmp_run)
    rejects = [e for e in ctx.log.entries() if e["action"] == "reject_draft"]
    assert rejects and all(e.get("reasons") for e in rejects)
    assert any("income" in r.lower() for e in rejects for r in e["reasons"])


def test_a_twice_blocked_draft_is_kept_with_its_reasons(tmp_run):
    _, result, said = blocked_run(tmp_run)
    assert result.outcome == "stop"
    kept = (tmp_run / "outputs" / "phase1_step2_rejected_draft.md").read_text(encoding="utf-8")
    assert "make $500 a month" in kept and "Why it was blocked" in kept
    assert any("income" in s.lower() for s in said), said
