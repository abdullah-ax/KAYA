import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Middle dots and bullet characters read as filler. Structure text with real
// layout (labels, lists, line breaks) instead.
const BANNED = /[·•]/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("no dot separators in the app", () => {
  it("has no · or • characters in any source file", () => {
    const offenders = sources(join(__dirname))
      .flatMap((f) => readFileSync(f, "utf8").split("\n").map((line, i) => ({ f, i: i + 1, line })))
      .filter(({ line }) => BANNED.test(line))
      .map(({ f, i, line }) => `${f.replace(__dirname, "src")}:${i}: ${line.trim()}`);
    expect(offenders).toEqual([]);
  });
});
