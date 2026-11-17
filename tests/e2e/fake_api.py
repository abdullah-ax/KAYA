"""Serve the real API with a scripted model and fake search, for browser end-to-end tests.

Runs write to a temp RUNS_DIR. Nothing here touches outputs/ or decision_log.json.
"""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]
os.environ.setdefault("RUNS_DIR", tempfile.mkdtemp(prefix="e2e-runs-"))
os.environ.setdefault("API_WAIT_SECONDS", "2")

import pipeline_fakes as fx  # noqa: E402
import uvicorn  # noqa: E402

from api.app import create_app  # noqa: E402

app = create_app(llm_factory=lambda cfg, provider, key: fx.scripted_llm(fx.strong_opportunities()),
                 search_factory=lambda cfg: fx.fake_search())

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8100")), log_level="warning")
