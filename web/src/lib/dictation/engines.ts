/* Speech to text engines. Whisper runs in the browser (no audio leaves the
   device). The browser's own speech service is the fallback and is labelled. */

export type Lang = "en" | "ar";
export type ErrorKind = "permission-denied" | "unsupported" | "failed";

export class DictationError extends Error {
  constructor(public kind: ErrorKind, message: string) {
    super(message);
  }
}

export type Hooks = { onProgress: (percent: number) => void };
export type Session = { stop: () => Promise<string>; cancel: () => void };
export type Engine = {
  kind: "whisper" | "browser";
  supported: () => boolean;
  start: (lang: Lang, hooks: Hooks) => Promise<Session>;
};
export type Transcriber = { transcribe: (audio: Float32Array, lang: Lang) => Promise<string> };

export const WHISPER_MODEL = "onnx-community/whisper-base";
const WHISPER_LANG: Record<Lang, string> = { en: "english", ar: "arabic" };
const BROWSER_LANG: Record<Lang, string> = { en: "en-US", ar: "ar-EG" };

export async function createTransformersTranscriber(onProgress: (n: number) => void): Promise<Transcriber> {
  const { pipeline } = await import("@huggingface/transformers");
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const asr = (await pipeline("automatic-speech-recognition", WHISPER_MODEL, {
    device: gpu ? "webgpu" : "wasm",
    progress_callback: (p: { status?: string; progress?: number }) => {
      if (p.status === "progress" && typeof p.progress === "number") onProgress(Math.round(p.progress));
    },
  } as never)) as unknown as (a: Float32Array, o: object) => Promise<{ text: string } | { text: string }[]>;
  return {
    async transcribe(audio, lang) {
      const out = await asr(audio, { language: WHISPER_LANG[lang], task: "transcribe", chunk_length_s: 30 });
      return (Array.isArray(out) ? out[0] : out).text.trim();
    },
  };
}

async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    return (await ctx.decodeAudioData(buf)).getChannelData(0);
  } finally {
    void ctx.close();
  }
}

type WhisperDeps = {
  load?: (onProgress: (n: number) => void) => Promise<Transcriber>;
  decode?: (blob: Blob) => Promise<Float32Array>;
};

export function createWhisperEngine({ load = createTransformersTranscriber, decode = decodeTo16k }: WhisperDeps = {}): Engine {
  let loaded: Promise<Transcriber> | null = null;
  const supported = () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  return {
    kind: "whisper",
    supported,
    async start(lang, hooks) {
      if (!supported()) throw new DictationError("unsupported", "Recording is not available in this browser.");
      loaded ??= load(hooks.onProgress).catch((e) => { loaded = null; throw e; });
      const transcriber = await loaded;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        const name = (e as { name?: string }).name;
        if (name === "NotAllowedError" || name === "SecurityError") throw new DictationError("permission-denied", "Microphone blocked.");
        throw new DictationError("failed", "No microphone found.");
      }
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      const release = () => stream.getTracks().forEach((t) => t.stop());
      rec.start();
      return {
        stop: () =>
          new Promise<string>((resolve, reject) => {
            rec.onstop = () => {
              release();
              decode(new Blob(chunks))
                .then((audio) => transcriber.transcribe(audio, lang))
                .then((t) => resolve(t.trim()))
                .catch(() => reject(new DictationError("failed", "Could not transcribe.")));
            };
            rec.stop();
          }),
        cancel: () => {
          rec.onstop = null;
          if (rec.state !== "inactive") rec.stop();
          release();
        },
      };
    },
  };
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionCtor(): (new () => Recognition) | undefined {
  const w = globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function createWebSpeechEngine(): Engine {
  return {
    kind: "browser",
    supported: () => !!recognitionCtor(),
    async start(lang) {
      const Ctor = recognitionCtor();
      if (!Ctor) throw new DictationError("unsupported", "Speech service not available.");
      const r = new Ctor();
      r.lang = BROWSER_LANG[lang];
      r.continuous = true;
      r.interimResults = false;
      let text = "";
      let error: DictationError | null = null;
      let done: (() => void) | null = null;
      r.onresult = (e) => {
        text = Array.from(e.results).map((x) => x[0].transcript).join(" ").trim();
      };
      r.onerror = (e) => {
        error = e.error === "not-allowed" || e.error === "service-not-allowed"
          ? new DictationError("permission-denied", "Microphone blocked.")
          : e.error === "no-speech" || e.error === "aborted" ? null : new DictationError("failed", "Speech service failed.");
        if (e.error === "not-allowed" || e.error === "service-not-allowed" || error) done?.();
      };
      r.onend = () => done?.();
      r.start();
      return {
        stop: () =>
          new Promise<string>((resolve, reject) => {
            done = () => (error ? reject(error) : resolve(text));
            r.stop();
          }),
        cancel: () => {
          r.onend = null;
          r.abort();
        },
      };
    },
  };
}
