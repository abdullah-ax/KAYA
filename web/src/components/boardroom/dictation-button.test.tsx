import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DictationError, type Engine } from "@/lib/dictation/engines";
import { DictationButton } from "./dictation-button";

afterEach(cleanup);

function engine(over: Partial<Engine> & { text?: string } = {}): Engine & { start: ReturnType<typeof vi.fn> } {
  const { text = "I sell tea", ...rest } = over;
  return {
    kind: "whisper",
    supported: () => true,
    start: vi.fn().mockResolvedValue({ stop: vi.fn().mockResolvedValue(text), cancel: vi.fn() }),
    ...rest,
  } as never;
}

describe("DictationButton", () => {
  it("records, transcribes, and hands the text over without sending anything", async () => {
    const onText = vi.fn();
    render(<DictationButton onText={onText} engines={[engine()]} />);
    await userEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    expect(await screen.findByRole("button", { name: /stop voice input/i })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/listening/i);
    await userEvent.click(screen.getByRole("button", { name: /stop voice input/i }));
    await waitFor(() => expect(onText).toHaveBeenCalledWith("I sell tea"));
    expect(screen.getByRole("status").textContent).toMatch(/edit/i);
  });

  it("shows model download progress, then recording", async () => {
    let release!: () => void;
    const e = engine();
    e.start.mockImplementation((_l: string, h: { onProgress: (n: number) => void }) =>
      new Promise((res) => {
        h.onProgress(42);
        release = () => res({ stop: async () => "x", cancel: () => {} });
      }));
    render(<DictationButton onText={() => {}} engines={[e]} />);
    await userEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    expect(await screen.findByText(/42%/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/stays on your device/i);
    await act(async () => release());
    expect(screen.getByRole("status").textContent).toMatch(/listening/i);
  });

  it("explains a blocked microphone in plain words", async () => {
    const e = engine();
    e.start.mockRejectedValue(new DictationError("permission-denied", "x"));
    render(<DictationButton onText={() => {}} engines={[e]} />);
    await userEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/microphone is blocked/i);
  });

  it("shows a failure message and lets the founder try again", async () => {
    const e = engine();
    e.start.mockRejectedValueOnce(new DictationError("failed", "x"));
    render(<DictationButton onText={() => {}} engines={[e]} />);
    await userEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/try again/i);
    await userEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    expect(await screen.findByRole("button", { name: /stop voice input/i })).toBeTruthy();
  });

  it("passes the chosen language to the engine", async () => {
    const e = engine();
    render(<DictationButton onText={() => {}} engines={[e]} />);
    const ar = screen.getByRole("button", { name: "العربية" });
    expect(ar.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(ar);
    expect(ar.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    expect(e.start.mock.calls[0][0]).toBe("ar");
  });

  it("falls back to the browser speech service and says so", async () => {
    const whisper = engine({ supported: () => false });
    const browser = engine({ kind: "browser", text: "hi" });
    render(<DictationButton onText={() => {}} engines={[whisper, browser]} />);
    expect(screen.getByText(/uses your browser's speech service/i)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    expect(browser.start).toHaveBeenCalled();
    expect(whisper.start).not.toHaveBeenCalled();
  });

  it("renders nothing when no engine works", () => {
    const { container } = render(<DictationButton onText={() => {}} engines={[engine({ supported: () => false })]} />);
    expect(container.innerHTML).toBe("");
  });

  it("works from the keyboard with Space", async () => {
    const onText = vi.fn();
    render(<DictationButton onText={onText} engines={[engine()]} />);
    screen.getByRole("button", { name: /start voice input/i }).focus();
    await userEvent.keyboard(" ");
    const stop = await screen.findByRole("button", { name: /stop voice input/i });
    expect(document.activeElement).toBe(stop);
    await userEvent.keyboard(" ");
    await waitFor(() => expect(onText).toHaveBeenCalled());
  });
});
