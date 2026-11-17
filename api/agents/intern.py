"""Research intern: searches, then drafts 2-3 options. Every claim gets a source or ASSUMPTION."""
from __future__ import annotations

import re

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Sequence

from pydantic import BaseModel, Field

from api.research import (UNTRUSTED_NOTE, SearchResult, SourceCard, assumption, claim_sources,
                          clean_cell, scrub_urls, untrusted)

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
        claim, cards = claim_sources(opp.problem, [] if bad else opp.evidence_urls, ctx.registry)
        source = ", ".join(c.url for c in cards) or "ASSUMPTION"
        out.cards += cards
        out.sourced += _trusted(cards)
        out.options.append(opp.title)
        out.rows.append((opp.title, opp.cost_to_test, opp.risk, source))
        out.founder_fit = min(out.founder_fit or opp.founder_fit, opp.founder_fit)  # weakest option
        out.texts += [opp.title, claim, opp.who, opp.founder_edge, opp.first_10, opp.cost_to_test, opp.risk]
        lines += [f"## Option {letter}: {opp.title}", "",
                  f"- Problem: {claim}", f"- Evidence: {source}", f"- Who has it: {opp.who}",
                  f"- Founder edge: {opp.founder_edge}", f"- First 10 people to ask: {opp.first_10}",
                  f"- Cost to test this week: {opp.cost_to_test}", f"- Biggest risk: {opp.risk}",
                  f"- Founder fit (model estimate, 1-5): {opp.founder_fit}", ""]
    out.markdown = "\n".join(lines)
    return out


class CanvasBox(BaseModel):
    content: str
    source_url: str | None = None


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
        "Fill Lean Canvas boxes 1 to 8. Set source_url only to a URL from Phase 1 research, "
        f"else null.{_notes_text(notes)}", LeanCanvas)
    out = Draft(markdown="", texts=[], data=canvas)
    lines = ["# Lean Canvas (Phase 2, step 1)", "", f"Opportunity: {opportunity.title}", "",
             "| Box | Content | Source or ASSUMPTION |", "|---|---|---|"]
    for key, label in BOX_NAMES.items():
        box: CanvasBox = getattr(canvas, key)
        box.content, removed = scrub_urls(box.content, ctx.registry)
        if removed:
            box.content = assumption(box.content)
        urls = [box.source_url] if box.source_url and not removed else []
        _claim, cards = claim_sources(box.content, urls, ctx.registry)
        out.cards += cards
        out.sourced += _trusted(cards)
        out.texts.append(box.content)
        lines.append(f"| {label} | {box.content} | {cards[0].url if cards else 'ASSUMPTION'} |")
    lines += [f'| 9. Unfair advantage (founder writes this) | "{unfair_advantage}" | founder |', "",
              f"Boxes with real evidence: {out.sourced} of 9", ""]
    out.markdown = "\n".join(lines)
    return out
