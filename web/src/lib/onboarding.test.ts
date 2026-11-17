import { describe, expect, it } from "vitest";

import { buildProfile, fallbackQuestion, MAX_FOLLOWUPS, OPENING, profileBrief, type OnbAnswer } from "./onboarding";

const a = (key: string, answer: string): OnbAnswer => ({ key, question: "Q?", answer });
const OPEN: OnbAnswer[] = [
  a("role", "Student, Pharmacy, 4th year"),
  a("city", "Cairo"),
  a("help", "Teaching or tutoring. They ask for my pharmacology sheets"),
  a("group", "About 1,200 pharmacy students in a Telegram group"),
  a("time", "5–10"),
  a("money", "Self-funded, no raise"),
];

describe("opening questions", () => {
  it("are specific, one per screen, and the vague first question is gone", () => {
    expect(OPENING.map((s) => s.id)).toEqual(["role", "city", "help", "group", "time", "money"]);
    expect(OPENING[0].q).toBe("What do you do most days?");
    expect(OPENING[0].chips).toEqual(["Student", "Employee", "Freelancer", "Run a business", "Between jobs"]);
    expect(OPENING.some((s) => /two or three sentences/i.test(s.q))).toBe(false);
  });
  it("max follow-ups in demo mode is 4", () => expect(MAX_FOLLOWUPS).toBe(4));
});

describe("fallbackQuestion", () => {
  it("puts the founder's own group words into the next unanswered question", () => {
    const q = fallbackQuestion(OPEN)!;
    expect(q.key).toBe("problem");
    expect(q.text).toContain("1,200 pharmacy students in a Telegram group");
    expect(q.why).not.toBe("");
  });
  it("skips topics already answered", () => {
    expect(fallbackQuestion([...OPEN, a("problem", "notes are long")])!.key).toBe("customer");
  });
  it("is null once nothing is left", () => {
    const all = ["problem", "customer", "past", "wont_do", "distribution", "fit", "unpaid", "conflict"].map((k) => a(k, "x"));
    expect(fallbackQuestion([...OPEN, ...all])).toBeNull();
  });
});

describe("buildProfile", () => {
  it("keeps the founder's words, counts the group and picks a co-founder with a reason", () => {
    const p = buildProfile([...OPEN, a("wont_do", "No fake reviews")]);
    expect(p.strengths[0].quote).toContain("pharmacology sheets");
    expect(p.access[0].count).toBe(1200);
    expect(p.constraints).toEqual({ hours: "5–10", money: "Self-funded, no raise" });
    expect(p.values).toEqual(["No fake reviews"]);
    expect(p.cofounder.type).toBe("warm_skeptic");
    expect(p.cofounder.why).not.toBe("");
  });
  it("marks what is missing as ASSUMPTION", () => {
    const p = buildProfile([a("role", "Student")]);
    expect(p.access[0].count).toBeNull();
    expect(p.constraints.hours).toContain("ASSUMPTION");
    expect(p.values[0]).toContain("ASSUMPTION");
  });
});

describe("profileBrief", () => {
  it("writes every edited line into the brief and stays under the limit", () => {
    const p = buildProfile(OPEN);
    p.strengths[0].quote = "I make exam sheets that people print";
    p.access[0].group = "800 pharmacy students";
    p.values = ["No exaggerated claims"];
    const brief = profileBrief(p);
    for (const part of ["exam sheets that people print", "800 pharmacy students", "No exaggerated claims", "5–10", "Self-funded", "warm_skeptic"]) expect(brief).toContain(part);
    expect(brief).not.toContain("pharmacology sheets");
    expect(profileBrief({ ...p, about: "x".repeat(20000) }).length).toBeLessThanOrEqual(8000);
  });
});
