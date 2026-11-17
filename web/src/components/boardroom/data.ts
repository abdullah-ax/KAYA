import type { ThreadMessageLike } from "@assistant-ui/react";

export type Member = {
  id: string;
  name: string;
  role: string;
  group: "Co-founder" | "Crew" | "Judges" | "Sharks";
  status?: string;
};

export const TEAM: Member[] = [
  { id: "warm_skeptic", name: "Noor", role: "Co-founder, warm skeptic", group: "Co-founder", status: "Leading" },
  { id: "profiler", name: "Profiler", role: "Learns who you are", group: "Crew" },
  { id: "intern", name: "Research intern", role: "Drafts with sources", group: "Crew", status: "Drafting" },
  { id: "boss", name: "Boss", role: "Checks every draft", group: "Crew" },
  { id: "judge_wee", name: "Evidence judge", role: "Sources and claims", group: "Judges" },
  { id: "judge_barn", name: "Ethics judge", role: "Deception, privacy", group: "Judges" },
  { id: "judge_long", name: "Clarity judge", role: "Grade 8, no slop", group: "Judges" },
  { id: "shark_numbers", name: "Numbers shark", role: "SIMULATION", group: "Sharks" },
  { id: "shark_people", name: "People shark", role: "SIMULATION", group: "Sharks" },
];

export type ScreenId = "intake" | "cofounder" | "gate" | "sharks" | "daily";

export type Note = { when: string; text: string; kind: "answer" | "decision" | "voice" };
export type Source = { n: number; title: string; url: string; trust: "high" | "medium" | "low"; backs: string };

export type Screen = {
  id: ScreenId;
  label: string;
  phase: string;
  title: string;
  speaker: string; // team member id leading the chat
  messages: ThreadMessageLike[];
  panel: "profile" | "sources" | "numbers" | "sharks" | "daily";
};

const SOURCES: Source[] = [
  { n: 1, title: "r/pharmacy: 'how do you memorize dosages?'", url: "https://www.reddit.com/r/pharmacy/", trust: "low", backs: "Students say dosage tables are the hardest part to memorize." },
  { n: 2, title: "CAPMAS: higher education enrolment, 2024", url: "https://www.capmas.gov.eg/", trust: "high", backs: "Egypt has more than 30 pharmacy faculties." },
  { n: 3, title: "Founder interview #2 (your notes)", url: "notes://interview-2", trust: "medium", backs: "3 of 5 students already buy printed summaries before exams." },
];

export const NOTES: Note[] = [
  { when: "Mon", kind: "answer", text: "“I tutor 40 pharmacy students a term and they always ask for my summary sheets.”" },
  { when: "Mon", kind: "voice", text: "“I can spend 10 hours a week. I don't want to raise money.”" },
  { when: "Tue", kind: "decision", text: "Picked: dosage cheat sheets for 3rd-year students. “They already pay for printed notes.”" },
];

export { SOURCES };

const t = (text: string) => ({ type: "text" as const, text });

export const SCREENS: Screen[] = [
  {
    id: "intake",
    label: "Intake",
    phase: "Phase 1: Discover",
    title: "Getting to know you",
    speaker: "profiler",
    panel: "profile",
    messages: [
      { role: "assistant", content: [t("Before ideas, I want to know you. Your brief says you are a pharmacy student in Cairo. **Question 2 of 5:** who already asks you for help, and with what?")] },
      { role: "user", content: [t("I tutor about 40 pharmacy students a term. They always ask for my summary sheets before exams.")] },
      { role: "assistant", content: [t("That is a real group that already trusts you. **Question 3 of 5:** how many hours a week can you give this, and do you want to raise money?")] },
      { role: "user", content: [t("About 10 hours a week. I don't want to raise money.")] },
      {
        role: "assistant",
        content: [
          t("Noted. Here is what I have so far. Fix anything that is wrong."),
          { type: "tool-call", toolCallId: "p1", toolName: "founder_profile", args: {}, result: {
            skills: ["Pharmacology tutoring", "Clear summaries"],
            network: "≈40 students a term, 2 teaching assistants",
            time: "10 h / week",
            money: "Self-funded, no raise",
            values: "No exaggerated health claims",
          } },
        ],
      },
    ],
  },
  {
    id: "cofounder",
    label: "Co-founder",
    phase: "Phase 1: Discover",
    title: "Find opportunities",
    speaker: "warm_skeptic",
    panel: "sources",
    messages: [
      { role: "user", content: [t("Can I sell my summary sheets online?")] },
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "r1", toolName: "research_trail", args: {}, result: { engine: "SearXNG", queries: [
            { q: "pharmacy students memorize dosage tables", results: 12, kept: 1 },
            { q: "Egypt pharmacy faculties number CAPMAS", results: 9, kept: 1 },
            { q: "edtech startup Egypt exam study case study", results: 14, kept: 1 },
            { q: "startup first users manual onboarding case study", results: 18, kept: 1 },
          ], dropped: "6 results had no date or author. 1 claimed a number with no source." } },
          { type: "reasoning", text: "Intern drafted 3 opportunities. Boss rejected one for an unsourced market claim. Ethics judge: pass, no health advice, study aid only." },
          t("Maybe. The intern found 3 problems with sources. One is weak, and I'll say so.\n\n1. **Dosage tables are the hardest thing to memorize** [1]. Source is a forum, so trust is low. It can't back a gate alone.\n2. **There are more than 30 pharmacy faculties in Egypt** [2]. Strong source.\n3. **3 of your 5 interviews already buy printed summaries** [3].\n\nASSUMPTION: students will pay online, not only for print. We haven't tested this."),
          { type: "tool-call", toolCallId: "s1", toolName: "sources", args: {}, result: { sources: SOURCES } },
        ],
      },
      { role: "user", content: [t("Which one would you test first?")] },
      { role: "assistant", content: [t("I won't pick for you. But you said on Monday your students ask for sheets every term. Which of the three matches what you saw yourself?")] },
    ],
  },
  {
    id: "gate",
    label: "Gate",
    phase: "Phase 2: Validate",
    title: "Gate: sign-up target",
    speaker: "warm_skeptic",
    panel: "numbers",
    messages: [
      { role: "assistant", content: [t("The 14-day test is over. You set the target before it started: **100 sign-ups**. You got **12**. That is under 30% of target, so I recommend **stop or pivot**. You decide.")] },
      { role: "assistant", content: [
        { type: "tool-call", toolCallId: "g1", toolName: "gate_decision", args: {
          question: "12 of 100 sign-ups. What now?",
          recommended: ["stop", "pivot"],
          options: [
            { id: "stop", label: "Stop", body: "End this idea. Keep what you learned.", cost: "None", risk: "Dropping an idea that needed more time" },
            { id: "pivot", label: "Pivot", body: "Same students, new offer: a one-page dosage cheat sheet.", cost: "1 week", risk: "Same low interest" },
            { id: "repeat", label: "Repeat", body: "Run 14 more days with 10 named students.", cost: "2 weeks", risk: "Waiting on weak demand" },
          ],
        } },
      ] },
    ],
  },
  {
    id: "sharks",
    label: "Sharks",
    phase: "Phase 2: Validate",
    title: "Shark panel (SIMULATION)",
    speaker: "shark_numbers",
    panel: "sharks",
    messages: [
      { role: "user", content: [t("Pitch: a one-page dosage cheat sheet for 3rd-year pharmacy students. 120 EGP. 12 sign-ups so far.")] },
      { role: "assistant", content: [
        t("This is a **simulation** to stress-test the pitch. These are not real investors."),
        { type: "tool-call", toolCallId: "k1", toolName: "shark_verdicts", args: {}, result: { verdicts: [
          { id: "shark_numbers", name: "Numbers shark", verdict: "out", reason: "12 sign-ups from 40 people you already know is 30%. From strangers it could be zero.", change: "20 sign-ups from students you've never met." },
          { id: "shark_people", name: "People shark", verdict: "in", reason: "You tutor them every week. That trust is hard to copy.", change: "" },
          { id: "shark_brand", name: "Brand shark", verdict: "out", reason: "“Cheat sheet” sounds like cheating to a dean.", change: "A name a professor would recommend." },
        ] } },
      ] },
    ],
  },
  {
    id: "daily",
    label: "Daily",
    phase: "Every day",
    title: "Daily check-in",
    speaker: "warm_skeptic",
    panel: "daily",
    messages: [
      { role: "assistant", content: [t("Morning. Three quick ones.\n\n1. What did you do yesterday?\n2. What did you learn?\n3. What's the one thing today?")] },
      { role: "user", content: [t("Talked to 4 students outside class. 2 said they'd pay if it covered the cardio block. Today I'll make the cardio page.")] },
      { role: "assistant", content: [t("Good. That's the first time you heard a price from strangers. You said “cardio” twice this week. Should the first sheet be cardio only?")] },
    ],
  },
];

/* ---------- Learning and case studies (all links checked by hand) ---------- */

export type Learn = { kind: "Video" | "Essay" | "Book" | "Course" | "Map"; org: string; title: string; url: string; why: string };
export type CaseStudy = { company: string; market: string; lesson: string; fact: string; url: string; source: string };

export const LEARN: Record<string, Learn[]> = {
  intake: [
    { kind: "Video", org: "YC Startup Library", title: "How to get startup ideas", url: "https://www.ycombinator.com/library/8g-how-to-get-startup-ideas", why: "Start from what you know. You already tutor 40 students." },
    { kind: "Map", org: "map.sistilli.dev", title: "The startup map", url: "https://map.sistilli.dev/", why: "See where you are on the founder path." },
  ],
  cofounder: [
    { kind: "Essay", org: "Paul Graham", title: "How to Get Startup Ideas", url: "https://paulgraham.com/startupideas.html", why: "Why problems you live with beat ideas you invent." },
    { kind: "Book", org: "Rob Fitzpatrick", title: "The Mom Test", url: "https://www.momtestbook.com/", why: "Ask about the past. Polite answers about the future lie." },
  ],
  gate: [
    { kind: "Essay", org: "Paul Graham", title: "Do Things That Don't Scale", url: "https://paulgraham.com/ds.html", why: "12 sign-ups can still teach you. Recruit the next 10 by hand." },
    { kind: "Essay", org: "Paul Graham", title: "The 18 Mistakes That Kill Startups", url: "https://paulgraham.com/startupmistakes.html", why: "Mistake #9: not wanting to hear what users say." },
  ],
  sharks: [
    { kind: "Video", org: "YC Startup Library", title: "YC's essential startup advice", url: "https://www.ycombinator.com/library/4D-yc-s-essential-startup-advice", why: "What investors listen for in a 2-minute pitch." },
    { kind: "Essay", org: "a16z speedrun", title: "What we look for in applications", url: "https://speedrun.substack.com/p/what-we-look-for-in-applications", why: "Proof from strangers beats proof from friends." },
  ],
  daily: [
    { kind: "Course", org: "Startup School", title: "Startup School for aspiring founders", url: "https://www.startupschool.org/future-founders", why: "Free. One short lesson a day fits your 10 hours." },
  ],
};

export const CASES: Record<string, CaseStudy[]> = {
  cofounder: [{
    company: "Nafham",
    market: "Egypt, edtech",
    lesson: "Students in Egypt will use study help built around their exact curriculum.",
    fact: "Free curriculum video lessons from Cairo. Came out of Flat6Labs; bought by Tyro in 2021.",
    url: "https://cairoscene.com/Business/Tyro-Acquires-Fellow-Egyptian-Edtech-Startup-Nafham",
    source: "CairoScene",
  }, {
    company: "Stripe",
    market: "Global unicorn",
    lesson: "Early users came one by one, set up in person.",
    fact: "The founders installed Stripe on a user's laptop on the spot instead of sending a link. Paul Graham calls it the “Collison installation”.",
    url: "https://paulgraham.com/ds.html",
    source: "Paul Graham",
  }],
  gate: [{
    company: "Breadfast",
    market: "Egypt, YC company",
    lesson: "Start with one tiny product and do the unscalable part yourself.",
    fact: "Started in 2017 with bread only, a co-founder as the first driver. Now 3,500+ items in under 60 minutes.",
    url: "https://www.ycombinator.com/companies/breadfast",
    source: "Y Combinator",
  }, {
    company: "Airbnb",
    market: "Global unicorn",
    lesson: "Weak numbers? Go to the users and fix the offer by hand.",
    fact: "With growth flat, the founders went door to door in New York, signed up hosts and took better photos of their listings themselves.",
    url: "https://paulgraham.com/ds.html",
    source: "Paul Graham",
  }],
};
