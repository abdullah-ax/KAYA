"use client";

import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CASES, LEARN, NOTES, SOURCES, type Screen } from "./data";
import { ProgramCard } from "./program-card";
import { demoProgramFor } from "./program-demo";
import { CaseStudyCard, EmptyState, LearnCard, SourceCard, StatusBadge, VerdictCard } from "./ui";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h3 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function NotesList() {
  return (
    <ol className="flex flex-col gap-3">
      {NOTES.map((n, i) => (
        <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-2 text-[15px] leading-snug">
          <span className="font-semibold text-muted-foreground">{n.when}</span>
          <span>
            {n.kind === "decision" && <b className="text-primary">Decision: </b>}
            {n.kind === "voice" && <b className="text-muted-foreground">Voice note: </b>}
            {n.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function WorkingPanel({ screen }: { screen: Screen }) {
  return (
    <div className="flex flex-col gap-7 p-6">
      <ProgramCard card={demoProgramFor(screen.id)} />
      {screen.panel === "profile" && (
        <>
          <Section title="Intake">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-extrabold">3 of 5</span>
              <span className="text-[15px] text-muted-foreground">questions, demo mode</span>
            </div>
            <Progress value={60} className="h-2" />
          </Section>
          <Section title="Still unknown">
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-base marker:text-muted-foreground">
              <li>What you won&apos;t do, even for money</li>
              <li>Who you could call this week</li>
            </ul>
          </Section>
          <Section title="Notes">
            <EmptyState title="No decisions yet" body="Your answers and choices will appear here, in your own words." />
          </Section>
        </>
      )}

      {screen.panel === "sources" && (
        <>
          <Section title="Sources (3)">
            {SOURCES.map((s) => <SourceCard key={s.n} {...s} />)}
          </Section>
          <Section title="Boss check">
            <p className="text-base"><b className="text-destructive">Rejected 1 draft:</b> “a huge market” had no source.</p>
            <p className="text-base"><b className="text-primary">Passed:</b> grade 7 reading level, 0 banned phrases.</p>
          </Section>
        </>
      )}

      {screen.panel === "numbers" && (
        <>
          <Section title="Target, set before the test">
            <span className="text-3xl font-extrabold">100 in 14 days</span>
          </Section>
          <Section title="Actual">
            <div className="flex items-center gap-2"><span className="text-3xl font-extrabold">12 (12%)</span><StatusBadge status="mocked">Demo data</StatusBadge></div>
            <Progress value={12} className="h-2 [&>div]:bg-destructive" />
          </Section>
          <div className="rounded-xl border-2 border-destructive/50 bg-stop-bg p-4">
            <div className="text-[14px] font-bold text-destructive">System recommends</div>
            <div className="text-2xl font-extrabold text-destructive">Stop or pivot</div>
            <p className="mt-1 text-[15px]">Under 30% of target. We don't spin weak results.</p>
          </div>
          <Separator />
          <Section title="Notes"><NotesList /></Section>
        </>
      )}

      {screen.panel === "sharks" && (
        <>
          <Section title="Panel"><StatusBadge status="simulation">Simulation</StatusBadge></Section>
          <Section title="Still deciding">
            <VerdictCard id="shark_tech" name="Tech shark" verdict="pending" reason="" />
          </Section>
          <Section title="Score">
            <span className="text-3xl font-extrabold">1 in, 2 out</span>
            <p className="text-[15px] text-muted-foreground">Most common reason: no proof from strangers.</p>
          </Section>
        </>
      )}

      {screen.panel === "daily" && (
        <>
          <Section title="Today's lesson">
            <div className="rounded-xl border bg-card p-4">
              <div className="text-lg font-bold">Ask about the past, not the future</div>
              <p className="mt-1 text-[15px]">“Would you buy this?” gets polite lies. “When did you last pay for notes?” gets facts.</p>
            </div>
          </Section>
          <Section title="One action"><p className="text-base">Make the cardio page. Show it to 3 students you haven't met.</p></Section>
          <Section title="Notes"><NotesList /></Section>
        </>
      )}

      {CASES[screen.id] && (
        <Section title="Who did this before">{CASES[screen.id].map((c) => <CaseStudyCard key={c.company} {...c} />)}</Section>
      )}
      {LEARN[screen.id] && (
        <Section title="Keep learning, 5 minutes">
          {LEARN[screen.id].map((l) => <LearnCard key={l.url} {...l} />)}
        </Section>
      )}
    </div>
  );
}
