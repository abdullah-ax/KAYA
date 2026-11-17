import { describe, expect, it } from "vitest";

import { ASSUMPTION, AREA_OF_TOPIC, buildProfile, checkAnswer, FIXED_KEYS, fallbackQuestion, founderFit, MAX_FOLLOWUPS, OPENING, profileBrief, type OnbAnswer } from "./onboarding";

const a = (key: string, answer: string): OnbAnswer => ({ key, question: "Q?", answer });
const OPEN: OnbAnswer[] = [
  a("role", "Student, Pharmacy, 4th year"),
  a("city", "Cairo"),
  a("help", "Teaching or tutoring. They ask for my pharmacology sheets"),
  a("group", "About 1,200 pharmacy students in a Telegram group"),
  a("time", "5–10"),
  a("money", "Self-funded, no raise"),
  a("education", "Cairo University, Pharmacy, 4th year"),
  a("work", "Pharmacy intern for 3 months"),
  a("hobbies", "I draw study posters and friends notice them"),
  a("connections", "My professor knows 3 clinic owners"),
  a("access", "Arabic and English, I know Cairo and Giza"),
  a("wont_do", "No fake reviews"),
];
const skip = (k: string) => a(k, ASSUMPTION);
const AREAS = ["strengths", "access", "experience", "interests", "constraints", "values"];

describe("opening questions", () => {
  it("are specific, one per screen, and the vague first question is gone", () => {
    expect(OPENING.map((s) => s.id)).toEqual(["role", "city", "education", "work", "help", "hobbies", "group", "connections", "access", "time", "money", "wont_do"]);
    expect([...FIXED_KEYS]).toEqual(OPENING.map((s) => s.id));
    expect(OPENING[0].q).toBe("What do you do most days?");
    expect(OPENING[0].chips).toEqual(["Student", "Employee", "Freelancer", "Run a business", "Between jobs"]);
    expect(OPENING.some((s) => /two or three sentences/i.test(s.q))).toBe(false);
  });
  it("every screen has chips or own words, a plain question and a why", () => {
    for (const st of OPENING) {
      expect(st.chips?.length || st.text).toBeTruthy();
      expect(st.q.endsWith("?")).toBe(true);
      expect(st.why).not.toBe("");
    }
    expect(OPENING.find((s) => s.id === "group")!.chips).toEqual(expect.arrayContaining(["Family", "Neighbourhood", "Mosque or church", "University clubs", "WhatsApp or Facebook groups", "Sports team", "Work"]));
    expect(OPENING.find((s) => s.id === "access")!.chips).toEqual(expect.arrayContaining(["Arabic", "English"]));
    expect(OPENING.find((s) => s.id === "wont_do")!.chips!.length).toBeGreaterThan(2);
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
    const all = ["problem", "customer", "past", "hobby", "distribution", "fit", "unpaid", "conflict"].map((k) => a(k, "x"));
    expect(fallbackQuestion([...OPEN, ...all])).toBeNull();
  });
});

describe("fallback covers every area", () => {
  it("every area has a standard question", () => {
    expect(new Set(Object.values(AREA_OF_TOPIC))).toEqual(new Set(AREAS));
  });
  it("walks through all six areas when everything was skipped", () => {
    const answers = [...FIXED_KEYS].map(skip);
    const areas = new Set<string>();
    for (let n = 0; n < 8; n++) {
      const q = fallbackQuestion(answers)!;
      expect(q.text).not.toBe("");
      areas.add(AREA_OF_TOPIC[q.key]);
      answers.push(a(q.key, "x"));
    }
    expect(areas).toEqual(new Set(AREAS));
    expect(fallbackQuestion(answers)).toBeNull();
  });
  it("asks about the skipped area first and quotes the founder's words", () => {
    const q = fallbackQuestion(OPEN.map((x) => (x.key === "hobbies" ? skip("hobbies") : x)))!;
    expect(q.key).toBe("hobby");
    const q2 = fallbackQuestion(OPEN)!;
    expect(q2.key).toBe("problem");
    expect(q2.text).toContain("40 pharmacy students".replace("40", "1,200"));
  });
  it("quotes the hobby words when the hobby topic comes up", () => {
    const q = fallbackQuestion([...OPEN, a("problem", "x"), a("distribution", "x"), a("customer", "x"), a("past", "x")])!;
    expect(q.key).toBe("hobby");
    expect(q.text).toContain("friends notice them");
  });
});

describe("checkAnswer", () => {
  it("is empty, bare, short or valid, with plain wording", () => {
    expect(checkAnswer("", 1).state).toBe("empty");
    expect(checkAnswer("yes", 1)).toEqual({ state: "bare", message: "Tell me in a few more words." });
    expect(checkAnswer("a b", 5)).toMatchObject({ state: "short", message: "3 more words." });
    expect(checkAnswer("a b c d", 5)).toMatchObject({ state: "short", message: "1 more word." });
    expect(checkAnswer("one two three", 3).state).toBe("valid");
  });
  it("never uses the word reason", () => {
    expect(JSON.stringify([checkAnswer("ok", 1), checkAnswer("a", 3)])).not.toMatch(/reason/i);
  });
});

describe("founderFit", () => {
  it("is the top three edges, each pointing to the answer that shows it", () => {
    const { edges } = founderFit(OPEN);
    expect(edges).toHaveLength(3);
    for (const e of edges) {
      expect(e.title && e.why).toBeTruthy();
      expect(e.quote).toBe(OPEN.find((x) => x.key === e.key)!.answer);
    }
    expect(edges.map((e) => e.key)).toEqual(["help", "group", "connections"]);
  });
  it("never counts skipped answers", () => {
    const { edges } = founderFit(OPEN.map((x) => (x.key === "help" || x.key === "group" ? skip(x.key) : x)));
    expect(edges.map((e) => e.key)).not.toContain("help");
    expect(edges.map((e) => e.key)).not.toContain("group");
    expect(founderFit(FIXED_KEYS.map(skip)).edges).toEqual([]);
  });
});

describe("buildProfile", () => {
  it("groups everything and marks skipped items as ASSUMPTION", () => {
    const p = buildProfile([...OPEN.map((x) => (x.key === "hobbies" || x.key === "connections" ? skip(x.key) : x)), a("hobby", "300 followers")]);
    expect(p.experience!.map((i) => i.quote)).toEqual(["Cairo University, Pharmacy, 4th year", "Pharmacy intern for 3 months"]);
    expect(p.interests![0]).toEqual({ key: "hobbies", text: "Hobbies and things you do for fun", quote: ASSUMPTION });
    expect(p.interests![1].quote).toBe("300 followers");
    const net = Object.fromEntries(p.network!.map((i) => [i.key, i.quote]));
    expect(net.connections).toBe(ASSUMPTION);
    expect(net.access).toContain("Arabic");
    expect(p.values).toEqual(["No fake reviews"]);
    expect(p.fit!.edges.length).toBe(3);
  });

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
    const p = buildProfile([a("role", "Student"), skip("group")]);
    expect(p.access[0].group).toBe(ASSUMPTION);
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
    expect(brief).toContain("Arabic and English");
    expect(brief).toContain("Cairo University");
    expect(brief).not.toContain("ASSUMPTION");
    for (const part of ["exam sheets that people print", "800 pharmacy students", "No exaggerated claims", "5–10", "Self-funded", "warm_skeptic"]) expect(brief).toContain(part);
    expect(brief).not.toContain("pharmacology sheets");
    expect(profileBrief({ ...p, about: "x".repeat(20000) }).length).toBeLessThanOrEqual(8000);
  });
});
