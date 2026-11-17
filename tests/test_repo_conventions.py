"""Smoke test: the repo follows the organizers' conventions (see CLAUDE.md)."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_precheck_has_no_errors():
    result = subprocess.run([sys.executable, str(ROOT / "scripts" / "precheck.py")], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout


def test_trick_prompts_file_exists():
    assert (ROOT / "evals" / "trick_prompts.md").exists()
