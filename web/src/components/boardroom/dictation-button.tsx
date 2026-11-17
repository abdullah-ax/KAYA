"use client";

/* Mic button for free-text answers. It only ever hands text back through
   onText; the founder edits it and sends it themselves. */

import { Loader2, Mic, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  createWebSpeechEngine,
  createWhisperEngine,
  DictationError,
  type Engine,
  type Lang,
  type Session,
} from "@/lib/dictation/engines";

type Phase = "idle" | "starting" | "recording" | "transcribing" | "done" | "denied" | "error";

const defaultEngines = (): Engine[] => [createWhisperEngine(), createWebSpeechEngine()];

export function DictationButton({ onText, engines, className }: { onText: (text: string) => void; engines?: Engine[]; className?: string }) {
  const list = useMemo(() => engines ?? defaultEngines(), [engines]);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const session = useRef<Session | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    setEngine(list.find((e) => e.supported()) ?? null);
  }, [list]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      session.current?.cancel();
    };
  }, []);

  if (!engine) return null;
  const local = engine.kind === "whisper";

  const fail = (e: unknown) => {
    if (mounted.current) setPhase(e instanceof DictationError && e.kind === "permission-denied" ? "denied" : "error");
  };

  async function toggle() {
    if (!engine || phase === "starting" || phase === "transcribing") return;
    if (phase === "recording" && session.current) {
      const s = session.current;
      session.current = null;
      setPhase("transcribing");
      try {
        const text = (await s.stop()).trim();
        if (!mounted.current) return;
        if (text) onText(text);
        setPhase("done");
      } catch (e) {
        fail(e);
      }
      return;
    }
    setPhase("starting");
    setProgress(null);
    try {
      session.current = await engine.start(lang, { onProgress: (n) => mounted.current && setProgress(n) });
      if (mounted.current) setPhase("recording");
    } catch (e) {
      fail(e);
    }
  }

  const recording = phase === "recording";
  const busy = phase === "starting" || phase === "transcribing";
  const message: Record<Phase, string> = {
    idle: local ? "Your voice is turned into text on this device." : "Uses your browser's speech service.",
    starting: local
      ? `Getting the voice model ready${progress != null ? `, ${progress}%` : ""}. It downloads once and stays on your device.`
      : "Getting ready.",
    recording: "Listening. Press again to stop.",
    transcribing: "Turning your voice into text.",
    done: "Added. Edit it before you send.",
    denied: "Your microphone is blocked. Allow it in your browser settings, then try again.",
    error: "That did not work. Try again.",
  };
  const failed = phase === "denied" || phase === "error";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-disabled={busy || undefined}
        aria-label={recording ? "Stop voice input" : "Start voice input"}
        className={cn(
          "flex size-9 items-center justify-center rounded-full border-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          recording ? "border-destructive text-destructive" : "border-input text-muted-foreground hover:text-foreground",
        )}
      >
        {busy ? <Loader2 className="size-4 motion-safe:animate-spin" /> : recording ? <Square className="size-3.5 fill-current motion-safe:animate-pulse" /> : <Mic className="size-4" />}
      </button>
      <div role="group" aria-label="Voice language" className="flex gap-1 text-[14px] font-semibold">
        {([["en", "English"], ["ar", "العربية"]] as const).map(([code, name]) => (
          <button
            key={code}
            type="button"
            aria-pressed={lang === code}
            disabled={recording || busy}
            onClick={() => setLang(code)}
            className={cn("rounded-full px-3 py-1", lang === code ? "bg-foreground text-background" : "text-muted-foreground")}
          >
            {name}
          </button>
        ))}
      </div>
      <p role={failed ? "alert" : "status"} aria-live="polite" className={cn("text-[14px]", failed ? "text-destructive" : "text-muted-foreground")}>
        {message[phase]}
      </p>
    </div>
  );
}
