"use client";

/* Reusable Boardroom building blocks. Each is a thin layer over shadcn/ui
   primitives and owns its full set of states. */

import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, BookOpen, Check, Compass, ExternalLink, GraduationCap, Loader2, PlayCircle, ScrollText, ShieldAlert, X } from "lucide-react";
import Image from "next/image";
import { useId, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* ---------- StatusBadge: honest labels the rules require ---------- */

const statusBadge = cva("rounded-md border px-2 py-0.5 text-[13px] font-bold tracking-wide uppercase", {
  variants: {
    status: {
      working: "border-primary/30 bg-accent text-accent-foreground",
      mocked: "border-amber-700/30 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
      stubbed: "border-border bg-muted text-muted-foreground",
      simulation: "border-sky-800/30 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
      stop: "border-destructive/40 bg-stop-bg text-destructive",
    },
  },
  defaultVariants: { status: "stubbed" },
});

export function StatusBadge({ status, children }: VariantProps<typeof statusBadge> & { children?: ReactNode }) {
  return <span className={statusBadge({ status })}>{children ?? status}</span>;
}

/* ---------- MascotAvatar: activity ring + expression ---------- */

export type Activity = "idle" | "thinking" | "speaking" | "done" | "error";
export type Expression = "neutral" | "listening" | "thinking" | "pleased" | "skeptical" | "im_out" | "avatar";

const ring: Record<Activity, string> = {
  idle: "ring-border",
  thinking: "ring-primary/60 motion-safe:animate-pulse",
  speaking: "ring-primary",
  done: "ring-primary/40",
  error: "ring-destructive",
};

export function MascotAvatar({
  id,
  expression = "avatar",
  activity = "idle",
  size = 44,
  className,
}: {
  id: string;
  expression?: Expression;
  activity?: Activity;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 rounded-full bg-[#fafaf7] ring-2 ring-offset-2 ring-offset-background", ring[activity], className)}
      style={{ width: size, height: size }}
    >
      <Image
        src={`/mascots/${id}/${expression}.png`}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-contain"
      />
      {activity === "thinking" && (
        <span className="absolute -right-1 -bottom-1 rounded-full bg-background p-0.5">
          <Loader2 className="size-3.5 animate-spin text-primary" aria-label="Thinking" />
        </span>
      )}
      {activity === "error" && (
        <span className="absolute -right-1 -bottom-1 rounded-full bg-destructive p-0.5 text-white">
          <X className="size-3" aria-label="Error" />
        </span>
      )}
    </span>
  );
}

/* ---------- RosterItem: one teammate in the left rail ---------- */

export function RosterItem({
  id,
  name,
  role,
  active = false,
  activity = "idle",
  status,
  disabled = false,
  onSelect,
}: {
  id: string;
  name: string;
  role: string;
  active?: boolean;
  activity?: Activity;
  status?: string;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
        "hover:bg-muted focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
        "disabled:pointer-events-none disabled:opacity-45",
        active && "bg-accent hover:bg-accent",
      )}
    >
      <MascotAvatar id={id} activity={activity} size={40} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-base font-semibold", active && "text-accent-foreground")}>{name}</span>
        <span className="block truncate text-[14px] text-muted-foreground">{role}</span>
      </span>
      {status && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-bold text-primary">{status}</span>
      )}
    </button>
  );
}

/* ---------- OptionCard: one choice at a gate (use inside RadioGroup) ---------- */

export function OptionCard({
  value,
  label,
  body,
  cost,
  risk,
  selected,
  recommended = false,
  disabled = false,
}: {
  value: string;
  label: string;
  body: string;
  cost: string;
  risk: string;
  selected: boolean;
  recommended?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Label
      htmlFor={id}
      data-selected={selected || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        "relative flex cursor-pointer flex-col items-start gap-2 rounded-xl border-2 bg-card p-4 font-normal transition-[border-color,box-shadow]",
        "hover:border-foreground/40 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40",
        "data-[selected]:border-foreground data-[selected]:shadow-[0_1px_0_0_var(--foreground)]",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      )}
    >
      <span className="flex w-full items-center gap-2.5">
        <RadioGroupItem id={id} value={value} disabled={disabled} className="size-5" />
        <span className="text-xl font-bold">{label}</span>
      </span>
      {recommended && <span className="text-[13px] font-bold tracking-wide text-destructive uppercase">Recommended</span>}
      <span className="text-base leading-snug">{body}</span>
      <span className="text-[14px] leading-snug text-muted-foreground">
        <b className="text-foreground">Cost:</b> {cost} · <b className="text-foreground">Risk:</b> {risk}
      </span>
    </Label>
  );
}

/* ---------- ReasonField: the founder's own words, no bare yes ---------- */

export const BARE_ANSWERS = ["yes", "y", "ok", "okay", "sure", "fine", "looks good", "lgtm", "go", "next", "approve"];

export type ReasonCheck =
  | { state: "empty" }
  | { state: "bare"; message: string }
  | { state: "short"; message: string; words: number }
  | { state: "valid"; words: number };

export function checkReason(text: string, minWords: number, alternative?: string): ReasonCheck {
  const clean = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (!clean) return { state: "empty" };
  if (BARE_ANSWERS.includes(clean))
    return { state: "bare", message: `“${text.trim()}” isn't a reason.${alternative ? ` What would make you pick ${alternative} instead?` : ""}` };
  const words = clean.split(/\s+/).length;
  if (words < minWords) return { state: "short", words, message: `${minWords - words} more words. Say why, in your own words.` };
  return { state: "valid", words };
}

export function ReasonField({
  value,
  onChange,
  check,
  minWords,
  disabled = false,
  label = "Why this option? In your own words.",
}: {
  value: string;
  onChange: (v: string) => void;
  check: ReasonCheck;
  minWords: number;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const invalid = check.state === "bare" || check.state === "short";
  const words = check.state === "valid" || check.state === "short" ? check.words : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <Label htmlFor={id} className="text-base font-bold">{label}</Label>
        <span className={cn("text-[14px] tabular-nums", check.state === "valid" ? "text-primary font-semibold" : "text-muted-foreground")}>
          {words}/{minWords} words
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-msg`}
        onChange={(e) => onChange(e.target.value)}
        placeholder="I picked this because…"
        className="min-h-24 rounded-xl border-2 bg-card text-base md:text-base"
      />
      <p id={`${id}-msg`} aria-live="polite" className="min-h-6 text-base font-semibold">
        {invalid && <span className="text-destructive">{check.message}</span>}
        {check.state === "valid" && (
          <span className="inline-flex items-center gap-1.5 text-primary"><Check className="size-4" /> That's a reason.</span>
        )}
      </p>
    </div>
  );
}

/* ---------- SourceCard: every claim gets one ---------- */

const trustStyle = {
  high: "bg-accent text-accent-foreground border-primary/30",
  medium: "bg-muted text-foreground border-border",
  low: "bg-amber-50 text-amber-900 border-amber-700/30 dark:bg-amber-950 dark:text-amber-200",
} as const;

export function SourceCard({
  n,
  title,
  url,
  trust,
  backs,
  state = "ready",
}: {
  n: number;
  title: string;
  url: string;
  trust: "high" | "medium" | "low";
  backs: string;
  state?: "ready" | "loading" | "broken";
}) {
  if (state === "loading") {
    return (
      <div className="flex gap-3 rounded-xl border bg-card p-3" aria-busy>
        <span className="size-7 shrink-0 animate-pulse rounded-md bg-muted" />
        <span className="flex flex-1 flex-col gap-2">
          <span className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <span className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
        </span>
      </div>
    );
  }
  const isLink = url.startsWith("http");
  return (
    <div className={cn("flex gap-3 rounded-xl border bg-card p-3", state === "broken" && "border-destructive/50")}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground text-[14px] font-bold text-background">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {isLink ? (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline focus-visible:underline">
              {title} <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <span className="font-semibold">{title}</span>
          )}
          <span className={cn("rounded border px-1.5 text-[13px] font-semibold", trustStyle[trust])}>{trust} trust</span>
        </div>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">Backs: “{backs}”</p>
        {trust === "low" && state !== "broken" && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[14px] font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-3.5" /> Can't back a gate decision alone.
          </p>
        )}
        {state === "broken" && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[14px] font-semibold text-destructive">
            <ShieldAlert className="size-3.5" /> Link didn't load. Claim now labelled ASSUMPTION.
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- VerdictCard: shark or judge ---------- */

export function VerdictCard({
  id,
  name,
  verdict,
  reason,
  change,
}: {
  id: string;
  name: string;
  verdict: "in" | "out" | "pending";
  reason: string;
  change?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border-2 bg-card p-4",
        verdict === "in" && "border-primary/50",
        verdict === "out" && "border-destructive/40",
      )}
    >
      <div className="flex items-center gap-3">
        <MascotAvatar
          id={id}
          size={48}
          expression={verdict === "out" ? "im_out" : verdict === "in" ? "pleased" : "thinking"}
          activity={verdict === "pending" ? "thinking" : "idle"}
        />
        <div className="flex-1">
          <div className="font-bold">{name}</div>
          {verdict === "pending" ? (
            <div className="text-[14px] text-muted-foreground">Thinking…</div>
          ) : (
            <div className={cn("text-[15px] font-bold", verdict === "in" ? "text-primary" : "text-destructive")}>
              {verdict === "in" ? "I'm in" : "I'm out"}
            </div>
          )}
        </div>
      </div>
      {verdict === "pending" ? (
        <span className="h-4 w-4/5 animate-pulse rounded bg-muted" />
      ) : (
        <>
          <p className="text-base leading-snug">{reason}</p>
          {change && (
            <p className="text-[15px] leading-snug text-muted-foreground"><b className="text-foreground">Would change my mind:</b> {change}</p>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- EmptyState ---------- */

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { label: string; onClick?: () => void } }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-5">
      <div className="font-bold">{title}</div>
      <p className="text-[15px] text-muted-foreground">{body}</p>
      {action && <Button variant="outline" size="sm" onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}

export { Badge };

/* ---------- LearnCard: short, linked, one line on why it matters now ---------- */


const learnIcon = { Video: PlayCircle, Essay: ScrollText, Book: BookOpen, Course: GraduationCap, Map: Compass } as const;

export function LearnCard({
  kind,
  org,
  title,
  url,
  why,
  done = false,
}: {
  kind: keyof typeof learnIcon;
  org: string;
  title: string;
  url: string;
  why: string;
  done?: boolean;
}) {
  const Icon = learnIcon[kind];
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "group flex gap-3 rounded-xl border bg-card p-3 outline-none transition-colors",
        "hover:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/40",
        done && "opacity-60",
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-muted-foreground">{kind} · {org}{done && " · Done"}</span>
        <span className="block font-semibold leading-snug group-hover:underline underline-offset-4">{title}</span>
        <span className="mt-0.5 block text-[15px] leading-snug text-muted-foreground">{why}</span>
      </span>
    </a>
  );
}

/* ---------- CaseStudyCard: a real startup, ideally from the region ---------- */

export function CaseStudyCard({
  company,
  market,
  lesson,
  fact,
  url,
  source,
}: {
  company: string;
  market: string;
  lesson: string;
  fact: string;
  url: string;
  source: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border-l-4 border-primary bg-accent/50 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-bold tracking-wide text-accent-foreground uppercase">Case study</span>
        <span className="font-bold">{company}</span>
        <span className="text-[14px] text-muted-foreground">{market}</span>
      </div>
      <p className="text-base font-semibold leading-snug">{lesson}</p>
      <p className="text-[15px] leading-snug">{fact}</p>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-[14px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:underline">
        Source: {source} <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}
