"""Gate rules: targets come from config, results decide go/repeat/pivot/stop."""
from types import SimpleNamespace

import pytest

from api.approval import check_approval
from api.gates import phase1_gate, phase2_gate, write_gate_decision


def make_cfg(signup_target=100, stop_below_fraction=0.3, window_days=14,
             min_sourced_problems=3, min_founder_fit_score=3):
    """A stand-in with the Config fields the gates read."""
    return SimpleNamespace(gates=SimpleNamespace(
        phase1_discover=SimpleNamespace(
            min_sourced_problems=min_sourced_problems,
            min_founder_fit_score=min_founder_fit_score),
        phase2_validate=SimpleNamespace(
            signup_target=signup_target, window_days=window_days,
            stop_below_fraction=stop_below_fraction)))


def test_phase2_gate_recommends_stop_at_12_of_100():
    result = phase2_gate(12, make_cfg())
    assert result.outcome == "stop"
    assert result.gate == "phase2_validate"
    assert result.evidence["target"] == 100
    assert result.evidence["actual"] == 12
    assert "12" in result.recommendation and "100" in result.recommendation


def test_phase2_gate_says_go_when_target_met():
    assert phase2_gate(100, make_cfg()).outcome == "go"


def test_phase2_gate_says_repeat_between_stop_line_and_target():
    assert phase2_gate(45, make_cfg()).outcome == "repeat"


def test_phase2_gate_reads_target_from_config():
    result = phase2_gate(12, make_cfg(signup_target=20))
    assert result.outcome == "repeat"
    assert result.evidence["percent"] == 60


def test_phase1_gate_go_when_sources_and_fit_meet_config():
    result = phase1_gate(3, 3, make_cfg())
    assert result.gate == "phase1_discover"
    assert result.outcome == "go"


def test_phase1_gate_repeat_when_too_few_sourced_problems():
    result = phase1_gate(2, 4, make_cfg())
    assert result.outcome == "repeat"
    assert result.evidence["sourced_problems"] == 2


def test_phase1_gate_pivot_when_founder_fit_is_low():
    assert phase1_gate(5, 2, make_cfg()).outcome == "pivot"


def test_write_gate_decision_without_approval_marks_pending(tmp_run):
    path = tmp_run / "outputs" / "phase2_gate_validate.md"
    out = write_gate_decision(path, phase2_gate(12, make_cfg()), None)
    text = out.read_text()
    assert out == path
    assert text.startswith("# Gate: phase2 validate")
    assert "## Target (set before the run)" in text
    assert "- Target: 100" in text
    assert "- Actual: 12" in text
    assert "- Percent of target: 12%" in text
    assert "## System recommendation\nstop" in text
    assert "- Approved by: pending" in text


def test_write_gate_decision_records_founder_choice(tmp_run):
    reason = "Twelve sign-ups is too few, I will look for a new problem"
    approval = check_approval("Stop", reason, ["Stop", "Pivot", "Repeat"],
                              SimpleNamespace(min_reason_words=8,
                                              approval=SimpleNamespace(rejected_answers=["yes"])))
    out = write_gate_decision(tmp_run / "g.md", phase2_gate(12, make_cfg()), approval)
    text = out.read_text()
    assert "- Picked: Stop" in text
    assert f'- Why, in their own words: "{reason}"' in text
    assert "- Approved by: founder, 20" in text and "Z" in text


def test_zero_targets_in_config_are_refused():
    with pytest.raises(ValueError):
        phase2_gate(5, make_cfg(signup_target=0))
    with pytest.raises(ValueError):
        phase1_gate(5, 5, make_cfg(min_sourced_problems=0))
