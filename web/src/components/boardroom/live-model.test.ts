import { describe, expect, it } from "vitest";

import type { ApiSource } from "@/lib/api";
import { composeBrief, doneMessage, friendlyFileName, gateArgsFromPending, outcomeSentence, progressLine, progressStages, sourceCardsFrom, stageInfo, STAGE_NAMES, stageNumber, stageTitle } from "./live-model";
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
  it("falls back to the phase's stage for unknown steps, with a plain label", () => {
    expect(stageInfo("phase2_mystery").stageId).toBe("validation");
    expect(stageInfo("???").stageId).toBe("ideation");
    expect(stageInfo("phase2_mystery").label).not.toMatch(/phase|\d/i);
  });
  it("maps later phases to their real stage", () => {
    expect(stageInfo("phase3_step1").stageId).toBe("build");
    expect(stageInfo("phase4_step1").stageId).toBe("setup");
    expect(stageInfo("phase5_gate").stageId).toBe("distribution");
    expect(stageInfo("phase6_step2").stageId).toBe("operate");
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
    expect(sourceCardsFrom(src)).toMatchObject([{ n: 1, title: "A", url: "https://a.org", trust: "high", backs: "c1; c2" }]);
  });
  it("handles missing claims", () => {
    expect(sourceCardsFrom([{ id: "S2", url: "u", title: "T", trust: "low" }])[0].backs).toBe("");
  });
});

describe("source titles, reasons and duplicate claims", () => {
  const mk = (over: Partial<ApiSource>): ApiSource => ({ id: "S0", url: "https://www.example.org/a", title: "T", trust: "medium", ...over });
  it("never titles a card 'Source 0': it uses the domain instead", () => {
    expect(sourceCardsFrom([mk({ title: "Source 0" })])[0].title).toBe("example.org");
    expect(sourceCardsFrom([mk({ title: "" })])[0].title).toBe("example.org");
    expect(sourceCardsFrom([mk({ title: "source 3" }), mk({ title: "Real title" })]).map((c) => c.title)).toEqual(["example.org", "Real title"]);
  });
  it("collapses duplicate claims", () => {
    expect(sourceCardsFrom([mk({ claims_backed: ["Students pay", "students pay ", "Cairo has 40 pharmacies"] })])[0].backs).toBe("Students pay; Cairo has 40 pharmacies");
  });
  it("gives every card a short reason for its trust level", () => {
    const reason = (url: string, trust: ApiSource["trust"]) => sourceCardsFrom([mk({ url, trust })])[0].reason;
    expect(reason("https://www.cbe.org.eg/x.gov.eg", "high")).toMatch(/\S/);
    expect(reason("https://www.capmas.gov.eg/a", "high")).toBe("Government site");
    expect(reason("https://www.reddit.com/r/x", "low")).toBe("Forum post");
    expect(reason("https://acme.com/blog/post", "medium")).toBe("Company blog");
    expect(reason("https://example.org", "low")).toMatch(/\S/);
    expect(reason("not a url", "medium")).toMatch(/\S/);
  });
  it("prefers the API's own short reason", () => {
    expect(sourceCardsFrom([mk({ trust_reason: "Peer reviewed" })])[0].reason).toBe("Peer reviewed");
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

describe("build stage wording", () => {
  it("labels the phase 3 steps in plain words", () => {
    expect(stageInfo("phase3_step1")).toEqual({ stageId: "build", label: "User stories" });
    expect(stageInfo("phase3_step2")).toEqual({ stageId: "build", label: "MVP plan" });
    expect(stageInfo("phase3_gate")).toEqual({ stageId: "build", label: "Build gate" });
    expect(stageInfo("phase4_gate")).toEqual({ stageId: "setup", label: "Checkout gate" });
    expect(stageInfo("phase5_step1")).toEqual({ stageId: "distribution", label: "Test sales" });
    expect(stageInfo("phase6_gate")).toEqual({ stageId: "operate", label: "Learning gate" });
  });

  it("shows Build as the current stage on the map", () => {
    const stages = ["ideation", "validation", "build", "setup"].map((id) => ({ id, status: "locked", facts: [], issues: [] }) as never);
    const out = progressStages(stages, stageInfo("phase3_step1").stageId);
    expect(out.map((s) => s.status)).toEqual(["done", "done", "current", "next"]);
  });

  it("says who is working on the build steps", () => {
    expect(progressLine("phase3_step1")).toMatch(/user stories/i);
    expect(progressLine("phase3_step2")).toMatch(/MVP plan/i);
  });

  it("marks the matching build option as recommended, not the go-back one", () => {
    const options = [
      { id: "build_this_mvp", name: "Build this MVP", cost: "", risk: "", source: "gate result" },
      { id: "cut_the_scope_further", name: "Cut the scope further", cost: "", risk: "", source: "gate result" },
      { id: "go_back_to_validation", name: "Go back to validation", cost: "", risk: "", source: "gate result" },
    ];
    const rec = (o: string) => gateArgsFromPending({ kind: "gate", key: "phase3", prompt: `${o}: Reason here. Which option, and why?`, options }).recommended;
    expect(rec("go")).toEqual(["build_this_mvp"]);
    expect(rec("repeat")).toEqual(["cut_the_scope_further"]);
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

describe("friendlyFileName", () => {
  it("shows plain names, never file names", () => {
    expect(friendlyFileName("phase1_step1_answers.json")).toBe("Your answers");
    expect(friendlyFileName("phase1_step2_opportunities.md")).toBe("Opportunities report");
    expect(friendlyFileName("phase1_step2_sources.json")).toBe("Sources list");
    expect(friendlyFileName("phase2_step1_lean_canvas.md")).toBe("Lean Canvas");
    expect(friendlyFileName("phase2_step2_signup_page.md")).toBe("Sign-up page");
    expect(friendlyFileName("decision_log.json")).toBe("Decision");
    expect(friendlyFileName("phase3_step1_user_stories.md")).toBe("User stories");
    expect(friendlyFileName("phase3_step2_mvp_spec.md")).toBe("MVP plan");
    expect(friendlyFileName("something_odd.txt")).toBe("Report");
  });
});

describe("outcomeSentence", () => {
  it("says what is happening in words", () => {
    expect(outcomeSentence("working", null)).toBe("Working on it");
    expect(outcomeSentence("waiting", null)).toBe("Waiting for you");
    expect(outcomeSentence("gate", null)).toBe("Waiting for you");
    expect(outcomeSentence("done", "stop")).toBe("Finished: stop");
    expect(outcomeSentence("done", "go")).toBe("Finished: go");
    expect(outcomeSentence("done", null)).toBe("Finished");
  });
});

describe("doneMessage", () => {
  it("gives a next step after stop, repeat and pivot", () => {
    expect(doneMessage("stop")).toBe("The run is finished. Outcome: stop. To go on, start a new run with a different idea or with stronger evidence.");
    expect(doneMessage("repeat")).toBe("The run is finished. Outcome: repeat. To go on, start a new run and bring more evidence for that step.");
    expect(doneMessage("pivot")).toBe("The run is finished. Outcome: pivot. To go on, start a new run with the changed idea.");
  });
  it("keeps go and a missing outcome short", () => {
    expect(doneMessage("go")).toBe("The run is finished. Outcome: go.");
    expect(doneMessage(null)).toBe("The run is finished.");
  });
});

describe("stageNumber and stageTitle", () => {
  it("names the six stages in order", () => {
    expect(STAGE_NAMES).toEqual(["Ideation", "Validation", "Build", "Commercial setup", "Sell and get paid", "Operate and learn"]);
  });
  it("numbers the stage from the step, 1 to 6, and starts at 1", () => {
    expect(stageNumber("start")).toBe(1);
    expect(stageNumber("phase1_gate")).toBe(1);
    expect(stageNumber("phase2_step1")).toBe(2);
    expect(stageNumber("phase3_gate")).toBe(3);
    expect(stageNumber("phase6_step1")).toBe(6);
    expect(stageNumber("phase9_step1")).toBe(1);
  });
  it("writes one plain line: stage number, stage name and step", () => {
    expect(stageTitle("phase1_step2")).toBe("Stage 1 of 6: Ideation, Opportunities");
    expect(stageTitle("phase2_gate")).toBe("Stage 2 of 6: Validation, Sign-up gate");
    expect(stageTitle("start")).toBe("Stage 1 of 6: Ideation, Getting to know you");
  });
});
