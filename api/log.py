"""Append-only decision log: one JSON entry per agent action."""
from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


_LOCKS: dict[Path, threading.RLock] = {}
_LOCKS_GUARD = threading.Lock()


def _lock_for(path: Path) -> threading.RLock:
    """One lock per log file, shared by every DecisionLog object that points at it."""
    key = path.resolve()
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(key, threading.RLock())


class DecisionLog:
    """Writes decision_log.json at the path given. Never write that file by hand."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self._lock = _lock_for(self.path)

    def entries(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text(encoding="utf-8"))

    def append(
        self,
        agent: str,
        action: str,
        *,
        sources: list[str] | None = None,
        model: str | None = None,
        cost: float = 0,
        approved_by: str | None = None,
        founder_input: str | None = None,
        outcome: str | None = None,
        gated: bool = False,
        tokens: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        if gated and (approved_by != "founder" or not (founder_input or "").strip()):
            raise ValueError(
                f"{agent}/{action} is gated: it needs approved_by='founder' and the founder's own words."
            )
        entry: dict[str, Any] = {
            "timestamp": _now(),
            "agent": agent,
            "action": action,
            "sources": list(sources or []),
            "model": model,
            "cost": cost,
            "approved_by": approved_by,
            "founder_input": founder_input,
        }
        if tokens is not None:
            entry["tokens"] = {"prompt": int(tokens.get("prompt", 0)),
                               "completion": int(tokens.get("completion", 0))}
        if outcome is not None:
            entry["outcome"] = outcome
        with self._lock:  # read, add, write must not interleave with another writer
            self._write([*self.entries(), entry])
        return entry

    def total_tokens(self) -> dict[str, int]:
        """Sum the model tokens in this run's log (for the README's cost per run)."""
        prompt = completion = 0
        for entry in self.entries():
            used = entry.get("tokens") or {}
            prompt += used.get("prompt", 0)
            completion += used.get("completion", 0)
        return {"prompt": prompt, "completion": completion, "total": prompt + completion}

    def _write(self, entries: list[dict[str, Any]]) -> None:
        """Write to a temp file in the same folder, then swap it in."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".decision_log.", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(entries, fh, indent=2, ensure_ascii=False)
                fh.write("\n")
            os.replace(tmp, self.path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
