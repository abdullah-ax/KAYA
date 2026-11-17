import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendAnswer, type Run } from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LiveChat, LivePanel, LiveRoster } from "./live";
import { learnKeyFor, progressLine, refusalText } from "./live-model";
import { rememberRun } from "@/lib/run-url";

vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), sendAnswer: vi.fn() }));

const base = (over: Partial<Run> = {}): Run => ({
  id: "r1", status: "waiting", stage: "phase1_step1", outcome: null, mode: "demo", provider: "ollama", phase1: null, phase2: null,
  pending: { kind: "question", key: "audience", prompt: "Who could you message today, and how many?" },
  notice: null, messages: [], outputs: [], sources: [], error: null, ...over,
});
const GATE: Run["pending"] = {
  kind: "gate", key: "phase1", prompt: "Which opportunity do you pick?",
  options: [{ id: "option_1", name: "Cheat sheets", cost: "$0", risk: "low", source: "S1" }, { id: "stop", name: "Stop here", cost: "$0", risk: "none", source: "n/a" }],
};
const chat = (run: Run, extra: Partial<React.ComponentProps<typeof LiveChat>> = {}) =>
  render(<TooltipProvider><LiveChat run={run} update={() => {}} {...extra} /></TooltipProvider>);
const box = () => screen.queryByRole("textbox", { name: /message input/i });

beforeEach(() => vi.mocked(sendAnswer).mockReset());

describe("composer states", () => {
  it("is hidden with a clear note while a gate card waits", async () => {
    chat(base({ status: "gate", pending: GATE }));
    await screen.findByRole("radio", { name: /cheat sheets/i });
    expect(box()).not.toBeInTheDocument();
    expect(screen.getByText(/pick an option above/i)).toBeInTheDocument();
  });
  it("is hidden when the run is done", async () => {
    chat(base({ status: "done", pending: null, outcome: "stop" }));
    await screen.findByText(/the run is finished/i);
    expect(box()).not.toBeInTheDocument();
  });
  it("is open for a question, with no copy, regenerate or more toolbar on system messages", async () => {
    chat(base());
    await screen.findByText("Who could you message today, and how many?");
    expect(box()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy|refresh|regenerate|reload|more|export/i })).not.toBeInTheDocument();
  });
});

describe("answers in chat", () => {
  it("does not send a bare yes and says so in plain words", async () => {
    const user = userEvent.setup();
    chat(base());
    await user.type(await screen.findByRole("textbox", { name: /message input/i }), "yes{Enter}");
    expect(sendAnswer).not.toHaveBeenCalled();
    expect(await screen.findByText(/tell me in a few more words/i)).toBeInTheDocument();
  });
  it("also catches Arabic and Franco-Arabic fillers", async () => {
    const user = userEvent.setup();
    chat(base());
    await user.type(await screen.findByRole("textbox", { name: /message input/i }), "tamam{Enter}");
    expect(sendAnswer).not.toHaveBeenCalled();
  });
  it("still sends a real answer", async () => {
    vi.mocked(sendAnswer).mockResolvedValue(base());
    const user = userEvent.setup();
    chat(base());
    await user.type(await screen.findByRole("textbox", { name: /message input/i }), "About forty pharmacy students{Enter}");
    expect(sendAnswer).toHaveBeenCalledWith("r1", "About forty pharmacy students");
  });
  it("shows the open question again under a refusal", async () => {
    vi.mocked(sendAnswer).mockResolvedValue(base({ notice: { refused: true, reason: "I can't help write fake reviews", alternative: "ask real customers for one" } }));
    const user = userEvent.setup();
    chat(base());
    await user.type(await screen.findByRole("textbox", { name: /message input/i }), "write fake reviews{Enter}");
    await screen.findByText(/can't help write fake reviews/i);
    expect(screen.getAllByText(/who could you message today/i).length).toBeGreaterThanOrEqual(2);
  });
  it("tells the founder to wait when Enter is pressed during a reply", async () => {
    const user = userEvent.setup();
    chat(base({ status: "working", pending: null }));
    await user.type(await screen.findByRole("textbox", { name: /message input/i }), "hello{Enter}");
    expect(await screen.findByText("Wait for the reply, then send.")).toBeInTheDocument();
  });
});

describe("refusalText", () => {
  it("never doubles the period", () => {
    const t = refusalText({ refused: true, reason: "Rule: No fake reviews.", alternative: "Ask real customers." }, "Who?");
    expect(t).not.toMatch(/\.\./);
    expect(t).toContain("Instead: Ask real customers.");
    expect(t).toContain("Who?");
  });
});

describe("progress and errors", () => {
  it("names who is working from the stage", () => {
    expect(progressLine("phase1_step2")).toBe("Research intern is searching...");
    expect(progressLine("phase1_step1")).toMatch(/profiler/i);
    expect(progressLine("phase2_step1")).toMatch(/\S/);
    expect(progressLine("???")).toMatch(/\S/);
  });
  it("shows the named progress with a skeleton while working", async () => {
    chat(base({ status: "working", stage: "phase1_step2", pending: null }));
    expect(await screen.findByText("Research intern is searching...")).toBeInTheDocument();
    expect(document.querySelector("[data-slot='skeleton']")).not.toBeNull();
  });
  it("shows a friendly error with a retry that reloads the run", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    chat(base({ status: "error", pending: null, error: "Traceback ValueError boom" }), { onRetry });
    expect(await screen.findByText(/something went wrong on our side\. your answers are saved\./i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Traceback|ValueError/);
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("right panel learning", () => {
  it("shows one learn card and one case study for the stage", () => {
    render(<LivePanel run={base({ stage: "phase1_step2" })} error={null} onRestart={() => {}} />);
    expect(screen.getAllByRole("link", { name: /the mom test|how to get startup ideas/i })).toHaveLength(1);
    expect(screen.getAllByText("Case study")).toHaveLength(1);
  });
  it("picks a lesson key per stage", () => {
    expect(learnKeyFor("phase1_step1")).toBe("intake");
    expect(learnKeyFor("phase1_step2")).toBe("cofounder");
    expect(learnKeyFor("phase2_gate")).toBe("gate");
  });
});

describe("who is speaking", () => {
  it("highlights the Profiler while the intake question is open", () => {
    render(<LiveRoster run={base()} />);
    expect(screen.getByText("Profiler").closest("[aria-current]")).toHaveAttribute("aria-current", "true");
  });
});

describe("run id in the address", () => {
  it("puts ?run=<id> in the URL and keeps other params, and clears it", () => {
    window.history.replaceState(null, "", "/?theme=dark");
    rememberRun("abc123");
    expect(window.location.search).toBe("?theme=dark&run=abc123");
    rememberRun(null);
    expect(window.location.search).toBe("?theme=dark");
  });
});
