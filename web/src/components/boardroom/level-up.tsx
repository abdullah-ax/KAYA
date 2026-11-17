"use client";

/* The pause between stages. A stage passed its gate; the founder can move on
   now or keep talking with the co-founder first. Nothing moves without a click. */

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError, nextStage, type Pending, type Run } from "@/lib/api";

export type LevelUp = Extract<Pending, { kind: "level_up" }>;

/** Level-up state for a run: the dialog opens once per finished stage; Go posts /next. */
export function useLevelUp(run: Run, update: (r: Run) => void) {
  const pending = run.pending?.kind === "level_up" ? run.pending : null;
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      update(await nextStage(run.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't move on. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return {
    pending,
    open: !!pending && dismissed !== pending.done,
    keepTalking: () => { if (pending) setDismissed(pending.done); },
    go,
    busy,
    error,
  };
}

export function LevelUpDialog({ pending, open, onGo, onKeepTalking, busy = false, error }: {
  pending: LevelUp;
  open: boolean;
  onGo: () => void;
  onKeepTalking: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const go = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onKeepTalking(); }}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => { e.preventDefault(); go.current?.focus(); }}
        className="gap-5 rounded-2xl p-8 sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle className="text-[32px] leading-tight font-extrabold">{pending.stage === "Build" ? "Build plan ready" : `${pending.stage} complete`}</DialogTitle>
          <DialogDescription className="text-base text-foreground">{pending.proof}</DialogDescription>
        </DialogHeader>
        <p className="text-xl font-semibold">Next level: Stage {pending.done + 1}, {pending.next}</p>
        {error && <p role="alert" className="text-base font-semibold text-destructive">{error}</p>}
        <DialogFooter className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 sm:justify-normal">
          <Button variant="outline" size="lg" className="w-full rounded-full text-base" onClick={onKeepTalking}>Keep talking with the co-founder</Button>
          <Button ref={go} size="lg" className="w-full rounded-full text-base font-bold" onClick={onGo} disabled={busy}>Go to {pending.next}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
