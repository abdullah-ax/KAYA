"""Config loads config.yaml and applies env overrides."""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


def test_load_config_reads_repo_yaml(monkeypatch):
    for var in ("OLLAMA_URL", "SEARXNG_URL", "MODE", "RUNS_DIR"):
        monkeypatch.delenv(var, raising=False)
    from api.config import load_config

    cfg = load_config(ROOT / "config.yaml")
    assert cfg.model.max_retries == 3
    assert cfg.model.temperature == 0
    assert cfg.mode == "demo"
    assert cfg.gates.phase2_validate.signup_target == 100
    assert cfg.gates.phase1_discover.min_sourced_problems == 3
    assert "lgtm" in cfg.approval.rejected_answers
    assert cfg.writing.max_reading_grade == 8


def test_env_overrides_urls_mode_and_runs_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("OLLAMA_URL", "http://localhost:9999")
    monkeypatch.setenv("SEARXNG_URL", "http://searx.test")
    monkeypatch.setenv("MODE", "full")
    monkeypatch.setenv("RUNS_DIR", str(tmp_path))
    from api.config import load_config

    cfg = load_config(ROOT / "config.yaml")
    assert cfg.model.ollama_url == "http://localhost:9999"
    assert cfg.searxng_url == "http://searx.test"
    assert cfg.mode == "full"
    assert cfg.runs_dir == tmp_path


def test_min_reason_words_follows_mode(monkeypatch):
    from api.config import load_config

    monkeypatch.setenv("MODE", "demo")
    assert load_config(ROOT / "config.yaml").min_reason_words == 8
    monkeypatch.setenv("MODE", "full")
    assert load_config(ROOT / "config.yaml").min_reason_words == 15


def test_bad_mode_env_is_rejected(monkeypatch):
    monkeypatch.setenv("MODE", "turbo")
    from pydantic import ValidationError

    from api.config import load_config

    with pytest.raises(ValidationError):
        load_config(ROOT / "config.yaml")
