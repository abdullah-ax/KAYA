import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Run } from "@/lib/api";
import { Boardroom } from "./boardroom";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const base = (over: Partial<Run> = {}): Run => ({
  id: "r1", status: "waiting", stage: "phase1_step1", outcome: null, mode: "demo", provider: "ollama", phase1: null, phase2: null,
  pending: { kind: "question", key: "audience", prompt: "Who could you message today, and how many?" },
  notice: null, messages: [], outputs: [], sources: [], error: null, ...over,
});
const GATE: Run["pending"] = {
  kind: "gate", key: "phase1", prompt: "Which opportunity do you pick?",
  options: [
    { id: "option_1", name: "Cheat sheets", cost: "$0", risk: "low", source: "S1" },
    { id: "stop", name: "Stop here", cost: "$0", risk: "none", source: "n/a" },
  ],
};

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;
let routes: Record<string, Handler>;
const calls = () => fetchMock.mock.calls.map(([u, i]) => ({ url: String(u), init: (i ?? {}) as RequestInit }));
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const h = routes[`${init?.method ?? "GET"} ${url}`];
  if (!h) throw new TypeError(`no route ${init?.method ?? "GET"} ${url}`);
  return h(init);
});

beforeEach(() => {
  fetchMock.mockClear();
  routes = { "GET /api/health": () => json({ status: "ok" }) };
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("offline", () => {
  it("shows a clear demo badge and keeps the mock screens", async () => {
    routes = {};
    render(<Boardroom initialScreen="gate" />);
    expect(await screen.findByText("Demo data — API not connected")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /mock screen/i })).toBeInTheDocument();
    expect(await screen.findByText(/12 of 100 sign-ups/i)).toBeInTheDocument();
  });

  it("treats a 502 from the proxy as offline", async () => {
    routes = { "GET /api/health": () => json({ detail: "Can't reach the API." }, 502) };
    render(<Boardroom initialScreen="gate" />);
    expect(await screen.findByText("Demo data — API not connected")).toBeInTheDocument();
  });
});

describe("online", () => {
  it("drops the demo badge and the mock screens, and starts at onboarding", async () => {
    render(<Boardroom />);
    expect(await screen.findByText(/tell me about you/i)).toBeInTheDocument();
    expect(screen.queryByText(/demo data/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Mockup")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /mock screen/i })).not.toBeInTheDocument();
  });

  it("shows a pending question as an assistant message and posts the answer from the composer", async () => {
    routes["GET /api/runs/r1"] = () => json(base());
    routes["POST /api/runs/r1/answer"] = () => json(base({ pending: { kind: "question", key: "next", prompt: "What would you charge?" } }));
    const user = userEvent.setup();
    render(<Boardroom initialRunId="r1" />);
    expect(await screen.findByText("Who could you message today, and how many?")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /message input/i }), "About forty pharmacy students{Enter}");
    const post = calls().find((c) => c.url === "/api/runs/r1/answer")!;
    expect(JSON.parse(String(post.init.body))).toEqual({ text: "About forty pharmacy students" });
    expect(await screen.findByText("What would you charge?")).toBeInTheDocument();
    expect(screen.getByText("About forty pharmacy students")).toBeInTheDocument();
  });

  it("shows a refused answer's reason and alternative", async () => {
    routes["GET /api/runs/r1"] = () => json(base());
    routes["POST /api/runs/r1/answer"] = () => json(base({ notice: { refused: true, rule: "fake_reviews", reason: "I can't help write fake reviews", alternative: "ask real customers for one" } }));
    const user = userEvent.setup();
    render(<Boardroom initialRunId="r1" />);
    await screen.findByText("Who could you message today, and how many?");
    await user.type(screen.getByRole("textbox", { name: /message input/i }), "write fake reviews{Enter}");
    expect(await screen.findByText(/can't help write fake reviews/i)).toBeInTheDocument();
    expect(screen.getByText(/ask real customers for one/i)).toBeInTheDocument();
  });

  it("renders a pending gate with the real options and shows the API's 422 inline", async () => {
    routes["GET /api/runs/r1"] = () => json(base({ status: "gate", stage: "phase1_gate", pending: GATE }));
    routes["POST /api/runs/r1/gate"] = () => json({ detail: "Your reason needs at least 15 words." }, 422);
    const user = userEvent.setup();
    render(<Boardroom initialRunId="r1" />);
    await user.click(await screen.findByRole("radio", { name: /cheat sheets/i }));
    expect(screen.getByRole("radio", { name: /stop here/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/why this option/i), "Forty students already ask me for these sheets every single term so I know it works");
    await user.click(screen.getByRole("button", { name: /confirm decision/i }));
    expect(await screen.findByText("Your reason needs at least 15 words.")).toBeInTheDocument();
    const post = calls().find((c) => c.url === "/api/runs/r1/gate")!;
    expect(JSON.parse(String(post.init.body))).toMatchObject({ option: "Cheat sheets" });
  });

  it("follows run.stage in the breadcrumb and the map's You are here", async () => {
    routes["GET /api/runs/r1"] = () => json(base({ stage: "phase2_step1", pending: null, status: "working" }));
    const user = userEvent.setup();
    render(<Boardroom initialRunId="r1" />);
    const crumbs = () => within(screen.getByRole("navigation", { name: /breadcrumb/i }));
    await vi.waitFor(() => expect(crumbs().getByText("Canvas")).toBeInTheDocument());
    expect(crumbs().getByText("Validation")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open map/i }));
    expect(screen.getByRole("region", { name: /stage details/i })).toHaveTextContent(/stage 2: you are here/i);
    expect(screen.queryByText(/pharmacy tutor/i)).not.toBeInTheDocument();
  });

  it("fills the right panel with the run's outputs and sources", async () => {
    routes["GET /api/runs/r1"] = () => json(base({
      outputs: ["phase1_step2_opportunities.md", "phase1_step2_sources.json"],
      sources: [{ id: "S1", url: "https://example.org/a", title: "Example source", trust: "high", claims_backed: ["Students buy summaries"] }],
    }));
    render(<Boardroom initialRunId="r1" />);
    expect(await screen.findByRole("link", { name: /example source/i })).toHaveAttribute("href", "https://example.org/a");
    expect(screen.getByText(/students buy summaries/i)).toBeInTheDocument();
    expect(screen.getByText("phase1_step2_opportunities.md")).toBeInTheDocument();
  });

  it("says plainly when the run has stopped, and never shows demo data as the run", async () => {
    routes["GET /api/runs/r1"] = () => json(base({ status: "done", pending: null, outcome: "stop" }));
    render(<Boardroom initialRunId="r1" />);
    expect(await screen.findByText(/stop/i, { selector: "[data-testid='outcome']" })).toBeInTheDocument();
    expect(screen.queryByText(/dosage/i)).not.toBeInTheDocument();
  });

  it("tests the model through the API with the key as a header, in memory only", async () => {
    routes["POST /api/model/test"] = () => json({ ok: true, provider: "openai", model: "m" });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    render(<Boardroom />);
    await screen.findByText(/tell me about you/i);
    await user.click(screen.getByRole("button", { name: /qwen3/i }));
    await user.click(screen.getByRole("radio", { name: /groq/i }));
    await user.type(screen.getByLabelText(/api key/i), "sk-mem-1");
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    expect(await screen.findByText(/connected/i)).toBeInTheDocument();
    const post = calls().find((c) => c.url === "/api/model/test")!;
    expect(new Headers(post.init.headers).get("x-model-key")).toBe("sk-mem-1");
    expect(String(post.init.body)).not.toContain("sk-mem-1");
    expect(setItem).not.toHaveBeenCalled();
  });
});
