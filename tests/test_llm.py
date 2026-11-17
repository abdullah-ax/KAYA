"""LLM adapters: validated JSON replies, retries, usage counts. All offline."""
import json
from pathlib import Path

import httpx
import pytest
import respx
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent


class Idea(BaseModel):
    title: str
    score: int


@pytest.fixture
def cfg(monkeypatch):
    monkeypatch.setenv("OLLAMA_URL", "http://ollama.test")
    from api.config import load_config

    return load_config(ROOT / "config.yaml")


def test_fake_llm_returns_parsed_model_and_usage():
    from api.llm import FakeLLM, Usage

    llm = FakeLLM([{"title": "Invoice reminders", "score": 4}])
    out, usage = llm.complete("sys", "user", Idea)
    assert llm.name == "fake"
    assert out == Idea(title="Invoice reminders", score=4)
    assert isinstance(usage, Usage)
    assert usage.prompt_tokens >= 0 and usage.completion_tokens >= 0


def test_fake_llm_out_of_replies_or_bad_reply_raises_llm_error():
    from api.llm import FakeLLM, LLMError

    with pytest.raises(LLMError):
        FakeLLM([]).complete("s", "u", Idea)
    with pytest.raises(LLMError):
        FakeLLM([{"title": "no score"}]).complete("s", "u", Idea)


def test_fake_llm_accepts_a_callable():
    from api.llm import FakeLLM

    llm = FakeLLM(lambda system, user, schema: {"title": user, "score": 1})
    out, _ = llm.complete("s", "Tutor booking", Idea)
    assert out.title == "Tutor booking"


def _ollama_reply(content, prompt=12, completion=5):
    return httpx.Response(200, json={
        "message": {"role": "assistant", "content": content},
        "prompt_eval_count": prompt, "eval_count": completion,
    })


@respx.mock
def test_ollama_posts_chat_with_json_schema_and_temperature_zero(cfg):
    from api.llm import make_llm

    route = respx.post("http://ollama.test/api/chat").mock(
        return_value=_ollama_reply(json.dumps({"title": "Tutor app", "score": 3}))
    )
    llm = make_llm(cfg)
    out, usage = llm.complete("You are a researcher.", "Find problems.", Idea)
    assert out == Idea(title="Tutor app", score=3)
    assert (usage.prompt_tokens, usage.completion_tokens) == (12, 5)
    assert llm.name == cfg.model.default
    body = json.loads(route.calls.last.request.content)
    assert body["model"] == cfg.model.default
    assert body["stream"] is False
    assert body["format"] == Idea.model_json_schema()
    assert body["options"]["temperature"] == 0
    assert body["messages"] == [
        {"role": "system", "content": "You are a researcher."},
        {"role": "user", "content": "Find problems."},
    ]


@respx.mock
def test_ollama_retries_bad_json_schema_and_http_errors_then_succeeds(cfg):
    from api.llm import make_llm

    route = respx.post("http://ollama.test/api/chat").mock(side_effect=[
        _ollama_reply("not json at all"),
        _ollama_reply(json.dumps({"title": "missing score"})),
        httpx.Response(500, text="boom"),
        _ollama_reply(json.dumps({"title": "Ok", "score": 2})),
    ])
    out, _ = make_llm(cfg).complete("s", "u", Idea)
    assert out.score == 2
    assert route.call_count == 4  # first try + max_retries (3)


@respx.mock
def test_ollama_raises_llm_error_after_max_retries(cfg):
    from api.llm import LLMError, make_llm

    route = respx.post("http://ollama.test/api/chat").mock(return_value=_ollama_reply("{bad"))
    with pytest.raises(LLMError):
        make_llm(cfg).complete("s", "u", Idea)
    assert route.call_count == cfg.model.max_retries + 1


@respx.mock
def test_ollama_connection_error_becomes_llm_error(cfg):
    from api.llm import LLMError, make_llm

    respx.post("http://ollama.test/api/chat").mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(LLMError):
        make_llm(cfg).complete("s", "u", Idea)


def _openai_reply(content, prompt=20, completion=7):
    return httpx.Response(200, json={
        "choices": [{"message": {"role": "assistant", "content": content}}],
        "usage": {"prompt_tokens": prompt, "completion_tokens": completion},
    })


@respx.mock
def test_openai_compatible_posts_chat_completions_with_bearer_key(cfg):
    from api.llm import make_llm

    route = respx.post("https://api.groq.test/openai/v1/chat/completions").mock(
        return_value=_openai_reply(json.dumps({"title": "Menu translator", "score": 5}))
    )
    llm = make_llm(cfg, provider="openai", api_key="sk-test-123",
                   base_url="https://api.groq.test/openai/v1/", model="llama-3.1-8b-instant")
    out, usage = llm.complete("sys", "user", Idea)
    assert out.title == "Menu translator"
    assert (usage.prompt_tokens, usage.completion_tokens) == (20, 7)
    assert llm.name == "llama-3.1-8b-instant"
    req = route.calls.last.request
    assert req.headers["authorization"] == "Bearer sk-test-123"
    body = json.loads(req.content)
    assert body["model"] == "llama-3.1-8b-instant"
    assert body["temperature"] == 0
    assert body["response_format"]["type"] == "json_object"
    assert body["messages"][0] == {"role": "system", "content": "sys"}
    assert json.dumps(Idea.model_json_schema()) in body["messages"][1]["content"]
    assert body["messages"][-1] == {"role": "user", "content": "user"}


@respx.mock
def test_openai_key_never_appears_in_errors_or_repr(cfg):
    from api.llm import LLMError, make_llm

    respx.post("https://router.test/v1/chat/completions").mock(
        return_value=httpx.Response(401, text="bad key sk-secret-999")
    )
    llm = make_llm(cfg, provider="openai", api_key="sk-secret-999",
                   base_url="https://router.test/v1", model="m")
    assert "sk-secret-999" not in repr(llm) and "sk-secret-999" not in str(vars(llm))
    with pytest.raises(LLMError) as err:
        llm.complete("s", "u", Idea)
    assert "sk-secret-999" not in str(err.value)


def test_openai_requires_key_and_base_url(cfg):
    from api.llm import make_llm

    with pytest.raises(ValueError):
        make_llm(cfg, provider="openai", base_url="https://x.test/v1", model="m")
    with pytest.raises(ValueError):
        make_llm(cfg, provider="openai", api_key="k", model="m")


def test_unknown_provider_is_rejected(cfg):
    from api.llm import make_llm

    with pytest.raises(ValueError):
        make_llm(cfg, provider="paid-cloud")
