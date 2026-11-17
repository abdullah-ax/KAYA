"use client";

/* Onboarding: one question per screen, big type, progress, back and next.
   The Profiler asks; the founder answers in their own words. */

import { ArrowLeft, ArrowRight, Check, Mic } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ApiError, createRun, type ApiProvider, type Run } from "@/lib/api";
import { composeBrief } from "./live-model";
import { checkReason, LearnCard, MascotAvatar } from "./ui";

type Step =
  | { kind: "text"; id: string; q: string; hint: string; minWords: number; placeholder: string }
  | { kind: "choice"; id: string; q: string; hint: string; options: string[]; multi?: boolean };

const STEPS: Step[] = [
  { kind: "text", id: "brief", q: "Tell me about you in two or three sentences.", hint: "Not your idea yet. You.", minWords: 12, placeholder: "I'm a 4th-year pharmacy student in Cairo. I tutor…" },
  { kind: "choice", id: "skills", q: "What are people already asking you to help with?", hint: "Pick all that apply.", options: ["Teaching or tutoring", "Design", "Writing", "Coding", "Selling", "Organizing events"], multi: true },
  { kind: "text", id: "network", q: "Which group of people could you message today?", hint: "Name the group and roughly how many.", minWords: 6, placeholder: "About 40 pharmacy students from my tutoring sessions" },
  { kind: "choice", id: "time", q: "How many hours a week can you give this?", hint: "Be honest. We plan around it.", options: ["Under 5", "5–10", "10–20", "20+"] },
  { kind: "choice", id: "money", q: "How do you want to fund it?", hint: "No wrong answer.", options: ["Self-funded, no raise", "Small grant or competition", "Raise from investors later"] },
  { kind: "text", id: "values", q: "What won't you do, even for money?", hint: "This becomes a rule the agents follow.", minWords: 6, placeholder: "No exaggerated health claims. No fake reviews." },
];

export type LiveStart = { provider: ApiProvider; modelKey: string; onRun: (run: Run) => void };

export function Onboarding({ onDone, live }: { onDone?: () => void; live?: LiveStart }) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [dir, setDir] = useState<1 | -1>(1);
  const fieldId = useId();
  const done = i >= STEPS.length;
  const step = STEPS[Math.min(i, STEPS.length - 1)];
  const value = answers[step.id];

  const valid =
    step.kind === "text"
      ? checkReason(String(value ?? ""), step.minWords).state === "valid"
      : Array.isArray(value) ? value.length > 0 : !!value;
  const textCheck = step.kind === "text" ? checkReason(String(value ?? ""), step.minWords) : null;

  const finish = async () => {
    if (!live) return go(1);
    setStarting(true);
    setStartError(null);
    try {
      live.onRun(await createRun({ brief: composeBrief(answers), mode: "demo", provider: live.provider }, live.modelKey || undefined));
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : "Couldn't reach the API. Check that it is running, then try again.");
      setStarting(false);
    }
  };
  const go = (d: 1 | -1) => { setDir(d); setI((x) => x + d); };
  const set = (v: string | string[]) => setAnswers((a) => ({ ...a, [step.id]: v }));

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1fr_22rem]">
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center gap-4 px-10 pt-6">
          <Progress value={(Math.min(i, STEPS.length) / STEPS.length) * 100} className="h-1.5 flex-1" />
          <span className="text-[14px] font-semibold tabular-nums text-muted-foreground">{done ? "Done" : `${i + 1} of ${STEPS.length}`}</span>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-y-auto px-10">
          {done ? (
            <div className="flex max-w-2xl flex-col items-start gap-5">
              <MascotAvatar id="profiler" expression="pleased" size={88} activity="done" />
              <h1 className="text-5xl leading-tight font-extrabold tracking-tight">Thanks. I know you a bit now.</h1>
              <p className="text-xl text-muted-foreground">Based on your answers, your co-founder is <b className="text-foreground">Noor, the warm skeptic</b>. She'll push back kindly and ask for proof.</p>
              <Button size="lg" className="h-12 rounded-full px-6 text-base font-bold" onClick={onDone}>Meet Noor <ArrowRight className="size-4" /></Button>
            </div>
          ) : (
            <div key={i} className={cn("flex w-full max-w-2xl flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300", dir === 1 ? "motion-safe:slide-in-from-bottom-4" : "motion-safe:slide-in-from-top-4")}>
              <div className="flex items-center gap-3">
                <MascotAvatar id="profiler" expression="listening" activity="speaking" size={48} />
                <span className="text-[15px] font-semibold text-muted-foreground">Profiler</span>
              </div>
              <div>
                <Label htmlFor={fieldId} className="block text-[32px] leading-tight font-extrabold tracking-tight">{step.q}</Label>
                <p className="mt-2 text-xl text-muted-foreground">{step.hint}</p>
              </div>

              {step.kind === "text" ? (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Textarea
                      id={fieldId}
                      autoFocus
                      value={String(value ?? "")}
                      onChange={(e) => set(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && valid && !starting) { if (i === STEPS.length - 1) void finish(); else go(1); } }}
                      placeholder={step.placeholder}
                      aria-invalid={textCheck?.state === "bare" || undefined}
                      className="min-h-32 rounded-xl border-2 bg-card p-4 pr-14 text-xl md:text-xl"
                    />
                    <Button variant="ghost" size="icon" className="absolute right-2 bottom-2 rounded-full" aria-label="Hold to talk"><Mic className="size-5" /></Button>
                  </div>
                  <p aria-live="polite" className="min-h-6 text-base font-semibold">
                    {textCheck?.state === "bare" && <span className="text-destructive">{textCheck.message} Tell me in your own words.</span>}
                    {textCheck?.state === "short" && <span className="text-muted-foreground">{textCheck.message}</span>}
                    {textCheck?.state === "valid" && <span className="inline-flex items-center gap-1.5 text-primary"><Check className="size-4" /> Got it.</span>}
                  </p>
                </div>
              ) : (
                <div role={step.multi ? "group" : "radiogroup"} aria-labelledby={fieldId} className="grid grid-cols-2 gap-3">
                  {step.options.map((o, k) => {
                    const sel = Array.isArray(value) ? value.includes(o) : value === o;
                    return (
                      <button
                        key={o}
                        role={step.multi ? "checkbox" : "radio"}
                        aria-checked={sel}
                        onClick={() => set(step.multi ? (sel ? (value as string[]).filter((x) => x !== o) : [...((value as string[]) ?? []), o]) : o)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border-2 bg-card px-4 py-3.5 text-left text-xl font-semibold outline-none transition-colors",
                          "hover:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/40",
                          sel && "border-foreground bg-accent/40",
                        )}
                      >
                        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md border-2 text-[14px] font-bold", sel ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}>
                          {sel ? <Check className="size-4" /> : String.fromCharCode(65 + k)}
                        </span>
                        {o}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button variant="ghost" size="lg" onClick={() => go(-1)} disabled={i === 0} className="h-12 rounded-full text-base"><ArrowLeft className="size-4" /> Back</Button>
                <Button size="lg" onClick={() => (i === STEPS.length - 1 ? finish() : go(1))} disabled={!valid || starting} className="h-12 rounded-full px-6 text-base font-bold">
                  {starting ? "Starting…" : i === STEPS.length - 1 ? "Finish" : "Next"} <ArrowRight className="size-4" />
                </Button>
                {step.kind === "text" && <span className="text-[14px] text-muted-foreground">Ctrl + Enter</span>}
              </div>
              <p role="alert" className="min-h-6 text-base font-semibold text-destructive">{startError}</p>
            </div>
          )}
        </div>
      </div>

      <aside className="flex min-h-0 flex-col gap-6 overflow-y-auto border-l bg-card/40 p-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">Why we ask</h3>
          <p className="text-base leading-snug">Founders do best with problems they already understand and people they can already reach. We start with you, not the idea.</p>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">Your answers so far</h3>
          {Object.keys(answers).length === 0 ? (
            <p className="text-[15px] text-muted-foreground">Nothing yet. Every answer is saved in your own words.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-[15px] leading-snug">
              {STEPS.filter((s) => answers[s.id]).map((s) => (
                <li key={s.id}><b className="capitalize">{s.id}:</b> {Array.isArray(answers[s.id]) ? (answers[s.id] as string[]).join(", ") : `“${answers[s.id]}”`}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">Keep learning · 5 min</h3>
          <LearnCard kind="Video" org="YC Startup Library" title="How to get startup ideas" url="https://www.ycombinator.com/library/8g-how-to-get-startup-ideas" why="Start from what you know and who you know." />
        </section>
      </aside>
    </div>
  );
}
