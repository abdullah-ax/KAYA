"""The accelerator program: one stage card per stage, built from api/program.yaml.

The card never decides for the founder. It asks, points to one small lesson, and
names the number to watch. Founder words from the profile are dropped into the questions.
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

PROGRAM_PATH = Path(__file__).with_name("program.yaml")
STAGE_ORDER = ["ideation", "validation", "build", "pricing", "distribution", "operate"]
_FALLBACK = {"group": "your group", "skill": "your skill", "market": "this problem"}
_PHASE_STAGE = {"1": "ideation", "2": "validation", "3": "build", "4": "pricing", "5": "distribution", "6": "operate"}


@lru_cache(maxsize=1)
def _load(path: Path = PROGRAM_PATH) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))["stages"]


def _fill(text: str, words: dict[str, str]) -> str:
    merged = {**_FALLBACK, **{k: v.strip() for k, v in words.items() if isinstance(v, str) and v.strip()}}
    return re.sub(r"\{(\w+)\}", lambda m: merged.get(m.group(1), m.group(0)), text)


def card(stage: str, words: dict[str, str] | None = None, previous: str | None = None) -> dict[str, Any]:
    """The stage card. `handoff` is set only when the lead differs from the previous stage's lead."""
    data = _load()[stage]
    words = words or {}
    lead_changed = previous is None or previous not in _load() or _load()[previous]["lead"]["id"] != data["lead"]["id"]
    out = {k: v for k, v in data.items() if k not in ("questions", "handoff")}
    out["stage"] = stage
    out["questions"] = [_fill(q, words) for q in data["questions"]]
    out["handoff"] = data["handoff"] if lead_changed else None
    return out


def stage_for(run_stage: str, status: str, outcome: str | None) -> str:
    """Which program stage a run's progress belongs to."""
    m = re.match(r"phase(\d)", run_stage or "")
    stage = _PHASE_STAGE.get(m.group(1), "operate") if m else "ideation"
    if stage == "validation" and status == "done" and outcome == "go":
        return "build"
    return stage


def words_from_profile(profile: Any) -> dict[str, str]:
    """The founder's own words: their group, their skill, the market they named. Missing parts are left out."""
    def first(key: str, field: str) -> str | None:
        items = profile.get(key) if isinstance(profile, dict) else None
        if isinstance(items, list) and items and isinstance(items[0], dict) and isinstance(items[0].get(field), str):
            return items[0][field]
        return None

    found = {"group": first("access", "group"), "skill": first("strengths", "strength"),
             "market": first("markets", "market")}
    return {k: v for k, v in found.items() if v}


def previous_stage(stage: str) -> str | None:
    i = STAGE_ORDER.index(stage)
    return STAGE_ORDER[i - 1] if i else None
