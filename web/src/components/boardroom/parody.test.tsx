import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Boardroom } from "./boardroom";
import { emotionFor, FACE_FALLBACK, FaceAvatar, SERIOUS, SettingsDialog } from "./parody";

const face = (c: HTMLElement) => c.querySelector("[data-emotion]")!.getAttribute("data-emotion");
const mockMotion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));

describe("faces", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("idle faces cycle only among serious expressions", () => {
    mockMotion(false);
    const { container } = render(<FaceAvatar emotion="neutral" idle />);
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      seen.add(face(container)!);
      act(() => { vi.advanceTimersByTime(4000); });
    }
    expect(seen.size).toBeGreaterThan(1);
    for (const e of seen) expect(SERIOUS).toContain(e);
    expect(seen.has("pleased")).toBe(false);
  });

  it("does not cycle under prefers-reduced-motion", () => {
    mockMotion(true);
    const { container } = render(<FaceAvatar emotion="neutral" idle />);
    const first = face(container);
    act(() => { vi.advanceTimersByTime(40000); });
    expect(face(container)).toBe(first);
    expect(first).toBe("neutral");
  });

  it("does not cycle unless asked to", () => {
    mockMotion(false);
    const { container } = render(<FaceAvatar emotion="thinking" />);
    act(() => { vi.advanceTimersByTime(20000); });
    expect(face(container)).toBe("thinking");
  });

  it("serious emotions never fall back to the happy photo", () => {
    for (const [e, chain] of Object.entries(FACE_FALLBACK)) {
      if (e === "pleased") continue;
      expect(chain).not.toContain("pleased");
    }
  });

  it("falls back to the placeholder, not the happy photo, when serious photos are missing", () => {
    mockMotion(false);
    const { container } = render(<FaceAvatar emotion="skeptical" />);
    const img = () => container.querySelector("img")!;
    const urls: string[] = [];
    for (let i = 0; i < 8; i++) {
      urls.push(img().getAttribute("src")!);
      act(() => { img().dispatchEvent(new Event("error")); });
    }
    expect(urls.some((u) => u.includes("pleased"))).toBe(false);
    expect(img().getAttribute("src")).toContain("placeholder.svg");
  });
});

describe("emotionFor", () => {
  it("does not return pleased for ordinary praise", () => {
    for (const t of ["Well done.", "I love this idea.", "That's a big deal.", "Nice work, good effort"]) expect(emotionFor(t)).not.toBe("pleased");
  });
  it("returns pleased for explicit deal or flawless phrases", () => {
    for (const t of ["I'm in.", "We have a deal.", "Flawless.", "Mabrouk, ya basha"]) expect(emotionFor(t)).toBe("pleased");
  });
  it("still says no deal means out", () => expect(emotionFor("No deal.")).toBe("im_out"));
});

describe("Ahmed Tarek mode switch", () => {
  it("is on by default in the demo team list", async () => {
    render(<Boardroom initialScreen="gate" />);
    expect(await screen.findByText("Ahmed Tarek")).toBeInTheDocument();
  });

  it("the settings switch turns him off", async () => {
    const user = userEvent.setup();
    render(<Boardroom initialScreen="gate" />);
    await user.click(await screen.findByRole("button", { name: /settings/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("switch"));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Ahmed Tarek")).not.toBeInTheDocument();
  });

  it("SettingsDialog reflects the checked state", async () => {
    const user = userEvent.setup();
    const on = vi.fn();
    render(<SettingsDialog tarekMode onTarekMode={on} />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    const sw = await screen.findByRole("switch");
    expect(sw).toBeChecked();
    await user.click(sw);
    expect(on).toHaveBeenCalledWith(false);
  });
});
