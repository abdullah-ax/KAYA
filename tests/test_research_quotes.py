"""A cited source must hold the words it is cited for: the quote is checked against the stored snippet."""
import json

import pipeline_fakes as fx
from api.agents import intern
from api.agents.profiler import FounderProfile
from api.log import DecisionLog
from api.orchestrator import Ctx, ScriptedAnswers
from api.research import SearchResult, SourceRegistry, quote_found, write_sources

BLS = SearchResult("Freelancer pay survey", "https://www.bls.gov/survey",
                   "In 2025, 41% of freelancers said clients paid them late.", "bing")


def _registry() -> SourceRegistry:
    reg = SourceRegistry()
    reg.record([BLS])
    return reg


def test_card_stores_the_snippet_title_and_host_from_the_search():
    card = _registry().card(BLS.url + "/", "Late pay is common.")
    assert card.snippet == BLS.snippet and card.title == BLS.title and card.host == "bls.gov"


def test_quote_match_ignores_case_spaces_and_small_punctuation():
    text = BLS.snippet
    assert quote_found("41% of freelancers said clients paid them late", text)
    assert quote_found("41%  OF freelancers said, clients paid them late.", text)
    assert quote_found("“41% of freelancers said clients paid them late”", text)
    assert not quote_found("most freelancers are paid late", text)
    assert not quote_found("", text)
    assert not quote_found("late", text)  # one word proves nothing


def test_registry_verifies_quote_against_snippet_or_title_only():
    reg = _registry()
    assert reg.verify(BLS.url, "clients paid them late")
    assert reg.verify(BLS.url, "freelancer pay survey")
    assert not reg.verify(BLS.url, "freelancers earn less every year")
    assert not reg.verify("https://unseen.example.com/x", "clients paid them late")


def test_source_json_keeps_the_verified_quote_and_the_snippet(tmp_run):
    card = _registry().card(BLS.url, "Late pay is common.", quote="clients paid them late")
    entry = json.loads(write_sources(tmp_run / "phase1_step2_sources.json", [card]).read_text())[0]
    assert entry["quote_or_number"] == "clients paid them late"
    assert entry["snippet"] == BLS.snippet and entry["publisher"] == "bls.gov"


def _ctx(tmp_run, llm):
    return Ctx(cfg=fx.config(), llm=llm, search=fx.fake_search(),
               log=DecisionLog(tmp_run / "decision_log.json"), answers=ScriptedAnswers({}),
               run_dir=tmp_run, say=lambda text: None)


def _opportunities(tmp_run, opps):
    ctx = _ctx(tmp_run, fx.scripted_llm(opps))
    profile = FounderProfile.model_validate(fx.PROFILE)
    return intern.draft_opportunities(ctx, "brief", profile, intern.search(ctx, "brief", profile))


def test_quote_not_in_the_snippet_makes_the_problem_an_assumption(tmp_run):
    opps = fx.strong_opportunities()
    opps["opportunities"][0]["evidence_quote"] = "90% of students fail speaking"
    draft = _opportunities(tmp_run, opps)

    assert draft.sourced == 2
    assert "ASSUMPTION: Students fail the speaking part because they lack practice (Speaking drills)" in draft.markdown
    assert fx.URLS[0] not in [c.url for c in draft.cards]


def test_missing_quote_makes_the_problem_an_assumption(tmp_run):
    opps = fx.strong_opportunities()
    for opp in opps["opportunities"]:
        opp["evidence_quote"] = ""
    draft = _opportunities(tmp_run, opps)

    assert draft.sourced == 0 and draft.cards == []


def test_verified_quote_is_shown_next_to_the_url(tmp_run):
    draft = _opportunities(tmp_run, fx.strong_opportunities())

    assert draft.sourced == 3
    quote = fx.QUOTES[fx.URLS[1]]
    assert f'- Evidence: {fx.URLS[1]}\n  > "{quote}" (britishcouncil.org)' in draft.markdown
    assert all(c.quote for c in draft.cards)


def test_quote_drops_only_the_urls_that_do_not_hold_it(tmp_run):
    opps = fx.strong_opportunities()
    opps["opportunities"][0]["evidence_urls"] = [fx.URLS[1], fx.URLS[0]]  # quote is from URLS[0]
    draft = _opportunities(tmp_run, opps)

    first = draft.markdown.split("## Option B")[0]
    assert fx.URLS[0] in first and fx.URLS[1] not in first


def test_canvas_box_needs_a_matching_quote_and_shows_it(tmp_run):
    good = fx.canvas(fx.URLS[0])
    bad = fx.canvas(fx.URLS[0])
    bad["problem"] = {"content": "Students practice alone.", "source_url": fx.URLS[0],
                      "source_quote": "nobody in Egypt practices"}
    llm = fx.scripted_llm({}, overrides={"LeanCanvas": [good, bad]})
    ctx = _ctx(tmp_run, llm)
    profile = FounderProfile.model_validate(fx.PROFILE)
    intern.search(ctx, "brief", profile)
    opp = intern.Opportunity.model_validate(fx.opportunity("Speaking drills", fx.URLS[0]))

    shown = intern.draft_lean_canvas(ctx, opp, profile, "I coached 300 students")
    assert shown.sourced == 2
    assert f'{fx.URLS[0]} > "{fx.QUOTES[fx.URLS[0]]}" (ielts-speaking-club.com)' in shown.markdown

    checked = intern.draft_lean_canvas(ctx, opp, profile, "I coached 300 students")
    assert checked.sourced == 1
    assert "| 2. Problem (top 3 + current fixes) | ASSUMPTION: Students practice alone. | ASSUMPTION |" in checked.markdown
