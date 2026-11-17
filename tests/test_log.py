"""DecisionLog: one entry per agent action, gated actions need the founder."""
import json
import re

import pytest

REQUIRED = {"timestamp", "agent", "action", "sources", "model", "cost", "approved_by", "founder_input"}


def test_append_writes_entry_with_required_keys(tmp_run):
    from api.log import DecisionLog

    path = tmp_run / "decision_log.json"
    log = DecisionLog(path)
    entry = log.append("researcher", "searched forums", sources=["https://a.test"], model="fake")
    assert REQUIRED <= set(entry)
    assert entry["cost"] == 0
    assert entry["approved_by"] is None
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z", entry["timestamp"])
    assert json.loads(path.read_text()) == [entry]


def test_gated_action_without_founder_raises_and_writes_nothing(tmp_run):
    from api.log import DecisionLog

    log = DecisionLog(tmp_run / "decision_log.json")
    with pytest.raises(ValueError):
        log.append("publisher", "publish_page", gated=True)
    with pytest.raises(ValueError):
        log.append("publisher", "publish_page", gated=True, approved_by="agent", founder_input="ship it now please")
    with pytest.raises(ValueError):
        log.append("publisher", "publish_page", gated=True, approved_by="founder", founder_input="   ")
    assert log.entries() == []


def test_gated_action_with_founder_is_logged_with_outcome(tmp_run):
    from api.log import DecisionLog

    log = DecisionLog(tmp_run / "decision_log.json")
    log.append("researcher", "find_opportunities")
    entry = log.append(
        "gate", "evidence_gate", gated=True, approved_by="founder",
        founder_input="Option B, the signups are too low to keep going", outcome="stop",
    )
    assert entry["approved_by"] == "founder"
    assert entry["outcome"] == "stop"
    assert [e["action"] for e in log.entries()] == ["find_opportunities", "evidence_gate"]


def test_entries_survive_a_new_instance_and_leave_no_temp_files(tmp_run):
    from api.log import DecisionLog

    path = tmp_run / "decision_log.json"
    DecisionLog(path).append("a", "one")
    DecisionLog(path).append("b", "two")
    assert len(DecisionLog(path).entries()) == 2
    assert [p.name for p in tmp_run.iterdir()] == ["decision_log.json"]
