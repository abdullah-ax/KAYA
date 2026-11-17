"use client";

/* The "This week" card: one accelerator stage, one coach, one thing to do today.
   The API builds the card (api/program.py); this only shows it. */

import { useEffect, useState, type ReactNode } from "react";

import { getProgram, type ProgramCardData } from "@/lib/api";
import { MascotAvatar } from "./ui";

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-[13px] font-bold tracking-wide text-muted-foreground uppercase">{title}</h4>
      {children}
    </div>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
      {children}
    </a>
  );
}

export function ProgramCard({ card }: { card: ProgramCardData }) {
  return (
    <section aria-label="This week" className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <MascotAvatar id={card.lead.id} size={44} activity="speaking" />
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">This week</h3>
          <div className="text-lg font-extrabold">{card.label}</div>
          {card.handoff && <p className="text-[15px]">{card.handoff}</p>}
        </div>
      </div>

      <Part title="Goal"><p className="text-base">{card.goal}</p></Part>
      <Part title="Think big"><p className="text-base">{card.big_question}</p></Part>

      <Part title="Ask yourself">
        <ul className="flex list-disc flex-col gap-1 pl-5 text-base">
          {card.questions.map((q) => <li key={q}>{q}</li>)}
        </ul>
      </Part>

      {card.steps && card.steps.length > 0 && (
        <Part title="Steps">
          <ol className="flex flex-col gap-2 text-base">
            {card.steps.map((s) => (
              <li key={s.step}>
                <b>Step {s.step}: {s.title}.</b> <span>{s.line}</span>{" "}
                {s.links.map((l, i) => <span key={l.url}>{i > 0 && ", "}<Link href={l.url}>{l.title}</Link></span>)}
              </li>
            ))}
          </ol>
        </Part>
      )}

      <Part title="Do today"><p className="text-base font-semibold">{card.do_today}</p></Part>
      <Part title="Ship this week"><p className="text-base">{card.ship}</p></Part>
      <Part title="Number to watch">
        <p className="text-base"><b>{card.metric.name}</b></p>
        <p className="text-[15px] text-muted-foreground">{card.metric.target}</p>
      </Part>
      <Part title="Review"><p className="text-base">{card.review}</p></Part>

      {card.joins.length > 0 && (
        <Part title="Who can join">
          <ul className="flex flex-col gap-1 text-[15px]">
            {card.joins.map((j) => (
              <li key={j.id} className="flex items-center gap-2">
                <MascotAvatar id={j.id} size={22} className="ring-1 ring-offset-0" />
                <span><b>{j.name}</b> {j.when}</span>
              </li>
            ))}
          </ul>
        </Part>
      )}

      <Part title="Learn, under 15 minutes">
        <p className="text-base"><Link href={card.learn.url}>{card.learn.title}</Link>, {card.learn.org}. {card.learn.why}</p>
      </Part>
      <Part title="Who did this before">
        <p className="text-base"><Link href={card.case.url}>{card.case.company}</Link> ({card.case.market}). {card.case.fact}</p>
        <p className="text-[15px] text-muted-foreground">Source: {card.case.source}</p>
      </Part>
    </section>
  );
}

/** Loads the card for a run. It refetches when the stage or status moves. Shows nothing if the API cannot give one. */
export function ProgramSection({ runId, stage, status }: { runId: string; stage: string; status: string }) {
  const [card, setCard] = useState<ProgramCardData | null>(null);
  useEffect(() => {
    let stopped = false;
    getProgram(runId).then((c) => { if (!stopped) setCard(c); }, () => {});
    return () => { stopped = true; };
  }, [runId, stage, status]);
  return card ? <ProgramCard card={card} /> : null;
}
