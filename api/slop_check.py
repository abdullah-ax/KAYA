"""Code checks that run before the boss reads a draft.

Banned phrases come from kb/style/anti_slop.md and prompts/house_voice.md.
Reading grade is Flesch-Kincaid, computed here in pure Python.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
STYLE_FILES = (ROOT / "kb" / "style" / "anti_slop.md", ROOT / "prompts" / "house_voice.md")
_LIST_LINE = re.compile(r"(?:Starter banned list[^:]*|Never write):\s*(.+)", re.IGNORECASE)
_ITEM = re.compile(r'"([^"]+)"|([^,"]+)')
_PLACEHOLDER = {"x", "y"}


@dataclass
class SlopReport:
    ok: bool
    grade: float
    banned: list[str]
    em_dash_paragraphs: int


def _clean(text: str) -> str:
    return text.replace("’", "'").replace("‘", "'").lower()


@lru_cache(maxsize=4)
def banned_phrases(files: tuple[Path, ...] = STYLE_FILES) -> list[str]:
    """Read the banned lists from the style files, in order, without repeats."""
    found: list[str] = []
    for path in files:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            match = _LIST_LINE.search(line)
            if not match:
                continue
            body = match.group(1).split("Full list")[0]
            for quoted, plain in _ITEM.findall(body):
                phrase = _clean((quoted or plain).strip(" .()"))
                if phrase and phrase not in found:
                    found.append(phrase)
    return found


def _pattern(phrase: str) -> re.Pattern[str]:
    words = re.findall(r"[\w'-]+", phrase)
    if len(words) == 1:
        stem = words[0][:-1] if words[0].endswith("e") else words[0]
        return re.compile(rf"\b{re.escape(stem)}\w*")
    parts = [r"[\w' -]{1,40}?" if w in _PLACEHOLDER else re.escape(w) for w in words]
    return re.compile(r"\b" + r"[\s,.-]+".join(parts) + r"\b")


def find_banned(text: str) -> list[str]:
    cleaned = _clean(text)
    return [p for p in banned_phrases() if _pattern(p).search(cleaned)]


def _syllables(word: str) -> int:
    word = word.lower()
    groups = re.findall(r"[aeiouy]+", word)
    count = len(groups)
    if word.endswith("e") and not word.endswith(("le", "ee")) and count > 1:
        count -= 1
    return max(count, 1)


def fk_grade(text: str) -> float:
    """Flesch-Kincaid grade level. Empty text scores 0."""
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?|\d+", text)
    if not words:
        return 0.0
    sentences = max(len(re.findall(r"[.!?]+(?:\s|$)", text.strip() + " ")), 1)
    syllables = sum(_syllables(w) for w in words)
    grade = 0.39 * len(words) / sentences + 11.8 * syllables / len(words) - 15.59
    return round(max(grade, 0.0), 1)


def em_dash_paragraphs(text: str, max_per_paragraph: int) -> int:
    paragraphs = re.split(r"\n\s*\n", text)
    return sum(1 for p in paragraphs if p.count("—") > max_per_paragraph)


def check_text(text: str, cfg: Any) -> SlopReport:
    """Fail on any banned phrase, a grade above the limit, or too many em dashes."""
    banned = find_banned(text)
    grade = fk_grade(text)
    dashes = em_dash_paragraphs(text, cfg.writing.max_em_dashes_per_paragraph)
    ok = not banned and grade <= cfg.writing.max_reading_grade and dashes == 0
    return SlopReport(ok, grade, banned, dashes)
