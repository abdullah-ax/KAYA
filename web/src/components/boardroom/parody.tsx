"use client";

/* "Ahmed Tarek mode": a lighthearted PARODY shark modelled on a public Shark
   Tank Egypt investor. Off by default; switched on in Settings.
   Lines are an impression, not real quotes. Persona facts are sourced in
   prompts/easter_egg_parody_shark.md. */

import { Settings } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { cn } from "@/lib/utils";

export type FaceEmotion = "neutral" | "listening" | "thinking" | "talking" | "pleased" | "skeptical" | "im_out";

export const PARODY = {
  id: "ahmed_tarek",
  name: "Ahmed Tarek",
  role: "PARODY · Ahmed Tarek mode",
  fallback: "/mascots/ahmed_tarek/placeholder.svg",
};

/* One photo per expression. Missing photos fall back to the closest one we
   have, then to the placeholder, so the face never breaks. */
const FACE_FALLBACK: Record<FaceEmotion, FaceEmotion[]> = {
  neutral: ["neutral", "listening", "pleased"],
  listening: ["listening", "neutral", "pleased"],
  thinking: ["thinking", "listening", "neutral", "pleased"],
  talking: ["talking", "neutral", "pleased"],
  pleased: ["pleased"],
  skeptical: ["skeptical", "neutral", "pleased"],
  im_out: ["skeptical", "neutral", "pleased"],
};

export function FaceAvatar({ emotion = "neutral", size = 48, className }: { emotion?: FaceEmotion; size?: number; className?: string }) {
  const chain = [...FACE_FALLBACK[emotion].map((e) => `/mascots/ahmed_tarek/${e}.png`), PARODY.fallback];
  const [tries, setTries] = useState<Record<string, number>>({});
  const src = chain[Math.min(tries[emotion] ?? 0, chain.length - 1)];
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <span
        className={cn(
          "block size-full overflow-hidden rounded-full bg-[#fafaf7] ring-2 ring-offset-2 ring-offset-background transition-[filter,box-shadow] duration-300",
          emotion === "im_out" ? "ring-destructive grayscale" : emotion === "pleased" ? "ring-primary" : "ring-foreground",
          `face-${emotion}`,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={src}
          src={src}
          alt=""
          onError={() => setTries((t) => ({ ...t, [emotion]: (t[emotion] ?? 0) + 1 }))}
          className="size-full object-cover object-top motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        />
      </span>
      {emotion === "thinking" && (
        <span className="absolute -top-1 -right-2 rounded-full bg-background px-1.5 text-[13px] font-bold motion-safe:animate-pulse">…</span>
      )}
      {emotion === "skeptical" && (
        <span className="absolute -top-1 -right-2 rounded-full bg-background px-1.5 text-[14px] font-bold">?!</span>
      )}
      {emotion === "im_out" && size >= 56 && (
        <span className="stamp-in absolute -bottom-2 left-1/2 -translate-x-1/2 rounded border-2 border-destructive bg-background px-1.5 text-[12px] font-extrabold whitespace-nowrap text-destructive uppercase">
          I&apos;m out
        </span>
      )}
    </span>
  );
}

/* Pick his face from what he's saying. */
export function emotionFor(text: string): FaceEmotion {
  const t = text.toLowerCase();
  if (/i'?m out|no deal|not investing/.test(t)) return "im_out";
  if (/i'?m in|deal\b|love this|well done|mabrouk/.test(t)) return "pleased";
  if (/\?|prove|show me|really|why/.test(t)) return "skeptical";
  if (/let me think|do the math|margin/.test(t)) return "thinking";
  return "talking";
}

/* He listens, thinks, then speaks line by line. His face follows each line. */
const LINES = [
  "Ya basha, listen to me. 12 sign-ups from 40 students who already know you?",
  "That's not a market. That's your WhatsApp group.",
  "I come from logistics. If the cargo doesn't move, nobody gets paid. Show me money moving, not likes.",
  "Go sell 50 sheets to strangers at 120 EGP. Cash, not promises. Then we talk numbers.",
  "Until then, I'm out.",
];

export function ParodyVerdict() {
  // -2 listening, -1 thinking, 0..n speaking line i
  const [step, setStep] = useState(-2);
  const finished = step >= LINES.length - 1;
  useEffect(() => {
    if (finished) return;
    const ms = step === -2 ? 1300 : step === -1 ? 1500 : 900 + LINES[step].length * 28;
    const t = setTimeout(() => setStep((x) => x + 1), ms);
    return () => clearTimeout(t);
  }, [step, finished]);

  const emotion: FaceEmotion = step === -2 ? "listening" : step === -1 ? "thinking" : emotionFor(LINES[step]);
  const label: Record<FaceEmotion, string> = {
    neutral: "", listening: "Listening…", thinking: "Doing the math…", talking: "Speaking",
    pleased: "Impressed", skeptical: "Not convinced", im_out: "I'm out",
  };

  return (
    <div className={cn("my-2 flex flex-col gap-3 rounded-xl border-2 bg-card p-4 transition-colors", emotion === "im_out" ? "border-destructive/50" : "border-foreground/20")}>
      <div className="flex items-center gap-4">
        <FaceAvatar emotion={emotion} size={80} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{PARODY.name}</span>
            <span className="rounded border border-sky-800/30 bg-sky-50 px-1.5 text-[12px] font-bold text-sky-900 uppercase dark:bg-sky-950 dark:text-sky-200">Parody</span>
          </div>
          <div aria-live="polite" className={cn("text-[15px] font-bold", emotion === "im_out" ? "text-destructive" : emotion === "pleased" ? "text-primary" : "text-muted-foreground")}>
            {label[emotion]}
          </div>
        </div>
        {!finished && (
          <button onClick={() => setStep(LINES.length - 1)} className="rounded-full px-3 py-1 text-[14px] font-semibold text-muted-foreground outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40">Skip</button>
        )}
      </div>
      {step < 0 ? (
        <div className="flex flex-col gap-2" aria-busy>
          <span className="h-4 w-11/12 animate-pulse rounded bg-muted" />
          <span className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 text-base leading-snug">
          {LINES.slice(0, step + 1).map((l, k) => (
            <p key={k} className={cn("motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1", k === step && !finished && "font-semibold")}>{l}</p>
          ))}
        </div>
      )}
      {finished && (
        <p className="text-[15px] text-muted-foreground"><b className="text-foreground">Would change my mind:</b> 50 paid orders from strangers.</p>
      )}
      <p className="text-[13px] text-muted-foreground">Parody for fun. Not affiliated with or endorsed by the real person. Not investment advice.</p>
    </div>
  );
}

export function SettingsDialog({ tarekMode, onTarekMode }: { tarekMode: boolean; onTarekMode: (v: boolean) => void }) {
  const id = useId();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full" aria-label="Settings">
          <Settings className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Settings</DialogTitle>
          <DialogDescription className="text-base">Change these before a run.</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-4 rounded-xl border-2 p-4 has-[[data-state=checked]]:border-foreground">
          <FaceAvatar emotion={tarekMode ? "talking" : "neutral"} size={52} />
          <div className="flex-1">
            <Label htmlFor={id} className="text-base font-bold">Ahmed Tarek mode</Label>
            <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
              A tough parody shark joins the panel. Blunt, numbers first, no mercy. For fun, not affiliated with the real person.
            </p>
          </div>
          <Switch id={id} checked={tarekMode} onCheckedChange={onTarekMode} className="mt-1" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
