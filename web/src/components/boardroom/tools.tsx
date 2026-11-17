"use client";

/* Tool-call renderers for assistant-ui. The agent emits a tool call; we
   render it as a Boardroom component inside the chat. */

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { CheckCircle2, Search } from "lucide-react";
import { createContext, useContext, useState } from "react";

import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import type { Source } from "./data";
import { ParodyVerdict } from "./parody";
import { checkReason, OptionCard, ReasonField, SourceCard, StatusBadge, VerdictCard } from "./ui";

const MIN_WORDS = 15;

type GateOption = { id: string; label: string; body: string; cost: string; risk: string };
type Recommendation = { outcome: "go" | "repeat" | "pivot" | "stop"; text: string };
type GateArgs = { question: string; recommended: string[]; options: GateOption[]; recommendation?: Recommendation };

const OUTCOME_WORD: Record<Recommendation["outcome"], string> = { go: "Go", repeat: "Repeat", pivot: "Pivot", stop: "Stop" };

/** The gate's own verdict, set from targets fixed before the test. The founder still decides. */
function RecommendationNote({ rec }: { rec: Recommendation }) {
  const stop = rec.outcome === "stop";
  return (
    <div
      role="note"
      aria-label="System recommends"
      data-outcome={rec.outcome}
      className={cn("rounded-xl border-2 p-4", stop ? "border-destructive/50 bg-stop-bg" : "border-primary/30 bg-accent/50")}
    >
      <div className={cn("text-[14px] font-bold", stop ? "text-destructive" : "text-accent-foreground")}>System recommends</div>
      <div className={cn("text-2xl font-extrabold", stop ? "text-destructive" : "text-foreground")}>{OUTCOME_WORD[rec.outcome]}</div>
      <p className="mt-1 text-[15px]">{rec.text}</p>
    </div>
  );
}

/** In live mode the app provides this. It posts the choice and rejects with the API's message. */
export const GateSubmitContext = createContext<((option: string, reason: string) => Promise<void>) | null>(null);

export function GateDecision({ args }: { args: GateArgs }) {
  const submit = useContext(GateSubmitContext);
  const [choice, setChoice] = useState<string>("");
  const [reason, setReason] = useState("");
  const [phase, setPhase] = useState<"editing" | "saving" | "recorded">("editing");
  const [error, setError] = useState<string | null>(null);

  const others = args.options.filter((o) => o.id !== choice).map((o) => o.label);
  const check = checkReason(reason, MIN_WORDS, others[others.length - 1]);
  const canConfirm = !!choice && check.state === "valid" && phase === "editing";
  const picked = args.options.find((o) => o.id === choice);

  const confirm = async () => {
    // The same check as the button: a bare yes or a short reason never leaves the browser.
    if (!picked || check.state !== "valid" || phase !== "editing") return;
    setError(null);
    setPhase("saving");
    if (!submit) {
      setTimeout(() => setPhase("recorded"), 900);
      return;
    }
    try {
      await submit(picked.label, reason.trim());
      setPhase("recorded");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send that. Check your connection and try again.");
      setPhase("editing");
    }
  };

  if (phase === "recorded" && picked) {
    return (
      <div className="my-2 flex flex-col gap-2 rounded-xl border-2 border-primary/40 bg-accent/40 p-4">
        <div className="flex items-center gap-2 text-lg font-bold text-accent-foreground">
          <CheckCircle2 className="size-5" /> Decision recorded: {picked.label}
        </div>
        <p className="text-base">“{reason.trim()}”</p>
        <p className="text-[14px] text-muted-foreground">Saved. You approved this.</p>
      </div>
    );
  }

  return (
    <div className="my-2 flex flex-col gap-5 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-2xl font-extrabold tracking-tight">{args.question}</h3>
        {!submit && <StatusBadge status="mocked">Demo data</StatusBadge>}
      </div>
      {args.recommendation && <RecommendationNote rec={args.recommendation} />}
      <RadioGroup value={choice} onValueChange={(v) => { setChoice(v); setError(null); }} className="grid gap-3 md:grid-cols-3" disabled={phase !== "editing"}>
        {args.options.map((o) => (
          <OptionCard
            key={o.id}
            value={o.id}
            label={o.label}
            body={o.body}
            cost={o.cost}
            risk={o.risk}
            selected={choice === o.id}
            recommended={args.recommended.includes(o.id)}
            disabled={phase !== "editing"}
          />
        ))}
      </RadioGroup>
      <ReasonField value={reason} onChange={(v) => { setReason(v); setError(null); }} check={check} minWords={MIN_WORDS} disabled={phase !== "editing"} error={error} />
      <div className="flex items-center gap-3">
        <Button
          size="lg"
          disabled={!canConfirm}
          onClick={confirm}
          className="h-12 rounded-full px-6 text-base font-bold"
        >
          {phase === "saving" ? "Recording…" : "Confirm decision"}
        </Button>
        {!choice && <span className="text-[15px] text-muted-foreground">Pick an option first.</span>}
      </div>
    </div>
  );
}

type Profile = Record<string, string | string[]>;

function FounderProfile({ result }: { result: Profile }) {
  return (
    <dl className="my-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-base">
      {Object.entries(result).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold capitalize text-muted-foreground">{k}</dt>
          <dd>{Array.isArray(v) ? v.join(", ") : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const BoardroomTool: ToolCallMessagePartComponent = ({ toolName, args, result }) => {
  if (toolName === "gate_decision") return <GateDecision args={args as GateArgs} />;
  if (toolName === "parody_verdict") return <ParodyVerdict />;
  if (toolName === "research_trail") {
    const r = result as { engine: string; queries: { q: string; results: number; kept: number }[]; dropped: string };
    return (
      <details className="group my-2 rounded-xl border bg-card p-3 text-[15px]">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
          <Search className="size-4 text-primary" /> Searched {r.engine}: {r.queries.length} queries, {r.queries.reduce((a, x) => a + x.kept, 0)} sources kept
          <span className="ml-auto text-muted-foreground group-open:hidden">Show</span>
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {r.queries.map((x) => (
            <li key={x.q} className="flex justify-between gap-4"><span className="font-mono text-[14px]">“{x.q}”</span><span className="shrink-0 text-muted-foreground">{x.results} found, {x.kept} kept</span></li>
          ))}
        </ul>
        <p className="mt-2 text-muted-foreground">Dropped: {r.dropped}</p>
      </details>
    );
  }
  if (toolName === "founder_profile") return <FounderProfile result={result as Profile} />;
  if (toolName === "sources") {
    const sources = (result as { sources?: Source[] } | undefined)?.sources;
    return (
      <div className="my-2 flex flex-col gap-2">
        {sources ? sources.map((s) => <SourceCard key={s.n} {...s} />) : [1, 2].map((i) => <SourceCard key={i} n={i} title="" url="" trust="medium" backs="" state="loading" />)}
      </div>
    );
  }
  if (toolName === "shark_verdicts") {
    const verdicts = (result as { verdicts: Parameters<typeof VerdictCard>[0][] }).verdicts;
    return (
      <div className="my-2 grid gap-3 md:grid-cols-3">
        {verdicts.map((v) => <VerdictCard key={v.id} {...v} />)}
      </div>
    );
  }
  return null;
};
