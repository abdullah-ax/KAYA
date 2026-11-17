"""The living business plan. Built only from files on disk and the decision log. Nothing is invented.

build_plan reads outputs/, decision_log.json and plan_versions.json. snapshot appends a version.
tarek_critique is a pure rule-based parody voice: short, numbers first, never investment advice.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MAX_VERSIONS = 50
CANVAS_BOXES = 9
SECTIONS = [("profile", "Founder profile"), ("opportunity", "Opportunity"), ("canvas", "Lean canvas"),
            ("signup", "Sign-up page"), ("decisions", "Decisions")]
TITLES = dict(SECTIONS)
REJECTED_SECTION = {"phase1_step2": "opportunity", "phase2_step1": "canvas"}
DISCLAIMER = "Parody for fun. Not affiliated with or endorsed by the real person. Not investment advice."

STAGE_NEXT = {
    "start": "Answer the first question so the profile can be written.",
    "brief": "Rewrite the brief so it passes the safety check.",
    "phase1_step1": "Wait for the research draft, then read the opportunities.",
    "phase1_step2": "Read the opportunities and prepare your Phase 1 decision.",
    "phase1_gate": "Pick an opportunity at the Phase 1 gate and say why.",
    "phase2_step1": "Review the lean canvas and the sign-up page.",
    "phase2_step2": "Decide whether to publish the sign-up page, then count real sign-ups.",
    "phase2_gate": "Decide at the Phase 2 gate: continue, repeat the test, or stop.",
}


# -- reading files -------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, ValueError):
        return None


def _sources(out: Path, step: str) -> list[dict[str, Any]]:
    data = _json(out / f"{step}_sources.json")
    if not isinstance(data, list):
        return []
    return [{"id": s.get("id"), "url": s.get("url"), "title": s.get("title") or s.get("url"),
             "trust": s.get("trust", "medium"), "trust_reason": s.get("trust_reason", ""),
             "claims": list(s.get("claims_backed") or [])}
            for s in data if isinstance(s, dict) and s.get("url")]


def _log(run_dir: Path) -> list[dict[str, Any]]:
    data = _json(run_dir / "decision_log.json")
    return [e for e in data if isinstance(e, dict)] if isinstance(data, list) else []


def _gate(out: Path, phase: int) -> dict[str, Any] | None:
    """Parse outputs/phase<N>_gate_decision.md into its parts. None if the file is missing."""
    text = _text(out / f"phase{phase}_gate_decision.md")
    if text is None:
        return None

    def part(heading: str) -> str:
        m = re.search(rf"^## {re.escape(heading)}\n(.*?)(?=^## |\Z)", text, re.S | re.M)
        return m.group(1).strip() if m else ""

    rec = part("System recommendation")
    picked = re.search(r"^- Picked: (.*)$", text, re.M)
    why = re.search(r'^- Why, in their own words: "(.*)"$', text, re.M)
    options = [[c.strip() for c in row.strip("|").split("|")]
               for row in part("Options shown to the founder").splitlines()[2:] if row.startswith("|")]
    outcome = re.match(r"(go|repeat|pivot|stop)\b", rec)
    return {"phase": phase, "recommendation": rec, "outcome": outcome.group(1) if outcome else None,
            "picked": picked.group(1).strip() if picked else None, "why": why.group(1) if why else None,
            "options": options, "result": part("Result")}


# -- sections --------------------------------------------------------------------

def _profile_body(data: dict[str, Any]) -> str:
    lines = ["## Strengths"]
    lines += [f'- {s.get("strength")}: "{s.get("quote")}"' for s in data.get("strengths") or []] or ["- none recorded"]
    lines += ["", "## Who you can reach"]
    for a in data.get("access") or []:
        today = "can reach today" if a.get("reach_today") else "cannot reach yet"
        lines.append(f'- {a.get("group")}: {a.get("how_many")} people, {today}')
    if not data.get("access"):
        lines.append("- none recorded")
    lines += ["", "## Limits"] + [f"- {c}" for c in data.get("constraints") or []]
    lines += ["", "## Personality signals"]
    lines += [f'- {p.get("signal")}: "{p.get("quote")}"' for p in data.get("personality") or []] or ["- none recorded"]
    lines += ["", "## Markets you could start in"]
    lines += [f'- {m.get("market")}: {m.get("why")}' for m in data.get("markets") or []] or ["- none recorded"]
    if data.get("cofounder_type"):
        lines += ["", "## Your AI cofounder", f'{data["cofounder_type"]}. {data.get("cofounder_why", "")}'.strip()]
    if data.get("open_questions"):
        lines += ["", "## Still open"] + [f"- {q}" for q in data["open_questions"]]
    if data.get("intake"):
        lines += ["", "## What you told us"] + [f'- {q.get("question")} {q.get("answer")}' for q in data["intake"]]
    return "\n".join(lines)


def _options(md: str) -> list[tuple[str, str]]:
    """Split opportunities.md into (title, block) pairs."""
    parts = re.split(r"^## Option [A-Z]: ", md, flags=re.M)[1:]
    return [(p.split("\n", 1)[0].strip(), "## " + p.split("\n", 1)[0].strip() + "\n" + (p.split("\n", 1) + [""])[1].strip())
            for p in parts]


def _opportunity_body(md: str, picked: str | None) -> tuple[str, str | None]:
    opts = _options(md)
    chosen = next((o for o in opts if o[0] == picked), None)
    if chosen is None:
        body = "## Options on the table\n\nNo choice yet.\n\n" + "\n\n".join(b for _, b in opts)
        return body, None
    others = [b for t, b in opts if t != chosen[0]]
    body = f"## Chosen: {chosen[0]}\n\n{chosen[1].split(chr(10), 1)[1].strip()}"
    if others:
        body += "\n\n## Alternatives\n\n" + "\n\n".join(b.replace("## ", "### ", 1) for b in others)
    return body, chosen[0]


def _decisions_body(gates: list[dict[str, Any]], log: list[dict[str, Any]]) -> str:
    blocks = []
    for g in gates:
        lines = [f"## Phase {g['phase']} gate", "", f"- Recommendation: {g['recommendation']}", "- Options:"]
        lines += [f"  - {o[0]}: cost {o[1]}, risk {o[2]}, source {o[3]}" for o in g["options"] if len(o) >= 4]
        lines += [f"- Choice: {g['picked'] or 'pending'}", f'- Your reason: "{g["why"] or "pending"}"']
        blocks.append("\n".join(lines))
    for e in log:
        if e.get("action") == "publish_signup_page" and e.get("approved_by") == "founder":
            blocks.append(f'## Publish decision\n\n- Choice: {e.get("outcome")}\n- Your reason: "{e.get("founder_input")}"')
        if e.get("action") == "keep_page_private":
            blocks.append(f'## Publish decision\n\n- Choice: Keep it private\n- Your reason: "{e.get("founder_input")}"')
    return "\n\n".join(blocks)


def _int(value: Any) -> int | None:
    m = re.search(r"\d[\d,]*", str(value))
    return int(m.group().replace(",", "")) if m else None


def _facts(sections: dict[str, dict[str, Any]], gates: dict[int, dict[str, Any]], profile: Any) -> dict[str, Any]:
    facts: dict[str, Any] = {"signups": None, "signup_target": None, "window_days": None, "sourced": None,
                             "sourced_target": None, "founder_fit": None, "min_fit": None,
                             "assumptions": sections["canvas"]["assumptions"], "canvas_boxes": CANVAS_BOXES,
                             "low_trust_only": [s["id"] for s in sections.values()
                                                if s["sources"] and all(x["trust"] == "low" for x in s["sources"])],
                             "gates": {f"phase{p}": g["outcome"] for p, g in gates.items()}, "reach": None}
    if 1 in gates:
        m = re.search(r"(\d+) sourced problems \(need (\d+)\), founder fit (\d) of 5 \(model estimate; need (\d)",
                      gates[1]["recommendation"])
        if m:
            facts.update(sourced=int(m[1]), sourced_target=int(m[2]), founder_fit=int(m[3]), min_fit=int(m[4]))
    if 2 in gates:
        m = re.search(r"(\d+) of (\d+) sign-ups in (\d+) days", gates[2]["recommendation"])
        if m:
            facts.update(signups=int(m[1]), signup_target=int(m[2]), window_days=int(m[3]))
    if isinstance(profile, dict):
        counts = [_int(a.get("how_many")) for a in profile.get("access") or [] if isinstance(a, dict)
                  if a.get("reach_today")]
        counts = [c for c in counts if c is not None]
        facts["reach"] = sum(counts) if counts else None
    return facts


def _issues(sections: dict[str, dict[str, Any]], gates: dict[int, dict[str, Any]], out: Path) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    for g in gates.values():
        if g["outcome"] in ("stop", "repeat", "pivot"):
            severity = "high" if g["outcome"] == "stop" else "medium"
            issues.append({"text": f"Phase {g['phase']} gate recommends {g['outcome']}: {g['recommendation']}",
                           "section": "decisions", "severity": severity})
    for path in sorted(out.glob("*_rejected_draft.md")) if out.exists() else []:
        step = re.match(r"(phase\d+_step\d+)", path.name)
        section = REJECTED_SECTION.get(step.group(1) if step else "", "decisions")
        text = _text(path) or ""
        why = text.split("## Why it was blocked", 1)[1] if "## Why it was blocked" in text else ""
        reasons = [r[2:].strip() for r in why.splitlines() if r.startswith("- ")]
        issues.append({"text": f"The ethics check blocked the {TITLES[section].lower()} draft twice: "
                               + ("; ".join(reasons) or "no reason recorded"),
                       "section": section, "severity": "high"})
    for sid, s in sections.items():
        if s["sources"] and all(x["trust"] == "low" for x in s["sources"]):
            issues.append({"text": f"Every source behind the {s['title'].lower()} is low-trust (forum or social). "
                                   "Treat these claims as unproven.", "section": sid, "severity": "medium"})
    a = sections["canvas"]["assumptions"]
    if a:
        issues.append({"text": f"{a} of {CANVAS_BOXES} lean canvas boxes are ASSUMPTION, with no source.",
                       "section": "canvas", "severity": "high" if a >= 5 else "medium"})
    for sid, s in sections.items():
        if s["status"] == "not_yet":
            issues.append({"text": f"{s['title']} is not written yet.", "section": sid, "severity": "low"})
    return issues


def _overview(run_dir: Path, state: dict[str, Any] | None, issues: list[dict[str, str]]) -> dict[str, Any]:
    saved = _json(run_dir / "state.json") or {}
    state = state or {}
    stage = state.get("stage") or saved.get("step") or "start"
    outcome = state.get("outcome") or saved.get("outcome")
    status = state.get("status") or ("done" if outcome in ("go", "stop", "repeat", "pivot", "refused") else "working")
    pending = state.get("pending") or None
    waiting = None
    if pending and pending.get("kind") == "gate":
        waiting = f"Your decision at the Phase {str(pending.get('key', ''))[-1:]} gate: {pending.get('prompt', '')}".strip()
    elif pending and pending.get("kind") == "question":
        waiting = f"Your answer: {pending.get('prompt', '')}"
    if status == "error":
        text = "The run hit an error."
    elif status == "done":
        text = {"go": "The run is finished: both gates say go.", "stop": "The run stopped here.",
                "refused": "The brief was refused by the safety check."}.get(outcome or "", f"The run is finished ({outcome}).")
    elif waiting:
        text = "Waiting on you."
    else:
        text = "The team is working."
    nxt = "Start a new run, or read the plan below." if status == "done" else STAGE_NEXT.get(stage, "Keep going.")
    return {"stage": stage, "status_text": text, "waiting_on": waiting, "next_step": nxt, "issues": issues}


def _sections(run_dir: Path) -> tuple[list[dict[str, Any]], dict[int, dict[str, Any]], Any, str | None]:
    out = run_dir / "outputs"
    log = _log(run_dir)
    gates = {p: g for p in (1, 2) if (g := _gate(out, p))}

    def blank(sid: str) -> dict[str, Any]:
        return {"id": sid, "title": TITLES[sid], "body_markdown": "", "sources": [], "assumptions": 0,
                "status": "not_yet"}

    s = {sid: blank(sid) for sid, _ in SECTIONS}
    profile = _json(out / "phase1_step1_founder_profile.json")
    if isinstance(profile, dict):
        s["profile"].update(body_markdown=_profile_body(profile), status="written")
    picked = gates[1]["picked"] if 1 in gates else None
    opp_md = _text(out / "phase1_step2_opportunities.md")
    chosen = None
    if opp_md is not None:
        body, chosen = _opportunity_body(opp_md, picked)
        s["opportunity"].update(body_markdown=body, sources=_sources(out, "phase1_step2"), status="written")
    canvas = _text(out / "phase2_step1_lean_canvas.md")
    if canvas is not None:
        body = canvas.split("\n", 1)[1].strip() if canvas.startswith("# ") else canvas
        s["canvas"].update(body_markdown=body, sources=_sources(out, "phase2_step1"), status="written",
                           assumptions=len(re.findall(r"\| ASSUMPTION \|\s*$", canvas, re.M)))
    page = _text(out / "phase2_step2_signup_page.md")
    if page is not None:
        s["signup"].update(body_markdown=page.strip(), status="written")
    if gates:
        s["decisions"].update(body_markdown=_decisions_body(list(gates.values()), log), status="written")
    return [s[sid] for sid, _ in SECTIONS], gates, profile, chosen


def build_plan(run_dir: Path | str, state: dict[str, Any] | None) -> dict[str, Any]:
    run_dir = Path(run_dir)
    sections, gates, profile, _ = _sections(run_dir)
    by_id = {s["id"]: s for s in sections}
    issues = _issues(by_id, gates, run_dir / "outputs")
    plan: dict[str, Any] = {"overview": _overview(run_dir, state, issues), "sections": sections,
                            "facts": _facts(by_id, gates, profile), "critique": [],
                            "versions": [{k: v for k, v in ver.items() if k not in ("sections", "chosen")}
                                         for ver in _versions(run_dir)]}
    plan["critique"] = tarek_critique(plan)
    return plan


# -- versions --------------------------------------------------------------------

def _versions(run_dir: Path) -> list[dict[str, Any]]:
    data = _json(run_dir / "plan_versions.json")
    return [v for v in data if isinstance(v, dict)] if isinstance(data, list) else []


def get_version(run_dir: Path | str, n: int) -> dict[str, Any] | None:
    return next((v for v in _versions(Path(run_dir)) if v.get("n") == n), None)


def snapshot(run_dir: Path | str, event: str, summary: str, option: str | None = None) -> dict[str, Any]:
    """Append a version. A decision becomes a stop or a pivot from the founder's option."""
    run_dir = Path(run_dir)
    sections, _, _, chosen = _sections(run_dir)
    versions = _versions(run_dir)
    previous = next((v.get("chosen") for v in reversed(versions) if v.get("chosen")), None)
    if event == "decision" and option:
        low = option.lower()
        if "stop" in low:
            event = "stop"
        elif "repeat" in low or "pivot" in low or (previous and chosen and chosen != previous):
            event = "pivot"
    digest = hashlib.sha256(json.dumps([[s["id"], s["body_markdown"]] for s in sections]).encode()).hexdigest()[:16]
    version = {"n": (versions[-1]["n"] + 1) if versions else 1, "at": _now(), "event": event,
               "summary": summary, "sections_hash": digest, "chosen": chosen,
               "sections": [{k: s[k] for k in ("id", "title", "body_markdown", "sources", "assumptions", "status")}
                            for s in sections]}
    run_dir.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=run_dir, prefix=".plan_versions.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump([*versions, version][-MAX_VERSIONS:], fh, ensure_ascii=False)
        os.replace(tmp, run_dir / "plan_versions.json")
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return version


# -- Tarek ---------------------------------------------------------------------

def tarek_critique(plan: dict[str, Any]) -> list[dict[str, str]]:
    """One blunt line per section, from the plan's real numbers. Serious emotions; pleased only if flawless."""
    f = plan.get("facts") or {}
    written = {s["id"]: s["status"] == "written" for s in plan["sections"]}
    signups, target = f.get("signups"), f.get("signup_target")
    low = f.get("low_trust_only") or []
    flawless = signups is not None and target is not None and signups >= target and not low
    gates = f.get("gates") or {}

    def low_note(sid: str) -> str:
        return " Only low-trust sources behind it." if sid in low else ""

    lines: dict[str, tuple[str, str]] = {}
    reach = f.get("reach")
    lines["profile"] = (f"{reach} people you can reach today. Reach is not sales, ya basha." if reach is not None
                        else "No group you can reach today is listed. Who pays you?",
                        "neutral" if reach is not None else "skeptical")
    if f.get("sourced") is not None:
        short = f["sourced"] < f["sourced_target"] or "opportunity" in low
        lines["opportunity"] = (f"{f['sourced']} of {f['sourced_target']} problems have a source. Founder fit "
                                f"{f['founder_fit']} of 5 is a model guess, not proof." + low_note("opportunity"),
                                "skeptical" if short or f["founder_fit"] < f["min_fit"] else "neutral")
    else:
        lines["opportunity"] = ("The options are drafted but the Phase 1 gate has no numbers yet.", "neutral")
    a, boxes = f.get("assumptions", 0), f.get("canvas_boxes", CANVAS_BOXES)
    lines["canvas"] = (f"{a} of {boxes} boxes are ASSUMPTION. Only {boxes - a} have evidence." + low_note("canvas")
                       if a or "canvas" in low else f"All {boxes} boxes cite evidence.",
                       "skeptical" if a or "canvas" in low else "neutral")
    if signups is not None:
        pct = round(signups / target * 100) if target else 0
        base = f"{signups} of {target} sign-ups in {f.get('window_days')} days ({pct}%)."
        if flawless:
            lines["signup"] = (base + " Target met. Now check they are strangers.", "pleased")
        elif signups >= target:
            lines["signup"] = (base + " Target met, but the sources behind the plan are only low-trust.", "skeptical")
        else:
            lines["signup"] = (base + " Not there, ya basha.", "im_out" if gates.get("phase2") == "stop" else "skeptical")
    else:
        lines["signup"] = ("No sign-up count yet. Count real people, not likes.", "listening")
    if gates:
        said = "; ".join(f"{k.replace('phase', 'Phase ')} gate said {v}" for k, v in sorted(gates.items()))
        nums = f" {signups} of {target} sign-ups." if signups is not None else ""
        if flawless:
            lines["decisions"] = (f"{said}.{nums} Sources hold up. Now we talk.", "pleased")
        else:
            bad = any(v == "stop" for v in gates.values())
            lines["decisions"] = (f"{said}.{nums}" + (" That is a stop. Say it plainly." if bad else " Keep the proof coming."),
                                  "im_out" if bad else "skeptical")
    else:
        lines["decisions"] = ("No gate decision yet. Nothing to judge.", "listening")

    out = []
    for s in plan["sections"]:
        line, emotion = lines[s["id"]]
        if not written.get(s["id"]) and s["id"] != "decisions":
            line, emotion = "Not written yet. I do not judge blank pages, ya basha.", "neutral"
        out.append({"section": s["id"], "emotion": emotion, "line": line})
    return out


# -- Markdown export --------------------------------------------------------------

def plan_markdown(plan: dict[str, Any], run_id: str) -> str:
    lines = ["# Business plan", "",
             f"Run {run_id}, exported {_now()}. Built only from the run's files. "
             "Every claim shows its source URL or the word ASSUMPTION.", "",
             f"Where it stands: {plan['overview']['status_text']} Stage: {plan['overview']['stage']}.", ""]
    issues = plan["overview"]["issues"]
    if issues:
        lines += ["## Open issues", ""] + [f"- [{i['severity']}] {i['text']}" for i in issues] + [""]
    for s in plan["sections"]:
        lines += [f"## {s['title']}", ""]
        if s["status"] != "written":
            lines += ["Not written yet.", ""]
            continue
        lines += [re.sub(r"^(#+) ", r"#\1 ", s["body_markdown"], flags=re.M), ""]
        if s["sources"]:
            lines += ["Sources:", ""] + [f"- {x['title']} ({x['trust']} trust): {x['url']}" for x in s["sources"]] + [""]
    lines += ["## Ahmed Tarek's notes (Parody)", "", f"_{DISCLAIMER}_", ""]
    lines += [f"- {TITLES[c['section']]} ({c['emotion']}): {c['line']}" for c in plan["critique"]]
    lines.append("")
    return "\n".join(lines)
