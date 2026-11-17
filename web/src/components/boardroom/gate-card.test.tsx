import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { gateArgsFromPending } from "./live-model";
import { GateDecision, GateNextContext, GateSubmitContext } from "./tools";

const GOOD = "I picked this because forty students already ask me for these sheets every single term";

describe("recommended badge", () => {
  const options = [
    { id: "option_1", name: "Cheat sheets", cost: "$0", risk: "low", source: "S1" },
    { id: "stop", name: "Stop here", cost: "$0", risk: "none", source: "none" },
  ];
  it("marks the stop option when stop is recommended", () => {
    const a = gateArgsFromPending({ kind: "gate", key: "p", prompt: "stop: Only one source. Which one?", options });
    expect(a.recommended).toEqual(["stop"]);
  });
  it("marks the matching option for go, repeat and pivot", () => {
    const opts = [
      { id: "", name: "Continue to Build", cost: "", risk: "", source: "none" },
      { id: "", name: "Repeat the test", cost: "", risk: "", source: "none" },
      { id: "", name: "Pivot to a new idea", cost: "", risk: "", source: "none" },
    ];
    const rec = (o: string) => gateArgsFromPending({ kind: "gate", key: "p", prompt: `${o}: Reason here. Which one?`, options: opts }).recommended.length;
    const go = gateArgsFromPending({ kind: "gate", key: "p", prompt: "go: Targets met. Which one?", options: opts });
    expect(go.recommended).toEqual([go.options[0].id]);
    const rep = gateArgsFromPending({ kind: "gate", key: "p", prompt: "repeat: Close. Which one?", options: opts });
    expect(rep.recommended).toEqual([rep.options[1].id]);
    const piv = gateArgsFromPending({ kind: "gate", key: "p", prompt: "pivot: Weak. Which one?", options: opts });
    expect(piv.recommended).toEqual([piv.options[2].id]);
    expect(rec("go")).toBe(1);
  });
});

describe("gate layout", () => {
  it("shows all four options in a grid that wraps", () => {
    const args = { question: "Pick?", recommended: [], options: ["a", "b", "c", "d"].map((x) => ({ id: x, label: `Option ${x}`, body: "", cost: "$0", risk: "low" })) };
    render(<GateDecision args={args} />);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    const group = screen.getByRole("radiogroup");
    expect(group.className).not.toMatch(/grid-cols-3/);
    expect(group.className).toMatch(/auto-fit|auto-fill|sm:grid-cols-2/);
  });
});

describe("after the decision", () => {
  const stopArgs = { question: "Pick?", recommended: [], options: [{ id: "stop", label: "Stop here", body: "", cost: "$0", risk: "none" }] };
  const goArgs = { question: "Pick?", recommended: [], options: [{ id: "go", label: "Continue to Build", body: "", cost: "$0", risk: "low" }] };

  async function record(args: typeof stopArgs, next: { done: boolean; startOver: () => void }) {
    const user = userEvent.setup();
    render(
      <GateSubmitContext.Provider value={vi.fn().mockResolvedValue(undefined)}>
        <GateNextContext.Provider value={next}>
          <GateDecision args={args} />
        </GateNextContext.Provider>
      </GateSubmitContext.Provider>,
    );
    await user.click(screen.getByRole("radio"));
    await user.type(screen.getByRole("textbox"), GOOD);
    await user.click(screen.getByRole("button", { name: /confirm decision/i }));
    await screen.findByText(/saved/i);
    return user;
  }

  it("offers 'Start over with a new idea' after a stop once the run is done", async () => {
    const startOver = vi.fn();
    const user = await record(stopArgs, { done: true, startOver });
    await user.click(screen.getByRole("button", { name: "Start over with a new idea" }));
    expect(startOver).toHaveBeenCalled();
  });

  it("has no dead 'Start Stage 3' button after a go, because the run continues by itself", async () => {
    await record(goArgs, { done: true, startOver: vi.fn() });
    expect(screen.queryByRole("button", { name: /start stage/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start over/i })).not.toBeInTheDocument();
  });

  it("shows no next step while the run is still going", async () => {
    await record(stopArgs, { done: false, startOver: vi.fn() });
    expect(screen.queryByRole("button", { name: /start over|start stage/i })).not.toBeInTheDocument();
  });
});
