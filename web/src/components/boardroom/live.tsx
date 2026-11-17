"use client";

/* Live mode: the same shell, driven by a real run from the API. Nothing here
   reads data.ts. If the API has not said it, this screen does not show it. */

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { Button } from "@/components/ui/button";
import { ApiError, sendAnswer, sendGate, type Run } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CASES, LEARN, TEAM } from "./data";
import { LevelUpDialog, useLevelUp } from "./level-up";
import { doneMessage, friendlyFileName, gateArgsFromPending, learnKeyFor, outcomeSentence, progressLine, refusalText, sourceCardsFrom, speakerFor, stageInfo, STAGE_NAMES, stageTitle } from "./live-model";
import { BoardroomTool, GateNextContext, GateSubmitContext, RetryContext } from "./tools";
import { FaceAvatar, PARODY, TarekCard } from "./parody";
import { ProgramSection } from "./program-card";
import { PublishCard } from "./publish-card";
import { tarekMood } from "./tarek-mood";
import { CaseStudyCard, checkReason, EmptyState, LearnCard, RosterItem, SourceCard } from "./ui";

const InlineToolGroup = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
const text = (t: string): ThreadMessageLike["content"] => [{ type: "text", text: t }];
const assistant = (id: string, t: string): ThreadMessageLike => ({ id, role: "assistant", content: text(t) });

/** Builds the chat from what the API says, in order, once each. */
function useTranscript(run: Run | null) {
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const seen = useRef({ said: 0, ids: new Set<string>() });

  useEffect(() => {
    if (!run) return;
    const s = seen.current;
    const add: ThreadMessageLike[] = [];
    const shownElsewhere = run.pending?.kind === "gate" || run.pending?.kind === "level_up" ? run.pending.prompt : null;
    run.messages.slice(s.said).forEach((m, i) => {
      // The gate card shows its own question; the level-up prompt is added once below.
      if (shownElsewhere && m.startsWith(shownElsewhere)) return;
      add.push(assistant(`say-${s.said + i}`, m));
    });
    s.said = run.messages.length;

    const once = (id: string, make: () => ThreadMessageLike) => {
      if (s.ids.has(id)) return;
      s.ids.add(id);
      add.push(make());
    };
    if (run.pending?.kind === "question") {
      const p = run.pending;
      once(`q|${p.key}|${p.prompt}`, () => assistant(`q-${s.ids.size}`, p.prompt));
    } else if (run.pending?.kind === "level_up") {
      const p = run.pending;
      once(`l|${p.done}`, () => assistant(`l-${p.done}`, p.prompt));
    } else if (run.pending?.kind === "gate") {
      const p = run.pending;
      once(`g|${p.key}|${p.prompt}`, () => ({
        id: `g-${s.ids.size}`,
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: `gate-${p.key}-${s.ids.size}`, toolName: "gate_decision", args: gateArgsFromPending(p), result: undefined }],
      }));
    }
    if (run.status === "error") once("error", () => ({ id: "error", role: "assistant", content: [{ type: "tool-call", toolCallId: "run-error", toolName: "run_error", args: {}, result: undefined }] }));
    if (run.status === "closed") once("closed", () => assistant("closed", "This run was closed when the server restarted. Start a new one."));
    if (run.status === "done") once("done", () => assistant("done", doneMessage(run.outcome)));
    if (add.length) setMessages((prev) => [...prev, ...add]);
  }, [run]);

  return { messages, push: (m: ThreadMessageLike) => setMessages((prev) => [...prev, m]) };
}

/** Always on top of the chat: which stage, which step, and what comes next. */
export function StageBar({ run, onNext, error }: { run: Run; onNext?: () => void; error?: string | null }) {
  const p = run.pending?.kind === "level_up" ? run.pending : null;
  const title = p ? `Stage ${p.done} of ${STAGE_NAMES.length}: ${p.stage}, complete` : stageTitle(run.stage);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-6 py-3">
      <span className="text-base font-bold">{title}</span>
      {p && <span className="text-base text-muted-foreground">Next: Stage {p.done + 1}, {p.next}</span>}
      {p && onNext && <Button size="sm" className="ml-auto rounded-full text-base font-bold" onClick={onNext}>Go to {p.next}</Button>}
      {p && onNext && error && <p role="alert" className="w-full text-base font-semibold text-destructive">{error}</p>}
    </div>
  );
}

export function LiveChat({ run, update, onRestart = () => {}, onRetry }: { run: Run; update: (r: Run) => void; onRestart?: () => void; onRetry?: () => void }) {
  const { messages, push } = useTranscript(run);
  const levelUp = useLevelUp(run, update);
  const [sending, setSending] = useState(false);
  const counter = useRef(0);
  const next = () => `local-${counter.current++}`;

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    isRunning: sending || run.status === "working",
    convertMessage: (m) => m,
    onNew: async (m: AppendMessage) => {
      const said = m.content.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
      if (!said) return;
      const kind = run.pending?.kind;
      if (kind !== "question" && kind !== "level_up") {
        push(assistant(next(), kind === "gate" ? "I'm waiting for your decision on the card above. Pick an option and say why." : "I'm still working. I'll ask when I need you."));
        return;
      }
      push({ id: next(), role: "user", content: text(said) });
      // A chat message to the co-founder is not an answer, so any length is fine.
      if (kind === "question" && checkReason(said, 1).state === "bare") {
        push(assistant(next(), `“${said}” isn't an answer I can use. Tell me in a few more words.`));
        return;
      }
      setSending(true);
      try {
        const fresh = await sendAnswer(run.id, said);
        if (fresh.notice?.refused) {
          push(assistant(next(), refusalText(fresh.notice, (fresh.pending ?? run.pending)?.prompt)));
        }
        update(fresh);
      } catch (e) {
        push(assistant(next(), e instanceof ApiError ? e.message : "Couldn't send that. Check your connection and try again."));
      } finally {
        setSending(false);
      }
    },
  });

  const submitGate = useMemo(
    () => async (option: string, reason: string) => { update(await sendGate(run.id, option, reason)); },
    [run.id, update],
  );

  const composerNote =
    run.pending?.kind === "gate" ? "Pick an option above, then say why."
    : run.status === "done" || run.status === "closed" ? "This run is finished. Start a new one when you are ready."
    : undefined;
  const composerHint = levelUp.pending ? "Ask the co-founder anything about this stage. Move on when you are ready." : undefined;
  const nextStep = useMemo(() => ({ done: run.status === "done", startOver: onRestart }), [run.status, onRestart]);

  return (
    <GateSubmitContext.Provider value={submitGate}>
      <GateNextContext.Provider value={nextStep}>
        <RetryContext.Provider value={onRetry ?? null}>
          <AssistantRuntimeProvider runtime={runtime}>
            <div className="flex h-full min-h-0 flex-col">
              <StageBar run={run} onNext={levelUp.pending && !levelUp.open ? () => void levelUp.go() : undefined} error={levelUp.error} />
              {levelUp.pending && (
                <LevelUpDialog pending={levelUp.pending} open={levelUp.open} onGo={() => void levelUp.go()} onKeepTalking={levelUp.keepTalking} busy={levelUp.busy} error={levelUp.error} />
              )}
              <div className="min-h-0 flex-1">
                <Thread
                  components={{ ToolFallback: BoardroomTool, ToolGroup: InlineToolGroup }}
                  autoFocus={false}
                  composerNote={composerNote}
                  composerHint={composerHint}
                  progress={run.status === "working" ? progressLine(run.stage) : undefined}
                  waitHint="Wait for the reply, then send."
                />
              </div>
            </div>
          </AssistantRuntimeProvider>
        </RetryContext.Provider>
      </GateNextContext.Provider>
    </GateSubmitContext.Provider>
  );
}

const STATUS_TEXT: Record<Run["status"], string> = {
  working: "Working on it",
  waiting: "Waiting for you",
  gate: "Waiting for you",
  done: "Finished",
  error: "Stopped with an error",
  closed: "Closed. The server restarted.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function LivePanel({ run, error, onRestart, tarek = false }: { run: Run | null; error: string | null; onRestart: () => void; tarek?: boolean }) {
  if (!run) {
    return <div className="p-6"><EmptyState title="Starting your run" body="Nothing to show yet." /></div>;
  }
  const info = stageInfo(run.stage);
  const cards = sourceCardsFrom(run.sources);
  const ended = run.status === "done" || run.status === "error" || run.status === "closed";
  return (
    <div className="flex flex-col gap-7 p-6">
      {tarek && <TarekCard run={run} />}
      <Section title="Status">
        <div className="text-2xl font-extrabold">{info.label}</div>
        <p data-testid="outcome" className={cn("text-base", run.outcome === "stop" && run.status === "done" ? "font-bold text-destructive" : "font-semibold")}>
          {run.status === "error" || run.status === "closed" ? STATUS_TEXT[run.status] : outcomeSentence(run.status, run.outcome)}
        </p>
        {error && <p role="status" className="text-[15px] font-semibold text-destructive">Lost contact with the API. Trying again.</p>}
        {ended && <Button variant="outline" onClick={onRestart} className="w-fit rounded-full">Start a new run</Button>}
      </Section>

      {(run.delivery?.approved || run.delivery?.url || (run.pending?.kind === "gate" && run.pending.key === "publish")) && <PublishCard run={run} />}

      <ProgramSection runId={run.id} stage={run.stage} status={run.status} />

      <Section title={`Sources (${cards.length})`}>
        {cards.length ? cards.map((c) => <SourceCard key={c.n} {...c} />) : <p className="text-[15px] text-muted-foreground">None yet. Every claim will show its source here, or the word ASSUMPTION.</p>}
      </Section>

      <Section title="Keep learning, 5 minutes">
        {(() => { const l = LEARN[learnKeyFor(run.stage)]?.[0]; return l ? <LearnCard key={l.url} {...l} /> : null; })()}
      </Section>
      {(() => { const c = (CASES[learnKeyFor(run.stage)] ?? CASES.cofounder)[0]; return (
        <Section title="Who did this before"><CaseStudyCard {...c} /></Section>
      ); })()}

      <Section title={`Your documents (${run.outputs.length})`}>
        {run.outputs.length ? (
          <ul className="flex flex-col gap-1.5">{run.outputs.map((o) => <li key={o} className="text-base">{friendlyFileName(o)}</li>)}</ul>
        ) : (
          <p className="text-[15px] text-muted-foreground">Nothing written yet.</p>
        )}
      </Section>
    </div>
  );
}

const GROUPS = ["Co-founder", "Crew", "Judges"] as const;

export function LiveRoster({ run, tarek = false }: { run: Run | null; tarek?: boolean }) {
  const working = run?.status === "working";
  const speaker = speakerFor(run);
  return (
    <aside className="hidden min-h-0 flex-col border-r lg:flex">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 p-4">
          {GROUPS.map((g) => (
            <div key={g} className="flex flex-col gap-1">
              <div className="px-2.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">{g}</div>
              {TEAM.filter((m) => m.group === g).map((m) => (
                <RosterItem key={m.id} id={m.id} name={m.name} role={m.role} active={m.id === speaker} activity={m.id === speaker ? (working ? "thinking" : "speaking") : "idle"} />
              ))}
            </div>
          ))}
          {tarek && (
            <div className="flex flex-col gap-1">
              <div className="px-2.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">Sharks</div>
              <div className="flex items-center gap-3 rounded-lg px-2.5 py-2">
                <FaceAvatar emotion={tarekMood(run).emotion} idle size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{PARODY.name}</span>
                  <span className="block truncate text-[14px] text-muted-foreground">{PARODY.role}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
