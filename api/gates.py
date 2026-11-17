"""Gates between steps. Targets come from config, set before any results."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

if TYPE_CHECKING:
    from api.approval import Approval

Outcome = Literal["go", "repeat", "pivot", "stop"]


@dataclass
class GateResult:
    gate: str
    outcome: Outcome
    recommendation: str
    evidence: dict[str, Any] = field(default_factory=dict)


def _require_positive(name: str, value: int) -> None:
    if value <= 0:
        raise ValueError(f"Gate target {name} must be above 0 in config.yaml.")


def phase1_gate(sourced_problems: int, founder_fit: int, cfg: Any) -> GateResult:
    """Check sourced problems and founder fit (1 to 5) against config."""
    rules = cfg.gates.phase1_discover
    _require_positive("min_sourced_problems", rules.min_sourced_problems)
    evidence = {"metric": "sourced problems", "target": rules.min_sourced_problems,
                "actual": sourced_problems,
                "percent": round(sourced_problems / rules.min_sourced_problems * 100),
                "sourced_problems": sourced_problems,
                "min_sourced_problems": rules.min_sourced_problems,
                "founder_fit": founder_fit,
                "min_founder_fit_score": rules.min_founder_fit_score}
    got = (f"{sourced_problems} sourced problems (need {rules.min_sourced_problems}), "
           f"founder fit {founder_fit} of 5 (need {rules.min_founder_fit_score})")
    if sourced_problems == 0:
        return GateResult("phase1_discover", "stop",
                          f"stop: {got}. Nothing here has a source, only assumptions. "
                          "Stop, or start again with a new search.", evidence)
    if founder_fit < rules.min_founder_fit_score:
        return GateResult("phase1_discover", "pivot",
                          f"pivot: {got}. Pick a problem closer to what you know.", evidence)
    if sourced_problems < rules.min_sourced_problems:
        return GateResult("phase1_discover", "repeat",
                          f"repeat: {got}. Find more problems with a source link.", evidence)
    return GateResult("phase1_discover", "go", f"go: {got}.", evidence)


def phase2_gate(signups: int, cfg: Any) -> GateResult:
    """Compare sign-ups to the target from config."""
    rules = cfg.gates.phase2_validate
    target = rules.signup_target
    _require_positive("signup_target", target)
    fraction = signups / target
    evidence = {"metric": "sign-ups", "target": target, "actual": signups,
                "percent": round(fraction * 100), "window_days": rules.window_days}
    got = f"{signups} of {target} sign-ups in {rules.window_days} days ({evidence['percent']}%)"
    if signups >= target:
        return GateResult("phase2_validate", "go",
                          f"go: {got}. The target is met.", evidence)
    if fraction >= rules.stop_below_fraction:
        return GateResult("phase2_validate", "repeat",
                          f"repeat: {got}. Run one more window or change the offer.", evidence)
    line = round(rules.stop_below_fraction * 100)
    return GateResult("phase2_validate", "stop",
                      f"stop: {got}. That is under {line}% of the target. "
                      "Stop or pivot to a new problem.", evidence)


def write_gate_decision(path: str | Path, result: GateResult,
                        approval: Approval | None) -> Path:
    """Write the gate decision as markdown, following templates/gate_decision.md."""
    path = Path(path)
    phase, _, name = result.gate.partition("_")
    ev = result.evidence
    window = f"{ev['window_days']} days" if "window_days" in ev else "not set"
    if approval is None:
        picked, why, by = "pending", "pending", "pending"
    else:
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        picked, why, by = approval.option, approval.reason, f"{approval.approved_by}, {stamp}"
    lines = [
        f"# Gate: {phase} {name}", "",
        "## Target (set before the run)",
        f"- Metric: {ev.get('metric', 'not set')}",
        f"- Target: {ev.get('target', 'not set')}",
        f"- Window: {window}", "",
        "## Result",
        f"- Actual: {ev.get('actual', 'unknown')} (source: {ev.get('source', 'not given')})",
        f"- Percent of target: {ev.get('percent', 'unknown')}%", "",
        "## System recommendation",
        result.recommendation, "",
        "## Judges' top notes",
        "- none recorded", "",
        "## Options shown to the founder",
        "| Option | Cost | Risk | Source |",
        "|---|---|---|---|", "",
        "## Founder's decision",
        f"- Picked: {picked}",
        f'- Why, in their own words: "{why}"',
        "- Understanding check answers: not recorded",
        f"- Approved by: {by}", "",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
    return path
