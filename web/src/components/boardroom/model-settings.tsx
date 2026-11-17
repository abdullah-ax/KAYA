"use client";

/* Bring-your-own-key model settings. Local Ollama is the default and needs
   nothing. A free-tier OpenAI-compatible endpoint is the fallback for
   machines that can't run the model. The key lives in this browser session
   only and is sent to our API per request, never stored or logged. */

import { CheckCircle2, Cpu, KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ApiProvider, ModelTestResult } from "@/lib/api";
import { cn } from "@/lib/utils";

type Provider = { id: string; name: string; model: string; note: string; needsKey: boolean };

export const PROVIDERS: Provider[] = [
  { id: "ollama", name: "Local, light", model: "qwen3:8b", note: "Free. Runs on a 16 GB laptop. Nothing leaves your machine.", needsKey: false },
  { id: "ollama-gpt-oss", name: "Local, stronger", model: "gpt-oss:20b", note: "Free. Better answers, slower. Needs about 16 GB free memory.", needsKey: false },
  { id: "groq", name: "Groq free tier", model: "Model set on the server", note: "Free key. Open-weight model, fast. Rate limited.", needsKey: true },
  { id: "openrouter", name: "OpenRouter free models", model: "Model set on the server", note: "Free key. Open-weight model. Slower at peak.", needsKey: true },
];

export type ConnState = "unset" | "testing" | "connected" | "invalid" | "rate_limited";

const STATE_TEXT: Record<ConnState, { text: string; tone: "muted" | "ok" | "bad" | "warn" }> = {
  unset: { text: "Not tested yet.", tone: "muted" },
  testing: { text: "Testing with one short request…", tone: "muted" },
  connected: { text: "Connected. Every log entry will name this model.", tone: "ok" },
  invalid: { text: "That key was refused. Check it and try again.", tone: "bad" },
  rate_limited: { text: "Free-tier limit hit. Wait a minute or switch to local.", tone: "warn" },
};

/** Local runs on Ollama. Every hosted choice is an OpenAI-compatible endpoint. */
export const apiProviderOf = (id: string): ApiProvider => (id.startsWith("ollama") ? "ollama" : "openai");

/** The Ollama model behind a local option; hosted options pick their model on the server. */
export const localModelOf = (id: string): string | undefined =>
  id.startsWith("ollama") ? PROVIDERS.find((x) => x.id === id)?.model : undefined;

export type ModelTest = (provider: ApiProvider, key: string, model?: string) => Promise<ModelTestResult>;

export function ConnectionStatus({ state, detail }: { state: ConnState; detail?: string }) {
  const s = STATE_TEXT[state];
  const Icon = state === "testing" ? Loader2 : state === "connected" ? CheckCircle2 : state === "unset" ? Cpu : TriangleAlert;
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 text-[15px] font-semibold",
        s.tone === "muted" && "text-muted-foreground",
        s.tone === "ok" && "text-primary",
        s.tone === "bad" && "text-destructive",
        s.tone === "warn" && "text-amber-800 dark:text-amber-300",
      )}
    >
      <Icon className={cn("size-4 shrink-0", state === "testing" && "motion-safe:animate-spin")} /> {detail || s.text}
    </p>
  );
}

export function ModelSettings({
  current,
  onChange,
  test: liveTest,
  installed,
}: {
  current: string;
  onChange: (id: string, key: string) => void;
  test?: ModelTest;
  /** Which local models Ollama has downloaded, from GET /models. */
  installed?: Record<string, boolean | null>;
}) {
  const [provider, setProvider] = useState(current);
  const [key, setKey] = useState("");
  const [state, setState] = useState<ConnState>("unset");
  const [detail, setDetail] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  // The model the server reported on the last good test, and the one in use now.
  const [tested, setTested] = useState<string | undefined>();
  const [inUse, setInUse] = useState<string | undefined>();
  const keyId = useId();
  const p = PROVIDERS.find((x) => x.id === provider)!;

  const test = async () => {
    setState("testing");
    setDetail(undefined);
    if (liveTest) {
      try {
        const r = await liveTest(apiProviderOf(provider), p.needsKey ? key.trim() : "", localModelOf(provider));
        if (r.ok) {
          setTested(r.model);
          return setState("connected");
        }
        setDetail(r.error || undefined);
        setState(/rate|429|quota/i.test(r.error ?? "") ? "rate_limited" : "invalid");
      } catch (e) {
        setDetail(e instanceof Error ? e.message : "Can't reach the API.");
        setState("invalid");
      }
      return;
    }
    // Demo only: no API is connected, so this is a stand-in.
    setTimeout(() => setState(!p.needsKey ? "connected" : key.trim().length < 20 ? "invalid" : "connected"), 900);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 rounded-full text-[14px]">
          {PROVIDERS.find((x) => x.id === current)?.needsKey ? <KeyRound className="size-4" /> : <Cpu className="size-4" />}
          AI ready
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">Model</DialogTitle>
          <DialogDescription className="text-base">
            Local is the default and costs nothing. Use a free key if your machine can't run the model.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={provider}
          onValueChange={(v) => {
            setProvider(v);
            setDetail(undefined);
            setState("unset");
          }}
          className="gap-2"
        >
          {PROVIDERS.map((x) => (
            <Label
              key={x.id}
              data-selected={provider === x.id || undefined}
              className="flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 font-normal hover:border-foreground/40 data-[selected]:border-foreground has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40"
            >
              <RadioGroupItem value={x.id} className="mt-1" />
              <span className="flex flex-col gap-0.5">
                <span className="font-bold">{x.name}</span>
                <span className="text-[15px]">{x.note}</span>
                {installed && localModelOf(x.id) && installed[localModelOf(x.id)!] === false && (
                  <span className="text-[14px] font-semibold text-amber-800 dark:text-amber-300">Still downloading. Pick the light model for now.</span>
                )}
              </span>
            </Label>
          ))}
        </RadioGroup>

        {p.needsKey && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={keyId} className="font-bold">API key</Label>
            <input
              id={keyId}
              type="password"
              autoComplete="off"
              value={key}
              aria-invalid={state === "invalid" || undefined}
              onChange={(e) => {
                setKey(e.target.value);
                setDetail(undefined);
                setState("unset");
              }}
              placeholder="Paste your key"
              className="h-11 rounded-lg border-2 bg-card px-3 font-mono text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-invalid:border-destructive"
            />
            <p className="text-[14px] text-muted-foreground">Kept in this browser tab only. Never saved, never logged.</p>
          </div>
        )}

        <ConnectionStatus state={state} detail={detail} />
        <details className="text-[15px]">
          <summary className="cursor-pointer font-semibold">Advanced</summary>
          <p className="mt-1 text-muted-foreground">
            Model: <span className="font-mono">{(state === "connected" && tested) || inUse || p.model}</span>
          </p>
        </details>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={test} disabled={state === "testing" || (p.needsKey && !key.trim())}>
            Test connection
          </Button>
          <Button
            onClick={() => {
              onChange(provider, p.needsKey ? key.trim() : "");
              setInUse(tested ?? localModelOf(provider));
              setOpen(false);
            }}
            disabled={state !== "connected"}
          >
            Use this model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
