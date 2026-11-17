import { describe, expect, it } from "vitest";

import type { ApiSource } from "@/lib/api";
import { composeBrief, gateArgsFromPending, progressStages, sourceCardsFrom, stageInfo } from "./live-model";
import { STAGES } from "./journey";

describe("composeBrief", () => {
  it("puts every answer in the brief, in the founder's words", () => {
    const brief = composeBrief({
      brief: "I'm a pharmacy student in Cairo and I tutor.",
      skills: ["Teaching or tutoring", "Design"],
      network: "About 40 pharmacy students",
      time: "5–10",
      money: "Self-funded, no raise",
      values: "No fake reviews.",
    });
    for (const part of ["pharmacy student in Cairo", "Teaching or tutoring, Design", "About 40 pharmacy students", "5–10", "Self-funded, no raise", "No fake reviews."]) {
      expect(brief).toContain(part);
    }
  });
  it("skips missing answers and stays under the API limit of 8000 characters", () => {
    expect(composeBrief({ brief: "Hello there" })).not.toMatch(/undefined|skills/i);
    expect(composeBrief({ brief: "x".repeat(20000) }).length).toBeLessThanOrEqual(8000);
  });
});

describe("stageInfo", () => {
  it("maps API steps to a map stage and a plain step label", () => {
    expect(stageInfo("start")).toMatchObject({ stageId: "ideation" });
    expect(stageInfo("phase1_step2")).toMatchObject({ stageId: "ideation", label: "Opportunities" });
    expect(stageInfo("phase1_gate")).toMatchObject({ stageId: "ideation", label: "Sign-up gate" });
    expect(stageInfo("phase2_step1")).toMatchObject({ stageId: "validation" });
    expect(stageInfo("phase2_step2")).toMatchObject({ stageId: "validation" });
    expect(stageInfo("phase2_gate")).toMatchObject({ stageId: "validation" });
  });
  it("falls back to the phase number for unknown steps", () => {
    expect(stageInfo("phase2_mystery").stageId).toBe("validation");
    expect(stageInfo("???").stageId).toBe("ideation");
  });
});

describe("progressStages", () => {
  it("marks earlier stages done, the current one 'You are here', and carries no demo facts", () => {
    const s = progressStages(STAGES, "validation");
    expect(s.map((x) => x.status)).toEqual(["done", "current", "next", "locked", "locked", "locked"]);
    expect(s.every((x) => x.facts.length === 0 && x.issues.length === 0)).toBe(true);
  });
});

describe("sourceCardsFrom", () => {
  it("turns API sources into SourceCard props", () => {
    const src: ApiSource[] = [{ id: "S1", url: "https://a.org", title: "A", trust: "high", claims_backed: ["c1", "c2"] }];
    expect(sourceCardsFrom(src)).toEqual([{ n: 1, title: "A", url: "https://a.org", trust: "high", backs: "c1; c2" }]);
  });
  it("handles missing claims", () => {
    expect(sourceCardsFrom([{ id: "S2", url: "u", title: "T", trust: "low" }])[0].backs).toBe("");
  });
});

describe("gateArgsFromPending", () => {
  it("maps API options to gate card options without inventing a recommendation", () => {
    const args = gateArgsFromPending({ kind: "gate", key: "phase1", prompt: "Which one?", options: [{ id: "option_1", name: "Cheat sheets", cost: "$0", risk: "low", source: "S1" }] });
    expect(args.question).toBe("Which one?");
    expect(args.recommended).toEqual([]);
    expect(args.options[0]).toMatchObject({ id: "option_1", label: "Cheat sheets", cost: "$0", risk: "low" });
    expect(args.options[0].body).toContain("S1");
  });
});
