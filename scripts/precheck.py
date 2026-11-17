#!/usr/bin/env python3
"""Check the repo against the organizers' CLAUDE.md conventions before a push to main.

Exit code 1 if any ERROR is found. Warnings print but don't block.
Run: python scripts/precheck.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

README_HEADINGS = [
    "Quickstart",
    "What works and what is mocked",
    "Architecture",
    "Models and free resources",
    "Cost per run",
    "Demo video",
    "What our system will NOT do",
    "How the project stays alive after the hackathon",
]
README_MUST = {"Quickstart", "What works and what is mocked", "Models and free resources", "Cost per run"}
ARCH_HEADINGS = ["Overview", "Phases", "Gates", "Sale to cash", "Data flow", "Built vs. stubbed", "Roadmap"]
LOG_KEYS = ["timestamp", "agent", "action", "sources", "model", "cost", "approved_by"]
OUTPUT_NAME = re.compile(r"^(phase\d+_step\d+_[a-z0-9_\-]+|phase\d+_gate_[a-z0-9_\-]+|payment_test_log)\.(md|json|csv|txt|html)$")
OSI_MARKERS = [
    "Permission is hereby granted, free of charge",          # MIT
    "Apache License",                                        # Apache-2.0
    "GNU GENERAL PUBLIC LICENSE",                            # GPL-3.0
    "GNU AFFERO GENERAL PUBLIC LICENSE",                     # AGPL-3.0
    "Redistribution and use in source and binary forms",     # BSD-3-Clause
    "Mozilla Public License",                                # MPL-2.0
]
SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"sk_live_[A-Za-z0-9]{10,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"ghp_[A-Za-z0-9]{30,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
]
REVIEWER_PATTERNS = [
    re.compile(r"\b(dear|to the|hello|hi)\s+(judges?|reviewers?|graders?|evaluators?)\b", re.I),
    re.compile(r"\b(full marks|perfect score|maximum score|give (us|this) (a )?(high|top|full))\b", re.I),
    re.compile(r"\b(grade|score|rate) (this|our) (repo|repository|project|submission)\b", re.I),
]
PLACEHOLDER = re.compile(r"\bTODO\b|\[FILL|\[Add |lorem ipsum", re.I)
TEXT_EXT = {".md", ".py", ".ts", ".tsx", ".js", ".json", ".yml", ".yaml", ".txt", ".html", ".toml", ".cfg", ".env", ".example"}

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def tracked_files():
    try:
        out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        return [ROOT / p for p in out.splitlines() if p]
    except Exception:
        return [p for p in ROOT.rglob("*") if p.is_file() and ".git" not in p.parts and "node_modules" not in p.parts]


def headings(text, level="##"):
    return [m.group(1).strip() for m in re.finditer(rf"^{level} (.+)$", text, re.M)]


def section(text, name):
    m = re.search(rf"^## {re.escape(name)}\s*$(.*?)(?=^## |\Z)", text, re.M | re.S)
    return m.group(1) if m else ""


def check_readme():
    p = ROOT / "README.md"
    if not p.exists():
        return err("README.md is missing")
    text = p.read_text(encoding="utf-8")
    found = [h for h in headings(text) if h in README_HEADINGS]
    for h in README_HEADINGS:
        if h not in found:
            (err if h in README_MUST else warn)(f"README: missing heading '## {h}'")
    order = [h for h in README_HEADINGS if h in found]
    if found != order:
        err(f"README: headings out of order. Expected order: {README_HEADINGS}")
    qs = section(text, "Quickstart")
    if not re.search(r"```bash\s*\n(?:.*\n)*?\s*docker compose up\s*\n(?:.*\n)*?```", qs):
        err("README Quickstart: needs a ```bash block containing exactly `docker compose up`")
    if "$" not in section(text, "Cost per run"):
        err("README Cost per run: needs a $ figure")
    table = "\n".join(l for l in section(text, "What works and what is mocked").splitlines() if l.strip().startswith("|"))
    if "|" not in table:
        err("README: 'What works and what is mocked' needs a table")
    if not re.search(r"\b(Working|MOCKED|STUBBED)\b", table):
        err("README status table: use Working, MOCKED or STUBBED")
    if not re.search(r"\bWorking\b", table):
        warn("README status table: nothing marked Working yet")
    demo = section(text, "Demo video")
    if demo and not re.search(r"https?://\S*(youtube|youtu\.be|vimeo|loom|drive\.google)", demo):
        warn("README Demo video: no YouTube/Vimeo/Loom/Drive link yet")


def check_license():
    p = ROOT / "LICENSE"
    if not p.exists():
        return err("LICENSE is missing")
    text = p.read_text(encoding="utf-8", errors="ignore")
    if not any(m in text for m in OSI_MARKERS):
        err("LICENSE: not recognized as full OSI license text")


def check_compose():
    if not ((ROOT / "docker-compose.yml").exists() or (ROOT / "compose.yaml").exists()):
        err("docker-compose.yml (or compose.yaml) is missing")


def check_log():
    p = ROOT / "decision_log.json"
    if not p.exists():
        return err("decision_log.json is missing (must come from a real pipeline run)")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        return err(f"decision_log.json is not valid JSON: {e}")
    if not isinstance(data, list) or not data:
        return err("decision_log.json must be a non-empty list from a real run")
    for i, e in enumerate(data):
        if not isinstance(e, dict):
            err(f"decision_log.json entry {i}: not an object")
            continue
        missing = [k for k in LOG_KEYS if k not in e]
        if missing:
            err(f"decision_log.json entry {i}: missing keys {missing}")
            continue
        if not isinstance(e["action"], str):
            err(f"decision_log.json entry {i}: action must be a string")
        if not isinstance(e["sources"], list):
            err(f"decision_log.json entry {i}: sources must be a list")
        if e["model"] is not None and not isinstance(e["model"], str):
            err(f"decision_log.json entry {i}: model must be a string or null")
        if not isinstance(e["cost"], (int, float)) or isinstance(e["cost"], bool):
            err(f"decision_log.json entry {i}: cost must be a number")
        if e["approved_by"] not in ("founder", None):
            err(f"decision_log.json entry {i}: approved_by must be 'founder' or null")
    if not any(e.get("approved_by") == "founder" for e in data if isinstance(e, dict)):
        warn("decision_log.json: no founder-approved action in this run")
    if p.stat().st_size > 500_000:
        warn("decision_log.json is large; commit only the demo run")


def check_outputs():
    d = ROOT / "outputs"
    if not d.is_dir():
        return err("outputs/ is missing")
    files = [p for p in d.iterdir() if p.is_file() and p.name != ".gitkeep"]
    if not files:
        return err("outputs/ is empty (needs real demo-run outputs)")
    for p in files:
        if not OUTPUT_NAME.match(p.name):
            err(f"outputs/{p.name}: name must be phase<N>_step<M>_<name>.<ext>, phase<N>_gate_<name>.<ext> or payment_test_log.md (text formats only)")
        if p.stat().st_size > 200_000:
            warn(f"outputs/{p.name}: over 200 KB; keep files small")
    if not any("_gate_" in p.name for p in files):
        err("outputs/: needs at least one gate decision file (phase<N>_gate_<name>)")
    gate_text = " ".join(p.read_text(encoding="utf-8", errors="ignore").lower() for p in files if "_gate_" in p.name)
    if "stop" not in gate_text:
        warn("outputs/: no gate shows a STOP recommendation (needed for the weak-idea demo)")
    md = [p for p in files if p.suffix in {".md", ".html"} and "_gate_" not in p.name and "payment" not in p.name]
    for p in md:
        t = p.read_text(encoding="utf-8", errors="ignore")
        if "http" not in t and "ASSUMPTION" not in t:
            warn(f"outputs/{p.name}: no source URL or ASSUMPTION label found")


def check_tests():
    d = ROOT / "tests"
    if not d.is_dir() or not (list(d.rglob("test_*.py")) + list(d.rglob("*.test.ts"))):
        err("tests/: needs smoke tests named test_*.py or *.test.ts")


def check_architecture():
    p = ROOT / "ARCHITECTURE.md"
    if not p.exists():
        return warn("ARCHITECTURE.md is missing (SHOULD)")
    text = p.read_text(encoding="utf-8")
    found = headings(text)
    for h in ARCH_HEADINGS:
        if h not in found:
            warn(f"ARCHITECTURE.md: missing '## {h}'")
    if "```mermaid" not in text:
        warn("ARCHITECTURE.md: no Mermaid diagram")
    phases = section(text, "Phases")
    if len(re.findall(r"^### ", phases, re.M)) < 6:
        warn("ARCHITECTURE.md: '## Phases' needs one ### per phase (6)")
    if "stop" not in section(text, "Gates").lower():
        warn("ARCHITECTURE.md: '## Gates' should say when the system recommends STOP")


def check_misc(files):
    if not (ROOT / ".env.example").exists():
        warn(".env.example is missing (SHOULD)")
    if not (ROOT / "prompts").is_dir() or not list((ROOT / "prompts").glob("*.md")):
        warn("prompts/: no prompt files (SHOULD)")
    if not (ROOT / "CLAUDE.md").exists() and not (ROOT / "AGENTS.md").exists():
        warn("CLAUDE.md (organizers' file) is not at the repo root")
    docs = ROOT / "docs"
    if docs.is_dir():
        for p in docs.rglob("*"):
            if p.is_file() and p.suffix == ".md":
                t = p.read_text(encoding="utf-8", errors="ignore")
                if "hackathon submission conventions" in t or "Problem Statement" in t:
                    err(f"{p.relative_to(ROOT)}: organizers' files must stay out of docs/")
    for p in files:
        rel = p.relative_to(ROOT)
        if rel.name == ".env":
            err(".env is tracked by git; remove it and keep it in .gitignore")
        if p.suffix not in TEXT_EXT and rel.name not in {".env.example", "LICENSE"}:
            continue
        try:
            t = p.read_text(encoding="utf-8")
        except Exception:
            continue
        for pat in SECRET_PATTERNS:
            if pat.search(t):
                err(f"{rel}: looks like a secret key")
        top = rel.parts[0] if rel.parts else ""
        if top not in {"tests", "evals", "scripts"} and rel.name != "CLAUDE.md":
            for pat in REVIEWER_PATTERNS:
                if pat.search(t):
                    err(f"{rel}: text that addresses reviewers or asks for a result")
        if rel.name in {"README.md", "ARCHITECTURE.md", "MAINTAINERS.md"} and PLACEHOLDER.search(t):
            warn(f"{rel}: placeholder text left in")


def check_branch():
    try:
        b = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        if b and b != "main":
            warn(f"current branch is '{b}'; only main is graded")
    except Exception:
        pass


def main():
    files = tracked_files()
    for fn in (check_readme, check_license, check_compose, check_log, check_outputs, check_tests, check_architecture, check_branch):
        fn()
    check_misc(files)
    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
