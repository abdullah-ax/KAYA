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


DOCS = ["README.md", "ARCHITECTURE.md", "CONTRIBUTING.md", "MAINTAINERS.md", "docs/pitch.md"]


def test_no_todo_left_in_docs_prompts_or_knowledge_base():
    import re
    files = [ROOT / d for d in DOCS] + [p for folder in ("prompts", "kb", "templates")
                                        for p in (ROOT / folder).rglob("*.md")]
    left = [str(p.relative_to(ROOT)) for p in files if re.search(r"\bTODO\b", p.read_text(encoding="utf-8"))]
    assert not left, left


def test_relative_links_in_the_docs_point_at_real_files():
    import re
    broken = []
    for doc in DOCS:
        path = ROOT / doc
        for target in re.findall(r"\]\(([^)#\s]+)", path.read_text(encoding="utf-8")):
            if not target.startswith(("http://", "https://", "mailto:")) and not (path.parent / target).exists():
                broken.append(f"{doc}: {target}")
    assert not broken, broken
