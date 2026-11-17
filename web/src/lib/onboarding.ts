/* Onboarding logic with no React and no network: the fixed opening questions, the
   standard follow-ups used when the model can't be reached, and the profile.
   Mirrors api/onboarding.py so the card looks the same online and offline.
   Topic ideas: prompts/question_bank.md, the office-hours six questions
   (github.com/alirezarezvani/claude-skills, MIT) and github.com/emotixco/claude-skills-founder (MIT). */

import type { FollowUp, OnbAnswer, Profile as ApiProfile } from "./api";

export type { FollowUp, OnbAnswer };

/** One line of the profile card. `key` is the question it came from. */
export type Item = { text: string; quote: string; key?: string };
/** An edge: what shows the founder's fit, and the answer that shows it. */
export type Edge = { title: string; why: string; key: string; quote: string };
/** The profile from the API, plus the groups added for founder fit (older replies may lack them). */
export type Profile = ApiProfile & { network?: Item[]; experience?: Item[]; interests?: Item[]; fit?: { edges: Edge[] } };

export const MAX_FOLLOWUPS = 4;
const MAX_BRIEF = 8000;
export const ASSUMPTION = "ASSUMPTION: not answered yet";

export type OpeningId = "role" | "city" | "education" | "work" | "help" | "hobbies" | "group" | "connections" | "access" | "time" | "money" | "wont_do";

export type OpeningStep = {
  id: OpeningId;
  q: string;
  hint: string;
  why: string;
  /** Short name for the "What I know about you" sidebar. */
  label: string;
  chips?: string[];
  multi?: boolean;
  /** Free text next to (or instead of) the chips. */
  text?: { label: string; placeholder: string; required: boolean };
};

export const OPENING: OpeningStep[] = [
  {
    id: "role", label: "What you do", q: "What do you do most days?", hint: "Pick one. Then add your field if you like.",
    why: "It tells us how much time and what kind of week you have.",
    chips: ["Student", "Employee", "Freelancer", "Run a business", "Between jobs"],
    text: { label: "Your field (optional)", placeholder: "Pharmacy, 4th year", required: false },
  },
  {
    id: "city", label: "City", q: "Where are you based?", hint: "A city is enough.",
    why: "Prices, languages and where people gather change from city to city.",
    text: { label: "Your city", placeholder: "Cairo, Alexandria, Mansoura…", required: true },
  },
  {
    id: "education", label: "Education", q: "What did you study, or what are you studying?", hint: "Pick one, then add the school, the subject and the year.",
    why: "What you studied is a skill you can show.",
    chips: ["School", "University", "Training course", "Self-taught", "Did not finish"],
    text: { label: "School, subject and year (optional)", placeholder: "Cairo University, Pharmacy, 4th year", required: false },
  },
  {
    id: "work", label: "Work", q: "What jobs or side jobs have you done?", hint: "Pick all that apply. Then say what you did and for how long.",
    why: "Real work is proof. Even a small side job counts.",
    chips: ["Full-time job", "Part-time job", "Freelance", "Family business", "Volunteering", "No work yet"], multi: true,
    text: { label: "What you did, and for how long (optional)", placeholder: "Pharmacy intern for 3 months", required: false },
  },
  {
    id: "help", label: "Asked for help with", q: "What do people already ask you to help with?", hint: "Pick all that apply, or write your own.",
    why: "People pay for what they already ask you for.",
    chips: ["Teaching or tutoring", "Design", "Writing", "Coding", "Selling", "Organizing events"], multi: true,
    text: { label: "Anything else? (optional)", placeholder: "They ask for my pharmacology summary sheets", required: false },
  },
  {
    id: "hobbies", label: "For fun", q: "What do you do for fun that other people notice?", hint: "Pick all that apply, or write your own.",
    why: "What you love doing is often where you know more than other people.",
    chips: ["Sports", "Music", "Drawing or design", "Gaming", "Cooking", "Reading", "Making videos"], multi: true,
    text: { label: "What do people say about it? (optional)", placeholder: "Friends ask me to draw their posters", required: false },
  },
  {
    id: "group", label: "Communities", q: "Which groups are you part of, and about how many people are in each?", hint: "Pick all that apply. Then give a rough number for each.",
    why: "People you can already reach are your first customers.",
    chips: ["Family", "Neighbourhood", "Mosque or church", "University clubs", "WhatsApp or Facebook groups", "Sports team", "Work"], multi: true,
    text: { label: "Names and rough counts (optional)", placeholder: "About 40 pharmacy students from my tutoring sessions", required: false },
  },
  {
    id: "connections", label: "Who could introduce you", q: "Who could introduce you to customers or experts?", hint: "Pick all that apply. Names help.",
    why: "One warm introduction beats a hundred cold messages.",
    chips: ["A teacher or professor", "A boss or old boss", "A family friend", "A club leader", "Someone in a company", "Nobody yet"], multi: true,
    text: { label: "Who, and who they know (optional)", placeholder: "My professor knows 3 clinic owners", required: false },
  },
  {
    id: "access", label: "Languages and access", q: "Which languages, cities and doors do you have?", hint: "Languages you speak, cities you know well, a family business, industries you can get into.",
    why: "Where you can get in is something most people cannot copy.",
    chips: ["Arabic", "English", "French", "German", "Family business", "Know several cities"], multi: true,
    text: { label: "Cities and industries (optional)", placeholder: "I know Cairo and Giza. My uncle owns a print shop", required: false },
  },
  {
    id: "time", label: "Hours a week", q: "How many hours a week can you give this?", hint: "Be honest. We plan around it.",
    why: "A plan that ignores your real week fails in week two.",
    chips: ["Under 5", "5–10", "10–20", "20+"],
  },
  {
    id: "money", label: "Money", q: "How much money can you risk, and how do you want to fund it?", hint: "No wrong answer. Zero is fine.",
    why: "It decides which tests are cheap enough to run.",
    chips: ["Self-funded, no raise", "Small grant or competition", "Raise from investors later"],
    text: { label: "How much you can risk (optional)", placeholder: "Up to EGP 2,000", required: false },
  },
  {
    id: "wont_do", label: "What you won't do", q: "What would you never do, even for money?", hint: "Pick all that apply, or write your own.",
    why: "This becomes a rule the agents follow.",
    chips: ["Lie to customers", "Fake reviews", "Sell to people who cannot afford it", "Copy someone's work", "Anything that hurts health"], multi: true,
    text: { label: "Anything else? (optional)", placeholder: "No exaggerated claims", required: false },
  },
];

export const FIXED_KEYS = OPENING.map((s) => s.id) as string[];

const short = (text: string, n = 90) => {
  const t = text.split(/\s+/).filter(Boolean).join(" ");
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};
/** The founder's latest answer, or "" when it is missing or was skipped. */
const get = (answers: OnbAnswer[], key: string) => {
  const said = answers.findLast((a) => a.key === key)?.answer.trim() ?? "";
  return said === ASSUMPTION ? "" : said;
};

/* ---------- standard follow-ups, aimed at the gaps ---------- */

export type Area = "strengths" | "access" | "experience" | "interests" | "constraints" | "values";

/** Every profile area has at least one standard question. Mirrors api/onboarding.py. */
export const AREA_OF_TOPIC: Record<string, Area> = {
  problem: "access", customer: "strengths", past: "experience", hobby: "interests",
  distribution: "access", fit: "values", unpaid: "constraints", conflict: "values",
};
export const AREA_OF_KEY: Record<string, Area> = {
  role: "experience", education: "experience", work: "experience", help: "strengths", hobbies: "interests",
  city: "access", group: "access", connections: "access", access: "access", time: "constraints", money: "constraints", wont_do: "values",
};

const TEMPLATES: [string, (g: string, h: string, hob: string) => { text: string; why: string; placeholder: string }][] = [
  ["problem", (g) => ({ text: `You said "${g}". What do they complain about most? Use their words.`, why: "A problem in their own words is where good ideas start.", placeholder: "They say the notes are too long" })],
  ["customer", (_g, h) => ({ text: `You said people ask you for "${h}". Who asked last time, and what did they ask?`, why: "One real person tells us more than a guess about a crowd.", placeholder: "Mona asked last week for…" })],
  ["past", () => ({ text: "What have you built, sold, taught, or organized before? What happened?", why: "What you have already done is the best proof of what you can do.", placeholder: "I sold printed notes to 12 classmates" })],
  ["hobby", (_g, _h, hob) => ({ text: hob ? `You said "${hob}". What do people say when they see it?` : "What do you do for fun that other people notice? What do they say?", why: "What you love doing is often where you know more than other people.", placeholder: "Friends ask me to draw their posters" })],
  ["distribution", (g) => ({ text: `If a stranger needed your help, where would they first hear about you? Name the place. Today you reach "${g}".`, why: "A product with no way to be found does not sell.", placeholder: "A Facebook group for pharmacy students" })],
  ["fit", (g) => ({ text: `Why are you the right person to help "${g}"?`, why: "Founders who know their people stay with the work longer.", placeholder: "I was in the same spot last year" })],
  ["unpaid", () => ({ text: "How many months can you work on this without being paid?", why: "It sets how long we can test before money matters.", placeholder: "About 3 months" })],
  ["conflict", () => ({ text: "When a plan goes wrong, what do you usually do first?", why: "It shows how your co-founder should push back.", placeholder: "I stop and write down what happened" })],
];

/** The opening questions the founder skipped or never answered, in opening order. */
export const skippedKeys = (answers: OnbAnswer[]) => FIXED_KEYS.filter((k) => !get(answers, k));

/** The next unanswered standard question: the most-skipped area first, with the founder's own words put in. Null when none is left. */
export function fallbackQuestion(answers: OnbAnswer[]): FollowUp | null {
  const done = new Set(answers.map((a) => a.key));
  const gaps: Record<string, number> = {};
  for (const k of skippedKeys(answers)) gaps[AREA_OF_KEY[k]] = (gaps[AREA_OF_KEY[k]] ?? 0) + 1;
  const open = TEMPLATES.filter(([key]) => !done.has(key));
  open.sort((x, y) => (gaps[AREA_OF_TOPIC[y[0]]] ?? 0) - (gaps[AREA_OF_TOPIC[x[0]]] ?? 0)); // stable: ties keep the standard order
  const hit = open[0];
  if (!hit) return null;
  const g = short(get(answers, "group")) || "the people you can reach";
  const h = short(get(answers, "help")) || "the things people ask you for";
  return { key: hit[0], kind: "text", ...hit[1](g, h, short(get(answers, "hobbies"))) };
}

/* ---------- checking an answer, in plain words ---------- */

const BARE = ["yes", "y", "no", "n", "ok", "okay", "sure", "fine", "idk", "nothing", "ايوه", "تمام", "ماشي", "اه", "tamam", "aywa", "mashy"];
export type AnswerCheck = { state: "empty" } | { state: "bare"; message: string } | { state: "short"; message: string } | { state: "valid" };

export function checkAnswer(text: string, minWords: number): AnswerCheck {
  const clean = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (!clean) return { state: "empty" };
  if (BARE.includes(clean)) return { state: "bare", message: "Tell me in a few more words." };
  const left = minWords - clean.split(/\s+/).length;
  if (left > 0) return { state: "short", message: `${left} more word${left === 1 ? "" : "s"}.` };
  return { state: "valid" };
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

/* What shows the founder's edge, strongest first. Mirrors EDGES in api/onboarding.py. */
const EDGES: [string, string, string, number][] = [
  ["help", "Real demand", "People already ask you for this.", 5],
  ["customer", "A real first customer", "A named person already asked you.", 4],
  ["group", "People you can reach", "You can message them today.", 4],
  ["past", "Proof you can do it", "You have done it before.", 3],
  ["work", "Real work behind you", "You have done this kind of work.", 3],
  ["connections", "Doors you can open", "You know people who can introduce you.", 3],
  ["access", "Access others lack", "Your languages, cities or industries open doors.", 3],
  ["education", "Trained for it", "You have studied this.", 2],
  ["hobbies", "Know it from the inside", "You spend free time on this.", 2],
];

/** The top 3 edges. A number or a longer answer scores a little higher. Skipped answers never count. */
export function founderFit(answers: OnbAnswer[]): { edges: Edge[] } {
  const scored = EDGES.flatMap(([key, title, why, weight], order) => {
    const quote = get(answers, key);
    if (!quote) return [];
    const score = weight + (/\d/.test(quote) ? 1 : 0) + (quote.split(/\s+/).length >= 6 ? 1 : 0);
    return [{ score, order, edge: { title, why, key, quote } }];
  });
  scored.sort((x, y) => y.score - x.score || x.order - y.order);
  return { edges: scored.slice(0, 3).map((s) => s.edge) };
}

/** Opening questions always show (ASSUMPTION when skipped); follow-ups only when answered. */
const items = (answers: OnbAnswer[], spec: [string, string][]): Item[] =>
  spec.flatMap(([key, text]) => {
    const quote = get(answers, key);
    if (quote) return [{ key, text, quote }];
    return FIXED_KEYS.includes(key) ? [{ key, text, quote: ASSUMPTION }] : [];
  });

export function buildProfile(answers: OnbAnswer[]): Profile {
  const group = get(answers, "group");
  const strengths = items(answers, [["help", "People already ask you for help"], ["past", "You have done it before"], ["customer", "A real person already asks you"], ["problem", "You know their problem"]]).slice(0, 3);
  const wont = get(answers, "wont_do");
  return {
    about: [get(answers, "role"), get(answers, "city")].filter(Boolean).join(", ") || ASSUMPTION,
    strengths,
    access: [{ group: group || ASSUMPTION, count: countOf(group), quote: group }],
    network: items(answers, [["connections", "People who could introduce you"], ["access", "Languages, cities, family business, industries"]]),
    experience: items(answers, [["education", "Education"], ["work", "Work and side jobs"], ["past", "Something you built, sold or organized"]]),
    interests: items(answers, [["hobbies", "Hobbies and things you do for fun"], ["hobby", "What others notice about it"]]),
    constraints: { hours: get(answers, "time") || ASSUMPTION, money: get(answers, "money") || ASSUMPTION },
    values: wont ? [wont] : [ASSUMPTION],
    fit: founderFit(answers),
    cofounder: pickCofounder(get(answers, "help")),
  };
}

/** The confirmed profile as one brief, in the founder's own words. */
export function profileBrief(p: Profile): string {
  const lines = [
    `About me: ${p.about}`,
    ...p.strengths.map((s) => `${s.text}: ${s.quote}`),
    ...p.access.map((a) => `People I could message today: ${a.group}`),
    ...(p.network ?? []).map((i) => `${i.text}: ${i.quote}`),
    ...(p.experience ?? []).map((i) => `${i.text}: ${i.quote}`),
    ...(p.interests ?? []).map((i) => `${i.text}: ${i.quote}`),
    `Hours a week I can give: ${p.constraints.hours}`,
    `How I want to fund it: ${p.constraints.money}`,
    ...p.values.map((v) => `What I won't do, even for money: ${v}`),
    `Co-founder style: ${p.cofounder.type}. ${p.cofounder.why}`,
  ];
  return lines.filter((l) => !/:\s*$/.test(l) && !l.includes(ASSUMPTION)).join("\n").slice(0, MAX_BRIEF);
}
