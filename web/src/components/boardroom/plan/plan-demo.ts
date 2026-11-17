/* Demo plan for when the API is not connected. Clearly labelled demo in the view.
   Same shape as GET /runs/{id}/plan, with the demo run's numbers (12 of 100 sign-ups). */

import type { Plan, PlanSection, PlanSnapshot } from "@/lib/api";

const section = (id: string, title: string, body: string, extra: Partial<PlanSection> = {}): PlanSection => ({
  id, title, body_markdown: body, sources: [], assumptions: 0, status: body ? "written" : "not_yet", ...extra,
});

const PROFILE = section("profile", "Founder profile",
  "## Strengths\n\n- Teaches IELTS speaking: \"I have coached 300 students since 2021\"\n\n## Who you can reach\n\n- IELTS Alexandria WhatsApp group: 420 people, can reach today\n\n## Limits\n\n- 10 hours a week\n- EGP 2,000 to spend");

const OPPORTUNITY = section("opportunity", "Opportunity",
  "## Chosen: Speaking drills\n\n- Problem: students fail the speaking part because they lack practice.\n- Cost to test this week: EGP 0 and 5 hours.\n\n## Alternatives\n\n### Mock test feedback\n\n- Problem: students want feedback on mock tests.",
  { sources: [{ url: "https://www.reddit.com/r/IELTS/comments/abc/speaking_partner/", title: "r/IELTS speaking partner thread", trust: "low", claims: ["Students lack speaking practice"] }] });

const CANVAS = section("canvas", "Lean canvas",
  "| Box | Content | Source or ASSUMPTION |\n|---|---|---|\n| 1. Customer segments | IELTS students in the group | https://www.reddit.com/r/IELTS/comments/abc/speaking_partner/ |\n| 6. Revenue streams | EGP 150 a month | ASSUMPTION |\n| 8. Key metrics | Sign-ups in 14 days | ASSUMPTION |",
  { assumptions: 6, sources: OPPORTUNITY.sources });

const SIGNUP = section("signup", "Sign-up page", "# Practice speaking with a coach\n\nLeave your email to hear when it is ready. We email you once.");

const DECISIONS = section("decisions", "Decisions",
  "## Phase 1 gate\n\n- Recommendation: go: 3 sourced problems (need 3)\n- Choice: Speaking drills\n- Your reason: \"My group asks for speaking practice every week\"\n\n## Phase 2 gate\n\n- Recommendation: stop: 12 of 100 sign-ups in 14 days (12%)\n- Choice: Repeat the test\n- Your reason: \"I only asked friends. I want to reach strangers.\"");

const FULL = [PROFILE, OPPORTUNITY, CANVAS, SIGNUP, DECISIONS];

export const DEMO_PLAN: Plan = {
  overview: {
    stage: "phase2_gate", status_text: "Demo data: the Phase 2 gate says stop.", waiting_on: null,
    next_step: "Repeat the test with strangers, or pick a new problem.",
    issues: [
      { text: "Phase 2 gate recommends stop: 12 of 100 sign-ups in 14 days (12%)", section: "decisions", severity: "high" },
      { text: "6 of 9 lean canvas boxes are ASSUMPTION, with no source.", section: "canvas", severity: "high" },
      { text: "Every source behind the lean canvas is low-trust (forum or social). Treat these claims as unproven.", section: "canvas", severity: "medium" },
    ],
  },
  sections: FULL,
  critique: [
    { section: "profile", emotion: "neutral", line: "420 people you can reach today. Reach is not sales, ya basha." },
    { section: "opportunity", emotion: "skeptical", line: "3 of 3 problems have a source, but only a forum thread backs this one." },
    { section: "canvas", emotion: "skeptical", line: "6 of 9 boxes are ASSUMPTION. Only 3 have evidence." },
    { section: "signup", emotion: "im_out", line: "12 of 100 sign-ups in 14 days (12%). Not there, ya basha." },
    { section: "decisions", emotion: "im_out", line: "Phase 1 gate said go; Phase 2 gate said stop. 12 of 100 sign-ups. That is a stop. Say it plainly." },
  ],
  versions: [
    { n: 1, at: "2026-11-17T10:00:00Z", event: "draft", summary: "Opportunities written", sections_hash: "demo1" },
    { n: 2, at: "2026-11-17T10:05:00Z", event: "decision", summary: "Phase 1 gate: you picked Speaking drills", sections_hash: "demo2" },
    { n: 3, at: "2026-11-17T10:12:00Z", event: "draft", summary: "Lean canvas written", sections_hash: "demo3" },
    { n: 4, at: "2026-11-17T10:30:00Z", event: "pivot", summary: "Phase 2 gate: you picked Repeat the test", sections_hash: "demo4" },
  ],
};

/** Demo snapshots: each version shows only what existed at that point. */
export function demoSnapshot(n: number): PlanSnapshot | null {
  const meta = DEMO_PLAN.versions.find((v) => v.n === n);
  if (!meta) return null;
  const keep = [["profile", "opportunity"], ["profile", "opportunity", "decisions"], ["profile", "opportunity", "canvas", "decisions"], FULL.map((s) => s.id)][n - 1];
  return { ...meta, sections: FULL.map((s) => (keep.includes(s.id) ? s : section(s.id, s.title, ""))) };
}

export function demoMarkdown(plan: Plan): string {
  return ["# Business plan (demo data)", "", ...plan.sections.flatMap((s) => [`## ${s.title}`, "", s.body_markdown || "Not written yet.", ""]),
    "## Ahmed Tarek notes (Parody)", "", ...plan.critique.map((c) => `- ${c.section}: ${c.line}`), ""].join("\n");
}
