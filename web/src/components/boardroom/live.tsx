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
import { TEAM } from "./data";
import { friendlyFileName, gateArgsFromPending, outcomeSentence, sourceCardsFrom, stageInfo } from "./live-model";
import { BoardroomTool, GateNextContext, GateSubmitContext } from "./tools";
import { FaceAvatar, PARODY, TarekCard } from "./parody";
import { PublishCard } from "./publish-card";
import { tarekMood } from "./tarek-mood";
import { EmptyState, RosterItem, SourceCard } from "./ui";

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
    const gatePrompt = run.pending?.kind === "gate" ? run.pending.prompt : null;
    run.messages.slice(s.said).forEach((m, i) => {
      // The gate card already shows the question and the options.
      if (gatePrompt && m.startsWith(gatePrompt)) return;
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
    } else if (run.pending?.kind === "gate") {
      const p = run.pending;
      once(`g|${p.key}|${p.prompt}`, () => ({
        id: `g-${s.ids.size}`,
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: `gate-${p.key}-${s.ids.size}`, toolName: "gate_decision", args: gateArgsFromPending(p), result: undefined }],
      }));
    }
    if (run.status === "error") once("error", () => assistant("error", `The run stopped with an error: ${run.error ?? "unknown"}`));
    if (run.status === "closed") once("closed", () => assistant("closed", "This run was closed when the server restarted. Start a new one."));
    if (run.status === "done") once("done", () => assistant("done", `The run is finished${run.outcome ? `. Outcome: ${run.outcome}` : ""}.`));
    if (add.length) setMessages((prev) => [...prev, ...add]);
  }, [run]);

  return { messages, push: (m: ThreadMessageLike) => setMessages((prev) => [...prev, m]) };
}

export function LiveChat({ run, update, onRestart = () => {} }: { run: Run; update: (r: Run) => void; onRestart?: () => void }) {
  const { messages, push } = useTranscript(run);
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
      if (run.pending?.kind !== "question") {
        push(assistant(next(), run.pending?.kind === "gate" ? "I'm waiting for your decision on the card above. Pick an option and say why." : "I'm still working. I'll ask when I need you."));
        return;
      }
      push({ id: next(), role: "user", content: text(said) });
      setSending(true);
      try {
        const fresh = await sendAnswer(run.id, said);
        if (fresh.notice?.refused) {
          push(assistant(next(), `${fresh.notice.reason ?? "I can't help with that"}.${fresh.notice.alternative ? ` Instead: ${fresh.notice.alternative}.` : ""}`));
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

  const nextStep = useMemo(() => ({ done: run.status === "done", startOver: onRestart }), [run.status, onRestart]);

  return (
    <GateSubmitContext.Provider value={submitGate}>
      <GateNextContext.Provider value={nextStep}>
        <AssistantRuntimeProvider runtime={runtime}>
          <Thread components={{ ToolFallback: BoardroomTool, ToolGroup: InlineToolGroup }} autoFocus={false} />
        </AssistantRuntimeProvider>
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

      <Section title={`Sources (${cards.length})`}>
        {cards.length ? cards.map((c) => <SourceCard key={c.n} {...c} />) : <p className="text-[15px] text-muted-foreground">None yet. Every claim will show its source here, or the word ASSUMPTION.</p>}
      </Section>

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
  return (
    <aside className="flex min-h-0 flex-col border-r">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 p-4">
          {GROUPS.map((g) => (
            <div key={g} className="flex flex-col gap-1">
              <div className="px-2.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">{g}</div>
              {TEAM.filter((m) => m.group === g).map((m) => (
                <RosterItem key={m.id} id={m.id} name={m.name} role={m.role} active={m.id === "warm_skeptic"} activity={m.id === "warm_skeptic" ? (working ? "thinking" : "speaking") : "idle"} />
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
