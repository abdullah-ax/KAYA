import { describe, expect, it } from "vitest";

import { STAGES } from "../journey";
import { agentRoster, layoutMindMap, stageIdsForAgent } from "./map-model";

describe("agentRoster", () => {
  it("lists every agent once, in first-seen order", () => {
    const roster = agentRoster(STAGES);
    const ids = roster.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("profiler");
    expect(ids).toContain("hustler");
  });
});

describe("stageIdsForAgent", () => {
  it("returns every stage when no agent is picked", () => {
    expect(stageIdsForAgent(STAGES, "all")).toHaveLength(STAGES.length);
  });

  it("returns only the stages an agent works on or can read", () => {
    expect(stageIdsForAgent(STAGES, "hustler")).toEqual(["distribution"]);
    expect(stageIdsForAgent(STAGES, "warm_skeptic")).toEqual(["ideation", "validation", "operate"]);
  });
});

describe("layoutMindMap", () => {
  const { nodes, edges } = layoutMindMap(STAGES);

  it("puts the founder at the centre and one node per stage", () => {
    expect(nodes.find((n) => n.id === "founder")).toBeDefined();
    for (const s of STAGES) expect(nodes.find((n) => n.id === s.id)).toBeDefined();
  });

  it("chains the stages in order from the founder", () => {
    const chain = edges.filter((e) => e.data?.kind === "flow").map((e) => `${e.source}>${e.target}`);
    expect(chain[0]).toBe("founder>ideation");
    expect(chain).toContain("validation>build");
    expect(chain).toHaveLength(STAGES.length);
  });

  it("branches one key-point node per fact and issue", () => {
    const validation = STAGES.find((s) => s.id === "validation")!;
    const points = nodes.flatMap((n) => (n.data.kind === "point" && n.data.stageId === "validation" ? [n.data] : []));
    expect(points).toHaveLength(validation.facts.length + validation.issues.length);
    expect(points.filter((p) => p.tone === "issue")).toHaveLength(validation.issues.length);
  });

  it("never overlaps two stage nodes", () => {
    const stages = nodes.filter((n) => n.type === "stage");
    const xs = stages.map((n) => `${n.position.x},${n.position.y}`);
    expect(new Set(xs).size).toBe(stages.length);
  });
});

describe("layoutMindMap radial", () => {
  const { nodes, edges } = layoutMindMap(STAGES);
  const pos = (id: string) => nodes.find((n) => n.id === id)!.position;

  it("rings the stages around the founder at the same distance", () => {
    const c = pos("founder");
    const d = STAGES.map((s) => Math.hypot(pos(s.id).x - c.x, pos(s.id).y - c.y));
    expect(Math.max(...d) - Math.min(...d)).toBeLessThan(2);
  });

  it("branches key points outward, away from the founder", () => {
    const c = pos("founder");
    for (const s of STAGES) {
      const sd = Math.hypot(pos(s.id).x - c.x, pos(s.id).y - c.y);
      for (const p of nodes.filter((n) => n.data.kind === "point" && n.data.stageId === s.id)) {
        expect(Math.hypot(p.position.x - c.x, p.position.y - c.y)).toBeGreaterThan(sd);
      }
    }
  });

  it("connects each edge on the sides facing each other", () => {
    for (const e of edges) expect(e.sourceHandle && e.targetHandle).toBeTruthy();
  });
});
