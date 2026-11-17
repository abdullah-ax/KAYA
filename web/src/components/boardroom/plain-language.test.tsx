import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Run } from "@/lib/api";
import { LivePanel } from "./live";
import { ModelSettings } from "./model-settings";
import { GateDecision, GateSubmitContext } from "./tools";

const run = (over: Partial<Run> = {}): Run => ({
  id: "r1", status: "working", stage: "phase1_step2", outcome: null, mode: "demo", provider: "ollama", phase1: null, phase2: null,
  pending: null, notice: null, messages: [], outputs: [], sources: [], error: null, ...over,
});

describe("live panel in plain language", () => {
  it("lists outputs by friendly name and never shows a file name", () => {
    render(<LivePanel run={run({ outputs: ["phase1_step1_answers.json", "phase1_step2_opportunities.md", "phase1_step2_sources.json", "weird.bin"] })} error={null} onRestart={() => {}} />);
    for (const n of ["Your answers", "Opportunities report", "Sources list", "Report"]) expect(screen.getByText(n)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\.(json|md|bin)\b/);
    expect(screen.queryByText(/files/i)).not.toBeInTheDocument();
  });

  it("says what is going on instead of 'Outcome: running'", () => {
    render(<LivePanel run={run({ status: "done", outcome: "stop" })} error={null} onRestart={() => {}} />);
    expect(screen.getByTestId("outcome")).toHaveTextContent("Finished: stop");
    expect(document.body.textContent).not.toMatch(/Outcome:/);
  });

  it("says Working on it while the run is working", () => {
    render(<LivePanel run={run({ status: "working", outcome: "running" })} error={null} onRestart={() => {}} />);
    expect(screen.getByTestId("outcome")).toHaveTextContent("Working on it");
  });
});

describe("recorded gate", () => {
  it("says it is saved and approved, with no file names", async () => {
    const user = userEvent.setup();
    render(
      <GateSubmitContext.Provider value={vi.fn().mockResolvedValue(undefined)}>
        <GateDecision args={{ question: "Pick?", recommended: [], options: [{ id: "a", label: "Cheat sheets", body: "", cost: "$0", risk: "low" }] }} />
      </GateSubmitContext.Provider>,
    );
    await user.click(screen.getByRole("radio", { name: /cheat sheets/i }));
    await user.type(screen.getByRole("textbox"), "Forty students already ask me for these sheets every single term so I know it works");
    await user.click(screen.getByRole("button", { name: /confirm decision/i }));
    expect(await screen.findByText("Saved. You approved this.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/decision_log|approved_by/);
  });
});

describe("model chip", () => {
  it("shows an AI ready label and keeps the raw model id inside the dialog under Advanced", async () => {
    const user = userEvent.setup();
    render(<ModelSettings current="ollama" onChange={() => {}} />);
    const chip = screen.getByRole("button", { name: /ai ready/i });
    expect(chip).not.toHaveTextContent(/qwen3/i);
    await user.click(chip);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Advanced")).toBeInTheDocument();
    expect(within(dialog).getAllByText(/qwen3:8b/).length).toBeGreaterThan(0);
  });
});
