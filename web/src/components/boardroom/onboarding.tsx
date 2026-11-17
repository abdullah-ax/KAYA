"use client";

/* Onboarding: one question per screen, big type, chips plus free text.
   First a short fixed opening. Then up to four standard follow-ups, built in the
   browser from the founder's own words. No model is called here. Last, a profile
   the founder can edit; Start sends it, with every answer, as the run's brief. */

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive } from "radix-ui";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { DictationButton } from "./dictation-button";
import { cn } from "@/lib/utils";
import { ApiError, createRun, type ApiProvider, type Run } from "@/lib/api";
import { ASSUMPTION, buildProfile, checkAnswer, fallbackQuestion, followUpCount, MAX_BRIEF, MAX_FOLLOWUPS, OPENING, profileBrief, type FollowUp, type OnbAnswer, type OpeningStep, type Profile } from "@/lib/onboarding";
import { ProfileCard } from "./onboarding-profile";
import { LearnCard, MascotAvatar } from "./ui";

export type LiveStart = { provider: ApiProvider; modelKey: string; model?: string; onRun: (run: Run) => void };

type Draft = { chips: string[]; text: string; skipped?: boolean };
type Trail = { q: FollowUp; answer: string };

const TOTAL = OPENING.length + MAX_FOLLOWUPS + 1;
const UNREACHABLE = "Couldn't reach the API. Check that it is running, then try again.";

type Known = { label: string; skipped?: boolean; chips?: string; text?: string };
const EMPTY: Draft = { chips: [], text: "" };

/** The edited profile, plus every follow-up answer the profile does not already show. */
function fullBrief(p: Profile, follow: OnbAnswer[]): string {
  const shown = new Set([...p.strengths, ...(p.network ?? []), ...(p.experience ?? []), ...(p.interests ?? [])].map((x) => x.key));
  const extra = follow.filter((a) => !shown.has(a.key)).map((a) => `${a.question} ${a.answer}`);
  return [profileBrief(p), ...extra].join("\n").slice(0, MAX_BRIEF);
}

function openingAnswer(step: OpeningStep, d: Draft): string {
  if (d.skipped) return ASSUMPTION;
  const text = d.text.trim();
  if (step.id === "role") return [d.chips[0], text].filter(Boolean).join(", ");
  if (!step.multi) return [d.chips[0], text].filter(Boolean).join(". ");
  return [d.chips.join(", "), text].filter(Boolean).join(". ");
}

function openingValid(step: OpeningStep, d: Draft): boolean {
  if (step.id === "role" || step.id === "time" || step.id === "money") return d.chips.length > 0;
  if (step.id === "city") return checkAnswer(d.text, 1).state === "valid";
  return d.chips.length > 0 || d.text.trim().length > 1;
}

const ARROWS: Record<string, 1 | -1> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
const CHIP = cn(
  "flex items-center gap-3 rounded-xl border-2 bg-card px-4 py-3.5 text-left text-xl font-semibold outline-none transition-colors",
  "hover:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/40",
);

function Mark({ on, multi }: { on: boolean; multi?: boolean }) {
  return (
    <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center border-2", multi ? "rounded-md" : "rounded-full", on ? "border-foreground bg-foreground text-background" : "border-input")}>
      {on && <Check className="size-4" />}
    </span>
  );
}

/** One choice step. Single choice is a real radio group (arrow keys pick). Several is a group of real checkboxes (arrow keys move, space ticks). */
function Chips({ options, value, multi, onChange, labelledBy }: { options: string[]; value: string[]; multi?: boolean; onChange: (v: string[]) => void; labelledBy: string }) {
  const boxes = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(0);
  if (!multi) {
    // Arrow keys move focus and pick, as a native radio group does. Done here so it does not depend on key-up timing.
    const onRadioKey = (e: KeyboardEvent<HTMLDivElement>) => {
      const step = ARROWS[e.key];
      const radios = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
      const at = radios.findIndex((r) => r === document.activeElement);
      if (!step || at < 0) return;
      e.preventDefault();
      e.stopPropagation();
      const to = (at + step + radios.length) % radios.length;
      radios[to].focus();
      onChange([options[to]]);
    };
    return (
      <RadioPrimitive.Root value={value[0] ?? ""} onValueChange={(v) => onChange([v])} onKeyDownCapture={onRadioKey} aria-labelledby={labelledBy} className="grid grid-cols-2 gap-3">
        {options.map((o) => (
          <RadioPrimitive.Item key={o} value={o} className={cn(CHIP, value[0] === o && "border-foreground bg-accent/40")}>
            <Mark on={value[0] === o} />
            {o}
          </RadioPrimitive.Item>
        ))}
      </RadioPrimitive.Root>
    );
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROWS[e.key];
    const at = boxes.current.findIndex((b) => b === document.activeElement);
    if (!step || at < 0) return;
    e.preventDefault();
    const to = (at + step + options.length) % options.length;
    setActive(to);
    boxes.current[to]?.focus();
  };
  return (
    <div role="group" aria-labelledby={labelledBy} onKeyDown={onKeyDown} className="grid grid-cols-2 gap-3">
      {options.map((o, k) => {
        const sel = value.includes(o);
        return (
          <CheckboxPrimitive.Root
            key={o}
            ref={(el) => { boxes.current[k] = el; }}
            checked={sel}
            tabIndex={k === active ? 0 : -1}
            onFocus={() => setActive(k)}
            onCheckedChange={(on) => onChange(on ? [...value, o] : value.filter((x) => x !== o))}
            className={cn(CHIP, sel && "border-foreground bg-accent/40")}
          >
            <Mark on={sel} multi />
            {o}
          </CheckboxPrimitive.Root>
        );
      })}
    </div>
  );
}

function TextField({ id, label, labelledBy, value, onChange, placeholder, onSubmit, invalid }: { id: string; label?: string; labelledBy?: string; value: string; onChange: (v: string) => void; placeholder: string; onSubmit: () => void; invalid?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <Label htmlFor={id} className="text-[18px] font-semibold text-muted-foreground">{label}</Label>}
      <Textarea
        id={id}
        aria-labelledby={label ? undefined : labelledBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(); }}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className="min-h-28 rounded-xl border-2 bg-card p-4 text-xl md:text-xl"
      />
      <DictationButton onText={(t) => onChange(value.trim() ? `${value.trim()} ${t}` : t)} />
    </div>
  );
}

export function Onboarding({ onDone, live }: { onDone?: () => void; live?: LiveStart }) {
  const [phase, setPhase] = useState<"opening" | "followup" | "profile">("opening");
  const [i, setI] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [trail, setTrail] = useState<Trail[]>([]);
  const [q, setQ] = useState<FollowUp | null>(null);
  const [followText, setFollowText] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const moved = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fieldId = useId();
  const headingId = `${fieldId}-q`;

  const step = OPENING[i];
  const draft: Draft = drafts[step.id] ?? EMPTY;
  const setDraft = (patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [step.id]: { ...draft, ...patch, skipped: false } }));

  // After Next, Skip or Back, the new question heading takes focus so a screen reader reads it first.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [phase, i, trail.length, q]);

  const openingAnswers: OnbAnswer[] = OPENING.map((s) => ({ key: s.id, question: s.q, answer: openingAnswer(s, drafts[s.id] ?? EMPTY) || ASSUMPTION }));
  const followAnswers = (t: Trail[]): OnbAnswer[] => t.map((x) => ({ key: x.q.key, question: x.q.text, answer: x.answer }));

  /* The next standard question, written in the browser, live or offline. After four, the profile. */
  const request = (nextTrail: Trail[]) => {
    const all = [...openingAnswers, ...followAnswers(nextTrail)];
    setPhase("followup");
    const next = followUpCount(all) < MAX_FOLLOWUPS ? fallbackQuestion(all) : null;
    if (next) return setQ(next);
    setProfile(buildProfile(all));
    setPhase("profile");
  };

  const goBack = () => {
    moved.current = true;
    setDir(-1);
    if (phase === "opening") return setI((x) => Math.max(0, x - 1));
    const last = trail.at(-1);
    if (!last) { setPhase("opening"); setI(OPENING.length - 1); return; }
    setTrail(trail.slice(0, -1));
    setFollowText(last.answer);
    setQ(last.q);
    setPhase("followup");
  };

  const nextOpening = () => {
    moved.current = true;
    setDir(1);
    if (i < OPENING.length - 1) return setI(i + 1);
    request(trail);
  };

  const skipOpening = () => {
    setDrafts((d) => ({ ...d, [step.id]: { chips: [], text: "", skipped: true } }));
    nextOpening();
  };

  const submitFollow = (q: FollowUp) => {
    const answer = followText.trim();
    if (!answer) return;
    moved.current = true;
    const t = [...trail, { q, answer }];
    setTrail(t);
    setFollowText("");
    setDir(1);
    request(t);
  };

  const start = async () => {
    if (!profile) return;
    if (!live) return onDone?.();
    setStarting(true);
    setStartError(null);
    try {
      live.onRun(await createRun({ brief: fullBrief(profile, followAnswers(trail)), mode: "demo", provider: live.provider, model: live.model }, live.modelKey || undefined));
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : UNREACHABLE);
      setStarting(false);
    }
  };

  const position = phase === "opening" ? i : phase === "followup" ? OPENING.length + trail.length : TOTAL - 1;
  const why = phase === "followup" && q ? q.why : phase === "opening" ? step.why : "Check every line. You can change any of it.";
  const sofar: Known[] = [
    ...OPENING.flatMap((st): Known[] => {
      const d = drafts[st.id];
      if (!d || (!d.skipped && !openingAnswer(st, d))) return [];
      if (d.skipped) return [{ label: st.label, skipped: true }];
      const chips = st.multi ? d.chips.join(", ") : d.chips[0] ?? "";
      return [{ label: st.label, chips: chips || undefined, text: d.text.trim() || undefined }];
    }),
    ...trail.map((t) => ({ label: t.q.key.replace("_", " "), ...(t.q.kind === "choice" ? { chips: t.answer } : { text: t.answer }) })),
  ];
  const followCheck = q?.kind === "choice" ? (followText ? { state: "valid" as const } : { state: "empty" as const }) : checkAnswer(followText, 1);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_22rem] lg:overflow-visible">
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center gap-4 px-10 pt-6">
          <Progress value={(position / (TOTAL - 1)) * 100} aria-label="Progress" className="h-1.5 flex-1" />
          <span className="text-[14px] font-semibold tabular-nums text-muted-foreground">{phase === "profile" ? "Check" : `${position + 1} of ${TOTAL - 1}`}</span>
        </div>

        <div className="flex flex-1 items-start justify-center overflow-y-auto px-10 py-8">
          {phase === "profile" && profile ? (
            <ProfileCard profile={profile} onChange={setProfile} onStart={start} onBack={goBack} starting={starting} error={startError} />
          ) : (
            <div key={`${phase}-${phase === "opening" ? i : trail.length}`} className={cn("my-auto flex w-full max-w-2xl flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300", dir === 1 ? "motion-safe:slide-in-from-bottom-4" : "motion-safe:slide-in-from-top-4")}>
              <div className="flex items-center gap-3">
                <MascotAvatar id="profiler" expression="listening" activity="speaking" size={48} />
                <span className="text-[15px] font-semibold text-muted-foreground">Profiler</span>
              </div>

              {phase === "opening" && (
                <>
                  <div>
                    <h1 id={headingId} ref={headingRef} tabIndex={-1} className="block text-[32px] leading-tight font-extrabold tracking-tight outline-none">{step.q}</h1>
                    <p className="mt-2 text-xl text-muted-foreground">{step.hint}</p>
                  </div>
                  {step.chips && <Chips options={step.chips} multi={step.multi} value={draft.chips} onChange={(chips) => setDraft({ chips })} labelledBy={headingId} />}
                  {step.text && (
                    <>
                      <TextField
                        id={`${fieldId}-text`}
                        label={step.chips ? step.text.label : undefined}
                        labelledBy={headingId}
                        value={draft.text}
                        onChange={(text) => setDraft({ text })}
                        placeholder={step.text.placeholder}
                        onSubmit={() => openingValid(step, draft) && nextOpening()}
                      />
                    </>
                  )}
                </>
              )}

              {phase === "followup" && q && (
                <>
                  <div>
                    <h1 id={headingId} ref={headingRef} tabIndex={-1} className="block text-[32px] leading-tight font-extrabold tracking-tight outline-none">{q.text}</h1>
                  </div>
                  {q.kind === "choice" && q.options ? (
                    <Chips options={q.options} value={followText ? [followText] : []} onChange={(v) => setFollowText(v[0] ?? "")} labelledBy={headingId} />
                  ) : (
                    <TextField id={`${fieldId}-text`} labelledBy={headingId} value={followText} onChange={setFollowText} placeholder={q.placeholder ?? ""} onSubmit={() => followCheck.state === "valid" && submitFollow(q)} invalid={followCheck.state === "bare"} />
                  )}
                  <p aria-live="polite" className="min-h-6 text-base font-semibold">
                    {followCheck.state === "bare" && <span className="text-destructive">{followCheck.message}</span>}
                  </p>
                </>
              )}

              {(phase === "opening" || q) && (
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="lg" onClick={goBack} disabled={phase === "opening" && i === 0} className="h-12 rounded-full text-base"><ArrowLeft className="size-4" /> Back</Button>
                  <Button
                    size="lg"
                    disabled={phase === "opening" ? !openingValid(step, draft) : followCheck.state !== "valid"}
                    onClick={() => (phase === "opening" ? nextOpening() : q && submitFollow(q))}
                    className="h-12 rounded-full px-6 text-base font-bold"
                  >
                    Next <ArrowRight className="size-4" />
                  </Button>
                  {phase === "opening" && (
                    <Button variant="ghost" size="lg" onClick={skipOpening} className="h-12 rounded-full text-base text-muted-foreground">Skip for now</Button>
                  )}
                  <span className="text-[14px] text-muted-foreground">{phase === "opening" && !step.chips || phase === "followup" ? "Ctrl + Enter" : ""}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <aside aria-label="What I know about you" className="flex min-h-0 flex-col gap-6 overflow-y-auto border-l bg-card/40 p-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">Why we ask</h3>
          <p className="text-base leading-snug">{why}</p>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">What I know about you</h3>
          {sofar.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">Nothing yet. Every answer is saved in your own words.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-[15px] leading-snug">
              {sofar.map((x) => (
                <li key={x.label}>
                  <b className="capitalize">{x.label}:</b>{" "}
                  {x.skipped ? ASSUMPTION : [x.chips, x.text && `“${x.text}”`].filter(Boolean).join(". ")}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">Keep learning, 5 minutes</h3>
          <LearnCard kind="Video" org="YC Startup Library" title="How to get startup ideas" url="https://www.ycombinator.com/library/8g-how-to-get-startup-ideas" why="Start from what you know and who you know." />
        </section>
      </aside>
    </div>
  );
}
