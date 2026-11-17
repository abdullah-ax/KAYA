"use client";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useEffect, useMemo, useState } from "react";

import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getRun, health, listModels, testModel, useRun, type Run } from "@/lib/api";
import { rememberRun } from "@/lib/run-url";
import { cn } from "@/lib/utils";
import { SCREENS, TEAM, type Screen } from "./data";
import { LiveChat, LivePanel, LiveRoster } from "./live";
import { progressStages, speakerFor, stageInfo } from "./live-model";
import { apiProviderOf, localModelOf, ModelSettings } from "./model-settings";
import { STAGES } from "./journey";
import { StageMap } from "./map/stage-map";
import { PlanView } from "./plan/plan-view";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Onboarding } from "./onboarding";
import { WorkingPanel } from "./panels";
import { FaceAvatar, PARODY, SettingsDialog } from "./parody";
import { StatesGallery } from "./states";
import { BoardroomTool } from "./tools";
import { MascotAvatar, RosterItem, StatusBadge } from "./ui";

const GROUPS = ["Co-founder", "Crew", "Judges", "Sharks"] as const;
const STEP_LABEL: Record<string, string> = { onboarding: "Onboarding", intake: "Intake", cofounder: "Opportunities", gate: "Sign-up gate", sharks: "Shark panel", daily: "Daily check-in", states: "States" };
const SCREEN_FOR_STAGE: Record<string, string> = { ideation: "cofounder", validation: "gate" };
const STAGE_OF: Record<string, string> = { onboarding: "ideation", intake: "ideation", cofounder: "ideation", gate: "validation", sharks: "validation", daily: "validation" };

function withEgg(screen: Screen, egg: boolean): ThreadMessageLike[] {
  if (!egg || screen.id !== "sharks") return screen.messages;
  return [
    ...screen.messages,
    { role: "assistant", content: [{ type: "text", text: "Ahmed Tarek mode is on. A tougher shark takes a seat." }, { type: "tool-call", toolCallId: "egg1", toolName: "parody_verdict", args: {}, result: {} }] },
  ];
}

function useMockRuntime(screen: Screen, egg: boolean) {
  const [messages, setMessages] = useState<ThreadMessageLike[]>(() => withEgg(screen, egg));
  const [isRunning, setIsRunning] = useState(false);
  useEffect(() => setMessages(withEgg(screen, egg)), [screen, egg]);

  return useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    isRunning,
    convertMessage: (m) => m,
    onNew: async (m: AppendMessage) => {
      const text = m.content.map((p) => (p.type === "text" ? p.text : "")).join(" ");
      setMessages((prev) => [...prev, { role: "user", content: [{ type: "text", text }] }]);
      setIsRunning(true);
      await new Promise((r) => setTimeout(r, 1200));
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: [{ type: "text", text: "MOCK reply. The real build sends this to the orchestrator, then the guardrail and ethics bot check it before you see it." }] },
      ]);
      setIsRunning(false);
    },
  });
}

/* Boardroom tool cards are content, not collapsible tool logs. */
const InlineToolGroup = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

function Chat({ screen, egg }: { screen: Screen; egg: boolean }) {
  const runtime = useMockRuntime(screen, egg);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread components={{ ToolFallback: BoardroomTool, ToolGroup: InlineToolGroup }} autoFocus={false} />
    </AssistantRuntimeProvider>
  );
}

type Conn = "checking" | "online" | "offline";
const LIVE_FOUNDER = { title: "You", subtitle: "Your answers, in your words" };

export function Boardroom({ initialScreen, initialRunId, dark, egg: eggParam, dev = false }: { initialScreen?: string; initialRunId?: string; dark?: boolean; egg?: boolean; dev?: boolean }) {
  const [conn, setConn] = useState<Conn>("checking");
  const [runId, setRunId] = useState<string | null>(initialRunId ?? null);
  // The model key lives in React state only: never storage, never a URL, never logged.
  const [modelKey, setModelKey] = useState("");
  const { run, error: runError, update } = useRun(conn === "online" ? runId : null);
  useEffect(() => {
    let alive = true;
    health().then((ok) => { if (alive) setConn(ok ? "online" : "offline"); });
    return () => { alive = false; };
  }, []);
  const live = conn === "online";
  useEffect(() => { if (live) rememberRun(runId); }, [live, runId]);
  const [installed, setInstalled] = useState<Record<string, boolean | null> | undefined>();
  useEffect(() => {
    if (!live) return;
    listModels()
      .then((m) => setInstalled(Object.fromEntries(m.choices.map((c) => [c.name, c.installed]))))
      .catch(() => setInstalled(undefined));
  }, [live]);

  const [egg, setEgg] = useState(eggParam ?? true);
  const [screenId, setScreenId] = useState<string>(initialScreen ?? "gate");
  const [model, setModel] = useState("ollama");
  const screen = SCREENS.find((s) => s.id === screenId);
  const speaker = TEAM.find((m) => m.id === screen?.speaker);
  const info = run ? stageInfo(run.stage) : { stageId: "ideation", label: runId ? "Starting" : "Onboarding" };
  const stageId = live ? info.stageId : (STAGE_OF[screenId] ?? "validation");
  const stepLabel = live ? info.label : (STEP_LABEL[screenId] ?? "");
  const liveStages = useMemo(() => progressStages(STAGES, stageId), [stageId]);
  const startOver = () => setRunId(null);

  return (
    <TooltipProvider>
      <div className={cn("flex h-dvh flex-col bg-background text-foreground", dark && "dark")}>
        {/* Top bar: map first, then where you are. Mock-only screen picker sits on the right. */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <StageMap
            current={stageId}
            onNavigate={(id) => { if (!live) setScreenId(SCREEN_FOR_STAGE[id] ?? screenId); }}
            stages={live ? liveStages : undefined}
            founder={live ? LIVE_FOUNDER : undefined}
          />
          <PlanView runId={runId} live={live} refreshKey={run ? `${run.stage}:${run.status}` : undefined} />
          <span className="text-xl font-extrabold tracking-tight">Boardroom</span>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[15px]">
            <span aria-hidden className="text-muted-foreground/60">/</span>
            <span className="font-semibold">{STAGES.find((s) => s.id === stageId)?.name}</span>
            <span aria-hidden className="text-muted-foreground/60">/</span>
            <span aria-current="page" className="text-muted-foreground">{stepLabel}</span>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {conn === "checking" && <StatusBadge status="stubbed">Checking API…</StatusBadge>}
            {conn === "offline" && <StatusBadge status="mocked">Demo data — API not connected</StatusBadge>}
            {!live && (conn === "offline" || dev) && (
              <Select value={screenId} onValueChange={setScreenId}>
                <SelectTrigger aria-label="Mock screen" className="h-9 w-40 rounded-full text-[14px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STEP_LABEL).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <ModelSettings
              current={model}
              onChange={(id, key) => { setModel(id); setModelKey(key); }}
              test={live ? (provider, key, m) => testModel(provider, key || undefined, m) : undefined}
              installed={installed}
            />
            <SettingsDialog tarekMode={egg} onTarekMode={setEgg} />
          </div>
        </header>

        {live ? (
          !runId ? (
            <Onboarding live={{ provider: apiProviderOf(model), modelKey, model: localModelOf(model), onRun: (r: Run) => { setRunId(r.id); update(r); } }} />
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[17rem_1fr_22rem] lg:overflow-visible">
              <LiveRoster run={run} tarek={egg} />
              <main className="flex min-h-[85dvh] flex-col lg:min-h-0">
                <div className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
                  <MascotAvatar id={speakerFor(run)} expression="listening" activity={run?.status === "working" ? "thinking" : "speaking"} size={44} />
                  <div>
                    <div className="text-[14px] font-semibold text-muted-foreground">{STAGES.find((s) => s.id === stageId)?.name}</div>
                    <h1 className="text-xl font-bold">{stepLabel}</h1>
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  {run ? <LiveChat key={run.id} run={run} update={update} onRestart={startOver} onRetry={() => { getRun(run.id).then(update).catch(() => {}); }} /> : <p className="p-6 text-base text-muted-foreground">{runError ?? "Loading your run…"}</p>}
                </div>
              </main>
              <aside className="min-h-0 border-l bg-card/40">
                <ScrollArea className="h-full"><LivePanel run={run} error={runError} onRestart={startOver} tarek={egg} /></ScrollArea>
              </aside>
            </div>
          )
        ) : screenId === "onboarding" ? (
          <Onboarding onDone={() => setScreenId("cofounder")} />
        ) : screenId === "states" || !screen ? (
          <ScrollArea className="min-h-0 flex-1"><StatesGallery /></ScrollArea>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[17rem_1fr_22rem] lg:overflow-visible">
            {/* Left: team roster */}
            <aside className="hidden min-h-0 flex-col border-r lg:flex">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex flex-col gap-5 p-4">
                  {GROUPS.map((g) => (
                    <div key={g} className="flex flex-col gap-1">
                      <div className="px-2.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">{g}</div>
                      {TEAM.filter((m) => m.group === g).map((m) => (
                        <RosterItem
                          key={m.id}
                          id={m.id}
                          name={m.name}
                          role={m.role}
                          status={m.status}
                          active={m.id === screen.speaker}
                          activity={m.status === "Drafting" ? "thinking" : m.id === screen.speaker ? "speaking" : "idle"}
                          disabled={g === "Sharks" && screen.id !== "sharks"}
                        />
                      ))}
                      {g === "Sharks" && egg && (
                        <div className="flex items-center gap-3 rounded-lg px-2.5 py-2">
                          <FaceAvatar emotion={screen.id === "sharks" ? "listening" : "neutral"} idle size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-semibold">{PARODY.name}</span>
                            <span className="block truncate text-[14px] text-muted-foreground">{PARODY.role}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            {/* Center: chat */}
            <main className="flex min-h-[85dvh] flex-col lg:min-h-0">
              <div className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
                {speaker && <MascotAvatar id={speaker.id} expression="listening" activity="speaking" size={44} />}
                <div>
                  <div className="text-[14px] font-semibold text-muted-foreground">{screen.phase}</div>
                  <h1 className="text-xl font-bold">{screen.title}</h1>
                </div>
              </div>
              <div className="min-h-0 flex-1"><Chat key={screen.id + egg} screen={screen} egg={egg} /></div>
            </main>

            {/* Right: working panel */}
            <aside className="min-h-0 border-l bg-card/40">
              <ScrollArea className="h-full"><WorkingPanel screen={screen} /></ScrollArea>
            </aside>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
