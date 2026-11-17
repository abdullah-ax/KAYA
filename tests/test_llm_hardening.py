"""Model transport hardening: reasoning text, fences, smart retries, timeouts and the fallback model."""
import json
from pathlib import Path

import httpx
import pytest
import respx
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
URL = "http://ollama.test/api/chat"


class Idea(BaseModel):
    title: str
    score: int


@pytest.fixture
def cfg(monkeypatch):
    monkeypatch.setenv("OLLAMA_URL", "http://ollama.test")
    from api.config import load_config
    return load_config(ROOT / "config.yaml")


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    slept = []
    monkeypatch.setattr("api.llm._sleep", slept.append)
    return slept


def reply(content):
    return httpx.Response(200, json={"message": {"content": content}, "prompt_eval_count": 1, "eval_count": 1})


@respx.mock
def test_reasoning_text_and_code_fences_are_stripped_before_validation(cfg):
    from api.llm import make_llm
    respx.post(URL).mock(side_effect=[
        reply('<think>The founder tutors, so...</think>\n{"title": "Sheets", "score": 3}'),
        reply('```json\n{"title": "Cards", "score": 2}\n```'),
    ])
    llm = make_llm(cfg)
    assert llm.complete("s", "u", Idea)[0].title == "Sheets"
    assert llm.complete("s", "u", Idea)[0].title == "Cards"


@respx.mock
def test_a_rejected_key_or_missing_model_is_not_retried(cfg):
    from api.llm import LLMError, make_llm
    route = respx.post("https://router.test/v1/chat/completions").mock(return_value=httpx.Response(401, text="no"))
    llm = make_llm(cfg, provider="openai", api_key="k", base_url="https://router.test/v1", model="m")
    with pytest.raises(LLMError):
        llm.complete("s", "u", Idea)
    assert route.call_count == 1


@respx.mock
def test_rate_limits_and_server_errors_back_off_and_honour_retry_after(cfg, no_sleep):
    from api.llm import make_llm
    respx.post(URL).mock(side_effect=[
        httpx.Response(429, headers={"Retry-After": "3"}, text="slow down"),
        httpx.Response(503, text="busy"),
        reply('{"title": "Ok", "score": 1}'),
    ])
    assert make_llm(cfg).complete("s", "u", Idea)[0].title == "Ok"
    assert no_sleep[0] == 3 and len(no_sleep) == 2 and no_sleep[1] > 0


@respx.mock
def test_a_schema_miss_is_fed_back_to_the_model_on_retry(cfg):
    from api.llm import make_llm
    route = respx.post(URL).mock(side_effect=[reply('{"title": "No score"}'), reply('{"title": "Ok", "score": 1}')])
    make_llm(cfg).complete("s", "u", Idea)
    second = json.loads(route.calls[1].request.content)["messages"][-1]["content"]
    assert "last reply did not match" in second.lower() and "score" in second


def test_timeouts_are_split_and_bounded(cfg):
    from api.llm import make_llm
    t = make_llm(cfg)._primary._client.timeout
    assert t.connect <= 10 and t.read <= 120


@respx.mock
def test_the_configured_fallback_model_takes_over_when_the_main_one_is_down(cfg):
    from api.llm import make_llm
    seen = []

    def handler(request):
        model = json.loads(request.content)["model"]
        seen.append(model)
        if model == cfg.model.default:
            return httpx.Response(404, json={"error": f"model '{model}' not found"})
        return reply('{"title": "From fallback", "score": 2}')

    respx.post(URL).mock(side_effect=handler)
    llm = make_llm(cfg)
    out, _ = llm.complete("s", "u", Idea)
    assert out.title == "From fallback"
    assert seen[0] == cfg.model.default and seen[-1] == cfg.model.fallback
    assert llm.name == cfg.model.fallback  # the log names the model that actually answered


@respx.mock
def test_no_fallback_for_bad_json_from_a_working_model(cfg):
    from api.llm import LLMError, make_llm
    route = respx.post(URL).mock(return_value=reply("{bad"))
    with pytest.raises(LLMError):
        make_llm(cfg).complete("s", "u", Idea)
    assert all(json.loads(c.request.content)["model"] == cfg.model.default for c in route.calls)
