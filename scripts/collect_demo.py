"""Copy real demo runs into outputs/ and decision_log.json. Copies only what the runs wrote.

The main run's files keep their names. Extra runs get their label added after the step,
for example phase1_gate_decision.md -> phase1_gate_weak_idea_decision.md.
Each log entry gets a "run" key naming the run it came from.
Usage: python3 scripts/collect_demo.py runs/full-demo [label=runs/dir ...]
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main(argv: list[str]) -> None:
    main_run, extras = Path(argv[0]), [a.split("=", 1) for a in argv[1:]]
    out = ROOT / "outputs"
    for old in out.glob("phase*"):
        old.unlink()
    log: list[dict] = []
    for label, run in [("main", main_run), *[(lbl, Path(p)) for lbl, p in extras]]:
        for f in sorted((run / "outputs").iterdir()):
            name = f.name if label == "main" else re.sub(r"^(phase\d+_(?:step\d+|gate))_", rf"\1_{label}_", f.name)
            shutil.copyfile(f, out / name)
        log += [{**e, "run": label} for e in json.loads((run / "decision_log.json").read_text(encoding="utf-8"))]
    (ROOT / "decision_log.json").write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(log)} log entries, {len(list(out.iterdir()))} files in outputs/")


if __name__ == "__main__":
    main(sys.argv[1:])
