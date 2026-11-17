"use client";

/* Onboarding: one question per screen, big type, chips plus free text.
   First a short fixed opening. Then up to four follow-ups the model writes from
   the founder's own words (or standard ones when the model can't be reached).
   Last, a profile the founder can edit before anything starts. */

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DictationButton } from "./dictation-button";
import { cn } from "@/lib/utils";
import { ApiError, createRun, nextQuestion, type ApiProvider, type FollowUp, type OnbAnswer, type Profile, type Run } from "@/lib/api";
import { buildProfile, fallbackQuestion, followUpCount, MAX_FOLLOWUPS, OPENING, profileBrief, type OpeningStep } from "@/lib/onboarding";
import { ProfileCard } from "./onboarding-profile";
import { checkReason, LearnCard, MascotAvatar } from "./ui";

export type LiveStart = { provider: ApiProvider; modelKey: string; model?: string; onRun: (run: Run) => void };

type Draft = { chips: string[]; text: string };
type Trail = { q: FollowUp; answer: string };
type Ask = { status: "loading" } | { status: "ready"; q: FollowUp } | { status: "error"; message: string; refused: boolean };

const TOTAL = OPENING.length + MAX_FOLLOWUPS + 1;
const UNREACHABLE = "Couldn't reach the API. Check that it is running, then try again.";

function openingAnswer(step: OpeningStep, d: Draft): string {
  const text = d.text.trim();
  if (step.id === "role") return [d.chips[0], text].filter(Boolean).join(", ");
  if (step.id === "help") return d.chips.length && text ? `${d.chips.join(", ")}. ${text}` : d.chips.length ? d.chips.join(", ") : text;
  return d.chips.length ? d.chips[0] : text;
}

function openingValid(step: OpeningStep, d: Draft): boolean {
  if (step.id === "role") return d.chips.length > 0;
  if (step.id === "help") return d.chips.length > 0 || d.text.trim().length > 1;
  if (step.chips) return d.chips.length > 0;
  return checkReason(d.text, step.text?.minWords ?? 1).state === "valid";
}

function Chips({ options, value, multi, onChange, labelledBy }: { options: string[]; value: string[]; multi?: boolean; onChange: (v: string[]) => void; labelledBy: string }) {
  return (
    <div role={multi ? "group" : "radiogroup"} aria-labelledby={labelledBy} className="grid grid-cols-2 gap-3">
      {options.map((o) => {
        const sel = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={sel}
            onClick={() => onChange(multi ? (sel ? value.filter((x) => x !== o) : [...value, o]) : [o])}
            className={cn(
              "flex items-center gap-3 rounded-xl border-2 bg-card px-4 py-3.5 text-left text-xl font-semibold outline-none transition-colors",
              "hover:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/40",
              sel && "border-foreground bg-accent/40",
            )}
          >
            <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center border-2", multi ? "rounded-md" : "rounded-full", sel ? "border-foreground bg-foreground text-background" : "border-input")}>
              {sel && <Check className="size-4" />}
            </span>
            {o}
          </button>
        );
      })}
    </div>
  );
}

function TextField({ id, label, value, onChange, placeholder, onSubmit, invalid }: { id: string; label?: string; value: string; onChange: (v: string) => void; placeholder: string; onSubmit: () => void; invalid?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <Label htmlFor={id} className="text-[18px] font-semibold text-muted-foreground">{label}</Label>}
      <div className="relative">
        <Textarea
          id={id}
          autoFocus={!label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(); }}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          className="min-h-28 rounded-xl border-2 bg-card p-4 text-xl md:text-xl"
        />
      </div>
      <DictationButton onText={(t) => onChange(value.trim() ? `${value.trim()} ${t}` : t)} />
    </div>
  );
}

export function Onboarding({ onDone, live }: { onDone?: () => void; live?: LiveStart }) {
  const [phase, setPhase] = useState<"opening" | "followup" | "profile">("opening");
  const [i, setI] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [trail, setTrail] = useState<Trail[]>([]);
  const [ask, setAsk] = useState<Ask>({ status: "loading" });
  const [followText, setFollowText] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const latest = useRef(0);
  const fieldId = useId();

  const step = OPENING[i];
  const draft: Draft = drafts[step.id] ?? { chips: [], text: "" };
  const setDraft = (patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [step.id]: { ...draft, ...patch } }));

  const openingAnswers: OnbAnswer[] = OPENING.map((s) => ({ key: s.id, question: s.q, answer: openingAnswer(s, drafts[s.id] ?? { chips: [], text: "" }) }));
  const followAnswers = (t: Trail[]): OnbAnswer[] => t.map((x) => ({ key: x.q.key, question: x.q.text, answer: x.answer }));

  /* Ask for the next question. Online: the API. Offline: the standard questions, in the browser. */
  const standard = (all: OnbAnswer[]) => {
    if (followUpCount(all) >= MAX_FOLLOWUPS) return finishWith(buildProfile(all));
    const q = fallbackQuestion(all);
    if (!q) return finishWith(buildProfile(all));
    setAsk({ status: "ready", q });
  };
  const finishWith = (p: Profile) => { setProfile(p); setPhase("profile"); };

  const request = async (nextTrail: Trail[]) => {
    const all = [...openingAnswers, ...followAnswers(nextTrail)];
    setPhase("followup");
    if (!live) return standard(all);
    const mine = ++latest.current;
    setAsk({ status: "loading" });
    try {
      const reply = await nextQuestion({ answers: all, provider: live.provider, model: live.model }, live.modelKey || undefined);
      if (mine !== latest.current) return;
      if (reply.done) finishWith(reply.profile);
      else setAsk({ status: "ready", q: reply.question });
    } catch (e) {
      if (mine !== latest.current) return;
      if (e instanceof ApiError && e.status === 422) {
        const last = nextTrail.at(-1);
        if (last) { // the newest follow-up was refused: keep that question and show why
          setTrail(nextTrail.slice(0, -1));
          setFollowText(last.answer);
          setRefusal(e.message);
          setAsk({ status: "ready", q: last.q });
        } else setAsk({ status: "error", message: e.message, refused: true });
        return;
      }
      setAsk({ status: "error", message: e instanceof ApiError ? e.message : UNREACHABLE, refused: false });
    }
  };

  const goBack = () => {
    latest.current++;
    setDir(-1);
    setRefusal(null);
    if (phase === "opening") return setI((x) => Math.max(0, x - 1));
    const last = trail.at(-1);
    if (!last) { setPhase("opening"); setI(OPENING.length - 1); return; }
    setTrail(trail.slice(0, -1));
    setFollowText(last.answer);
    setAsk({ status: "ready", q: last.q });
    setPhase("followup");
  };

  const nextOpening = () => {
    setDir(1);
    if (i < OPENING.length - 1) return setI(i + 1);
    void request(trail);
  };

  const submitFollow = (q: FollowUp) => {
    const answer = followText.trim();
    if (!answer) return;
    const t = [...trail, { q, answer }];
    setTrail(t);
    setFollowText("");
    setRefusal(null);
    setDir(1);
    void request(t);
  };

  const start = async () => {
    if (!profile) return;
    if (!live) return onDone?.();
    setStarting(true);
    setStartError(null);
    try {
      live.onRun(await createRun({ brief: profileBrief(profile), mode: "demo", provider: live.provider, model: live.model }, live.modelKey || undefined));
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : UNREACHABLE);
      setStarting(false);
    }
  };

  const position = phase === "opening" ? i : phase === "followup" ? OPENING.length + trail.length : TOTAL - 1;
  const why = phase === "followup" && ask.status === "ready" ? ask.q.why : phase === "opening" ? step.why : "Check every line. You can change any of it.";
  const sofar: { label: string; answer: string }[] = [
    ...openingAnswers.filter((a) => a.answer).map((a) => ({ label: a.key, answer: a.answer })),
    ...trail.map((t) => ({ label: t.q.key.replace("_", " "), answer: t.answer })),
  ];
  const q = ask.status === "ready" ? ask.q : null;
  const followCheck = checkReason(followText, 1);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_22rem] lg:overflow-visible">
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center gap-4 px-10 pt-6">
          <Progress value={(position / (TOTAL - 1)) * 100} className="h-1.5 flex-1" />
          <span className="text-[14px] font-semibold tabular-nums text-muted-foreground">{phase === "profile" ? "Check" : `${position + 1} of ${TOTAL - 1}`}</span>
        </div>

        <div className="flex flex-1 items-start justify-center overflow-y-auto px-10 py-8">
          {phase === "profile" && profile ? (
            <ProfileCard profile={profile} onChange={setProfile} onStart={start} onBack={goBack} starting={starting} error={startError} />
          ) : (
            <div key={`${phase}-${phase === "opening" ? i : trail.length}`} className={cn("my-auto flex w-full max-w-2xl flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300", dir === 1 ? "motion-safe:slide-in-from-bottom-4" : "motion-safe:slide-in-from-top-4")}>
              <div className="flex items-center gap-3">
                <MascotAvatar id="profiler" expression={phase === "followup" && ask.status === "loading" ? "thinking" : "listening"} activity={phase === "followup" && ask.status === "loading" ? "thinking" : "speaking"} size={48} />
                <span className="text-[15px] font-semibold text-muted-foreground">Profiler</span>
              </div>

              {phase === "opening" && (
                <>
                  <div>
                    <Label id={fieldId} className="block text-[32px] leading-tight font-extrabold tracking-tight">{step.q}</Label>
                    <p className="mt-2 text-xl text-muted-foreground">{step.hint}</p>
                  </div>
                  {step.chips && <Chips options={step.chips} multi={step.multi} value={draft.chips} onChange={(chips) => setDraft({ chips })} labelledBy={fieldId} />}
                  {step.text && (
                    <>
                      <TextField
                        id={`${fieldId}-text`}
                        label={step.chips ? step.text.label : undefined}
                        value={draft.text}
                        onChange={(text) => setDraft({ text })}
                        placeholder={step.text.placeholder}
                        onSubmit={() => openingValid(step, draft) && nextOpening()}
                      />
                      {!step.chips && step.text.minWords && (
                        <p aria-live="polite" className="min-h-6 text-base font-semibold">
                          {draft.text.trim() && checkReason(draft.text, step.text.minWords).state === "short" && <span className="text-muted-foreground">Add a number and the group name.</span>}
                          {checkReason(draft.text, step.text.minWords).state === "valid" && <span className="inline-flex items-center gap-1.5 text-primary"><Check className="size-4" /> Got it.</span>}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}

              {phase === "followup" && ask.status === "loading" && (
                <div role="status" aria-label="Writing your next question" className="flex flex-col gap-4">
                  <Skeleton className="h-9 w-4/5" />
                  <Skeleton className="h-9 w-3/5" />
                  <Skeleton className="h-6 w-2/5" />
                  <Skeleton className="h-28 w-full rounded-xl" />
                </div>
              )}

              {phase === "followup" && ask.status === "error" && (
                <div className="flex flex-col gap-4">
                  <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">{ask.refused ? "I can't use one of your answers." : "I couldn't write your next question."}</h1>
                  <p role="alert" className="text-xl font-semibold text-destructive">{ask.message}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    {ask.refused ? (
                      <Button size="lg" className="h-12 rounded-full px-6 text-base font-bold" onClick={goBack}>Change my answers</Button>
                    ) : (
                      <>
                        <Button size="lg" className="h-12 rounded-full px-6 text-base font-bold" onClick={() => void request(trail)}>Retry</Button>
                        <Button variant="outline" size="lg" className="h-12 rounded-full px-6 text-base font-bold" onClick={() => standard([...openingAnswers, ...followAnswers(trail)])}>Use a standard question</Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {phase === "followup" && q && (
                <>
                  <div>
                    <Label id={fieldId} htmlFor={q.kind === "text" ? `${fieldId}-text` : undefined} className="block text-[32px] leading-tight font-extrabold tracking-tight">{q.text}</Label>
                  </div>
                  {q.kind === "choice" && q.options ? (
                    <Chips options={q.options} value={followText ? [followText] : []} onChange={(v) => setFollowText(v[0] ?? "")} labelledBy={fieldId} />
                  ) : (
                    <TextField id={`${fieldId}-text`} value={followText} onChange={(v) => { setFollowText(v); setRefusal(null); }} placeholder={q.placeholder ?? ""} onSubmit={() => followCheck.state === "valid" && submitFollow(q)} invalid={!!refusal || followCheck.state === "bare"} />
                  )}
                  <p aria-live="polite" role={refusal ? "alert" : undefined} className="min-h-6 text-base font-semibold">
                    {refusal && <span className="text-destructive">{refusal}</span>}
                    {!refusal && followCheck.state === "bare" && <span className="text-destructive">{followCheck.message} Tell me in your own words.</span>}
                  </p>
                </>
              )}

              {!(phase === "followup" && ask.status !== "ready") && (
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
                  <span className="text-[14px] text-muted-foreground">{phase === "opening" && !step.chips || phase === "followup" ? "Ctrl + Enter" : ""}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <aside className="flex min-h-0 flex-col gap-6 overflow-y-auto border-l bg-card/40 p-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">Why we ask</h3>
          <p className="text-base leading-snug">{why}</p>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">Your answers so far</h3>
          {sofar.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">Nothing yet. Every answer is saved in your own words.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-[15px] leading-snug">
              {sofar.map((s) => (
                <li key={s.label}><b className="capitalize">{s.label}:</b> {`“${s.answer}”`}</li>
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
