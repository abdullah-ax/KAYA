"""Load config.yaml into typed settings. Env vars override a few keys."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, model_validator


class _Section(BaseModel):
    model_config = ConfigDict(extra="allow")


class ModelConfig(_Section):
    default: str
    fallback: str
    choices: list[str] = []
    temperature: float = 0
    max_retries: int = 3
    ollama_url: str = "http://localhost:11434"

    @model_validator(mode="after")
    def _offer_default_and_fallback(self) -> "ModelConfig":
        for name in (self.default, self.fallback):
            if name not in self.choices:
                self.choices.append(name)
        return self


class ModeLimits(_Section):
    max_intake_questions: int
    min_reason_words: int


class ApprovalConfig(_Section):
    rejected_answers: list[str]
    options_per_choice: int = 3
    understanding_questions: int = 2


class Phase1Gate(_Section):
    min_sourced_problems: int
    min_founder_fit_score: int


class Phase2Gate(_Section):
    signup_target: int
    window_days: int
    stop_below_fraction: float


class GatesConfig(_Section):
    phase1_discover: Phase1Gate
    phase2_validate: Phase2Gate


class WritingConfig(_Section):
    max_reading_grade: float
    max_em_dashes_per_paragraph: int


class Config(_Section):
    model: ModelConfig
    mode: Literal["demo", "full"] = "demo"
    demo: ModeLimits
    full: ModeLimits
    approval: ApprovalConfig
    gates: GatesConfig
    writing: WritingConfig
    searxng_url: str = "http://searxng:8080"
    runs_dir: Path = Path("runs")

    @property
    def min_reason_words(self) -> int:
        """Shortest founder reason we accept, for the current mode."""
        return (self.demo if self.mode == "demo" else self.full).min_reason_words


def load_config(path: str | Path = "config.yaml") -> Config:
    """Read the YAML file, then let env vars win for URLs, mode and runs dir."""
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    env = os.environ
    if env.get("OLLAMA_URL"):
        data.setdefault("model", {})["ollama_url"] = env["OLLAMA_URL"]
    if env.get("SEARXNG_URL"):
        data["searxng_url"] = env["SEARXNG_URL"]
    if env.get("MODE"):
        data["mode"] = env["MODE"]
    if env.get("RUNS_DIR"):
        data["runs_dir"] = env["RUNS_DIR"]
    return Config.model_validate(data)
