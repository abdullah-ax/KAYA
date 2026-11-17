"""The founder picks the model per run: qwen3:8b (light) or gpt-oss:20b (stronger)."""
from pathlib import Path

import httpx
import pytest
import respx
import yaml
from fastapi.testclient import TestClient

import pipeline_fakes as fx
from api.app import create_app
from api.cli import main as cli_main
from api.config import load_config

ROOT = Path(__file__).resolve().parent.parent
BRIEF = (ROOT / "briefs" / "strong.md").read_text(encoding="utf-8")


def test_config_offers_both_models_and_defaults_to_the_lighter_one():
    cfg = load_config(ROOT / "config.yaml")
    assert set(cfg.model.choices) >= {"qwen3:8b", "gpt-oss:20b"}
    assert cfg.model.default == "qwen3:8b"
    assert cfg.model.default in cfg.model.choices


@pytest.fixture
def seen(tmp_run):
    return []


@pytest.fixture
def client(seen):
    def llm_factory(cfg, provider, api_key):
        seen.append(cfg.model.default)
        return fx.scripted_llm(fx.strong_opportunities())

    with TestClient(create_app(llm_factory=llm_factory, search_factory=lambda cfg: fx.fake_search())) as c:
        yield c


def test_run_uses_the_model_the_founder_picked(client, seen):
    resp = client.post("/runs", json={"brief": BRIEF, "model": "gpt-oss:20b"})
    assert resp.status_code == 201, resp.text
    assert seen[-1] == "gpt-oss:20b"
    assert client.get(f"/runs/{resp.json()['id']}").json()["model"] == "gpt-oss:20b"


def test_run_without_a_pick_uses_the_config_default(client, seen):
    client.post("/runs", json={"brief": BRIEF})
    assert seen[-1] == "qwen3:8b"


def test_unknown_model_is_refused(client):
    resp = client.post("/runs", json={"brief": BRIEF, "model": "llama-huge"})
    assert resp.status_code == 422


def test_model_test_endpoint_takes_a_model(tmp_run):
    from api.llm import FakeLLM
    seen = []

    def factory(cfg, provider, api_key):
        seen.append(cfg.model.default)
        return FakeLLM([{"ok": True}])

    with TestClient(create_app(llm_factory=factory)) as c:
        resp = c.post("/model/test", json={"provider": "ollama", "model": "gpt-oss:20b"})
    assert resp.json()["ok"] is True
    assert seen == ["gpt-oss:20b"]


@respx.mock
def test_models_lists_choices_with_download_state(client):
    respx.get(url__regex=r".*/api/tags$").mock(return_value=httpx.Response(200, json={"models": [{"name": "qwen3:8b"}]}))
    body = client.get("/models").json()
    assert body["default"] == "qwen3:8b"
    assert {"name": "qwen3:8b", "installed": True} in body["choices"]
    assert {"name": "gpt-oss:20b", "installed": False} in body["choices"]


@respx.mock
def test_models_says_unknown_when_ollama_is_down(client):
    respx.get(url__regex=r".*/api/tags$").mock(side_effect=httpx.ConnectError("down"))
    body = client.get("/models").json()
    assert all(c["installed"] is None for c in body["choices"])


def test_cli_rejects_a_model_not_on_the_list(capsys):
    with pytest.raises(SystemExit):
        cli_main(["--brief", str(ROOT / "briefs" / "strong.md"), "--model", "llama-huge"])
    assert "invalid choice" in capsys.readouterr().err


def test_compose_downloads_both_models_lighter_first():
    pull = yaml.safe_load((ROOT / "docker-compose.yml").read_text())["services"]["ollama-pull"]
    cmd = " ".join(pull["entrypoint"])
    assert cmd.index("qwen3:8b") < cmd.index("gpt-oss:20b")


def test_ollama_runs_ignore_openai_env_overrides(monkeypatch):
    from api.app import _default_llm, with_model
    monkeypatch.setenv("OPENAI_MODEL", "some/openai-model")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://api.example.com/v1")
    cfg = with_model(load_config(ROOT / "config.yaml"), "gpt-oss:20b")
    llm = _default_llm(cfg, "ollama", None)
    assert llm.name == "gpt-oss:20b"
    assert "example.com" not in getattr(llm, "base_url", "")
