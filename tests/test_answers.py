"""Founder answers come from an AnswerSource: stdin, or a YAML file for replay."""
import io

import pytest

from api.orchestrator import AnswersExhausted, InteractiveAnswers, ScriptedAnswers


def test_scripted_answers_replay_in_order_and_stop_when_out(tmp_path):
    path = tmp_path / "answers.yaml"
    path.write_text("intake:\n  - first\n  - second\nsignups: 12\n", encoding="utf-8")
    answers = ScriptedAnswers.from_file(path)

    assert answers.ask("intake", "Q1?") == "first"
    assert answers.ask("intake", "Q2?") == "second"
    assert answers.ask("signups", "How many?") == "12"
    assert answers.asked == [("intake", "Q1?"), ("intake", "Q2?"), ("signups", "How many?")]
    with pytest.raises(AnswersExhausted):
        answers.ask("intake", "Q3?")


def test_interactive_answers_read_stdin_and_stop_on_eof():
    out = io.StringIO()
    answers = InteractiveAnswers(stdin=io.StringIO("Alex groups\n"), stdout=out)

    assert answers.ask("intake", "Which groups?") == "Alex groups"
    assert "Which groups?" in out.getvalue()
    with pytest.raises(AnswersExhausted):
        answers.ask("intake", "Next?")
