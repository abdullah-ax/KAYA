/* Pure helpers for live mode: no React, no network. */

import type { ApiSource, Pending } from "@/lib/api";
import type { Stage } from "./journey";

export type OnboardingAnswers = Record<string, string | string[]>;
const MAX_BRIEF = 8000;

const LABELS: [string, string][] = [
  ["brief", "About me"],
  ["skills", "What people already ask me to help with"],
  ["network", "People I could message today"],
  ["time", "Hours a week I can give"],
  ["money", "How I want to fund it"],
  ["values", "What I won't do, even for money"],
];

/** The founder's onboarding answers as one brief, in their own words. */
export function composeBrief(answers: OnboardingAnswers): string {
  const lines = LABELS.flatMap(([id, label]) => {
    const v = answers[id];
    const text = Array.isArray(v) ? v.join(", ") : (v ?? "").trim();
    return text ? [`${label}: ${text}`] : [];
  });
  return lines.join("\n").slice(0, MAX_BRIEF);
}

const STEP_LABEL: Record<string, string> = {
  start: "Starting",
  brief: "Brief",
  phase1_step1: "Intake",
  phase1_step2: "Opportunities",
  phase1_gate: "Opportunity gate",
  phase2_step1: "Canvas",
  phase2_step2: "Publish",
  phase2_gate: "Sign-up gate",
};

const STAGE_BY_PHASE = ["ideation", "validation", "build", "setup", "distribution", "operate"];

/** Which map stage the founder is on, and a plain name for the step. */
export function stageInfo(step: string): { stageId: string; label: string } {
  const phase = Number(/^phase(\d+)/.exec(step)?.[1]);
  const stageId = STAGE_BY_PHASE[phase - 1] ?? "ideation";
  return { stageId, label: STEP_LABEL[step] ?? (phase ? "Working on this stage" : "Starting") };
}

const FILE_NAMES: [RegExp, string][] = [
  [/answers/i, "Your answers"],
  [/sources/i, "Sources list"],
  [/opportunit/i, "Opportunities report"],
  [/canvas/i, "Lean Canvas"],
  [/signup|sign_up/i, "Sign-up page"],
  [/decision/i, "Decision"],
];

/** A founder never sees a file name. Known outputs get a plain name; the rest are "Report". */
export function friendlyFileName(file: string): string {
  return FILE_NAMES.find(([re]) => re.test(file))?.[1] ?? "Report";
}

/** One human sentence for the run's state and outcome. */
export function outcomeSentence(status: string, outcome: string | null): string {
  if (status === "working") return "Working on it";
  if (status === "waiting" || status === "gate") return "Waiting for you";
  if (status === "done") return outcome ? `Finished: ${outcome}` : "Finished";
  if (status === "error") return "Stopped with an error";
  return "Closed";
}

/** The map's stages with status taken from the run. Demo facts and issues are dropped. */
export function progressStages(stages: Stage[], currentId: string): Stage[] {
  const at = Math.max(0, stages.findIndex((s) => s.id === currentId));
  return stages.map((s, i) => ({
    ...s,
    facts: [],
    issues: [],
    status: i < at ? "done" : i === at ? "current" : i === at + 1 ? "next" : "locked",
  }));
}

export function sourceCardsFrom(sources: ApiSource[]) {
  return sources.map((s, i) => ({
    n: i + 1,
    title: s.title,
    url: s.url,
    trust: s.trust,
    backs: (s.claims_backed ?? []).join("; "),
  }));
}

export type Outcome = "go" | "repeat" | "pivot" | "stop";
export type GateArgs = {
  question: string;
  recommended: string[];
  recommendation?: { outcome: Outcome; text: string };
  options: { id: string; label: string; body: string; cost: string; risk: string }[];
};

function siteName(source: string): string | null {
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** "go: 3 sourced problems. Which option?" -> a recommendation plus the question. */
function splitPrompt(prompt: string): { question: string; recommendation?: { outcome: Outcome; text: string } } {
  const m = /^(go|repeat|pivot|stop):\s*([^]*?[.!])\s+(\S[^]*)$/.exec(prompt.trim());
  return m ? { question: m[3], recommendation: { outcome: m[1] as Outcome, text: m[2] } } : { question: prompt };
}

export function gateArgsFromPending(p: Extract<Pending, { kind: "gate" }>): GateArgs {
  const { question, recommendation } = splitPrompt(p.prompt);
  return {
    question,
    recommendation,
    recommended: recommendation?.outcome === "stop" ? p.options.filter((o) => o.id === "stop").map((o) => o.id) : [],
    options: p.options.map((o, i) => {
      const site = o.source && o.source !== "none" ? siteName(o.source) : null;
      const body = site ? `Source: ${site}` : o.source && o.source !== "none" ? `Source: ${o.source}` : "No source. Treat as an assumption.";
      return { id: o.id || `${i}:${o.name}`, label: o.name, body, cost: o.cost, risk: o.risk };
    }),
  };
}
