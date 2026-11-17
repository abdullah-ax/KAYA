"use client";

/* The founder map: a quiet full-screen canvas. Founder on the left, the six
   stages in a line, key facts branching above, problems below, agents beside
   each stage. An outline on the left keeps it usable by keyboard and screen
   reader; the canvas is the same data drawn spatially. */

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, ArrowRight, Check, Lock, MapIcon, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STAGES, type Stage, type StageStatus } from "../journey";
import { MascotAvatar } from "../ui";
import { agentRoster, layoutMindMap, stageIdsForAgent, type FounderData, type PointData, type StageData } from "./map-model";

const STATUS_LABEL: Record<StageStatus, string> = { done: "Done", current: "You are here", next: "Next", locked: "Locked" };

const hidden = "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";

/** Handles on every side so edges can leave from whichever side faces the target. */
function Handles() {
  return (
    <>
      {([["top", Position.Top], ["right", Position.Right], ["bottom", Position.Bottom], ["left", Position.Left]] as const).map(([id, pos]) => (
        <span key={id}>
          <Handle type="source" id={`s-${id}`} position={pos} className={hidden} />
          <Handle type="target" id={`t-${id}`} position={pos} className={hidden} />
        </span>
      ))}
    </>
  );
}

function StatusDot({ status }: { status: StageStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]",
        status === "done" && "bg-primary text-primary-foreground",
        status === "current" && "bg-foreground ring-4 ring-foreground/10",
        status === "next" && "border-2 border-foreground/40",
        status === "locked" && "bg-muted text-muted-foreground",
      )}
    >
      {status === "done" && <Check className="size-3" />}
      {status === "locked" && <Lock className="size-2.5" />}
    </span>
  );
}

function FounderNode({ data }: NodeProps & { data: FounderData }) {
  return (
    <div className="flex w-56 items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-background">
      <span className="flex size-10 items-center justify-center rounded-full bg-background text-lg font-extrabold text-foreground">{data.title[0]}</span>
      <span className="min-w-0">
        <span className="block font-bold">{data.title}</span>
        <span className="block text-[13px] leading-snug text-background/75">{data.subtitle}</span>
      </span>
      <Handles />
    </div>
  );
}

function StageNode({ data }: NodeProps & { data: StageData }) {
  const s = data.stage;
  return (
    <div
      className={cn(
        "group w-64 cursor-pointer rounded-2xl border bg-card p-4 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[opacity,box-shadow,border-color] duration-200",
        "hover:shadow-[0_6px_24px_-8px_rgb(0_0_0/0.18)]",
        s.status === "current" && "border-foreground border-2",
        s.status === "locked" && "border-dashed",
        data.selected && "ring-4 ring-ring/25",
        data.dimmed && "opacity-25",
      )}
    >
      <Handles />
      <div className="flex items-center gap-2">
        <StatusDot status={s.status} />
        <span className="text-[13px] font-semibold text-muted-foreground">{STATUS_LABEL[s.status]}</span>
        {s.issues.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[13px] font-bold text-destructive"><AlertTriangle className="size-3.5" />{s.issues.length}</span>
        )}
      </div>
      <div className="mt-2 text-xl font-bold tracking-tight">{s.name}</div>
      <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">{s.goal}</p>
      <div className="mt-3 flex -space-x-2">
        {s.agents.map((a) => (
          <span key={a.id + a.name} title={`${a.name}${a.access === "reads" ? " (read only)" : ""}`} className={cn("rounded-full", a.access === "reads" && "opacity-60")}>
            <MascotAvatar id={a.id} size={28} className="ring-2 ring-offset-0 ring-card" />
          </span>
        ))}
      </div>
    </div>
  );
}

function PointNode({ data }: NodeProps & { data: PointData }) {
  return (
    <div
      className={cn(
        "max-w-64 rounded-full px-3.5 py-1.5 text-[15px] leading-snug whitespace-nowrap transition-opacity duration-200",
        data.tone === "issue" ? "bg-stop-bg font-semibold text-destructive" : "bg-muted text-foreground",
        data.dimmed && "opacity-25",
      )}
    >
      <Handles />
      {data.text}
    </div>
  );
}

const nodeTypes: NodeTypes = { founder: FounderNode, stage: StageNode, point: PointNode } as NodeTypes;

function StageDetails({ stage, onGo }: { stage: Stage; onGo: () => void }) {
  const locked = stage.status === "locked";
  return (
    <section aria-label="Stage details" className="flex w-[22rem] shrink-0 flex-col gap-5 overflow-y-auto border-l bg-background p-6">
      <div className="flex items-center gap-2">
        <StatusDot status={stage.status} />
        <span className="text-[14px] font-semibold text-muted-foreground">Stage {stage.n} · {STATUS_LABEL[stage.status]}</span>
      </div>
      <div>
        <h2 className="text-[32px] leading-tight font-extrabold tracking-tight">{stage.name}</h2>
        <p className="mt-1 text-base text-muted-foreground">{stage.goal}</p>
      </div>
      <ul className="flex flex-col gap-2 text-base leading-snug">
        {stage.facts.map((f) => <li key={f} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/40" />{f}</li>)}
      </ul>
      {stage.issues.length > 0 && (
        <ul className="flex flex-col gap-2 rounded-xl bg-stop-bg p-3 text-[15px] font-semibold leading-snug text-destructive">
          {stage.issues.map((i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{i}</li>)}
        </ul>
      )}
      <div className="text-[15px]"><span className="font-bold">Gate</span><p className="text-muted-foreground">{stage.gate}</p></div>
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-bold">Agents</span>
        {stage.agents.map((a) => (
          <div key={a.id + a.name} className="flex items-center gap-3">
            <MascotAvatar id={a.id} size={32} />
            <span className="flex-1 text-base">{a.name}</span>
            <span className="text-[13px] text-muted-foreground">{a.access === "works" ? "Works here" : "Read only"}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-2">
        {locked ? (
          <Button disabled size="lg" className="h-12 w-full rounded-full text-base">
            <Lock className="size-4" /> Locked until the gate before it passes
          </Button>
        ) : (
          <Button size="lg" onClick={onGo} className="h-12 w-full rounded-full text-base font-bold">
            Go to {stage.name} <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </section>
  );
}

export function StageMap({ current, onNavigate }: { current: string; onNavigate: (stageId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState("all");
  const [selected, setSelected] = useState(current);
  const roster = useMemo(() => agentRoster(STAGES), []);
  const visible = useMemo(() => new Set(stageIdsForAgent(STAGES, agent)), [agent]);
  const { nodes, edges } = useMemo(() => layoutMindMap(STAGES, { agent, selected }), [agent, selected]);
  const stage = STAGES.find((s) => s.id === selected) ?? STAGES[0];

  const styledEdges = edges.map((e) => ({
    ...e,
    selectable: false,
    style: e.data?.kind === "flow"
      ? { stroke: "var(--foreground)", strokeWidth: 1.5, opacity: 0.55 }
      : { stroke: "var(--border)", strokeWidth: 1.25, strokeDasharray: "4 4" },
  }));

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setSelected(current); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open map" className="size-10 rounded-full">
          <MapIcon className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
      >
        <header className="flex h-16 shrink-0 items-center gap-4 border-b px-5">
          <MapIcon className="size-5" aria-hidden />
          <DialogTitle className="text-xl font-bold">Founder map</DialogTitle>
          <DialogDescription className="sr-only">All stages, what we know, open problems, and which agents work on each.</DialogDescription>
          <div className="ml-auto flex items-center gap-3">
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger aria-label="Agents" className="h-10 w-56 rounded-full text-[15px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {roster.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <MascotAvatar id={a.id} size={20} className="ring-1 ring-offset-0" /> {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close map" className="size-10 rounded-full"><X className="size-5" /></Button>
            </DialogClose>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="w-60 shrink-0 overflow-y-auto border-r p-3" aria-label="Stage outline">
            <ul aria-label="Stages" className="flex flex-col gap-0.5">
              {STAGES.map((s) => {
                const dimmed = !visible.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelected(s.id)}
                      aria-pressed={selected === s.id}
                      data-dimmed={dimmed ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-[background-color,opacity] duration-150",
                        "hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40",
                        selected === s.id && "bg-muted",
                        dimmed && "opacity-35",
                      )}
                    >
                      <StatusDot status={s.status} />
                      <span className="flex-1 text-base font-semibold">{s.name}</span>
                      {s.issues.length > 0 && <span className="text-[13px] font-bold text-destructive">{s.issues.length}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="relative min-w-0 flex-1 bg-background">
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={styledEdges}
                nodeTypes={nodeTypes}
                onNodeClick={(_, n) => { if (n.type === "stage") setSelected(n.id); }}
                fitView
                fitViewOptions={{ padding: 0.06 }}
                minZoom={0.3}
                maxZoom={1.5}
                nodesConnectable={false}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="var(--border)" />
                <Controls showInteractive={false} position="bottom-left" />
              </ReactFlow>
            </ReactFlowProvider>
          </div>

          <StageDetails stage={stage} onGo={() => { onNavigate(stage.id); setOpen(false); }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
