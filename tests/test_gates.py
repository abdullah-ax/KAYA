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


def test_phase1_gate_stop_when_both_sourcing_and_fit_are_low():
    result = phase1_gate(1, 2, make_cfg())
    assert result.outcome == "stop"
    assert "stop" in result.recommendation


def test_phase1_gate_stop_when_nothing_is_sourced_even_with_good_fit():
    assert phase1_gate(0, 5, make_cfg()).outcome == "stop"


def test_phase1_gate_clamps_fit_and_labels_it_a_model_estimate():
    high = phase1_gate(3, 99, make_cfg())
    assert high.evidence["founder_fit"] == 5 and high.outcome == "go"
    assert phase1_gate(3, -4, make_cfg()).evidence["founder_fit"] == 1
    assert "model estimate" in high.recommendation


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


def test_phase1_recommends_stop_when_the_founder_can_reach_no_one():
    from api.gates import phase1_gate
    import pipeline_fakes as fx
    result = phase1_gate(3, 3, fx.config(), reach=0, hours=3)

    assert result.outcome == "stop"
    assert "no group or person" in result.recommendation and "3 hours a week" in result.recommendation
    assert result.evidence["reach"] == 0


def test_phase1_reach_check_does_not_block_a_founder_with_a_group():
    from api.gates import phase1_gate
    import pipeline_fakes as fx
    assert phase1_gate(3, 4, fx.config(), reach=2, hours=15).outcome == "go"


def test_gate_decision_file_has_no_empty_filler_lines(tmp_run):
    for result in (phase1_gate(3, 4, make_cfg(), reach=2), phase2_gate(12, make_cfg())):
        text = write_gate_decision(tmp_run / f"{result.gate}.md", result, None).read_text()
        for filler in ("not given", "none recorded", "not recorded", "not set", "Judges"):
            assert filler not in text, f"{result.gate}: {filler}"


def test_gate_decision_says_where_each_result_came_from(tmp_run):
    one = write_gate_decision(tmp_run / "one.md", phase1_gate(3, 4, make_cfg(), reach=2), None).read_text()
    assert "- Actual: 3 (source: opportunities with a medium or high trust source card" in one
    assert "- Window:" not in one  # phase 1 has no time window, so the line is left out
    two = write_gate_decision(tmp_run / "two.md", phase2_gate(12, make_cfg()), None).read_text()
    assert "- Actual: 12 (source: founder-entered count)" in two
    assert "- Window: 14 days" in two
