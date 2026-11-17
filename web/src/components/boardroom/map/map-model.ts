/* Pure layout and filtering for the founder map. No React here, so it is
   cheap to test and reuse on the server later. */

import type { Edge, Node } from "@xyflow/react";

import type { Stage } from "../journey";

export type Agent = Stage["agents"][number];

export type FounderData = { kind: "founder"; title: string; subtitle: string };
export type StageData = { kind: "stage"; stageId: string; stage: Stage; dimmed: boolean; selected: boolean };
export type PointData = { kind: "point"; stageId: string; text: string; tone: "fact" | "issue"; dimmed: boolean };

export type MapNode =
  | Node<FounderData, "founder">
  | (Node<StageData, "stage"> & { data: StageData })
  | (Node<PointData, "point"> & { data: PointData });

export type MapEdge = Edge<{ kind: "flow" | "branch" }>;

/** Every agent once, in the order they first appear across stages. */
export function agentRoster(stages: Stage[]): Agent[] {
  const seen = new Map<string, Agent>();
  for (const s of stages) for (const a of s.agents) if (!seen.has(a.id)) seen.set(a.id, a);
  return [...seen.values()];
}

/** Stage ids an agent works on or can read. "all" means no filter. */
export function stageIdsForAgent(stages: Stage[], agentId: string): string[] {
  if (agentId === "all") return stages.map((s) => s.id);
  return stages.filter((s) => s.agents.some((a) => a.id === agentId)).map((s) => s.id);
}

const RADIUS = 400;
const BRANCH = 250;
const POINT_GAP = 46;

type Side = "top" | "right" | "bottom" | "left";
const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/** Which side of a node faces a point at (dx, dy) from it. */
export function sideToward(dx: number, dy: number): Side {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
}

function link(id: string, source: string, from: { x: number; y: number }, target: string, to: { x: number; y: number }, kind: "flow" | "branch"): MapEdge {
  const side = sideToward(to.x - from.x, to.y - from.y);
  return { id, source, target, sourceHandle: `s-${side}`, targetHandle: `t-${OPPOSITE[side]}`, type: "smoothstep", data: { kind } };
}

/**
 * A mind map: founder in the centre, stages in a clockwise ring starting at
 * nine o'clock, key facts and problems branching outward from each stage.
 * Positions are node centres (origin 0.5, 0.5).
 */
export function layoutMindMap(
  stages: Stage[],
  opts: { agent?: string; selected?: string; founder?: { title: string; subtitle: string } } = {},
): { nodes: MapNode[]; edges: MapEdge[] } {
  const visible = new Set(stageIdsForAgent(stages, opts.agent ?? "all"));
  const centre = { x: 0, y: 0 };
  const origin: [number, number] = [0.5, 0.5];
  const nodes: MapNode[] = [
    {
      id: "founder",
      type: "founder",
      position: centre,
      origin,
      data: { kind: "founder", title: opts.founder?.title ?? "You", subtitle: opts.founder?.subtitle ?? "Pharmacy tutor · dosage cheat sheets" },
      draggable: false,
    },
  ];
  const edges: MapEdge[] = [];

  stages.forEach((s, i) => {
    const angle = Math.PI + (i * 2 * Math.PI) / stages.length;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const at = { x: centre.x + dir.x * RADIUS, y: centre.y + dir.y * RADIUS };
    const dimmed = !visible.has(s.id);
    nodes.push({ id: s.id, type: "stage", position: at, origin, data: { kind: "stage", stageId: s.id, stage: s, dimmed, selected: opts.selected === s.id }, draggable: false });

    const prevId = i === 0 ? "founder" : stages[i - 1].id;
    const prevAt = nodes.find((n) => n.id === prevId)!.position;
    edges.push(link(`flow-${i}`, prevId, prevAt, s.id, at, "flow"));

    const points = [...s.facts.map((t) => ({ t, tone: "fact" as const })), ...s.issues.map((t) => ({ t, tone: "issue" as const }))];
    // Cards are wider than tall, so sideways branches need more room.
    const reach = BRANCH + Math.abs(dir.x) * 140;
    const hub = { x: at.x + dir.x * reach, y: at.y + dir.y * reach };
    points.forEach((p, k) => {
      const id = `${s.id}-${p.tone}-${k}`;
      const pos = { x: hub.x, y: hub.y + (k - (points.length - 1) / 2) * POINT_GAP };
      nodes.push({ id, type: "point", position: pos, origin, data: { kind: "point", stageId: s.id, text: p.t, tone: p.tone, dimmed }, draggable: false, selectable: false });
      edges.push(link(`e-${id}`, s.id, at, id, pos, "branch"));
    });
  });

  return { nodes, edges };
}
