"""Phase 1, step 3: a Mom Test interview script, written after the founder picks an opportunity."""
import re
from pathlib import Path

import pipeline_fakes as fx
from api.agents import intern
from api.agents.profiler import FounderProfile
from api.log import DecisionLog
from api.orchestrator import Ctx, ScriptedAnswers
from test_pipeline import out, run, strong_answers

ROOT = Path(__file__).resolve().parent.parent
HYPOTHETICAL = re.compile(r"\b(would you (buy|pay|use|download|subscribe)|will you (buy|pay)|"
                          r"how much would you|do you think you would|if i (made|built|offered))\b", re.I)


def _numbered(md: str) -> list[str]:
    return re.findall(r"^\d+\. (.+)$", md, flags=re.M)


def test_pipeline_writes_the_interview_script_after_the_phase1_pick(tmp_run):
    ctx, result = run(tmp_run, "strong.md", fx.scripted_llm(fx.strong_opportunities()), strong_answers())

    md = out(tmp_run, "phase1_step3_interview_script.md")
    assert md.startswith("# Interview script (Phase 1, step 3)")
    questions = _numbered(md)
    assert len(questions) == 5
    assert not HYPOTHETICAL.search(md)
    assert "Who to ask first" in md and "IELTS Alexandria WhatsApp group" in md
    assert "## Notes per interview" in md and "Close:" in md
    assert "[the thing]" not in md


def test_interview_script_goes_through_the_boss_and_is_logged(tmp_run):
    ctx, _ = run(tmp_run, "strong.md", fx.scripted_llm(fx.strong_opportunities()), strong_answers())

    actions = [e["action"] for e in ctx.log.entries()]
    assert "draft_interview_script" in actions and "accept_phase1_step3" in actions
    assert actions.index("draft_interview_script") > actions.index("phase1_gate")


def test_no_script_when_the_founder_stops_at_the_phase1_gate(tmp_run):
    answers = strong_answers(phase1_option="Stop here", phase1_reason="The gate says stop and I agree with it")
    _, result = run(tmp_run, "strong.md", fx.scripted_llm(fx.strong_opportunities()), answers)

    assert result.outcome == "stop"
    assert not (tmp_run / "outputs" / "phase1_step3_interview_script.md").exists()


def test_would_you_buy_questions_are_replaced_with_past_behaviour_questions(tmp_run):
    bad = fx.interview_script()
    bad["questions"][1] = "Would you buy a speaking partner app for EGP 100?"
    bad["questions"][3] = "How much would you pay for it?"
    ctx = Ctx(cfg=fx.config(), llm=fx.scripted_llm(fx.strong_opportunities(), overrides={"InterviewScript": [bad]}),
              search=fx.fake_search(), log=DecisionLog(tmp_run / "decision_log.json"),
              answers=ScriptedAnswers({}), run_dir=tmp_run, say=lambda text: None)
    opp = intern.Opportunity.model_validate(fx.opportunity("Speaking drills", fx.URLS[0]))

    draft = intern.draft_interview_script(ctx, opp, FounderProfile.model_validate(fx.PROFILE))

    questions = _numbered(draft.markdown)
    assert len(questions) == 5 and len(set(questions)) == 5
    assert not HYPOTHETICAL.search(draft.markdown)
    assert questions[0] == bad["questions"][0]


def test_template_is_the_source_of_the_structure():
    template = (ROOT / "templates" / "interview_script.md").read_text(encoding="utf-8")
    assert "Mom Test" in template or "past" in template.lower() or "What have you done" in template
