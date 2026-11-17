/* Pure: what the parody shark feels and says about a run. No React, no network.
   Lines are an impression, never quotes from the real person, never advice. */

import type { Run } from "@/lib/api";
import type { FaceEmotion } from "./parody";

export type TarekMood = { emotion: FaceEmotion; line: string };

const GREETING = "Show me the numbers, ya basha.";

/** "12 of 100 sign-ups" -> { got: 12, target: 100 }. Null if the text has no such pair. */
function numbersIn(text: string): { got: number; target: number } | null {
  const m = /(\d+)\s+of\s+(\d+)/.exec(text);
  return m ? { got: Number(m[1]), target: Number(m[2]) } : null;
}

function gateLine(outcome: string, n: { got: number; target: number } | null): string {
  const pair = n ? `${n.got} of ${n.target}` : null;
  if (outcome === "stop") return pair ? `${pair}? That's your WhatsApp group, not a market.` : "No proof yet. That's your WhatsApp group, not a market.";
  if (outcome === "repeat") return pair ? `${pair}. Not there yet. Fix the offer or run it again.` : "Not enough yet. Get more proof, then come back.";
  if (outcome === "pivot") return pair ? `${pair}. This one is not moving. Pick a new problem.` : "This one is not moving. Pick a new problem.";
  return "Sources are a start. Cash is the proof.";
}

/** Phase 2 go at or above the target the founder set. Needs the numbers when the text has them. */
function phase2Flawless(run: Run, text: string | null): boolean {
  const n = text ? numbersIn(text) : null;
  if (n) return /^go\b/i.test(text!.trim()) && run.stage.startsWith("phase2") && n.got >= n.target;
  return run.phase2 === "go";
}

export function tarekMood(run: Run | null, opts: { flawless?: boolean } = {}): TarekMood {
  const pleased: TarekMood = { emotion: "pleased", line: "Now we talk." };
  if (opts.flawless) return pleased;
  if (!run) return { emotion: "neutral", line: GREETING };

  if (run.outcome === "stop") return { emotion: "im_out", line: "I'm out. Come back with people who pay." };

  const p = run.pending;
  if (p?.kind === "gate") {
    const outcome = /^(go|repeat|pivot|stop)\b/i.exec(p.prompt.trim())?.[1].toLowerCase() ?? "";
    if (outcome === "go" && phase2Flawless(run, p.prompt)) return pleased;
    if (outcome === "go") return { emotion: "neutral", line: "Sources are a start. Cash is the proof." };
    return { emotion: "skeptical", line: gateLine(outcome, numbersIn(p.prompt)) };
  }
  if (p?.kind === "question") return { emotion: "listening", line: "Go on. I'm listening. Numbers first." };
  if (run.status === "working") return { emotion: "thinking", line: "Let me do the math." };
  if (run.phase2 === "go") return pleased;
  return { emotion: "neutral", line: GREETING };
}
