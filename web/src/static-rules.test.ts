import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "app/globals.css"), "utf8");

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (block: string, name: string) => new RegExp(`${block}\\s*\\{[^}]*--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css)?.[1] ?? "";

describe("WCAG 1.4.11 non-text contrast", () => {
  it("keeps the input border at 3:1 against the page in the light theme", () => {
    expect(ratio(token(":root", "input"), token(":root", "background"))).toBeGreaterThanOrEqual(3);
  });
  it("keeps the input border at 3:1 against the page in the dark theme", () => {
    expect(ratio(token("\\.dark", "input"), token("\\.dark", "background"))).toBeGreaterThanOrEqual(3);
  });
  it("draws a solid 2px focus outline in the primary color on everything focusable", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--primary\)/);
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [p] : [];
  });
}

describe("reduced motion", () => {
  it("only spins or pulses under motion-safe", () => {
    const offenders = sources(__dirname).flatMap((f) =>
      readFileSync(f, "utf8").split("\n").flatMap((line, i) => (/(?<!motion-safe:)\banimate-(spin|pulse)\b/.test(line) ? [`${f.replace(__dirname, "src")}:${i + 1}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});
