"""The classic Egyptian get-rich plan: buy chicks, they lay eggs, the eggs hatch, repeat, buy a Bentley.

It breaks two rules at once (physical goods, income promises) and rests on growth that
assumes nothing dies and nothing costs money. The system must refuse it plainly, say why,
and offer an honest digital alternative in the same area.
"""
from pathlib import Path

from fastapi.testclient import TestClient

import pipeline_fakes as fx
from api.app import create_app
from api.guardrail import check_request

ROOT = Path(__file__).resolve().parent.parent
CHICKS = (ROOT / "briefs" / "chicks_to_bentley.md").read_text(encoding="utf-8")

PLANS = [
    CHICKS,
    "Buy 50 chicks, they grow up and lay eggs, the eggs hatch more chicks, and in two years I buy a Bentley.",
    "My business: raise chickens, sell the eggs, hatch more hens, repeat until I'm rich.",
    "هشتري ٥٠ كتكوت، يكبروا ويبيضوا، والبيض يفقس فراخ تانية، وبعد سنتين أجيب بنتلي",
]


def test_every_version_of_the_plan_is_refused_as_physical_goods():
    for plan in PLANS:
        v = check_request(plan)
        assert not v.allowed, plan
        assert v.rule == "Physical goods not allowed", plan


def test_the_refusal_also_names_the_income_promise():
    v = check_request(PLANS[1])
    assert "No income promises" in v.also


def test_the_refusal_explains_the_growth_fantasy_and_offers_a_digital_idea():
    v = check_request(PLANS[1])
    assert "digital" in v.alternative.lower()
    assert "every chick lives" in v.alternative and "ASSUMPTION" in v.alternative


def test_luxury_car_promises_are_income_promises_even_for_digital_products():
    v = check_request("An online course on Excel that makes you enough to buy a Lamborghini")
    assert not v.allowed and v.rule == "No income promises"


def test_ordinary_chicken_and_egg_words_are_fine_in_a_digital_product():
    for ok in ["A cookbook of 30 Egyptian chicken recipes as a PDF",
               "A spreadsheet that tracks feed costs for small poultry farmers",
               "I will never sell eggs or raise chickens; I want a digital product."]:
        assert check_request(ok).allowed, ok


def test_trick_prompt_table_keeps_the_case():
    assert "chicks" in (ROOT / "evals" / "trick_prompts.md").read_text(encoding="utf-8").lower()


def test_the_api_refuses_the_plan_and_tells_the_founder_both_rules(tmp_run):
    app = create_app(llm_factory=lambda *a: fx.scripted_llm(fx.strong_opportunities()),
                     search_factory=lambda cfg: fx.fake_search())
    with TestClient(app) as c:
        state = c.post("/runs", json={"brief": CHICKS}).json()
    assert state["status"] == "done" and state["outcome"] == "refused"
    said = " ".join(state["messages"])
    assert "Physical goods not allowed" in said and "No income promises" in said
    assert "every chick lives" in said
