"""At the end of a passed stage the web run pauses on a level-up: chat with the co-founder or move on."""
import pytest
from fastapi.testclient import TestClient

import pipeline_fakes as fx
from api.app import create_app
from api.orchestrator import STAGES
from test_app import REASON1, REASON2, answer, decide, to_phase1_gate


@pytest.fixture
def client(tmp_run):
    def llm_factory(cfg, provider, api_key):
        return fx.scripted_llm(fx.strong_opportunities(),
                               overrides={"Reply": [{"text": "Validation means ten real sign-ups first."}]})

    app = create_app(llm_factory=llm_factory, search_factory=lambda cfg: fx.fake_search())
    with TestClient(app) as c:
        yield c


def to_level_up(client):
    run_id, _ = to_phase1_gate(client)
    return run_id, decide(client, run_id, "Speaking drills", REASON1)


def test_stages_are_the_six_named_stages():
    assert STAGES == ["Ideation", "Validation", "Build", "Commercial setup", "Sell and get paid",
                      "Operate and learn"]


def test_run_pauses_on_level_up_after_the_phase1_pick(client):
    _, state = to_level_up(client)

    pending = state["pending"]
    assert state["status"] == "waiting"
    assert pending["kind"] == "level_up" and pending["key"] == "level_up"
    assert pending["done"] == 1 and pending["stage"] == "Ideation" and pending["next"] == "Validation"
    assert pending["prompt"] and pending["proof"]


def test_chat_while_paused_gets_a_reply_and_stays_paused(client):
    run_id, before = to_level_up(client)

    state = answer(client, run_id, "What does the next stage ask me to prove?")

    assert "Validation means ten real sign-ups first." in state["messages"]
    assert len(state["messages"]) > len(before["messages"])
    assert state["pending"]["kind"] == "level_up" and state["pending"]["done"] == 1
    assert state["status"] == "waiting"


def test_next_moves_on_and_logs_the_founder_action(client):
    run_id, _ = to_level_up(client)

    resp = client.post(f"/runs/{run_id}/next")

    assert resp.status_code == 200, resp.text
    assert resp.json()["pending"]["key"] == "unfair_advantage"
    log = client.get(f"/runs/{run_id}/log").json()
    moves = [e for e in log if e["action"] == "move_to_next_stage"]
    assert len(moves) == 1 and moves[0]["approved_by"] == "founder"
    assert "Validation" in moves[0]["founder_input"]


def test_next_is_409_when_not_paused_on_a_level_up(client):
    run_id, _ = to_phase1_gate(client)

    assert client.post(f"/runs/{run_id}/next").status_code == 409


def test_sentinel_text_through_answer_does_not_move_on(client):
    run_id, _ = to_level_up(client)

    resp = client.post(f"/runs/{run_id}/answer", json={"text": "__next_stage__"})

    assert resp.status_code == 422
    log = client.get(f"/runs/{run_id}/log").json()
    assert not any(e["action"] == "move_to_next_stage" for e in log)


def test_level_up_after_phase2_go_names_build(client):
    run_id, _ = to_level_up(client)
    client.post(f"/runs/{run_id}/next")
    answer(client, run_id, "I coached 300 students and scored band 8.5")
    decide(client, run_id, "Publish the sign-up page", REASON1)
    answer(client, run_id, "130")

    state = decide(client, run_id, "Continue to Build", REASON2)

    assert state["pending"]["kind"] == "level_up"
    assert state["pending"]["done"] == 2 and state["pending"]["next"] == "Build"


def test_model_trouble_in_chat_gives_a_plain_fallback(tmp_run):
    def broken_chat(*a):
        llm = fx.scripted_llm(fx.strong_opportunities())
        plain = llm.complete

        def complete(system, user, schema):
            if schema.__name__ == "Reply":
                raise RuntimeError("model down")
            return plain(system, user, schema)
        llm.complete = complete
        return llm

    app = create_app(llm_factory=broken_chat,
                     search_factory=lambda cfg: fx.fake_search())
    with TestClient(app) as c:
        run_id, _ = to_level_up(c)
        state = answer(c, run_id, "What does the next stage ask me to prove?")

    assert any("ask again" in m and "move on" in m for m in state["messages"])
    assert state["pending"]["kind"] == "level_up"


def test_scripted_runs_do_not_pause_on_level_up(tmp_run):
    from test_canvas_fails_boss import _run
    _, result, _, answers = _run(tmp_run, [])

    assert result.outcome == "go"
    assert "level_up" not in [k for k, _ in answers.asked]
