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
    expect(stageInfo("phase1_gate")).toMatchObject({ stageId: "ideation", label: "Opportunity gate" });
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

describe("gate options without ids", () => {
  it("still get distinct values so only one can be picked", () => {
    const args = gateArgsFromPending({ kind: "gate", key: "publish", prompt: "Publish?", options: [
      { id: "", name: "Publish the sign-up page", cost: "EGP 0", risk: "few", source: "none" },
      { id: "", name: "Keep it private", cost: "EGP 0", risk: "none", source: "none" },
    ] } as never);
    const ids = args.options.map((o) => o.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every(Boolean)).toBe(true);
  });
});

describe("live gate wording", () => {
  const gate = (prompt: string, source = "https://www.britishcouncil.org/exam/ielts/some/very/long/path?x=1") =>
    gateArgsFromPending({ kind: "gate", key: "phase1", prompt, options: [{ id: "option_1", name: "Speaking drills", cost: "EGP 0", risk: "low", source }] } as never);

  it("names the phase 1 gate for what it decides", () => {
    expect(stageInfo("phase1_gate").label).toBe("Opportunity gate");
    expect(stageInfo("phase2_gate").label).toBe("Sign-up gate");
  });

  it("turns the gate's raw outcome prefix into a plain recommendation", () => {
    const g = gate("go: 3 sourced problems (need 3), founder fit 4 of 5. Which option, and why?");
    expect(g.question).toBe("Which option, and why?");
    expect(g.recommendation).toEqual({ outcome: "go", text: "3 sourced problems (need 3), founder fit 4 of 5." });
  });

  it("marks the stop option as recommended when the gate says stop", () => {
    const g = gateArgsFromPending({ kind: "gate", key: "phase1", prompt: "stop: 0 sourced problems. Which option, and why?", options: [
      { id: "option_1", name: "Idea", cost: "", risk: "", source: "none" }, { id: "stop", name: "Stop here", cost: "", risk: "", source: "none" }] } as never);
    expect(g.recommended).toEqual(["stop"]);
  });

  it("shows a source as its site name, not a long url", () => {
    expect(gate("Pick one?").options[0].body).toBe("Source: britishcouncil.org");
    expect(gate("Pick one?", "none").options[0].body).toBe("No source. Treat as an assumption.");
  });
});
