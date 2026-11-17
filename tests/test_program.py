"""The accelerator program: six stage cards, verified links only, no income promises."""
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import pipeline_fakes as fx
from api import program
from api.app import create_app
from api.guardrail import check_request

ROOT = Path(__file__).resolve().parent.parent
STAGES = ["ideation", "validation", "build", "pricing", "distribution", "operate"]
PARTS = ["goal", "lead", "joins", "big_question", "questions", "do_today", "ship", "metric", "learn", "case", "review"]


def verified_urls() -> set[str]:
    data = (ROOT / "web/src/components/boardroom/data.ts").read_text(encoding="utf-8")
    sist = (ROOT / "kb/method/sistilli_map.md").read_text(encoding="utf-8")
    urls = set(re.findall(r'url: "(https?://[^"]+)"', data))
    urls |= set(re.findall(r"\]\((https?://[^\s]+?)\)(?=[,\s|.]|$)", sist))
    return urls


def strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from strings(v)
    elif isinstance(node, (list, tuple)):
        for v in node:
            yield from strings(v)


WORDS = {"group": "420 students in my WhatsApp group", "skill": "speaking English", "market": "English practice"}


def test_there_are_six_stages_in_order():
    assert program.STAGE_ORDER == STAGES


@pytest.mark.parametrize("stage", STAGES)
def test_every_stage_has_every_part(stage):
    c = program.card(stage, WORDS)
    for part in PARTS:
        assert c.get(part), f"{stage} is missing {part}"
    assert len(c["questions"]) == 3
    assert c["lead"]["id"] and c["lead"]["name"]
    assert c["metric"]["name"] and c["metric"]["target"]
    assert c["learn"]["url"] and c["learn"]["title"] and c["learn"]["why"]
    assert c["case"]["url"] and c["case"]["company"] and c["case"]["fact"]


@pytest.mark.parametrize("stage", STAGES)
def test_every_url_is_in_the_verified_set(stage):
    c = program.card(stage, WORDS)
    urls = [u for u in strings(c) if u.startswith("http")]
    assert urls
    assert set(urls) <= verified_urls()


@pytest.mark.parametrize("stage", STAGES)
def test_no_stage_text_promises_income(stage):
    for text in strings(program.card(stage, WORDS)):
        v = check_request(text)
        assert v.allowed, f"{stage}: {text!r} -> {v.rule}"


def test_big_questions_never_mention_money():
    for stage in STAGES:
        q = program.card(stage, WORDS)["big_question"].lower()
        assert not re.search(r"\b(money|income|earn|profit|revenue|rich|millions?)\b", q)


def test_founder_words_are_inserted_into_questions():
    qs = " ".join(program.card("validation", WORDS)["questions"])
    assert "420 students in my WhatsApp group" in qs
    assert "{" not in qs


def test_missing_founder_words_fall_back_to_plain_text():
    for stage in STAGES:
        qs = " ".join(program.card(stage, {})["questions"])
        assert "{" not in qs and "None" not in qs


def test_ideation_follows_sistilli_steps_with_links():
    steps = program.card("ideation", WORDS)["steps"]
    assert [s["step"] for s in steps] == ["0", "1", "2"]
    assert all(s["links"] for s in steps)
    text = " ".join(strings(steps)).lower()
    assert "tarpit" in text and "painkiller" in text and "founder-market fit" in text


def test_handoff_line_appears_when_the_lead_changes():
    assert program.card("validation", WORDS, previous="ideation")["handoff"]
    assert program.card("ideation", WORDS)["handoff"]


def test_no_handoff_when_the_lead_stays():
    same = program.card("distribution", WORDS, previous="distribution")
    assert same["handoff"] is None


@pytest.mark.parametrize("run_stage,status,outcome,want", [
    ("start", "waiting", None, "ideation"),
    ("brief", "working", None, "ideation"),
    ("phase1_step2", "working", None, "ideation"),
    ("phase1_gate", "gate", None, "ideation"),
    ("phase2_step1", "working", None, "validation"),
    ("phase2_step2", "gate", None, "validation"),
    ("phase2_gate", "gate", None, "validation"),
    ("phase2_step3", "done", "go", "build"),
    ("phase2_step3", "done", "stop", "validation"),
    ("phase3_step1", "working", None, "build"),
    ("phase4_step1", "working", None, "pricing"),
    ("phase5_step1", "working", None, "distribution"),
    ("phase6_step1", "working", None, "operate"),
])
def test_stage_for_maps_run_progress(run_stage, status, outcome, want):
    assert program.stage_for(run_stage, status, outcome) == want


def test_words_come_from_the_founder_profile():
    profile = {"strengths": [{"strength": "speaking English", "quote": "q"}],
               "access": [{"group": "420 students", "how_many": "420", "reach_today": True}],
               "markets": [{"market": "English practice", "why": "w"}]}
    assert program.words_from_profile(profile) == {"group": "420 students", "skill": "speaking English",
                                                    "market": "English practice"}
    assert program.words_from_profile(None) == {}
    assert program.words_from_profile({"strengths": "bad"}) == {}


@pytest.fixture
def client(tmp_run):
    app = create_app(llm_factory=lambda cfg, p, k: fx.scripted_llm(fx.strong_opportunities()),
                     search_factory=lambda cfg: fx.fake_search())
    with TestClient(app) as c:
        yield c


def test_endpoint_returns_the_card_for_the_current_stage(client):
    brief = (ROOT / "briefs" / "strong.md").read_text(encoding="utf-8")
    run_id = client.post("/runs", json={"brief": brief, "mode": "demo", "provider": "ollama"}).json()["id"]

    body = client.get(f"/runs/{run_id}/program").json()

    assert body["stage"] == "ideation"
    assert body["card"]["lead"]["id"]
    assert len(body["card"]["questions"]) == 3
    assert body["card"]["handoff"]


def test_endpoint_unknown_run_is_404(client):
    assert client.get("/runs/nope/program").status_code == 404
