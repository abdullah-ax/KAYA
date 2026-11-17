"""Profiler: reads the brief, asks only gap questions, writes the founder profile."""
from __future__ import annotations

import json
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from api.agents.cofounder import ask_founder

if TYPE_CHECKING:
    from api.orchestrator import Ctx


class IntakePlan(BaseModel):
    answered: list[str] = []
    questions: list[str] = []


class Strength(BaseModel):
    strength: str
    quote: str


class Access(BaseModel):
    group: str
    how_many: str
    reach_today: bool


class Signal(BaseModel):
    signal: str
    quote: str


class Market(BaseModel):
    market: str
    why: str


class FounderProfile(BaseModel):
    strengths: list[Strength] = Field(max_length=3)
    access: list[Access] = []
    constraints: list[str] = []
    personality: list[Signal] = []
    cofounder_type: Literal["numbers_hawk", "hustler", "brand_builder", "operator", "warm_skeptic"]
    cofounder_why: str
    teaching_level: Literal["strengths-led", "baby-steps"]
    markets: list[Market] = Field(max_length=3)
    open_questions: list[str] = []


def _limit(ctx: Ctx) -> int:
    return (ctx.cfg.demo if ctx.cfg.mode == "demo" else ctx.cfg.full).max_intake_questions


def run(ctx: Ctx, brief: str) -> FounderProfile:
    system = ctx.prompt("profiler", "question_bank")
    plan = ctx.complete("profiler", "plan_intake_questions", system,
                        f"Founder brief:\n{brief}\n\nList only questions the brief does not answer. "
                        f"At most {_limit(ctx)}.", IntakePlan)
    intake = []
    for question in plan.questions[:_limit(ctx)]:
        answer = ask_founder(ctx, "intake", question)
        ctx.log.append("founder", "answer_question", founder_input=answer)
        intake.append({"question": question, "answer": answer})
    qa = "\n".join(f"Q: {x['question']}\nA: {x['answer']}" for x in intake) or "(no questions asked)"
    profile = ctx.complete("profiler", "write_founder_profile", system,
                           f"Founder brief:\n{brief}\n\nIntake answers:\n{qa}\n\n"
                           "Mark anything still missing as ASSUMPTION.", FounderProfile)
    path = ctx.output(1, 1, "founder_profile", "json")
    path.write_text(json.dumps(profile.model_dump() | {"intake": intake}, indent=2,
                               ensure_ascii=False) + "\n", encoding="utf-8")
    return profile
