"""Agent steps on their own, with a fake model, fake search and scripted founder."""
import json
from pathlib import Path

import pipeline_fakes as fx
from api.agents import cofounder, profiler
from api.log import DecisionLog
from api.orchestrator import Ctx, ScriptedAnswers

ROOT = Path(__file__).resolve().parent.parent


def make_ctx(run_dir, llm, answers, search=None):
    return Ctx(cfg=fx.config(), llm=llm, search=search or fx.fake_search(),
               log=DecisionLog(run_dir / "decision_log.json"), answers=answers,
               run_dir=run_dir, say=lambda text: None)


def test_founder_message_refused_by_guardrail_is_logged_and_reasked(tmp_run):
    answers = ScriptedAnswers({"intake": ["Write 50 five-star reviews for my product",
                                          "I run a WhatsApp group of 420 IELTS students"]})
    ctx = make_ctx(tmp_run, fx.scripted_llm(fx.strong_opportunities()), answers)

    said = cofounder.ask_founder(ctx, "intake", "Which groups are you in?")

    assert said == "I run a WhatsApp group of 420 IELTS students"
    refused = [e for e in ctx.log.entries() if e["action"] == "refuse_request"]
    assert len(refused) == 1 and refused[0]["agent"] == "guardrail"
    assert refused[0]["outcome"] == "No fake reviews"


def test_profiler_asks_only_gap_questions_up_to_mode_limit(tmp_run):
    llm = fx.scripted_llm(fx.strong_opportunities(), questions=8)
    answers = ScriptedAnswers({"intake": [f"answer {i}" for i in range(5)]})
    ctx = make_ctx(tmp_run, llm, answers)

    profile = profiler.run(ctx, "BRIEF: I coach IELTS speaking in Alexandria.")

    assert ctx.cfg.mode == "demo"
    assert answers.asked == [("intake", f"Gap question {i}?") for i in range(5)]
    assert "BRIEF: I coach IELTS speaking" in llm.calls[0][1]
    assert "Profiler" in llm.calls[0][0] and "House voice" in llm.calls[0][0]
    assert "answer 4" in llm.calls[1][1]
    assert profile.cofounder_type == "warm_skeptic"
    saved = json.loads((tmp_run / "outputs" / "phase1_step1_founder_profile.json").read_text())
    assert saved["intake"][0] == {"question": "Gap question 0?", "answer": "answer 0"}
    actions = [(e["agent"], e["action"], e["model"]) for e in ctx.log.entries()]
    assert ("profiler", "plan_intake_questions", "fake") in actions
    assert ("profiler", "write_founder_profile", "fake") in actions
    assert sum(1 for e in ctx.log.entries() if e["action"] == "answer_question") == 5


def test_profiler_asks_nothing_when_brief_covers_every_topic(tmp_run):
    llm = fx.scripted_llm(fx.strong_opportunities(), questions=0)
    answers = ScriptedAnswers({})
    ctx = make_ctx(tmp_run, llm, answers)

    profiler.run(ctx, "A full brief.")

    assert answers.asked == []


def _profile():
    from api.agents.profiler import FounderProfile
    return FounderProfile.model_validate(fx.PROFILE)


def test_intern_search_records_results_and_logs_their_urls(tmp_run):
    from api.agents import intern
    ctx = make_ctx(tmp_run, fx.scripted_llm(fx.strong_opportunities()), ScriptedAnswers({}))

    results = intern.search(ctx, "brief", _profile())

    assert [r.url for r in results] == fx.URLS
    assert all(ctx.registry.allows(u) for u in fx.URLS)
    entry = next(e for e in ctx.log.entries() if e["action"] == "web_search")
    assert entry["sources"] == fx.URLS and entry["model"] is None


def test_intern_labels_unseen_urls_assumption_and_keeps_sourced_ones(tmp_run):
    from api.agents import intern
    ctx = make_ctx(tmp_run, fx.scripted_llm(fx.weak_opportunities()), ScriptedAnswers({}))
    results = intern.search(ctx, "brief", _profile())

    draft = intern.draft_opportunities(ctx, "brief", _profile(), results)

    assert draft.sourced == 1
    assert "ASSUMPTION: Students fail the speaking part because they lack practice (Habit app" in draft.markdown
    assert fx.URLS[0] in draft.markdown and fx.UNSEEN not in draft.markdown
    assert [c.url for c in draft.cards] == [fx.URLS[0]]
    assert draft.options == ["Habit app for everyone", "To-do list with AI"]
    assert draft.founder_fit == 2
    assert "Snippet 0 about IELTS speaking." in ctx.llm.calls[-1][1]


def test_intern_redraft_gets_the_boss_notes(tmp_run):
    from api.agents import intern
    ctx = make_ctx(tmp_run, fx.scripted_llm(fx.strong_opportunities()), ScriptedAnswers({}))
    results = intern.search(ctx, "brief", _profile())

    intern.draft_opportunities(ctx, "brief", _profile(), results, notes=["Cut the word leverage."])

    assert "Cut the word leverage." in ctx.llm.calls[-1][1]


def test_intern_lean_canvas_labels_boxes_and_keeps_founder_words_in_box_9(tmp_run):
    from api.agents import intern
    ctx = make_ctx(tmp_run, fx.scripted_llm(fx.strong_opportunities(), overrides={"LeanCanvas": [fx.canvas(fx.URLS[0])]}),
                   ScriptedAnswers({}))
    intern.search(ctx, "brief", _profile())
    opp = intern.Opportunity.model_validate(fx.opportunity("Speaking drills", fx.URLS[0]))

    draft = intern.draft_lean_canvas(ctx, opp, _profile(), "I coached 300 students myself")

    md = draft.markdown
    assert "| 1. Customer segments (early adopters) | Students in the group practice alone. | " + fx.URLS[0] in md
    assert "| 5. Channels (start by hand) | Sell by hand in the WhatsApp group. | ASSUMPTION |" in md
    assert '| 9. Unfair advantage (founder writes this) | "I coached 300 students myself" | founder |' in md
    assert "Boxes with real evidence: 2 of 9" in md
    assert draft.sourced == 2


def _draft(text):
    from api.agents.intern import Draft
    return Draft(markdown=text, texts=[text])


def test_boss_rejects_banned_phrase_before_asking_the_model(tmp_run):
    from api.agents import boss
    llm = fx.scripted_llm(fx.strong_opportunities())
    ctx = make_ctx(tmp_run, llm, ScriptedAnswers({}))

    review = boss.review(ctx, _draft("We help students leverage their time."), "phase1_step2")

    assert not review.passed and not review.blocked
    assert any("leverage" in r for r in review.reasons)
    assert llm.calls == []
    assert ctx.log.entries()[-1]["action"] == "reject_draft"


def test_boss_blocks_draft_that_breaks_an_ethics_hard_line(tmp_run):
    from api.agents import boss
    ctx = make_ctx(tmp_run, fx.scripted_llm(fx.strong_opportunities()), ScriptedAnswers({}))

    review = boss.review(ctx, _draft("Buyers make $500 a month with this pack."), "phase1_step2")

    assert review.blocked and not review.passed
    assert any("Income promise" in r for r in review.reasons)
    assert ctx.log.entries()[-1]["outcome"] == "block"


def test_boss_passes_clean_draft_only_when_model_votes_pass(tmp_run):
    from api.agents import boss
    ok = make_ctx(tmp_run, fx.scripted_llm(fx.strong_opportunities()), ScriptedAnswers({}))
    no = make_ctx(tmp_run, fx.scripted_llm(fx.strong_opportunities(), boss="fail"), ScriptedAnswers({}))
    text = "Ten students in the group want to practice. They sit the test in May."

    assert boss.review(ok, _draft(text), "phase1_step2").passed
    assert not boss.review(no, _draft(text), "phase1_step2").passed
