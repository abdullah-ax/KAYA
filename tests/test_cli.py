"""python -m api.cli runs the pipeline from a brief, optionally replaying founder answers."""
import json
from pathlib import Path

import pytest
import yaml

import pipeline_fakes as fx
from api import cli

ROOT = Path(__file__).resolve().parent.parent
REASON = "Twelve sign-ups is far below the target so this idea should stop now honestly"


def weak_answers(path):
    path.write_text(yaml.safe_dump({
        "intake": ["I have no group", "Three hours a week"],
        "phase1_option": "To-do list with AI",
        "phase1_reason": "I still want to test it once with real people before I drop it",
        "unfair_advantage": "I do not have one yet",
        "publish_option": "Keep it private", "publish_reason": REASON,
        "signups": 12, "phase2_option": "Stop or pivot", "phase2_reason": REASON}), encoding="utf-8")
    return path


def test_cli_replays_answers_and_writes_run_dir(tmp_run, capsys):
    answers = weak_answers(tmp_run / "answers.yaml")
    run_dir = tmp_run / "weak-run"

    code = cli.main(["--brief", str(ROOT / "briefs" / "weak.md"), "--answers", str(answers),
                     "--run-dir", str(run_dir)],
                    llm=fx.scripted_llm(fx.weak_opportunities()), search=fx.fake_search())

    assert code == 0
    assert json.loads((run_dir / "state.json").read_text())["outcome"] == "stop"
    assert (run_dir / "decision_log.json").exists()
    assert (run_dir / "outputs" / "phase2_gate_decision.md").exists()
    assert "stop" in capsys.readouterr().out


def test_cli_default_run_dir_is_under_runs_dir(tmp_run):
    answers = weak_answers(tmp_run / "answers.yaml")
    cli.main(["--brief", str(ROOT / "briefs" / "weak.md"), "--answers", str(answers)],
             llm=fx.scripted_llm(fx.weak_opportunities()), search=fx.fake_search())
    runs = [p for p in tmp_run.iterdir() if p.is_dir()]
    assert len(runs) == 1 and runs[0].name.startswith("weak-")


def test_cli_openai_provider_reads_key_from_env(tmp_run, monkeypatch):
    seen = {}

    def fake_make_llm(cfg, provider="ollama", api_key=None, base_url=None, model=None):
        seen.update(provider=provider, api_key=api_key, base_url=base_url, model=model)
        return fx.scripted_llm(fx.weak_opportunities())

    monkeypatch.setattr(cli, "make_llm", fake_make_llm)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://api.example.com/v1")
    monkeypatch.setenv("OPENAI_MODEL", "some-model")
    answers = weak_answers(tmp_run / "answers.yaml")

    cli.main(["--brief", str(ROOT / "briefs" / "weak.md"), "--answers", str(answers),
              "--provider", "openai", "--run-dir", str(tmp_run / "r")], search=fx.fake_search())

    assert seen == {"provider": "openai", "api_key": "sk-test",
                    "base_url": "https://api.example.com/v1", "model": "some-model"}


def test_cli_needs_a_brief():
    with pytest.raises(SystemExit):
        cli.main([])
