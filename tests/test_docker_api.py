"""The api container builds from the repo root and reports its health."""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def test_compose_api_builds_from_root_with_healthcheck():
    api = yaml.safe_load((ROOT / "docker-compose.yml").read_text())["services"]["api"]

    assert api["build"] == {"context": ".", "dockerfile": "api/Dockerfile"}
    assert "healthcheck" in api and "/health" in " ".join(api["healthcheck"]["test"])
    assert {"ollama", "searxng"} <= set(api["depends_on"])
    assert "RUNS_DIR=/app/runs" in api["environment"]


def test_dockerfile_copies_what_the_api_reads_and_runs_uvicorn():
    text = (ROOT / "api" / "Dockerfile").read_text()

    assert text.startswith("FROM python:3.12-slim") or "\nFROM python:3.12-slim" in text
    assert "api/requirements.txt" in text and "HEALTHCHECK" in text and "EXPOSE 8000" in text
    for path in ["api/", "prompts/", "templates/", "kb/", "evals/", "config.yaml"]:
        assert f"COPY {path}" in text, path
    assert "uvicorn" in text and "api.app:app" in text


def test_env_example_lists_api_settings_without_real_keys():
    text = (ROOT / ".env.example").read_text()

    assert "API_WAIT_SECONDS=" in text and "OPENAI_BASE_URL=" in text
    assert "sk-" not in text
