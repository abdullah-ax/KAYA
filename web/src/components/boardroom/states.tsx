"use client";

/* Every reusable component in every state, on one page. */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import { ConnectionStatus, type ConnState } from "./model-settings";
import { FaceAvatar, type FaceEmotion } from "./parody";
import {
  checkReason,
  CaseStudyCard,
  EmptyState,
  LearnCard,
  MascotAvatar,
  OptionCard,
  ReasonField,
  RosterItem,
  SourceCard,
  StatusBadge,
  VerdictCard,
  type Activity,
} from "./ui";

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b py-8 last:border-0">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const REASONS = [
  { label: "empty", text: "" },
  { label: "bare yes", text: "yes" },
  { label: "too short", text: "Because students like it" },
  { label: "valid", text: "Students already pay for printed notes, so a one-page sheet tests price with less work for me" },
];

export function StatesGallery() {
  const [opt, setOpt] = useState("b");
  return (
    <div className="mx-auto max-w-6xl px-8 pb-16">
      <Row title="StatusBadge">
        <div className="flex flex-wrap gap-3">
          {(["working", "mocked", "stubbed", "simulation", "stop"] as const).map((s) => <StatusBadge key={s} status={s} />)}
        </div>
      </Row>

      <Row title="MascotAvatar · activity">
        <div className="flex flex-wrap gap-8">
          {(["idle", "thinking", "speaking", "done", "error"] as Activity[]).map((a) => (
            <Labeled key={a} label={a}><MascotAvatar id="boss" activity={a} size={56} /></Labeled>
          ))}
        </div>
      </Row>

      <Row title="MascotAvatar · expression">
        <div className="flex flex-wrap gap-8">
          {(["neutral", "listening", "thinking", "pleased", "skeptical"] as const).map((e) => (
            <Labeled key={e} label={e}><MascotAvatar id="warm_skeptic" expression={e} size={72} /></Labeled>
          ))}
          <Labeled label="im_out"><MascotAvatar id="shark_numbers" expression="im_out" size={72} /></Labeled>
        </div>
      </Row>

      <Row title="FaceAvatar · parody easter egg">
        <div className="flex flex-wrap gap-8">
          {(["neutral", "listening", "thinking", "talking", "pleased", "skeptical", "im_out"] as FaceEmotion[]).map((e) => (
            <Labeled key={e} label={e}><FaceAvatar emotion={e} size={72} /></Labeled>
          ))}
        </div>
      </Row>

      <Row title="RosterItem">
        <div className="grid max-w-3xl grid-cols-2 gap-4">
          <Labeled label="default"><RosterItem id="profiler" name="Profiler" role="Learns who you are" /></Labeled>
          <Labeled label="active + speaking"><RosterItem id="warm_skeptic" name="Noor" role="Co-founder" active activity="speaking" status="Leading" /></Labeled>
          <Labeled label="thinking"><RosterItem id="intern" name="Research intern" role="Drafts with sources" activity="thinking" status="Drafting" /></Labeled>
          <Labeled label="disabled"><RosterItem id="shark_people" name="People shark" role="SIMULATION" disabled /></Labeled>
          <Labeled label="error"><RosterItem id="boss" name="Boss" role="Model timed out, retry 2 of 3" activity="error" /></Labeled>
        </div>
      </Row>

      <Row title="OptionCard">
        <RadioGroup value={opt} onValueChange={setOpt} className="grid grid-cols-4 gap-3">
          <Labeled label="default"><OptionCard value="a" label="Stop" body="End this idea." cost="None" risk="Low" selected={opt === "a"} /></Labeled>
          <Labeled label="selected"><OptionCard value="b" label="Pivot" body="New offer, same users." cost="1 week" risk="Medium" selected={opt === "b"} /></Labeled>
          <Labeled label="recommended"><OptionCard value="c" label="Repeat" body="Run 14 more days." cost="2 weeks" risk="High" selected={opt === "c"} recommended /></Labeled>
          <Labeled label="disabled"><OptionCard value="d" label="Go" body="Needs 30+ sign-ups." cost="—" risk="—" selected={false} disabled /></Labeled>
        </RadioGroup>
      </Row>

      <Row title="ReasonField · no bare yes">
        <div className="grid grid-cols-2 gap-6">
          {REASONS.map((r) => (
            <Labeled key={r.label} label={r.label}>
              <ReasonField value={r.text} onChange={() => {}} check={checkReason(r.text, 15, "Repeat")} minWords={15} />
            </Labeled>
          ))}
        </div>
      </Row>

      <Row title="SourceCard">
        <div className="grid grid-cols-2 gap-4">
          <Labeled label="high trust"><SourceCard n={1} title="CAPMAS enrolment data" url="https://www.capmas.gov.eg/" trust="high" backs="Egypt has more than 30 pharmacy faculties." /></Labeled>
          <Labeled label="low trust"><SourceCard n={2} title="r/pharmacy thread" url="https://www.reddit.com/r/pharmacy/" trust="low" backs="Dosage tables are hard to memorize." /></Labeled>
          <Labeled label="loading"><SourceCard n={3} title="" url="" trust="medium" backs="" state="loading" /></Labeled>
          <Labeled label="broken link"><SourceCard n={4} title="Blog post" url="https://example.com/" trust="medium" backs="Students spend 500 EGP a term on notes." state="broken" /></Labeled>
        </div>
      </Row>

      <Row title="VerdictCard">
        <div className="grid grid-cols-3 gap-4">
          <VerdictCard id="shark_people" name="People shark" verdict="in" reason="You already teach them every week." />
          <VerdictCard id="shark_numbers" name="Numbers shark" verdict="out" reason="12 sign-ups, all from friends." change="20 from strangers." />
          <VerdictCard id="shark_tech" name="Tech shark" verdict="pending" reason="" />
        </div>
      </Row>

      <Row title="LearnCard · CaseStudyCard">
        <div className="grid grid-cols-3 gap-4">
          <Labeled label="default"><LearnCard kind="Essay" org="Paul Graham" title="Do Things That Don't Scale" url="https://paulgraham.com/ds.html" why="Recruit your next 10 users by hand." /></Labeled>
          <Labeled label="done"><LearnCard kind="Book" org="Rob Fitzpatrick" title="The Mom Test" url="https://www.momtestbook.com/" why="Ask about the past." done /></Labeled>
          <Labeled label="case study"><CaseStudyCard company="Breadfast" market="Egypt · YC company" lesson="Start tiny, do the unscalable part yourself." fact="Started in 2017 with bread only." url="https://www.ycombinator.com/companies/breadfast" source="Y Combinator" /></Labeled>
        </div>
      </Row>

      <Row title="Model connection (BYOK)">
        <div className="flex flex-col gap-2">
          {(["unset", "testing", "connected", "invalid", "rate_limited"] as ConnState[]).map((s) => <ConnectionStatus key={s} state={s} />)}
        </div>
      </Row>

      <Row title="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Confirm decision</Button>
          <Button variant="outline">Test connection</Button>
          <Button variant="destructive">Stop this idea</Button>
          <Button disabled>Disabled</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      </Row>

      <Row title="EmptyState">
        <div className="max-w-md">
          <EmptyState title="No sources yet" body="The intern hasn't found anything. Every claim needs a link or the label ASSUMPTION." action={{ label: "Search again" }} />
        </div>
      </Row>
    </div>
  );
}
