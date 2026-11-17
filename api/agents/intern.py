"""Research intern: searches, then drafts 2-3 options. Every claim gets a source or ASSUMPTION."""
from __future__ import annotations

import re
from pathlib import Path

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal, Sequence

from pydantic import BaseModel, Field, model_validator

from api.research import (UNTRUSTED_NOTE, SearchResult, SourceCard, assumption, cite, claim_sources,
                          clean_cell, quote_note, quoted_claim, scrub_urls, untrusted)

if TYPE_CHECKING:
    from api.agents.profiler import FounderProfile
    from api.orchestrator import Ctx


class SearchPlan(BaseModel):
    queries: list[str] = Field(min_length=1, max_length=3)


class Opportunity(BaseModel):
    title: str
    problem: str
    who: str
    evidence_urls: list[str] = []
    evidence_quote: str = ""  # words copied exactly from the cited result's snippet
    founder_edge: str
    first_10: str
    cost_to_test: str
    risk: str
    founder_fit: int = Field(ge=1, le=5)


class OpportunityDraft(BaseModel):
    opportunities: list[Opportunity] = Field(min_length=2, max_length=3)


@dataclass
class Draft:
    """A rendered draft plus what the boss and the gate need from it."""

    markdown: str
    texts: list[str]
    cards: list[SourceCard] = field(default_factory=list)
    sourced: int = 0
    options: list[str] = field(default_factory=list)
    rows: list[tuple[str, str, str, str]] = field(default_factory=list)  # option, cost, risk, source
    founder_fit: int = 0
    data: Any = None
    redrafted: bool = False
    review_failed: bool = False  # the boss failed it even after a redraft
    review_reasons: list[str] = field(default_factory=list)


def search(ctx: Ctx, brief: str, profile: FounderProfile) -> list[SearchResult]:
    plan = ctx.complete("research_intern", "plan_searches", ctx.prompt("intern"),
                        f"{UNTRUSTED_NOTE}\n\nFounder brief:\n{untrusted(brief)}\n\n"
                        f"Profile:\n{profile.model_dump_json()}\n\n"
                        "Give 1 to 3 web search queries that find real problems this founder can solve.",
                        SearchPlan)
    results: list[SearchResult] = []
    for query in plan.queries:
        results.extend(ctx.search.search(query))
    ctx.registry.record(results)
    ctx.log.append("research_intern", "web_search", sources=[r.url for r in results])
    return results


def _results_text(results: Sequence[SearchResult]) -> str:
    lines = [f"- {r.title} | {r.url} | {r.snippet}" for r in results]
    return "\n".join(lines) or "(search found nothing: label every claim ASSUMPTION)"


def _notes_text(notes: Sequence[str]) -> str:
    return ("\n\nThe boss sent your last draft back. Fix these:\n" + "\n".join(f"- {n}" for n in notes)
            if notes else "")


def draft_opportunities(ctx: Ctx, brief: str, profile: FounderProfile,
                        results: Sequence[SearchResult], notes: Sequence[str] = ()) -> Draft:
    draft = ctx.complete(
        "research_intern", "draft_opportunities", ctx.prompt("intern"),
        f"{UNTRUSTED_NOTE}\n\nFounder brief:\n{untrusted(brief)}\n\n"
        f"Profile:\n{profile.model_dump_json()}\n\n"
        f"Search results (cite only these URLs):\n{untrusted(_results_text(results))}\n\n"
        "For each problem you back with evidence_urls, set evidence_quote to 3 to 25 words copied word for "
        "word from that result's snippet. Code checks the quote; a problem without a matching quote "
        "becomes ASSUMPTION.\n\n"
        f"Give 2 or 3 opportunities. Score founder_fit 1 to 5 from the profile.{_notes_text(notes)}",
        OpportunityDraft, sources=[r.url for r in results])
    return _render_opportunities(ctx, draft)


RESERVED_TITLES = ("Stop here",)  # option names the pipeline owns
_OPP_TEXT_FIELDS = ("problem", "who", "founder_edge", "first_10", "cost_to_test", "risk")


def _norm_title(title: str) -> str:
    return " ".join(re.sub(r"[^\w\s]", " ", title.lower()).split())


def _tidy_opportunities(ctx: Ctx, draft: OpportunityDraft) -> list[bool]:
    """Fix titles (one line, unique, never a reserved name) and scrub unseen URLs from every text.

    Returns, per opportunity, whether its problem text held an unseen URL.
    """
    taken = {_norm_title(t) for t in RESERVED_TITLES}
    tainted: list[bool] = []
    for opp in draft.opportunities:
        base = clean_cell(scrub_urls(opp.title, ctx.registry)[0]) or "Idea"
        title, n = base, 2
        while _norm_title(title) in taken:
            title, n = f"{base} (idea {n})", n + 1
        taken.add(_norm_title(title))
        opp.title = title
        bad_problem = False
        for name in _OPP_TEXT_FIELDS:
            text, removed = scrub_urls(getattr(opp, name), ctx.registry)
            setattr(opp, name, assumption(text) if removed else text)
            bad_problem = bad_problem or (removed and name == "problem")
        tainted.append(bad_problem)
    return tainted


def _trusted(cards: Sequence[SourceCard]) -> bool:
    """Only medium or high trust cards make a claim sourced; forums and social posts do not."""
    return any(c.trust != "low" for c in cards)


def _render_opportunities(ctx: Ctx, draft: OpportunityDraft) -> Draft:
    tainted = _tidy_opportunities(ctx, draft)
    out = Draft(markdown="", texts=[], data=draft)
    lines = ["# Opportunities (Phase 1, step 2)", "", "2-3 options. The founder picks one and says why.", ""]
    for letter, opp, bad in zip("ABC", draft.opportunities, tainted):
        claim, cards = quoted_claim(opp.problem, [] if bad else opp.evidence_urls, opp.evidence_quote,
                                    ctx.registry)
        source = ", ".join(c.url for c in cards) or "ASSUMPTION"
        evidence = [f"- Evidence: {source}", *(f"  > {quote_note(c)}" for c in cards if c.quote)]
        out.cards += cards
        out.sourced += _trusted(cards)
        out.options.append(opp.title)
        out.rows.append((opp.title, opp.cost_to_test, opp.risk, source))
        out.founder_fit = min(out.founder_fit or opp.founder_fit, opp.founder_fit)  # weakest option
        out.texts += [opp.title, claim, opp.who, opp.founder_edge, opp.first_10, opp.cost_to_test, opp.risk]
        lines += [f"## Option {letter}: {opp.title}", "",
                  f"- Problem: {claim}", *evidence, f"- Who has it: {opp.who}",
                  f"- Founder edge: {opp.founder_edge}", f"- First 10 people to ask: {opp.first_10}",
                  f"- Cost to test this week: {opp.cost_to_test}", f"- Biggest risk: {opp.risk}",
                  f"- Founder fit (model estimate, 1-5): {opp.founder_fit}", ""]
    out.markdown = "\n".join(lines)
    return out


class CanvasBox(BaseModel):
    content: str
    source_url: str | None = None
    source_quote: str | None = None  # words copied exactly from that source's snippet


class LeanCanvas(BaseModel):
    customer_segments: CanvasBox
    problem: CanvasBox
    uvp: CanvasBox
    solution: CanvasBox
    channels: CanvasBox
    revenue: CanvasBox
    costs: CanvasBox
    key_metrics: CanvasBox


BOX_NAMES = {
    "customer_segments": "1. Customer segments (early adopters)",
    "problem": "2. Problem (top 3 + current fixes)",
    "uvp": "3. Unique value proposition (one sentence)",
    "solution": "4. Solution (smallest feature set)",
    "channels": "5. Channels (start by hand)",
    "revenue": "6. Revenue streams (price)",
    "costs": "7. Cost structure",
    "key_metrics": "8. Key metrics (1-3)",
}


def draft_lean_canvas(ctx: Ctx, opportunity: Opportunity, profile: FounderProfile,
                      unfair_advantage: str, notes: Sequence[str] = ()) -> Draft:
    """Boxes 1-8 come from the model; box 9 is the founder's own words."""
    canvas = ctx.complete(
        "research_intern", "draft_lean_canvas", ctx.prompt("intern"),
        f"Chosen opportunity:\n{opportunity.model_dump_json()}\n\nProfile:\n{profile.model_dump_json()}\n\n"
        "Fill Lean Canvas boxes 1 to 8. Set source_url only to a URL from Phase 1 research, else null. "
        "When you set source_url, set source_quote to the words copied exactly from that source "
        "(the opportunity's evidence_quote when it is the same URL). Code checks the quote; "
        f"a box without a matching quote becomes ASSUMPTION.{_notes_text(notes)}", LeanCanvas)
    out = Draft(markdown="", texts=[], data=canvas)
    lines = ["# Lean Canvas (Phase 2, step 1)", "", f"Opportunity: {opportunity.title}", "",
             "| Box | Content | Source or ASSUMPTION |", "|---|---|---|"]
    for key, label in BOX_NAMES.items():
        box: CanvasBox = getattr(canvas, key)
        box.content, removed = scrub_urls(box.content, ctx.registry)
        if removed:
            box.content = assumption(box.content)
        urls = [box.source_url] if box.source_url and not removed else []
        claim, cards = quoted_claim(box.content, urls, box.source_quote, ctx.registry)
        if urls and not cards:
            box.content = claim  # cited, but the source does not hold the quote
        out.cards += cards
        out.sourced += _trusted(cards)
        out.texts.append(box.content)
        lines.append(f"| {label} | {box.content} | {cite(cards[0]) if cards else 'ASSUMPTION'} |")
    lines += [f'| 9. Unfair advantage (founder writes this) | "{unfair_advantage}" | founder |', "",
              f"Boxes with real evidence: {out.sourced} of 9", ""]
    out.markdown = "\n".join(lines)
    return out


class InterviewScript(BaseModel):
    questions: list[str] = Field(min_length=5, max_length=5)
    first_people: list[str] = Field(min_length=1, max_length=3)


TEMPLATE_PATH = Path(__file__).resolve().parent.parent.parent / "templates" / "interview_script.md"
# A question about what someone would do, not what they did. Mom Test: ask about the past.
_HYPOTHETICAL = re.compile(
    r"\b(would|will|could|might) (you|they)\b.{0,25}\b(buy|pay|use|download|subscribe|sign|try|want|like|love)\b|"
    r"\bhow much (would|will|do you think)\b|\bdo you think (you|they) (would|will)\b|"
    r"\bif (i|we) (made|built|offered|sold|created)\b|\bwould it be (useful|helpful|good)\b", re.IGNORECASE)


def _template_parts() -> tuple[str, str, list[str]]:
    """Head (before the questions), tail (from the Close line on) and the template's own questions."""
    text = TEMPLATE_PATH.read_text(encoding="utf-8")
    head, _, rest = text.partition("\n1. ")
    body, _, tail = ("1. " + rest).partition("**Close:**")
    questions = re.findall(r"^\d+\. (.+)$", body, flags=re.MULTILINE)
    return head, "**Close:**" + tail, questions


def draft_interview_script(ctx: Ctx, opportunity: Opportunity, profile: FounderProfile,
                           notes: Sequence[str] = ()) -> Draft:
    """Five Mom Test questions about past behaviour, plus who to ask first from the founder's own groups."""
    script = ctx.complete(
        "research_intern", "draft_interview_script", ctx.prompt("intern"),
        f"Chosen opportunity:\n{opportunity.model_dump_json()}\n\nProfile:\n{profile.model_dump_json()}\n\n"
        "Write an interview script in Mom Test style: exactly 5 questions about what people did in the past, "
        "never about what they would buy, pay or use. Do not mention the idea. "
        "In first_people, describe the first kinds of people to ask, taken from the founder's own groups "
        "(profile access), for example '3 students from your WhatsApp group who sit the test within 2 months'. "
        f"Never invent a person's name, age or job title.{_notes_text(notes)}", InterviewScript)
    head, tail, defaults = _template_parts()
    fallbacks = [q.replace("[the thing]", opportunity.title.lower()) for q in defaults]
    questions: list[str] = []
    for i, question in enumerate(script.questions):
        question = clean_cell(question)
        if _HYPOTHETICAL.search(question) or question in questions or not question:
            question = next((f for f in fallbacks[i:] + fallbacks if f not in questions), fallbacks[i])
        questions.append(question)
    first = [clean_cell(p) for p in script.first_people]
    md = "\n".join([head, "", *(f"{n}. {q}" for n, q in enumerate(questions, 1)), "",
                    "## Who to ask first", "", *(f"- {p}" for p in first), "", tail.rstrip(), ""])
    return Draft(markdown=md, texts=[*questions, *first], data=script)


# -- Phase 3: user stories and the 2-week MVP plan ------------------------------------

class UserStory(BaseModel):
    who: str
    want: str
    why: str
    criteria: list[str] = Field(min_length=1, max_length=4)
    priority: Literal["must", "should", "could"]
    hours: int = Field(ge=1, le=80)  # a model estimate of the work, in hours
    first_version: str  # the smallest manual or no-code way to deliver it
    backed_by: str | None = None  # a URL from Phase 1 research, else None


class UserStories(BaseModel):
    stories: list[UserStory] = Field(min_length=5, max_length=8)

    @model_validator(mode="after")
    def _has_a_must(self) -> UserStories:
        if not any(s.priority == "must" for s in self.stories):
            raise ValueError("At least one story must have priority must.")
        return self


class Step(BaseModel):
    when: str
    task: str


class MvpPlan(BaseModel):
    not_building: list[str] = Field(min_length=2, max_length=6)
    tools: list[str] = Field(min_length=1, max_length=6)
    checklist: list[Step] = Field(min_length=4, max_length=14)
    first_10: list[str] = Field(min_length=2, max_length=5)
    one_metric: str


DEFAULT_WEEKLY_HOURS = 5
_HOURS = re.compile(r"(\d+(?:\.\d+)?)\s*(?:(?:-|to)\s*\d+(?:\.\d+)?\s*)?(?:hours?|hrs?)\b", re.IGNORECASE)
_PRIORITY_ORDER = {"must": 0, "should": 1, "could": 2}


def weekly_hours(profile: FounderProfile) -> tuple[int, bool]:
    """Hours a week the founder gave, read from the profile limits. (hours, known). Unknown means a default."""
    for line in profile.constraints:
        if re.search(r"\b(day|month|total)\b", line, re.IGNORECASE):
            continue
        found = _HOURS.search(line)
        if found and float(found.group(1)) >= 1:
            return int(float(found.group(1))), True
    return DEFAULT_WEEKLY_HOURS, False


def _plain(ctx: Ctx, text: str) -> str:
    return clean_cell(scrub_urls(text, ctx.registry)[0])


def draft_user_stories(ctx: Ctx, opportunity: Opportunity, profile: FounderProfile, canvas: Draft,
                       signup_page: str, notes: Sequence[str] = ()) -> Draft:
    """5 to 8 INVEST stories with acceptance criteria, a priority and the smallest manual way to deliver each."""
    weekly, _ = weekly_hours(profile)
    drafted = ctx.complete(
        "research_intern", "draft_user_stories", ctx.prompt("intern"),
        f"Chosen opportunity:\n{opportunity.model_dump_json()}\n\nProfile:\n{profile.model_dump_json()}\n\n"
        f"Lean Canvas:\n{canvas.markdown}\n\nSign-up page:\n{signup_page}\n\n"
        f"Write 5 to 8 user stories for the first version. Each story follows INVEST: it stands alone, is small "
        f"and can be tested. who is one specific kind of person, described by group, never by a made-up name (for example a student in your WhatsApp group). want is what they do. why is what they get. "
        f"Give 1 to 4 acceptance criteria written as Given, when, then. Set priority to must, should or could. "
        f"At least one must. hours is your honest guess of the work in hours; the founder has {weekly} hours "
        f"a week. first_version is the smallest way to deliver it by hand or with a free no-code tool, "
        f"before any code. Set backed_by only to a URL from Phase 1 research, else null. "
        f"Do not promise income or sign-ups.{_notes_text(notes)}", UserStories)
    stories = sorted(drafted.stories, key=lambda s: _PRIORITY_ORDER[s.priority])
    out = Draft(markdown="", texts=[], data=UserStories.model_construct(stories=stories))
    lines = ["# User stories (Phase 3, step 1)", "", f"Opportunity: {opportunity.title}", "",
             "Drafted by the intern from your profile, your Lean Canvas and your sign-up page. "
             "Hours are the model's guess, so check them against your week.", ""]
    for n, s in enumerate(stories, 1):
        s.who, s.want, s.why = _plain(ctx, s.who), _plain(ctx, s.want), _plain(ctx, s.why)
        s.criteria = [_plain(ctx, c) for c in s.criteria]
        s.first_version = _plain(ctx, s.first_version)
        _claim, cards = claim_sources(s.want, [s.backed_by] if s.backed_by else [], ctx.registry)
        out.cards += cards
        out.texts += [s.who, s.want, s.why, *s.criteria, s.first_version]
        lines += [f"## Story {n}", "", f"As a {s.who}, I want {s.want}, so that {s.why}.", "",
                  f"- Priority: {s.priority}", f"- Time (model guess): {s.hours} hours", "- Acceptance criteria:",
                  *(f"  - {c}" for c in s.criteria),
                  f"- Smallest way to deliver it first: {s.first_version}",
                  f"- Backed by: {cards[0].url if cards else 'ASSUMPTION'}", ""]
    out.markdown = "\n".join(lines)
    return out


def must_hours(stories: Draft) -> int:
    return sum(s.hours for s in stories.data.stories if s.priority == "must")


def draft_mvp_plan(ctx: Ctx, opportunity: Opportunity, profile: FounderProfile, stories: Draft,
                   notes: Sequence[str] = ()) -> Draft:
    """A 2-week plan sized to the founder's hours. The scope is the must stories, listed by code."""
    weekly, known = weekly_hours(profile)
    musts = [s for s in stories.data.stories if s.priority == "must"]
    plan = ctx.complete(
        "research_intern", "draft_mvp_plan", ctx.prompt("intern"),
        f"Chosen opportunity:\n{opportunity.model_dump_json()}\n\nProfile:\n{profile.model_dump_json()}\n\n"
        f"Must-have stories:\n{chr(10).join(f'- {s.want} (first version: {s.first_version})' for s in musts)}\n\n"
        f"Write a 2-week MVP plan for a founder with {weekly} hours a week. not_building lists what to leave out. "
        "tools lists free or no-code tools first. checklist is the order of work, each step with when "
        "(a day or a week) and task. first_10 says how to put it in front of the first 10 users, taken from "
        "the founder's own groups (profile access), before any public post. one_metric is the one number to "
        f"watch. Do not promise income or sign-ups.{_notes_text(notes)}", MvpPlan)
    capacity = weekly * 2
    lines = ["# MVP plan (Phase 3, step 2)", "", f"Opportunity: {opportunity.title}", "",
             f"Your time: {weekly} hours a week, so {capacity} hours in 2 weeks"
             + ("." if known else ". ASSUMPTION: you did not say how many hours you have."), "",
             "## What to build", "", "Only the must-have stories:", ""]
    lines += [f"- As a {s.who}, I want {s.want} (about {s.hours} hours; first: {s.first_version})" for s in musts]
    lines += ["", f"Total: about {must_hours(stories)} hours of {capacity} (model guess).", ""]
    section = [("What not to build", [_plain(ctx, t) for t in plan.not_building]),
               ("Tools (free or no-code first)", [_plain(ctx, t) for t in plan.tools])]
    for title, items in section:
        lines += [f"## {title}", "", *(f"- {i}" for i in items), ""]
    steps = [(_plain(ctx, s.when), _plain(ctx, s.task)) for s in plan.checklist]
    first = [_plain(ctx, t) for t in plan.first_10]
    metric = _plain(ctx, plan.one_metric)
    lines += ["## Checklist (2 weeks)", "", *(f"- [ ] {w}: {t}" for w, t in steps), "",
              "## First 10 users", "", *(f"{n}. {t}" for n, t in enumerate(first, 1)), "",
              "## One number to watch", "", metric, ""]
    texts = [*(i for _, items in section for i in items), *(f"{w}: {t}" for w, t in steps), *first, metric]
    return Draft(markdown="\n".join(lines), texts=texts, data=plan)
