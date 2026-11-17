import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { nextStage, sendAnswer, type Run } from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LiveChat, StageBar } from "./live";

vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), sendAnswer: vi.fn(), nextStage: vi.fn() }));

const LEVEL_UP: Run["pending"] = {
  kind: "level_up", key: "level_up", prompt: "Ideation is done. Ask me anything, or move on.",
  done: 1, stage: "Ideation", next: "Validation", proof: "You picked one opportunity with 3 sourced problems.",
};
const run = (over: Partial<Run> = {}): Run => ({
  id: "r1", status: "waiting", stage: "phase1_gate", outcome: null, mode: "demo", provider: "ollama", phase1: "option_1", phase2: null,
  pending: LEVEL_UP, notice: null, messages: [], outputs: [], sources: [], error: null, ...over,
});
const chat = (r: Run, update = vi.fn()) => {
  render(<TooltipProvider><LiveChat run={r} update={update} /></TooltipProvider>);
  return update;
};

beforeEach(() => { vi.mocked(sendAnswer).mockReset(); vi.mocked(nextStage).mockReset(); });

describe("level-up dialog", () => {
  it("opens with the finished stage, the proof and the next level, focused on the primary button", async () => {
    chat(run());
    const dialog = await screen.findByRole("dialog", { name: "Ideation complete" });
    expect(dialog).toHaveTextContent(LEVEL_UP.kind === "level_up" ? LEVEL_UP.proof : "");
    expect(dialog).toHaveTextContent("Next level: Stage 2, Validation");
    expect(screen.getByRole("button", { name: "Go to Validation" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Keep talking with the co-founder" })).toBeInTheDocument();
  });

  it("Go calls nextStage and hands the new run on", async () => {
    const fresh = run({ status: "working", stage: "phase2_step1", pending: null });
    vi.mocked(nextStage).mockResolvedValue(fresh);
    const user = userEvent.setup();
    const update = chat(run());
    await user.click(await screen.findByRole("button", { name: "Go to Validation" }));
    expect(nextStage).toHaveBeenCalledWith("r1");
    await waitFor(() => expect(update).toHaveBeenCalledWith(fresh));
  });

  it("Keep talking closes the dialog, keeps a Go button in the stage bar, and the composer posts to /answer", async () => {
    vi.mocked(sendAnswer).mockResolvedValue(run({ messages: ["Your top risk is price."] }));
    const user = userEvent.setup();
    chat(run());
    await user.click(await screen.findByRole("button", { name: "Keep talking with the co-founder" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to Validation" })).toBeInTheDocument();
    expect(screen.getByText(/ask the co-founder anything about this stage/i)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /message input/i }), "ok{Enter}");
    expect(sendAnswer).toHaveBeenCalledWith("r1", "ok");
  });

  it("Escape means keep talking", async () => {
    const user = userEvent.setup();
    chat(run());
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /message input/i })).toBeInTheDocument();
  });

  it("shows the level-up prompt once in the chat", async () => {
    chat(run({ messages: [LEVEL_UP.kind === "level_up" ? LEVEL_UP.prompt : ""] }));
    await screen.findByRole("dialog");
    await userEvent.setup().keyboard("{Escape}");
    expect(screen.getAllByText("Ideation is done. Ask me anything, or move on.")).toHaveLength(1);
  });
});

describe("StageBar", () => {
  it("shows the stage number, name and step", () => {
    render(<StageBar run={run({ status: "working", stage: "phase2_step1", pending: null })} />);
    expect(screen.getByText("Stage 2 of 6: Validation, Canvas")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the next stage while paused on a level-up, and a Go button when asked", async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(<StageBar run={run()} onNext={onNext} />);
    expect(screen.getByText(/Stage 1 of 6: Ideation/)).toBeInTheDocument();
    expect(screen.getByText("Next: Stage 2, Validation")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to Validation" }));
    expect(onNext).toHaveBeenCalled();
  });

  it("is at the top of the live chat", async () => {
    chat(run({ status: "working", stage: "phase1_step2", pending: null }));
    expect(await screen.findByText("Stage 1 of 6: Ideation, Opportunities")).toBeInTheDocument();
  });
});
