"""Shared test setup: make the api package importable and keep runs offline."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture
def tmp_run(tmp_path, monkeypatch):
    """A throwaway run directory so tests never touch outputs/ or decision_log.json."""
    monkeypatch.setenv("RUNS_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture(autouse=True)
def _no_real_backoff(monkeypatch):
    """Retries back off with real sleeps in production; tests skip the wait."""
    monkeypatch.setattr("api.llm._sleep", lambda seconds: None)
