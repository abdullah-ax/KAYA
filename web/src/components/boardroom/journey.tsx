"use client";

/* The founder's map: every stage, where we are, what's known, what's wrong,
   and which agents work on (or can see) each stage. A compact strip is always
   visible; it expands into the full map. */

import { AlertTriangle, Check, ChevronDown, Lock, MapIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { MascotAvatar } from "./ui";

export type StageStatus = "done" | "current" | "next" | "locked";

export type Stage = {
  id: string;
  n: number;
  name: string;
  goal: string;
  status: StageStatus;
  facts: string[];
  issues: string[];
  agents: { id: string; name: string; access: "works" | "reads" }[];
  gate: string;
};

export const STAGES: Stage[] = [
  {
    id: "ideation", n: 1, name: "Ideation", goal: "Who you are and which problem fits you", status: "done",
    facts: ["Pharmacy tutor, 40 students a term", "Picked: dosage cheat sheets", "3 sourced problems, 1 low trust"],
    issues: [],
    agents: [
      { id: "profiler", name: "Profiler", access: "works" },
      { id: "intern", name: "Research intern", access: "works" },
      { id: "boss", name: "Boss", access: "works" },
      { id: "warm_skeptic", name: "Noor", access: "works" },
    ],
    gate: "3+ sourced problems and founder fit 3/5",
  },
  {
    id: "validation", n: 2, name: "Validation", goal: "Proof from strangers before you build", status: "current",
    facts: ["Target set before test: 100 in 14 days", "Actual: 12 sign-ups (demo data)", "Lean Canvas drafted"],
    issues: ["Under 30% of target: stop or pivot", "All sign-ups came from people you know"],
    agents: [
      { id: "warm_skeptic", name: "Noor", access: "works" },
      { id: "intern", name: "Research intern", access: "works" },
      { id: "judge_wee", name: "Evidence judge", access: "works" },
      { id: "shark_numbers", name: "Sharks", access: "reads" },
    ],
    gate: "Sign-ups ≥ 30% of the target you set",
  },
  {
    id: "build", n: 3, name: "Build", goal: "The smallest product that tests the promise", status: "next",
    facts: ["User stories and MVP spec"], issues: [],
    agents: [{ id: "operator", name: "Operator", access: "works" }, { id: "boss", name: "Boss", access: "works" }],
    gate: "MVP done in ≤ 2 weeks of your time",
  },
  {
    id: "setup", n: 4, name: "Pricing & setup", goal: "Price, policies, store page", status: "locked",
    facts: ["Pricing tests and draft policies"], issues: [],
    agents: [{ id: "numbers_hawk", name: "Numbers hawk", access: "works" }, { id: "judge_barn", name: "Ethics judge", access: "works" }],
    gate: "Founder approves price and every policy",
  },
  {
    id: "distribution", n: 5, name: "Distribution", goal: "Reach buyers, sell, deliver, get paid", status: "locked",
    facts: ["Channels, launch posts, mock checkout"], issues: [],
    agents: [{ id: "hustler", name: "Hustler", access: "works" }, { id: "brand_builder", name: "Brand builder", access: "works" }],
    gate: "First 10 paid orders (MOCKED payments)",
  },
  {
    id: "operate", n: 6, name: "Operate & learn", goal: "Support, metrics, keep or pivot", status: "locked",
    facts: ["Weekly metrics and pivot memo"], issues: [],
    agents: [{ id: "warm_skeptic", name: "Noor", access: "works" }, { id: "judge_long", name: "Clarity judge", access: "reads" }],
    gate: "Monthly keep / pivot / stop review",
  },
];

const statusIcon = (s: StageStatus) =>
  s === "done" ? <Check className="size-3.5" /> : s === "locked" ? <Lock className="size-3" /> : null;

function StagePill({ stage, onClick }: { stage: Stage; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={stage.status === "current" ? "step" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-[14px] font-semibold outline-none transition-colors",
        "hover:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/40",
        stage.status === "done" && "border-primary/30 bg-accent text-accent-foreground",
        stage.status === "current" && "border-foreground bg-foreground text-background hover:border-foreground",
        stage.status === "next" && "bg-card",
        stage.status === "locked" && "bg-transparent text-muted-foreground",
      )}
    >
      <span className={cn("flex size-5 items-center justify-center rounded-full text-[12px]", stage.status === "current" ? "bg-background text-foreground" : "bg-muted")}>
        {statusIcon(stage.status) ?? stage.n}
      </span>
      {stage.name}
      {stage.issues.length > 0 && (
        <span className="flex items-center gap-0.5 rounded-full bg-destructive px-1.5 text-[12px] text-white">
          <AlertTriangle className="size-3" />{stage.issues.length}
        </span>
      )}
    </button>
  );
}

function StageNode({ stage, focused }: { stage: Stage; focused: boolean }) {
  return (
    <div
      className={cn(
        "flex w-64 shrink-0 flex-col gap-3 rounded-xl border-2 bg-card p-4",
        stage.status === "current" && "border-foreground",
        stage.status === "locked" && "border-dashed opacity-70",
        focused && "ring-[3px] ring-ring/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold tracking-wide text-muted-foreground uppercase">Stage {stage.n}</span>
        <span className={cn(
          "rounded-full px-2 text-[12px] font-bold uppercase",
          stage.status === "done" && "bg-accent text-accent-foreground",
          stage.status === "current" && "bg-foreground text-background",
          stage.status === "next" && "bg-muted",
          stage.status === "locked" && "bg-muted text-muted-foreground",
        )}>{stage.status === "current" ? "You are here" : stage.status}</span>
      </div>
      <div>
        <div className="text-xl font-bold">{stage.name}</div>
        <p className="text-[15px] leading-snug text-muted-foreground">{stage.goal}</p>
      </div>
      <ul className="flex flex-col gap-1 text-[15px] leading-snug">
        {stage.facts.map((f) => <li key={f}>{f}</li>)}
      </ul>
      {stage.issues.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg bg-stop-bg p-2.5 text-[14px] font-semibold leading-snug text-destructive">
          {stage.issues.map((i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{i}</li>)}
        </ul>
      )}
      <div className="text-[14px]"><b>Gate:</b> <span className="text-muted-foreground">{stage.gate}</span></div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {stage.agents.map((a) => (
          <span key={a.id + a.name} title={`${a.name}: ${a.access === "works" ? "works on this stage" : "read only"}`} className={cn("flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-[13px] font-semibold", a.access === "reads" && "border-dashed text-muted-foreground")}>
            <MascotAvatar id={a.id} size={22} className="ring-1 ring-offset-0" />
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function JourneyMap({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(current);
  return (
    <div className="shrink-0 border-b bg-card/60">
      <div className="flex items-center gap-3 overflow-x-auto px-5 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[14px] font-bold outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <MapIcon className="size-4" /> Map <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
        {STAGES.map((s, i) => (
          <div key={s.id} className="flex shrink-0 items-center gap-3">
            {i > 0 && <span className={cn("h-0.5 w-5 rounded", s.status === "locked" ? "bg-border" : "bg-foreground/50")} />}
            <StagePill stage={s} onClick={() => { setFocus(s.id); setOpen(true); }} />
          </div>
        ))}
      </div>
      {open && (
        <div className="flex gap-0 overflow-x-auto px-5 pt-2 pb-5">
          {STAGES.map((s, i) => (
            <div key={s.id} className="flex shrink-0 items-start">
              {i > 0 && <span className={cn("mt-16 h-0.5 w-6", s.status === "locked" ? "border-t-2 border-dashed border-border" : "bg-foreground/50")} />}
              <StageNode stage={s} focused={focus === s.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
