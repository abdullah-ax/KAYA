"""A bare yes or filler to a Profiler question is re-asked once, then recorded as an assumption."""
import json

import pipeline_fakes as fx
from api.agents import profiler
from api.log import DecisionLog
from api.orchestrator import Ctx, ScriptedAnswers

MORE = "Tell me in a few more words"


def _ctx(tmp_run, answers, questions=1):
    return Ctx(cfg=fx.config(), llm=fx.scripted_llm(fx.strong_opportunities(), questions=questions),
               search=fx.fake_search(), log=DecisionLog(tmp_run / "decision_log.json"),
               answers=answers, run_dir=tmp_run, say=lambda text: None)


def _intake(tmp_run):
    return json.loads((tmp_run / "outputs" / "phase1_step1_founder_profile.json").read_text())["intake"]


def test_bare_yes_is_reasked_once_with_a_nudge_and_the_fuller_answer_is_kept(tmp_run):
    answers = ScriptedAnswers({"intake": ["yes", "I teach IELTS speaking in Alexandria"]})
    ctx = _ctx(tmp_run, answers)

    profiler.run(ctx, "brief")

    assert [k for k, _ in answers.asked] == ["intake", "intake"]
    assert MORE not in answers.asked[0][1] and MORE in answers.asked[1][1]
    assert _intake(tmp_run) == [{"question": "Gap question 0?", "answer": "I teach IELTS speaking in Alexandria"}]


def test_second_bare_answer_is_recorded_as_assumption_no_answer(tmp_run):
    answers = ScriptedAnswers({"intake": ["ok", "yes"]})
    ctx = _ctx(tmp_run, answers)

    profiler.run(ctx, "brief")

    assert len(answers.asked) == 2
    assert _intake(tmp_run)[0]["answer"] == "ASSUMPTION: no answer"
    logged = [e for e in ctx.log.entries() if e["action"] == "answer_question"]
    assert logged[0]["founder_input"] == "ASSUMPTION: no answer"


def test_filler_phrases_and_empty_answers_count_as_bare(tmp_run):
    for filler in ["looks good", "Yes!", "ok ok", ""]:
        answers = ScriptedAnswers({"intake": [filler, "I can reach 420 students today"]})
        profiler.run(_ctx(tmp_run, answers), "brief")
        assert len(answers.asked) == 2, filler


def test_a_short_real_answer_is_not_reasked(tmp_run):
    for real in ["Cairo", "420", "EGP 2,000"]:
        answers = ScriptedAnswers({"intake": [real]})
        profiler.run(_ctx(tmp_run, answers), "brief")
        assert len(answers.asked) == 1, real


def test_each_question_gets_its_own_single_retry(tmp_run):
    answers = ScriptedAnswers({"intake": ["yes", "ok", "yes", "I can spend EGP 2,000"]})
    profiler.run(_ctx(tmp_run, answers, questions=2), "brief")

    assert [x["answer"] for x in _intake(tmp_run)] == ["ASSUMPTION: no answer", "I can spend EGP 2,000"]
