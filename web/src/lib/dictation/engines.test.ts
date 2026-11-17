import { afterEach, describe, expect, it, vi } from "vitest";

import { createTransformersTranscriber, createWebSpeechEngine, createWhisperEngine, DictationError } from "./engines";

const hooks = { onProgress: () => {} };

function fakeStream() {
  const stop = vi.fn();
  return { stop, stream: { getTracks: () => [{ stop }] } as unknown as MediaStream };
}

class FakeRecorder {
  static last: FakeRecorder;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = "inactive";
  constructor(public stream: MediaStream) { FakeRecorder.last = this; }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["abc"]) });
    this.onstop?.();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("whisper engine", () => {
  function setup() {
    const { stream, stop } = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const transcriber = { transcribe: vi.fn().mockResolvedValue("  hello there ") };
    const load = vi.fn().mockResolvedValue(transcriber);
    const engine = createWhisperEngine({ load, decode: async () => new Float32Array([0.1]) });
    return { engine, load, transcriber, getUserMedia, stop };
  }

  it("loads the model once, reports progress, records, then transcribes locally", async () => {
    const { engine, load, transcriber, stop } = setup();
    load.mockImplementation(async (p: (n: number) => void) => { p(40); return transcriber; });
    const progress: number[] = [];
    const s = await engine.start("en", { onProgress: (n) => progress.push(n) });
    expect(progress).toEqual([40]);
    expect(await s.stop()).toBe("hello there");
    expect(transcriber.transcribe).toHaveBeenCalledWith(expect.any(Float32Array), "en");
    expect(stop).toHaveBeenCalled();
    await engine.start("ar", hooks);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("maps a denied microphone to permission-denied", async () => {
    const { engine, getUserMedia } = setup();
    getUserMedia.mockRejectedValue(Object.assign(new Error("no"), { name: "NotAllowedError" }));
    await expect(engine.start("en", hooks)).rejects.toMatchObject({ kind: "permission-denied" });
  });

  it("cancel stops the mic and never transcribes", async () => {
    const { engine, transcriber, stop } = setup();
    const s = await engine.start("ar", hooks);
    s.cancel();
    expect(stop).toHaveBeenCalled();
    expect(transcriber.transcribe).not.toHaveBeenCalled();
  });

  it("reports unsupported when there is no MediaRecorder", async () => {
    const { engine } = setup();
    vi.stubGlobal("MediaRecorder", undefined);
    expect(engine.supported()).toBe(false);
    await expect(engine.start("en", hooks)).rejects.toBeInstanceOf(DictationError);
  });
});

class FakeRecognition {
  static last: FakeRecognition;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() { FakeRecognition.last = this; }
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
}

describe("web speech engine", () => {
  const result = (t: string) => ({ results: [[{ transcript: t }]] });

  it("uses the chosen language and returns the transcript on stop", async () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const s = await createWebSpeechEngine().start("ar", hooks);
    expect(FakeRecognition.last.lang).toBe("ar-EG");
    FakeRecognition.last.onresult?.(result("مرحبا"));
    expect(await s.stop()).toBe("مرحبا");
  });

  it("maps not-allowed to permission-denied", async () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const s = await createWebSpeechEngine().start("en", hooks);
    FakeRecognition.last.onerror?.({ error: "not-allowed" });
    await expect(s.stop()).rejects.toMatchObject({ kind: "permission-denied" });
  });

  it("is unsupported without the browser API", () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    expect(createWebSpeechEngine().supported()).toBe(false);
  });
});

describe("transformers transcriber", () => {
  it("loads whisper lazily and asks for the right language", async () => {
    const run = vi.fn().mockResolvedValue({ text: " مرحبا " });
    const pipeline = vi.fn().mockImplementation(async (_t: string, _m: string, o: { progress_callback: (p: unknown) => void }) => {
      o.progress_callback({ status: "progress", progress: 55 });
      return run;
    });
    vi.doMock("@huggingface/transformers", () => ({ pipeline }));
    const seen: number[] = [];
    const t = await createTransformersTranscriber((n) => seen.push(n));
    expect(seen).toEqual([55]);
    expect(pipeline.mock.calls[0][0]).toBe("automatic-speech-recognition");
    expect(await t.transcribe(new Float32Array(1), "ar")).toBe("مرحبا");
    expect(run.mock.calls[0][1]).toMatchObject({ language: "arabic", task: "transcribe" });
    vi.doUnmock("@huggingface/transformers");
  });
});
