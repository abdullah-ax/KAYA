import { describe, expect, it } from "vitest";

import type { Run } from "@/lib/api";
import { tarekMood } from "./tarek-mood";

const run = (over: Partial<Run> = {}): Run => ({
  id: "r1", status: "waiting", stage: "phase1_step1", outcome: null, mode: "demo", provider: "ollama", phase1: null, phase2: null,
  pending: null, notice: null, messages: [], outputs: [], sources: [], error: null, ...over,
});
const gate = (prompt: string): Run["pending"] => ({ kind: "gate", key: "phase2", prompt, options: [{ id: "stop", name: "Stop", cost: "$0", risk: "none", source: "none" }] });

describe("tarekMood", () => {
  it("is neutral with no run", () => {
    expect(tarekMood(null).emotion).toBe("neutral");
  });
  it("thinks while the model works", () => {
    expect(tarekMood(run({ status: "working" })).emotion).toBe("thinking");
  });
  it("listens while a founder question is pending", () => {
    const m = tarekMood(run({ pending: { kind: "question", key: "a", prompt: "Who?" } }));
    expect(m.emotion).toBe("listening");
  });
  it("is skeptical at a stop gate and names the numbers", () => {
    const m = tarekMood(run({ status: "gate", stage: "phase2_gate", pending: gate("stop: 12 of 100 sign-ups in 14 days (12%). That is under 30% of the target. Stop or pivot to a new problem.\nWhich option, and why?") }));
    expect(m.emotion).toBe("skeptical");
    expect(m.line).toContain("12 of 100");
    expect(m.line).toMatch(/WhatsApp group/);
  });
  it("is skeptical at a repeat gate and names the numbers", () => {
    const m = tarekMood(run({ status: "gate", stage: "phase2_gate", pending: gate("repeat: 60 of 100 sign-ups in 14 days (60%). Run one more window or change the offer.\nWhich option, and why?") }));
    expect(m.emotion).toBe("skeptical");
    expect(m.line).toContain("60 of 100");
  });
  it("is skeptical at a phase 1 repeat gate without sign-up numbers", () => {
    const m = tarekMood(run({ status: "gate", stage: "phase1_gate", pending: gate("repeat: 2 sourced problems. Find more problems with a source link.\nWhich option, and why?") }));
    expect(m.emotion).toBe("skeptical");
    expect(m.line.length).toBeGreaterThan(0);
  });
  it("is skeptical at a pivot gate", () => {
    const m = tarekMood(run({ status: "gate", stage: "phase1_gate", pending: gate("pivot: 1 of 3 sourced problems. Try a new angle.\nWhich?") }));
    expect(m.emotion).toBe("skeptical");
  });
  it("says I'm out once stop was chosen", () => {
    const m = tarekMood(run({ status: "done", outcome: "stop", phase2: "stop" }));
    expect(m.emotion).toBe("im_out");
  });
  it("is pleased only for a phase 2 go at or above target", () => {
    const m = tarekMood(run({ status: "gate", stage: "phase2_gate", pending: gate("go: 100 of 100 sign-ups in 14 days (100%). The target is met.\nWhich option, and why?") }));
    expect(m.emotion).toBe("pleased");
    expect(m.line).toBe("Now we talk.");
  });
  it("is pleased above target", () => {
    const m = tarekMood(run({ status: "gate", stage: "phase2_gate", pending: gate("go: 140 of 100 sign-ups in 14 days (140%). The target is met.\nWhich?") }));
    expect(m.emotion).toBe("pleased");
  });
  it("is not pleased when sign-ups are below target, even if the text says go", () => {
    const m = tarekMood(run({ status: "gate", stage: "phase2_gate", pending: gate("go: 99 of 100 sign-ups in 14 days (99%).\nWhich?") }));
    expect(m.emotion).not.toBe("pleased");
  });
  it("is pleased when a finished run has phase 2 go", () => {
    expect(tarekMood(run({ status: "done", outcome: "go", phase2: "go" })).emotion).toBe("pleased");
  });
  it("is not pleased for a phase 1 go", () => {
    const m = tarekMood(run({ status: "gate", stage: "phase1_gate", pending: gate("go: 3 sourced problems.\nWhich?") }));
    expect(m.emotion).not.toBe("pleased");
  });
  it("is pleased for an explicit flawless flag", () => {
    expect(tarekMood(run({ status: "working" }), { flawless: true }).emotion).toBe("pleased");
  });
  it("never quotes a real person or gives investment advice", () => {
    const lines = [
      tarekMood(null), tarekMood(run({ status: "working" })),
      tarekMood(run({ status: "done", outcome: "stop" })),
      tarekMood(run({ status: "gate", stage: "phase2_gate", pending: gate("stop: 12 of 100 sign-ups in 14 days (12%).") })),
    ].map((m) => m.line);
    for (const l of lines) expect(l).not.toMatch(/invest(ment)? advice|said:|"/i);
  });
});
