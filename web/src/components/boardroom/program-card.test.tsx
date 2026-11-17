import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProgramCardData } from "@/lib/api";
import { LivePanel } from "./live";
import { DEMO_PROGRAM } from "./program-demo";
import { ProgramCard, ProgramSection } from "./program-card";

const base = (over: Partial<ProgramCardData> = {}): ProgramCardData => ({
  stage: "validation",
  label: "Validation",
  goal: "Get proof from strangers before you build anything.",
  lead: { id: "warm_skeptic", name: "Noor" },
  handoff: "Noor takes over to help you test the idea with real people before you build.",
  joins: [{ id: "hustler", name: "Hustler", when: "writes your outreach messages" }],
  big_question: "If this worked, who else would want it in a year?",
  questions: ["Who outside your 420 students have you talked to?", "Q2?", "Q3?"],
  do_today: "Message 10 people you do not know.",
  ship: "A sign-up page, published only after you approve it.",
  metric: { name: "Sign-ups from strangers in 14 days", target: "A number you set before you start." },
  review: "Under 30% of your target means stop or pivot.",
  learn: { kind: "Essay", org: "Paul Graham", title: "Do Things That Don't Scale", url: "https://paulgraham.com/ds.html", why: "Recruit by hand." },
  case: { company: "Airbnb", market: "Global unicorn", fact: "Door to door in New York.", url: "https://paulgraham.com/ds.html", source: "Paul Graham", why: "Fix the offer by hand." },
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("ProgramCard", () => {
  it("shows every part of the stage card", () => {
    render(<ProgramCard card={base()} />);
    expect(screen.getByRole("heading", { name: /this week/i })).toBeInTheDocument();
    for (const text of [/get proof from strangers/i, /who else would want it/i, /420 students/, /message 10 people/i, /sign-up page/i,
      /sign-ups from strangers/i, /set before you start/i, /under 30%/i, /door to door/i]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("link", { name: /do things that don't scale/i })[0]).toHaveAttribute("href", "https://paulgraham.com/ds.html");
  });
  it("shows the coach avatar and the handoff line", () => {
    render(<ProgramCard card={base()} />);
    expect(screen.getByText(/noor takes over/i)).toBeInTheDocument();
    expect(document.querySelector("img[src*='warm_skeptic']")).not.toBeNull();
  });
  it("hides the handoff line when the coach stays", () => {
    render(<ProgramCard card={base({ handoff: null })} />);
    expect(screen.queryByText(/takes over/i)).toBeNull();
  });
  it("shows Sistilli steps with links for ideation", () => {
    const steps = [{ step: "2", title: "Check each idea", line: "Tarpit? Painkiller or vitamin?", links: [{ title: "Tarpit idea", url: "https://map.sistilli.dev/public/startups/concepts/Tarpit+idea" }] }];
    render(<ProgramCard card={base({ stage: "ideation", steps })} />);
    expect(screen.getByRole("link", { name: "Tarpit idea" })).toBeInTheDocument();
  });
  it("updates when the stage changes", () => {
    const { rerender } = render(<ProgramCard card={base()} />);
    rerender(<ProgramCard card={base({ stage: "build", label: "Build", lead: { id: "operator", name: "Operator" }, goal: "Make the smallest version.", handoff: "The Operator joins." })} />);
    expect(screen.getByText(/make the smallest version/i)).toBeInTheDocument();
    expect(screen.queryByText(/get proof from strangers/i)).toBeNull();
    expect(document.querySelector("img[src*='operator']")).not.toBeNull();
  });
});

describe("ProgramSection", () => {
  it("loads the card for the run and refetches when the stage changes", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ stage: "validation", card: base() }) }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<ProgramSection runId="run1" stage="phase2_step1" status="working" />);
    expect(await screen.findByText(/get proof from strangers/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/runs/run1/program", expect.anything());
    rerender(<ProgramSection runId="run1" stage="phase3_step1" status="working" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
  it("shows nothing when the card cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => "" })));
    const { container } = render(<ProgramSection runId="run1" stage="start" status="working" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});

describe("demo and live panel", () => {
  it("has demo cards with three questions and no forbidden dot characters", () => {
    expect(Object.keys(DEMO_PROGRAM).length).toBeGreaterThanOrEqual(3);
    for (const c of Object.values(DEMO_PROGRAM)) {
      expect(JSON.stringify(c)).not.toMatch(/[·•]/);
      expect(c.questions).toHaveLength(3);
    }
  });
  it("puts the This week card in the live right panel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ stage: "validation", card: base() }) })));
    const run = { id: "run1", status: "working", stage: "phase2_step1", outcome: null, mode: "demo", provider: "ollama", phase1: null, phase2: null,
      pending: null, notice: null, messages: [], outputs: [], sources: [], error: null, delivery: { approved: false, url: null, site_id: null } };
    render(<LivePanel run={run as never} error={null} onRestart={() => {}} />);
    expect(await screen.findByRole("heading", { name: /this week/i })).toBeInTheDocument();
  });
});
