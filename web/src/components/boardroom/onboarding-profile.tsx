"use client";

/* "Here's what I understood": the profile as editable lines. Nothing starts
   until the founder has read it and, where it is wrong, fixed it. */

import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Profile } from "@/lib/api";
import { COFOUNDERS, countOf } from "@/lib/onboarding";
import { MascotAvatar } from "./ui";

function Line({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[15px] font-semibold text-muted-foreground">{label}</Label>
      <Textarea
        aria-label={label}
        value={value}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 rounded-xl border-2 bg-card px-4 py-2.5 text-[18px] md:text-[18px]"
      />
      {hint && <p className="text-[15px] font-semibold text-primary">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card/60 p-5">
      <h2 className="text-[14px] font-bold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

const swap = <T,>(list: T[], i: number, v: T) => list.map((x, k) => (k === i ? v : x));

export function ProfileCard({
  profile, onChange, onStart, onBack, starting, error,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
  onStart: () => void;
  onBack: () => void;
  starting: boolean;
  error: string | null;
}) {
  const co = COFOUNDERS[profile.cofounder.type] ?? COFOUNDERS.warm_skeptic;
  return (
    <div className="flex w-full max-w-2xl flex-col gap-5 py-8">
      <div className="flex items-center gap-4">
        <MascotAvatar id="profiler" expression="pleased" size={64} activity="done" />
        <div>
          <h1 className="text-4xl leading-tight font-extrabold tracking-tight">Here&apos;s what I understood</h1>
          <p className="text-[18px] text-muted-foreground">Fix any line that is wrong. These are your words.</p>
        </div>
      </div>

      <Section title="About you">
        <Line label="About you" value={profile.about} onChange={(about) => onChange({ ...profile, about })} />
      </Section>

      <Section title="Strengths, in your words">
        {profile.strengths.length === 0 && <p className="text-[18px] text-muted-foreground">Nothing yet. ASSUMPTION: we will learn this as we work.</p>}
        {profile.strengths.map((s, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="text-[15px] font-semibold">{s.text}</span>
            <Line label={`Strength ${i + 1}`} value={s.quote} onChange={(quote) => onChange({ ...profile, strengths: swap(profile.strengths, i, { ...s, quote }) })} />
          </div>
        ))}
      </Section>

      <Section title="Who you can reach">
        {profile.access.map((a, i) => {
          const n = countOf(a.group);
          return (
            <Line
              key={i}
              label="Group you can message today"
              value={a.group}
              hint={n === null ? "No number yet. ASSUMPTION: we will ask you to count." : `About ${n.toLocaleString("en-US")} people`}
              onChange={(group) => onChange({ ...profile, access: swap(profile.access, i, { ...a, group, count: countOf(group) }) })}
            />
          );
        })}
      </Section>

      <Section title="Your limits">
        <Line label="Hours per week" value={profile.constraints.hours} onChange={(hours) => onChange({ ...profile, constraints: { ...profile.constraints, hours } })} />
        <Line label="Money" value={profile.constraints.money} onChange={(money) => onChange({ ...profile, constraints: { ...profile.constraints, money } })} />
      </Section>

      <Section title="What you won't do">
        {profile.values.map((v, i) => (
          <Line key={i} label={`Value ${i + 1}`} value={v} onChange={(x) => onChange({ ...profile, values: swap(profile.values, i, x) })} />
        ))}
      </Section>

      <Section title="Your co-founder">
        <p className="text-[18px]"><b>{co.name}</b>. {co.line}</p>
        <Line label="Why this co-founder" value={profile.cofounder.why} onChange={(why) => onChange({ ...profile, cofounder: { ...profile.cofounder, why } })} />
      </Section>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="lg" onClick={onBack} disabled={starting} className="h-12 rounded-full text-base"><ArrowLeft className="size-4" /> Back</Button>
        <Button size="lg" onClick={onStart} disabled={starting} className="h-12 rounded-full px-6 text-base font-bold">
          {starting ? "Starting…" : "Start"} <ArrowRight className="size-4" />
        </Button>
      </div>
      <p role="alert" className="min-h-6 text-base font-semibold text-destructive">{error}</p>
    </div>
  );
}
