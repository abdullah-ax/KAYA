/* Onboarding logic with no React and no network: the fixed opening questions, the
   standard follow-ups used when the model can't be reached, and the profile.
   Mirrors api/onboarding.py so the card looks the same online and offline.
   Topic ideas: prompts/question_bank.md, the office-hours six questions
   (github.com/alirezarezvani/claude-skills, MIT) and github.com/emotixco/claude-skills-founder (MIT). */

import type { FollowUp, OnbAnswer, Profile } from "./api";

export type { FollowUp, OnbAnswer, Profile };

export const MAX_FOLLOWUPS = 4;
const MAX_BRIEF = 8000;
export const ASSUMPTION = "ASSUMPTION: not answered yet";

export type OpeningStep = {
  id: "role" | "city" | "help" | "group" | "time" | "money";
  q: string;
  hint: string;
  why: string;
  chips?: string[];
  multi?: boolean;
  /** Free text next to (or instead of) the chips. */
  text?: { label: string; placeholder: string; required: boolean; minWords?: number };
};

export const OPENING: OpeningStep[] = [
  {
    id: "role", q: "What do you do most days?", hint: "Pick one. Then add your field if you like.",
    why: "It tells us how much time and what kind of week you have.",
    chips: ["Student", "Employee", "Freelancer", "Run a business", "Between jobs"],
    text: { label: "Your field (optional)", placeholder: "Pharmacy, 4th year", required: false },
  },
  {
    id: "city", q: "Where are you based?", hint: "A city is enough.",
    why: "Prices, languages and where people gather change from city to city.",
    text: { label: "Your city", placeholder: "Cairo, Alexandria, Mansoura…", required: true },
  },
  {
    id: "help", q: "What do people already ask you to help with?", hint: "Pick all that apply, or write your own.",
    why: "People pay for what they already ask you for.",
    chips: ["Teaching or tutoring", "Design", "Writing", "Coding", "Selling", "Organizing events"], multi: true,
    text: { label: "Anything else? (optional)", placeholder: "They ask for my pharmacology summary sheets", required: false },
  },
  {
    id: "group", q: "Which group could you message today, and about how many people are in it?", hint: "Name the group and give a number.",
    why: "People you can already reach are your first customers.",
    text: { label: "Your group", placeholder: "About 40 pharmacy students from my tutoring sessions", required: true, minWords: 3 },
  },
  {
    id: "time", q: "How many hours a week can you give this?", hint: "Be honest. We plan around it.",
    why: "A plan that ignores your real week fails in week two.",
    chips: ["Under 5", "5–10", "10–20", "20+"],
  },
  {
    id: "money", q: "How do you want to fund it?", hint: "No wrong answer.",
    why: "It decides which tests are cheap enough to run.",
    chips: ["Self-funded, no raise", "Small grant or competition", "Raise from investors later"],
  },
];

export const FIXED_KEYS = OPENING.map((s) => s.id) as string[];

const short = (text: string, n = 90) => {
  const t = text.split(/\s+/).filter(Boolean).join(" ");
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};
const get = (answers: OnbAnswer[], key: string) => answers.findLast((a) => a.key === key)?.answer.trim() ?? "";

/* ---------- standard follow-ups, in the order they are asked ---------- */

const TEMPLATES: [string, (g: string, h: string) => { text: string; why: string; placeholder: string }][] = [
  ["problem", (g) => ({ text: `You said "${g}". What do they complain about most? Use their words.`, why: "A problem in their own words is where good ideas start.", placeholder: "They say the notes are too long" })],
  ["customer", (_g, h) => ({ text: `You said people ask you for "${h}". Who asked last time, and what did they ask?`, why: "One real person tells us more than a guess about a crowd.", placeholder: "Mona asked last week for…" })],
  ["past", () => ({ text: "What have you built, sold, taught, or organized before? What happened?", why: "What you have already done is the best proof of what you can do.", placeholder: "I sold printed notes to 12 classmates" })],
  ["wont_do", () => ({ text: "What kind of business would you never run?", why: "This becomes a rule the agents follow.", placeholder: "No fake reviews. No exaggerated claims." })],
  ["distribution", (g) => ({ text: `If a stranger needed your help, where would they first hear about you? Name the place. Today you reach "${g}".`, why: "A product with no way to be found does not sell.", placeholder: "A Facebook group for pharmacy students" })],
  ["fit", (g) => ({ text: `Why are you the right person to help "${g}"?`, why: "Founders who know their people stay with the work longer.", placeholder: "I was in the same spot last year" })],
  ["unpaid", () => ({ text: "How many months can you work on this without being paid?", why: "It sets how long we can test before money matters.", placeholder: "About 3 months" })],
  ["conflict", () => ({ text: "When a plan goes wrong, what do you usually do first?", why: "It shows how your co-founder should push back.", placeholder: "I stop and write down what happened" })],
];

/** The next unanswered standard question, with the founder's own words put in. Null when none is left. */
export function fallbackQuestion(answers: OnbAnswer[]): FollowUp | null {
  const done = new Set(answers.map((a) => a.key));
  const g = short(get(answers, "group")) || "the people you can reach";
  const h = short(get(answers, "help")) || "the things people ask you for";
  const hit = TEMPLATES.find(([key]) => !done.has(key));
  if (!hit) return null;
  return { key: hit[0], kind: "text", ...hit[1](g, h) };
}

export const followUpCount = (answers: OnbAnswer[]) => answers.filter((a) => !FIXED_KEYS.includes(a.key)).length;

/* ---------- profile ---------- */

export const countOf = (text: string): number | null => {
  const m = /\d[\d,]*/.exec(text);
  return m ? Number(m[0].replace(/,/g, "")) : null;
};

export const COFOUNDERS: Record<string, { name: string; line: string }> = {
  warm_skeptic: { name: "Noor, the warm skeptic", line: "Pushes back kindly and asks for proof." },
  numbers_hawk: { name: "The numbers hawk", line: "Checks that the price and the costs add up." },
  hustler: { name: "The hustler", line: "Pushes you to put it in front of buyers this week." },
  brand_builder: { name: "The brand builder", line: "Makes the offer clear and easy to trust." },
  operator: { name: "The operator", line: "Turns the plan into a weekly routine." },
};

function pickCofounder(help: string): { type: string; why: string } {
  const h = help.toLowerCase();
  if (h.includes("selling") || h.includes("organizing"))
    return { type: "numbers_hawk", why: "You already reach people. A numbers hawk checks that the price and the costs add up." };
  if (h.includes("design") || h.includes("coding"))
    return { type: "hustler", why: "You build well. A hustler pushes you to put it in front of buyers this week." };
  return { type: "warm_skeptic", why: "You are early. A warm skeptic is kind, and asks for proof before you build." };
}

export function buildProfile(answers: OnbAnswer[]): Profile {
  const group = get(answers, "group");
  const strengths = ([["help", "People already ask you for help"], ["past", "You have done it before"], ["customer", "A real person already asks you"], ["problem", "You know their problem"]] as const)
    .flatMap(([key, text]) => (get(answers, key) ? [{ text, quote: get(answers, key) }] : []))
    .slice(0, 3);
  const values = answers.filter((a) => a.key === "wont_do").map((a) => a.answer.trim());
  return {
    about: [get(answers, "role"), get(answers, "city")].filter(Boolean).join(", ") || ASSUMPTION,
    strengths,
    access: [{ group: group || ASSUMPTION, count: countOf(group), quote: group }],
    constraints: { hours: get(answers, "time") || ASSUMPTION, money: get(answers, "money") || ASSUMPTION },
    values: values.length ? values : [ASSUMPTION],
    cofounder: pickCofounder(get(answers, "help")),
  };
}

/** The confirmed profile as one brief, in the founder's own words. */
export function profileBrief(p: Profile): string {
  const lines = [
    `About me: ${p.about}`,
    ...p.strengths.map((s) => `${s.text}: ${s.quote}`),
    ...p.access.map((a) => `People I could message today: ${a.group}`),
    `Hours a week I can give: ${p.constraints.hours}`,
    `How I want to fund it: ${p.constraints.money}`,
    ...p.values.map((v) => `What I won't do, even for money: ${v}`),
    `Co-founder style: ${p.cofounder.type}. ${p.cofounder.why}`,
  ];
  return lines.filter((l) => !/:\s*$/.test(l)).join("\n").slice(0, MAX_BRIEF);
}
