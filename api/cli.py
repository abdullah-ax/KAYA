"""Run the six-phase pipeline from the terminal.

python -m api.cli --brief briefs/strong.md [--answers answers.yaml]
                  [--provider ollama|openai] [--run-dir runs/<name>]
"""
from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from pathlib import Path

from api.config import load_config
from api.llm import LLM, make_llm
from api.log import DecisionLog
from api.orchestrator import AnswerSource, Ctx, InteractiveAnswers, ScriptedAnswers, run_pipeline
from api.research import Search, SearxSearch

ROOT = Path(__file__).resolve().parent.parent
FINISHED = {"go", "repeat", "pivot", "stop"}


def _model_choices() -> list[str]:
    return load_config(ROOT / "config.yaml").model.choices


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m api.cli", description="Run the six-phase pipeline on a founder brief.")
    p.add_argument("--brief", required=True, type=Path, help="founder brief, e.g. briefs/strong.md")
    p.add_argument("--answers", type=Path, help="YAML file of founder answers to replay a run")
    p.add_argument("--provider", choices=["ollama", "openai"], default="ollama")
    p.add_argument("--model", choices=_model_choices(), help="which model to run (default from config.yaml)")
    p.add_argument("--run-dir", type=Path, help="where outputs/, decision_log.json and state.json go")
    p.add_argument("--config", type=Path, default=ROOT / "config.yaml")
    return p


def main(argv: list[str] | None = None, *, llm: LLM | None = None, search: Search | None = None) -> int:
    args = _parser().parse_args(argv)
    cfg = load_config(args.config)
    if args.model:
        cfg = cfg.model_copy(update={"model": cfg.model.model_copy(update={"default": args.model})})
    if llm is None:
        # The key stays in the environment and goes only to the provider.
        llm = make_llm(cfg, args.provider, api_key=os.environ.get("OPENAI_API_KEY"),
                       base_url=os.environ.get("OPENAI_BASE_URL"),
                       model=os.environ.get("OPENAI_MODEL") if args.provider == "openai" else None)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = args.run_dir or cfg.runs_dir / f"{args.brief.stem}-{stamp}"
    answers: AnswerSource = ScriptedAnswers.from_file(args.answers) if args.answers else InteractiveAnswers()
    ctx = Ctx(cfg=cfg, llm=llm, search=search or SearxSearch(cfg.searxng_url),
              log=DecisionLog(run_dir / "decision_log.json"), answers=answers, run_dir=run_dir)
    result = run_pipeline(ctx, args.brief.read_text(encoding="utf-8"))
    print(f"\nRun finished: {result.outcome} (at {result.stopped_at}). Files are in {run_dir}")
    return 0 if result.outcome in FINISHED else 1


if __name__ == "__main__":
    raise SystemExit(main())
