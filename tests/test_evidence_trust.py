"""Sourced means trustworthy: low-trust cards (forums, social, blogs on LinkedIn) do not count."""
import pipeline_fakes as fx
from api.agents import intern
from api.agents.profiler import FounderProfile
from api.gates import phase1_gate
from api.log import DecisionLog
from api.orchestrator import Ctx, ScriptedAnswers
from api.research import FakeSearch, SearchResult

LINKEDIN = "https://www.linkedin.com/pulse/microbus-routes-cairo"
BLOG = "https://medium.com/@someone/why-microbus-is-hard"
LOW_QUOTE = "nobody has a map of the microbus routes"
LOW_RESULTS = [SearchResult("Post", LINKEDIN, f"A post: {LOW_QUOTE}.", None),
               SearchResult("Blog", BLOG, f"A blog: {LOW_QUOTE}.", None)]


def _ctx(tmp_run, llm):
    search = FakeSearch({"ielts speaking practice egypt": fx.RESULTS + LOW_RESULTS})
    return Ctx(cfg=fx.config(), llm=llm, search=search,
               log=DecisionLog(tmp_run / "decision_log.json"), answers=ScriptedAnswers({}),
               run_dir=tmp_run, say=lambda text: None)


def _draft(tmp_run, urls, fit=4):
    opps = {"opportunities": [fx.opportunity(f"Idea {i}", u, fit=fit) for i, u in enumerate(urls)]}
    for opp, url in zip(opps["opportunities"], urls):
        if url in (LINKEDIN, BLOG):
            opp["evidence_quote"] = LOW_QUOTE  # a real quote, so only low trust keeps it from counting
    ctx = _ctx(tmp_run, fx.scripted_llm(opps))
    profile = FounderProfile.model_validate(fx.PROFILE)
    return intern.draft_opportunities(ctx, "brief", profile, intern.search(ctx, "brief", profile))


def test_low_trust_only_sources_do_not_count_as_sourced(tmp_run):
    assert _draft(tmp_run, [fx.LOW_URL, LINKEDIN, BLOG]).sourced == 0


def test_medium_and_high_sources_count_and_low_ones_do_not(tmp_run):
    assert _draft(tmp_run, [fx.LOW_URL, LINKEDIN, fx.URLS[1]]).sourced == 1


def test_a_low_source_next_to_a_medium_one_still_counts_once(tmp_run):
    opps = {"opportunities": [fx.opportunity("A", fx.URLS[0]), fx.opportunity("B", fx.URLS[1])]}
    opps["opportunities"][0]["evidence_urls"] = [fx.LOW_URL, fx.URLS[0]]
    ctx = _ctx(tmp_run, fx.scripted_llm(opps))
    profile = FounderProfile.model_validate(fx.PROFILE)

    draft = intern.draft_opportunities(ctx, "brief", profile, intern.search(ctx, "brief", profile))

    assert draft.sourced == 2


def test_microbus_style_result_with_only_social_sources_and_weak_fit_gets_stop(tmp_run):
    draft = _draft(tmp_run, [fx.LOW_URL, LINKEDIN, BLOG], fit=2)

    assert phase1_gate(draft.sourced, draft.founder_fit, fx.config()).outcome == "stop"


def test_low_sources_only_with_good_fit_recommends_stop_not_go(tmp_run):
    draft = _draft(tmp_run, [fx.LOW_URL, LINKEDIN, BLOG], fit=5)

    assert phase1_gate(draft.sourced, draft.founder_fit, fx.config()).outcome == "stop"


def test_two_trusted_of_three_with_good_fit_recommends_repeat(tmp_run):
    draft = _draft(tmp_run, [fx.LOW_URL, fx.URLS[0], fx.URLS[1]], fit=5)

    assert draft.sourced == 2
    assert phase1_gate(draft.sourced, draft.founder_fit, fx.config()).outcome == "repeat"


def test_canvas_boxes_resting_on_low_sources_are_not_counted(tmp_run):
    llm = fx.scripted_llm({}, overrides={"LeanCanvas": [fx.canvas(fx.LOW_URL)]})
    ctx = _ctx(tmp_run, llm)
    profile = FounderProfile.model_validate(fx.PROFILE)
    intern.search(ctx, "brief", profile)
    opp = intern.Opportunity.model_validate(fx.opportunity("Speaking drills", fx.URLS[0]))

    draft = intern.draft_lean_canvas(ctx, opp, profile, "I coached 300 students")

    assert draft.sourced == 0
