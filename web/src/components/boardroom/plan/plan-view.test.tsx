import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Plan, PlanSnapshot } from "@/lib/api";
import * as api from "@/lib/api";
import { PlanView } from "./plan-view";

vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), getPlan: vi.fn(), getPlanVersion: vi.fn() }));

const sec = (id: string, title: string, body: string, extra = {}) => ({
  id, title, body_markdown: body, sources: [], assumptions: 0, status: body ? "written" : "not_yet", ...extra,
});

const PLAN: Plan = {
  overview: {
    stage: "phase2_gate", status_text: "Waiting on you.", waiting_on: "Your decision at the Phase 2 gate: go: 130 of 100 sign-ups",
    next_step: "Decide at the Phase 2 gate: continue, repeat the test, or stop.",
    issues: [{ text: "6 of 9 lean canvas boxes are ASSUMPTION, with no source.", section: "canvas", severity: "high" }],
  },
  sections: [
    sec("profile", "Founder profile", "## Strengths\n\n- Teaches IELTS speaking"),
    sec("opportunity", "Opportunity", "## Chosen: Speaking drills\n\n- Problem: students lack practice", {
      sources: [{ url: "https://example.edu/a", title: "Study A", trust: "high", claims: ["Students lack practice"] }] }),
    sec("canvas", "Lean canvas", "| Box | Content | Source or ASSUMPTION |\n|---|---|---|\n| 3. UVP | Sell by hand | ASSUMPTION |", { assumptions: 6 }),
    sec("signup", "Sign-up page", ""),
    sec("decisions", "Decisions", "## Phase 1 gate\n\n- Choice: Speaking drills"),
  ],
  critique: [
    { section: "profile", emotion: "neutral", line: "420 people you can reach today. Reach is not sales, ya basha." },
    { section: "opportunity", emotion: "skeptical", line: "3 of 3 problems have a source." },
    { section: "canvas", emotion: "skeptical", line: "6 of 9 boxes are ASSUMPTION." },
    { section: "signup", emotion: "listening", line: "No sign-up count yet." },
    { section: "decisions", emotion: "im_out", line: "Phase 1 gate said stop." },
  ],
  versions: [
    { n: 1, at: "2026-11-17T10:00:00Z", event: "draft", summary: "Opportunities written", sections_hash: "a" },
    { n: 2, at: "2026-11-17T10:05:00Z", event: "pivot", summary: "Phase 1 gate: you picked Mock test feedback", sections_hash: "b" },
    { n: 3, at: "2026-11-17T10:09:00Z", event: "stop", summary: "Phase 2 gate: you picked Stop or pivot", sections_hash: "c" },
  ],
};

const SNAP: PlanSnapshot = { ...PLAN.versions[1], sections: PLAN.sections.map((s) => s.id === "decisions" ? { ...s, body_markdown: "older decisions text" } : s) };

const getPlan = vi.mocked(api.getPlan);
const getPlanVersion = vi.mocked(api.getPlanVersion);

async function open(props: Partial<React.ComponentProps<typeof PlanView>> = {}) {
  const user = userEvent.setup();
  render(<PlanView runId="r1" live {...props} />);
  await user.click(screen.getByRole("button", { name: /open plan/i }));
  return user;
}

beforeEach(() => {
  getPlan.mockReset().mockResolvedValue(PLAN);
  getPlanVersion.mockReset().mockResolvedValue(SNAP);
});

describe("PlanView", () => {
  it("opens from the Plan button and closes on Escape", async () => {
    const user = await open();
    expect(screen.getByRole("dialog", { name: /business plan/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /business plan/i })).not.toBeInTheDocument();
  });

  it("shows the overview with what waits on the founder and issues linking to sections", async () => {
    await open();
    const overview = await screen.findByRole("region", { name: /overview/i });
    expect(within(overview).getByText(/Your decision at the Phase 2 gate/)).toBeInTheDocument();
    const link = within(overview).getByRole("link", { name: /6 of 9 lean canvas boxes/ });
    expect(link).toHaveAttribute("href", "#plan-canvas");
  });

  it("renders every section, with ASSUMPTION labels, sources and a Not written yet placeholder", async () => {
    await open();
    const doc = await screen.findByRole("article", { name: /plan document/i });
    expect(within(doc).getByRole("heading", { name: "Founder profile" })).toBeInTheDocument();
    expect(within(doc).getByText("Teaches IELTS speaking")).toBeInTheDocument();
    expect(within(doc).getAllByText("ASSUMPTION").length).toBeGreaterThan(0);
    expect(within(doc).getByRole("link", { name: /Study A/ })).toHaveAttribute("href", "https://example.edu/a");
    const signup = doc.querySelector("#plan-signup") as HTMLElement;
    expect(within(signup).getByText(/not written yet/i)).toBeInTheDocument();
  });

  it("marks pivot and stop versions, newest first", async () => {
    await open();
    const timeline = await screen.findByRole("list", { name: /version history/i });
    const items = within(timeline).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Stop")).toBeInTheDocument();
    expect(within(items[1]).getByText("Pivot")).toBeInTheDocument();
    expect(within(items[2]).queryByText(/^(Pivot|Stop)$/)).not.toBeInTheDocument();
  });

  it("opens a version read-only and goes back to current", async () => {
    const user = await open();
    await user.click(await screen.findByRole("button", { name: /version 2/i }));
    expect(getPlanVersion).toHaveBeenCalledWith("r1", 2);
    expect(await screen.findByText(/viewing version 2/i)).toBeInTheDocument();
    expect(screen.getByText("older decisions text")).toBeInTheDocument();
    expect(screen.getByText(/changed since this version/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /back to current/i }));
    expect(screen.queryByText(/viewing version 2/i)).not.toBeInTheDocument();
    expect(screen.getByText("Phase 1 gate")).toBeInTheDocument();
  });

  it("shows Ahmed Tarek's critique per section with Parody labels and one disclaimer", async () => {
    await open();
    const col = await screen.findByRole("complementary", { name: /ahmed tarek/i });
    expect(within(col).getByText(/420 people you can reach today/)).toBeInTheDocument();
    expect(within(col).getByText(/6 of 9 boxes are ASSUMPTION/)).toBeInTheDocument();
    expect(within(col).getAllByText("Parody").length).toBeGreaterThanOrEqual(5);
    expect(within(col).getAllByText(/not affiliated/i)).toHaveLength(1);
  });

  it("offers the Markdown download from the API", async () => {
    await open();
    const link = await screen.findByRole("link", { name: /download as markdown/i });
    expect(link).toHaveAttribute("href", "/api/runs/r1/plan.md");
  });

  it("shows a loading skeleton, then an error with retry", async () => {
    getPlan.mockReset().mockRejectedValueOnce(new Error("The API is down.")).mockResolvedValueOnce(PLAN);
    const user = await open();
    expect(await screen.findByText("The API is down.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByRole("article", { name: /plan document/i })).toBeInTheDocument());
  });

  it("explains an empty plan when no run has started", async () => {
    await open({ runId: null });
    expect(screen.getByText(/fills in as you go/i)).toBeInTheDocument();
    expect(getPlan).not.toHaveBeenCalled();
  });

  it("builds a labelled demo plan when the API is not connected", async () => {
    await open({ runId: null, live: false });
    expect(await screen.findByText(/demo plan/i)).toBeInTheDocument();
    expect(screen.getByRole("article", { name: /plan document/i })).toBeInTheDocument();
    expect(getPlan).not.toHaveBeenCalled();
  });
});
