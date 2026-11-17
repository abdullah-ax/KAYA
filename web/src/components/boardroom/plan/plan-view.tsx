"use client";

/* The living business plan: a full-screen document the founder can open at any point.
   Left: outline and version history. Center: the document. Right: Ahmed Tarek (parody) per section. */

import { ArrowLeft, Download, FileText, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlan, getPlanVersion, planMarkdownUrl, type Plan, type PlanSection, type PlanSnapshot, type PlanVersionMeta } from "@/lib/api";
import { cn } from "@/lib/utils";

import { FaceAvatar } from "../parody";
import { SourceCard } from "../ui";
import { DEMO_PLAN, demoMarkdown, demoSnapshot } from "./plan-demo";
import { PlanMarkdown } from "./plan-markdown";

const DISCLAIMER = "Parody for fun. Not affiliated with or endorsed by the real person. Not investment advice.";
const SEVERITY = { high: "text-destructive", medium: "text-destructive", low: "text-muted-foreground" } as const;
type Pane = "outline" | "doc" | "critique";

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function EventBadge({ event }: { event: PlanVersionMeta["event"] }) {
  if (event !== "pivot" && event !== "stop") return null;
  return (
    <span className={cn("rounded border px-1.5 text-[12px] font-bold uppercase", event === "stop" ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-amber-700/40 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200")}>
      {event === "stop" ? "Stop" : "Pivot"}
    </span>
  );
}

function goTo(id: string) {
  document.getElementById(`plan-${id}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function Loading() {
  return (
    <div className="flex flex-col gap-4 p-6" aria-busy aria-label="Loading the plan">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function PlanView({ runId, live, refreshKey }: { runId: string | null; live: boolean; refreshKey?: string }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [snap, setSnap] = useState<PlanSnapshot | null>(null);
  const [pane, setPane] = useState<Pane>("doc");
  const demo = !live;
  const empty = live && !runId;

  const load = useCallback(() => {
    if (demo) { setPlan(DEMO_PLAN); return; }
    if (!runId) { setPlan(null); return; }
    setLoading(true);
    setError(null);
    getPlan(runId)
      .then((p) => setPlan(p))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the plan."))
      .finally(() => setLoading(false));
  }, [demo, runId]);

  useEffect(() => { if (open) load(); }, [open, load, refreshKey]);

  const openVersion = async (n: number) => {
    try {
      setSnap(demo ? demoSnapshot(n) : await getPlanVersion(runId!, n));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that version.");
    }
  };

  const shown: PlanSection[] = snap ? snap.sections : plan?.sections ?? [];
  const changed = useMemo(() => {
    if (!snap || !plan) return [];
    return plan.sections.filter((s) => s.body_markdown !== (snap.sections.find((x) => x.id === s.id)?.body_markdown ?? "")).map((s) => s.title);
  }, [snap, plan]);
  const critique = (id: string) => plan?.critique.find((c) => c.section === id);
  const mdHref = demo ? `data:text/markdown;charset=utf-8,${encodeURIComponent(demoMarkdown(DEMO_PLAN))}` : runId ? planMarkdownUrl(runId) : undefined;
  const jump = (id: string) => { setPane("doc"); setTimeout(() => goTo(id), 0); };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSnap(null); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" aria-label="Open plan" className="h-10 gap-2 rounded-full px-3">
          <FileText className="size-5" aria-hidden /> <span className="text-[15px] font-semibold">Plan</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
      >
        <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2 sm:px-5">
          <FileText className="size-5" aria-hidden />
          <DialogTitle className="text-xl font-bold">Business plan</DialogTitle>
          <DialogDescription className="sr-only">Your plan so far, Ahmed Tarek&apos;s critique of each section, and how it changed.</DialogDescription>
          {demo && <span className="rounded border border-amber-700/40 bg-amber-50 px-2 text-[13px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Demo plan, not your data</span>}
          <div className="ml-auto flex items-center gap-2">
            {mdHref && plan && (
              <Button asChild variant="outline" className="h-10 rounded-full">
                <a href={mdHref} download={demo ? "business-plan-demo.md" : undefined}><Download className="size-4" aria-hidden /> Download as Markdown</a>
              </Button>
            )}
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close plan" className="size-10 rounded-full"><X className="size-5" /></Button>
            </DialogClose>
          </div>
        </header>

        {empty ? (
          <div className="mx-auto max-w-[65ch] p-8 text-lg">
            <h2 className="text-2xl font-bold">Your plan is empty for now</h2>
            <p className="mt-2 text-muted-foreground">The plan fills in as you go. Start a run and each step you finish adds a section here, with its sources, open problems and Ahmed Tarek&apos;s critique.</p>
          </div>
        ) : error && !plan ? (
          <div role="alert" className="mx-auto flex max-w-[65ch] flex-col items-start gap-3 p-8">
            <p className="text-lg font-semibold text-destructive">{error}</p>
            <Button onClick={load} className="rounded-full">Try again</Button>
          </div>
        ) : !plan ? (
          <Loading />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <section aria-label="Overview" className="m-4 rounded-xl border-2 bg-card p-4 sm:mx-5">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="text-lg font-bold">Where things stand</h2>
                <span className="text-[15px] text-muted-foreground">Stage: {plan.overview.stage}</span>
              </div>
              <p className="mt-1 text-base">{plan.overview.status_text}</p>
              {plan.overview.waiting_on && <p className="mt-1 text-base font-semibold">{plan.overview.waiting_on}</p>}
              <p className="mt-1 text-[15px] text-muted-foreground">Next: {plan.overview.next_step}</p>
              {plan.overview.issues.length > 0 && (
                <ul aria-label="Open issues" className="mt-3 flex flex-col gap-1">
                  {plan.overview.issues.map((issue, k) => (
                    <li key={k}>
                      <a href={`#plan-${issue.section}`} onClick={(e) => { e.preventDefault(); jump(issue.section); }}
                        className={cn("text-[16px] font-semibold underline-offset-4 hover:underline focus-visible:underline", SEVERITY[issue.severity])}>
                        {issue.text}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div role="tablist" aria-label="Plan panes" className="flex gap-1 border-b px-4 pb-2 lg:hidden">
              {([["outline", "Outline and history"], ["doc", "Document"], ["critique", "Ahmed Tarek"]] as const).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={pane === id} onClick={() => setPane(id)}
                  className={cn("rounded-full px-3 py-1.5 text-[15px] font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40", pane === id ? "bg-foreground text-background" : "hover:bg-muted")}>
                  {label}
                </button>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 px-4 pb-8 sm:px-5 lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
              <nav aria-label="Outline and history" className={cn("min-w-0 flex-col gap-6 lg:flex", pane === "outline" ? "flex" : "hidden")}>
                <ul aria-label="Sections" className="flex flex-col gap-0.5">
                  {plan.sections.map((s) => (
                    <li key={s.id}>
                      <button onClick={() => jump(s.id)} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-base font-semibold outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40">
                        {s.title}
                        {s.status === "not_yet" && <span className="text-[13px] font-normal text-muted-foreground">not yet</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                <div>
                  <h2 className="px-3 text-[15px] font-bold">Version history</h2>
                  {plan.versions.length === 0 ? (
                    <p className="px-3 pt-1 text-[15px] text-muted-foreground">No versions yet. One is saved after each draft and each decision.</p>
                  ) : (
                    <ul aria-label="Version history" className="mt-1 flex flex-col gap-0.5">
                      {[...plan.versions].reverse().map((v) => (
                        <li key={v.n}>
                          <button onClick={() => void openVersion(v.n)} aria-pressed={snap?.n === v.n}
                            className={cn("flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40", snap?.n === v.n && "bg-muted")}>
                            <span className="flex items-center gap-2 text-[15px] font-semibold">Version {v.n} <EventBadge event={v.event} /></span>
                            <span className="text-[14px] leading-snug text-muted-foreground">{v.summary}</span>
                            <span className="text-[13px] text-muted-foreground">{when(v.at)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </nav>

              <div className={cn("min-w-0 lg:block", pane === "doc" ? "block" : "hidden")}>
                {snap && (
                  <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-700/40 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                    <span className="font-semibold">Viewing version {snap.n} from {when(snap.at)}. Read only.</span>
                    <Button size="sm" variant="outline" onClick={() => setSnap(null)} className="rounded-full"><ArrowLeft className="size-4" aria-hidden /> Back to current</Button>
                    {changed.length > 0 && <p className="basis-full text-[15px]">Changed since this version: {changed.join(", ")}.</p>}
                  </div>
                )}
                <article aria-label="Plan document" className="max-w-[70ch] text-[18px] leading-relaxed">
                  {shown.map((s) => (
                    <section key={s.id} id={`plan-${s.id}`} className="mb-10 scroll-mt-4">
                      <h2 className="flex flex-wrap items-center gap-3 border-b pb-2 text-2xl font-extrabold">
                        {s.title}
                        {s.assumptions > 0 && <span className="rounded border border-amber-700/40 bg-amber-50 px-2 text-[14px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{s.assumptions} ASSUMPTION</span>}
                      </h2>
                      {s.status === "not_yet" ? (
                        <p className="mt-3 rounded-xl border-2 border-dashed p-4 text-muted-foreground">Not written yet. This section fills in when its step is done.</p>
                      ) : (
                        <PlanMarkdown text={s.body_markdown} />
                      )}
                      {s.sources.length > 0 && (
                        <div className="mt-4 flex flex-col gap-2">
                          <h3 className="text-[15px] font-bold">Sources</h3>
                          {s.sources.map((x, k) => <SourceCard key={x.url} n={k + 1} title={x.title} url={x.url} trust={x.trust} backs={x.claims.join("; ") || "no claim recorded"} />)}
                        </div>
                      )}
                    </section>
                  ))}
                </article>
              </div>

              <aside aria-label="Ahmed Tarek critique" className={cn("min-w-0 flex-col gap-3 lg:flex", pane === "critique" ? "flex" : "hidden")}>
                <p className="text-[13px] text-muted-foreground">{DISCLAIMER}</p>
                {snap && <p className="text-[14px] font-semibold">Ahmed&apos;s notes are on the current plan only.</p>}
                {plan.sections.map((s) => {
                  const c = critique(s.id);
                  if (!c) return null;
                  return (
                    <section key={s.id} aria-label={`Critique of ${s.title}`} className="flex gap-3 rounded-xl border-2 border-foreground/20 bg-card p-3">
                      <FaceAvatar emotion={c.emotion} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-bold">{s.title}</span>
                          <span className="rounded border border-sky-800/30 bg-sky-50 px-1.5 text-[12px] font-bold text-sky-900 uppercase dark:bg-sky-950 dark:text-sky-200">Parody</span>
                        </div>
                        <p className={cn("mt-1 text-[15px] leading-snug", c.emotion === "im_out" && "font-semibold text-destructive")}>{c.line}</p>
                      </div>
                    </section>
                  );
                })}
              </aside>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
