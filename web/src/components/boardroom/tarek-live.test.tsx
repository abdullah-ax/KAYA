import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Run } from "@/lib/api";
import { Boardroom } from "./boardroom";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const GATE_TEXT = "stop: 12 of 100 sign-ups in 14 days (12%). That is under 30% of the target. Stop or pivot to a new problem.\nWhich option, and why?";
const run: Run = {
  id: "r1", status: "gate", stage: "phase2_gate", outcome: null, mode: "demo", provider: "ollama", phase1: "go", phase2: "stop",
  pending: { kind: "gate", key: "phase2", prompt: GATE_TEXT, options: [{ id: "stop", name: "Stop", cost: "$0", risk: "none", source: "none" }] },
  notice: null, messages: [], outputs: [], sources: [], error: null,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/health") return json({ status: "ok" });
    if (url === "/api/models") return json({ default: "ollama", choices: [] });
    if (url === "/api/runs/r1") return json(run);
    throw new TypeError(`no route ${url}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Ahmed Tarek in live mode", () => {
  it("sits in the team list and shows his reaction with the parody label and disclaimer", async () => {
    render(<Boardroom initialRunId="r1" />);
    expect(await screen.findAllByText("Ahmed Tarek")).not.toHaveLength(0);
    expect(await screen.findByText(/12 of 100\? That's your WhatsApp group/)).toBeInTheDocument();
    expect(screen.getAllByText("Parody").length).toBeGreaterThan(0);
    expect(screen.getByText(/not affiliated/i)).toBeInTheDocument();
  });
});
