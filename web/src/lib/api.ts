/* Typed client for the KAYA API, reached through the /api proxy. Types mirror
   api/app.py. The model key is passed in per call and only ever travels in the
   X-Model-Key header. It is never stored here. */

import { useCallback, useEffect, useRef, useState } from "react";

export type RunStatus = "working" | "waiting" | "gate" | "done" | "error" | "closed";
export type ApiProvider = "ollama" | "openai";

export type GateOptionDto = { id: string; name: string; cost: string; risk: string; source: string };
export type Pending =
  | { kind: "question"; key: string; prompt: string }
  | { kind: "gate"; key: string; prompt: string; options: GateOptionDto[] }
  /** A stage passed. The run waits until the founder moves on with POST /next. */
  | { kind: "level_up"; key: "level_up"; prompt: string; done: number; stage: string; next: string; proof: string };

/** One entry of outputs/*_sources.json, as the API returns it. */
export type ApiSource = {
  id: string;
  url: string;
  title: string;
  trust: "high" | "medium" | "low";
  trust_reason?: string;
  claims_backed?: string[];
  [k: string]: unknown;
};

export type Notice = { refused: boolean; rule?: string; reason?: string; alternative?: string } | null;

export type Run = {
  id: string;
  status: RunStatus;
  stage: string;
  outcome: string | null;
  mode: string;
  provider: string;
  phase1: string | null;
  phase2: string | null;
  pending: Pending | null;
  notice: Notice;
  messages: string[];
  outputs: string[];
  sources: ApiSource[];
  error: string | null;
  /** Putting the approved sign-up page online. approved comes from the decision log. */
  delivery?: { approved: boolean; url: string | null; site_id: string | null };
};

export type ProgramStep = { step: string; title: string; line: string; links: { title: string; url: string }[] };
/** One accelerator stage card from GET /runs/{id}/program. Mirrors api/program.py. */
export type ProgramCardData = {
  stage: string;
  label: string;
  goal: string;
  lead: { id: string; name: string };
  handoff: string | null;
  joins: { id: string; name: string; when: string }[];
  big_question: string;
  questions: string[];
  do_today: string;
  ship: string;
  metric: { name: string; target: string };
  review: string;
  learn: { kind: string; org: string; title: string; url: string; why: string };
  case: { company: string; market: string; fact: string; url: string; source: string; why: string };
  steps?: ProgramStep[];
};

export type ModelTestResult = { ok: boolean; provider: ApiProvider; model?: string; error?: string };
export type LogEntry = Record<string, unknown>;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const FALLBACK = "Something went wrong talking to the API. Try again.";

async function call<T>(path: string, init: { method?: "GET" | "POST" | "DELETE"; body?: unknown; key?: string; netlifyToken?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.key) headers["x-model-key"] = init.key;
  if (init.netlifyToken) headers["x-netlify-token"] = init.netlifyToken;
  const res = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | undefined)?.detail;
    throw new ApiError(res.status, typeof detail === "string" && detail ? detail : FALLBACK);
  }
  return data as T;
}

export async function health(): Promise<boolean> {
  try {
    await call<{ status: string }>("/health");
    return true;
  } catch {
    return false;
  }
}

export const createRun = (body: { brief: string; mode?: "demo" | "full"; provider?: ApiProvider; model?: string }, key?: string) =>
  call<Run>("/runs", {
    method: "POST",
    body: { brief: body.brief, mode: body.mode ?? "demo", provider: body.provider ?? "ollama", ...(body.model ? { model: body.model } : {}) },
    key,
  });
export const getRun = (id: string) => call<Run>(`/runs/${encodeURIComponent(id)}`);
export const sendAnswer = (id: string, text: string) => call<Run>(`/runs/${encodeURIComponent(id)}/answer`, { method: "POST", body: { text } });
export const sendGate = (id: string, option: string, reason: string) => call<Run>(`/runs/${encodeURIComponent(id)}/gate`, { method: "POST", body: { option, reason } });
export const nextStage = (id: string) => call<Run>(`/runs/${encodeURIComponent(id)}/next`, { method: "POST" });
export const getLog = (id: string) => call<LogEntry[]>(`/runs/${encodeURIComponent(id)}/log`);
export const testModel = (provider: ApiProvider, key?: string, model?: string) =>
  call<ModelTestResult>("/model/test", { method: "POST", body: { provider, ...(model ? { model } : {}) }, key });
export type Delivered = { url: string | null; site_id: string | null };
/** The Netlify token travels only in the X-Netlify-Token header. It is never stored here. */
export const publishToNetlify = (id: string, token: string) =>
  call<Delivered>(`/runs/${encodeURIComponent(id)}/publish/netlify`, { method: "POST", netlifyToken: token });
export const takeDownNetlify = (id: string, token: string) =>
  call<Delivered>(`/runs/${encodeURIComponent(id)}/publish/netlify`, { method: "DELETE", netlifyToken: token });
export type ModelChoices = { default: string; choices: { name: string; installed: boolean | null }[] };
export const listModels = () => call<ModelChoices>("/models");

/* The living business plan. Built by the API only from files on disk. */
export type PlanSource = { id?: string | null; url: string; title: string; trust: "high" | "medium" | "low"; claims: string[] };
export type PlanSection = {
  id: string; title: string; body_markdown: string; sources: PlanSource[]; assumptions: number; status: "written" | "not_yet";
};
export type PlanIssue = { text: string; section: string; severity: "high" | "medium" | "low" };
export type PlanCritique = { section: string; emotion: "neutral" | "listening" | "thinking" | "talking" | "pleased" | "skeptical" | "im_out"; line: string };
export type PlanVersionMeta = { n: number; at: string; event: "draft" | "decision" | "pivot" | "stop" | "redraft"; summary: string; sections_hash: string };
export type PlanSnapshot = PlanVersionMeta & { sections: PlanSection[] };
export type Plan = {
  overview: { stage: string; status_text: string; waiting_on: string | null; next_step: string; issues: PlanIssue[] };
  sections: PlanSection[];
  critique: PlanCritique[];
  versions: PlanVersionMeta[];
};
export const getPlan = (id: string) => call<Plan>(`/runs/${encodeURIComponent(id)}/plan`);
export const getPlanVersion = (id: string, n: number) => call<PlanSnapshot>(`/runs/${encodeURIComponent(id)}/plan/versions/${n}`);
export const planMarkdownUrl = (id: string) => `/api/runs/${encodeURIComponent(id)}/plan.md`;

/* Onboarding: one personal follow-up question at a time, then a profile. */
export type OnbAnswer = { key: string; question: string; answer: string };
export type FollowUp = { key: string; text: string; why: string; kind: "text" | "choice"; options?: string[]; placeholder?: string };
export type Profile = {
  about: string;
  strengths: { text: string; quote: string }[];
  access: { group: string; count: number | null; quote: string }[];
  constraints: { hours: string; money: string };
  values: string[];
  cofounder: { type: string; why: string };
};
export type NextReply = { done: false; question: FollowUp } | { done: true; profile: Profile };
export const nextQuestion = (body: { answers: OnbAnswer[]; mode?: "demo" | "full"; provider?: ApiProvider; model?: string }, key?: string) =>
  call<NextReply>("/onboarding/next", {
    method: "POST",
    body: { answers: body.answers, mode: body.mode ?? "demo", provider: body.provider ?? "ollama", ...(body.model ? { model: body.model } : {}) },
    key,
  });

export async function getProgram(runId: string): Promise<ProgramCardData> {
  const body = await call<{ card?: ProgramCardData }>(`/runs/${encodeURIComponent(runId)}/program`);
  if (!body?.card || !Array.isArray(body.card.questions)) throw new ApiError(500, FALLBACK);
  return body.card;
}

export const POLL_MS = 1000;
const isLive = (s: RunStatus) => s === "working" || s === "waiting" || s === "gate";

/** Follow a run: read it now, then every second until it is done, failed or closed. */
export function useRun(runId: string | null) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef<Run | null>(null);
  runRef.current = run;

  const update = useCallback((next: Run) => { setRun(next); setError(null); }, []);

  useEffect(() => {
    setRun(null);
    setError(null);
    if (!runId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let again = true;
      try {
        const next = await getRun(runId);
        if (stopped) return;
        setRun(next);
        setError(null);
        again = isLive(next.status);
      } catch (e) {
        if (stopped) return;
        setError(e instanceof Error ? e.message : FALLBACK);
        again = !(e instanceof ApiError && e.status === 404);
      }
      if (again && !stopped) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [runId]);

  return { run, error, update };
}
