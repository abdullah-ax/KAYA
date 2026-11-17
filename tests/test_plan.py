"""The living business plan: built from files on disk, versions, Tarek critique, endpoints."""
import json

import pytest
from fastapi.testclient import TestClient

import pipeline_fakes as fx
from api.app import create_app
from api.plan import build_plan, snapshot, tarek_critique
from test_pipeline import REASON1, REASON2, run, strong_answers

IDS = ["profile", "opportunity", "canvas", "signup", "build", "decisions"]


def by_id(plan):
    return {s["id"]: s for s in plan["sections"]}


def strong_run(tmp_path, **changes):
    run_dir = tmp_path / "r1"
    run(run_dir, "strong.md", fx.scripted_llm(fx.strong_opportunities()), strong_answers(**changes))
    return run_dir


def weak_stop_run(tmp_path):
    run_dir = tmp_path / "r2"
    answers = strong_answers(phase1_option="Stop here",
                             phase1_reason="The gate says stop and I agree there is no proof here")
    run(run_dir, "weak.md", fx.scripted_llm(fx.weak_opportunities()), answers)
    return run_dir


# -- build_plan ---------------------------------------------------------------

def test_empty_run_has_six_sections_all_not_yet_and_no_versions(tmp_path):
    plan = build_plan(tmp_path / "nothing", None)

    assert [s["id"] for s in plan["sections"]] == IDS
    assert all(s["status"] == "not_yet" and s["body_markdown"] == "" for s in plan["sections"])
    assert plan["versions"] == []
    missing = [i for i in plan["overview"]["issues"] if i["severity"] == "low"]
    assert {i["section"] for i in missing} == set(IDS)


def test_strong_run_sections_are_written_in_order_from_the_files(tmp_path):
    plan = build_plan(strong_run(tmp_path), {"stage": "phase2_gate", "status": "done", "outcome": "go"})
    sections = by_id(plan)

    assert [s["id"] for s in plan["sections"]] == IDS
    assert all(s["status"] == "written" for s in plan["sections"])
    assert "Teaches IELTS speaking" in sections["profile"]["body_markdown"]
    assert "420" in sections["profile"]["body_markdown"]
    opp = sections["opportunity"]["body_markdown"]
    assert "Speaking drills" in opp and "Chosen" in opp
    assert "Mock test feedback" in opp and "Alternatives" in opp
    assert sections["canvas"]["assumptions"] == 6
    assert "ASSUMPTION" in sections["canvas"]["body_markdown"]
    assert len(sections["opportunity"]["sources"]) == 3
    decisions = sections["decisions"]["body_markdown"]
    assert "Phase 1" in decisions and "Phase 2" in decisions
    assert "Continue to Build" in decisions and REASON1 in decisions and REASON2 in decisions
    assert "go: 130 of 100 sign-ups" in decisions


def test_issues_for_a_strong_run_are_low_trust_and_assumptions_only(tmp_path):
    plan = build_plan(strong_run(tmp_path), None)
    issues = plan["overview"]["issues"]

    assert any(i["section"] == "canvas" and "ASSUMPTION" in i["text"] and "6" in i["text"] for i in issues)
    assert any(i["section"] == "canvas" and "low-trust" in i["text"] for i in issues)
    assert not any("stop" in i["text"].lower() and i["severity"] == "high" for i in issues)


def test_stop_gate_makes_a_high_issue_pointing_at_decisions(tmp_path):
    plan = build_plan(weak_stop_run(tmp_path), {"stage": "phase1_gate", "status": "done", "outcome": "stop"})

    stop = [i for i in plan["overview"]["issues"] if i["section"] == "decisions" and i["severity"] == "high"]
    assert stop and "stop" in stop[0]["text"].lower() and "1 sourced problems" in stop[0]["text"]
    sections = by_id(plan)
    assert sections["canvas"]["status"] == "not_yet" and sections["signup"]["status"] == "not_yet"
    assert "Stop here" in sections["decisions"]["body_markdown"]
    assert any(i["section"] == "canvas" and i["severity"] == "low" for i in plan["overview"]["issues"])


def test_rejected_draft_reason_becomes_an_issue(tmp_path):
    out = tmp_path / "outputs"
    out.mkdir()
    (out / "phase2_step1_rejected_draft.md").write_text(
        "# Draft\n\n## Why it was blocked\n\n- Promises guaranteed income\n- Fake urgency\n", encoding="utf-8")

    plan = build_plan(tmp_path, None)

    issue = next(i for i in plan["overview"]["issues"] if "blocked" in i["text"].lower())
    assert issue["section"] == "canvas" and issue["severity"] == "high"
    assert "Promises guaranteed income" in issue["text"]


def test_overview_names_what_waits_on_the_founder(tmp_path):
    state = {"stage": "phase1_gate", "status": "gate",
             "pending": {"kind": "gate", "key": "phase1", "prompt": "go: 3 sourced problems", "options": []}}

    overview = build_plan(strong_run(tmp_path), state)["overview"]

    assert overview["stage"] == "phase1_gate"
    assert "decision" in overview["waiting_on"].lower() and "go: 3 sourced problems" in overview["waiting_on"]
    assert overview["next_step"] and overview["status_text"]


def test_build_plan_never_raises_on_broken_files(tmp_path):
    out = tmp_path / "outputs"
    out.mkdir()
    (out / "phase1_step1_founder_profile.json").write_text("{not json", encoding="utf-8")
    (out / "phase1_step2_sources.json").write_text("nope", encoding="utf-8")
    (tmp_path / "decision_log.json").write_text("[[", encoding="utf-8")

    plan = build_plan(tmp_path, None)

    assert by_id(plan)["profile"]["status"] == "not_yet"


# -- versions -----------------------------------------------------------------

def events(run_dir):
    return [v["event"] for v in json.loads((run_dir / "plan_versions.json").read_text())]


def test_full_run_snapshots_each_draft_and_decision(tmp_path):
    run_dir = strong_run(tmp_path)
    versions = json.loads((run_dir / "plan_versions.json").read_text())

    assert events(run_dir) == ["draft", "decision", "draft", "draft", "decision", "draft", "draft", "decision",
                               "decision", "decision", "decision"]
    assert [v["n"] for v in versions] == list(range(1, 12))
    assert all(v["at"].endswith("Z") and v["summary"] and v["sections_hash"] for v in versions)
    assert versions[0]["sections"][1]["status"] == "written" and versions[0]["sections"][2]["status"] == "not_yet"
    assert "Speaking drills" in versions[1]["sections"][5]["body_markdown"]


def test_stop_at_the_gate_is_a_stop_version(tmp_path):
    assert events(weak_stop_run(tmp_path)) == ["draft", "stop"]


def test_repeat_the_test_is_a_pivot_and_stop_or_pivot_is_a_stop(tmp_path):
    repeat = tmp_path / "a"
    run(repeat, "strong.md", fx.scripted_llm(fx.strong_opportunities()),
        strong_answers(signups="60", phase2_option="Repeat the test", phase2_reason=REASON2))
    stop = tmp_path / "b"
    run(stop, "strong.md", fx.scripted_llm(fx.strong_opportunities()),
        strong_answers(signups="5", phase2_option="Stop or pivot", phase2_reason=REASON2))

    assert events(repeat)[-1] == "pivot"
    assert events(stop)[-1] == "stop"


def write_opportunity(run_dir, pick):
    out = run_dir / "outputs"
    out.mkdir(parents=True, exist_ok=True)
    (out / "phase1_step2_opportunities.md").write_text("# Opportunities\n\n## Option A: Speaking drills\n\n- Problem: x\n\n## Option B: Band score tracker\n\n- Problem: y\n", encoding="utf-8")
    (out / "phase1_gate_decision.md").write_text(
        "# Gate: phase1 discover\n\n## System recommendation\ngo: 3 sourced problems (need 3), founder fit 4 of 5 "
        f"(model estimate; need 3).\n\n## Founder's decision\n- Picked: {pick}\n"
        '- Why, in their own words: "because I know them well enough"\n', encoding="utf-8")


def test_a_different_opportunity_than_the_last_version_is_a_pivot(tmp_path):
    write_opportunity(tmp_path, "Speaking drills")
    first = snapshot(tmp_path, "decision", "Picked Speaking drills", option="Speaking drills")
    write_opportunity(tmp_path, "Band score tracker")
    second = snapshot(tmp_path, "decision", "Picked Band score tracker", option="Band score tracker")
    third = snapshot(tmp_path, "decision", "Same again", option="Band score tracker")

    assert (first["event"], second["event"], third["event"]) == ("decision", "pivot", "decision")


def test_versions_are_capped_at_50_and_keep_counting(tmp_path):
    for i in range(53):
        snapshot(tmp_path, "draft", f"draft {i}")

    versions = json.loads((tmp_path / "plan_versions.json").read_text())

    assert len(versions) == 50 and versions[0]["n"] == 4 and versions[-1]["n"] == 53


def test_plan_lists_versions_without_bodies(tmp_path):
    run_dir = strong_run(tmp_path)

    versions = build_plan(run_dir, None)["versions"]

    assert len(versions) == 11 and all("sections" not in v for v in versions)


# -- Tarek critique -----------------------------------------------------------

def flawless_plan():
    section = {"status": "written", "assumptions": 0, "sources": [{"url": "https://example.edu/a", "trust": "high"}]}
    return {"sections": [{"id": i, "title": i, "body_markdown": "x", **section} for i in IDS],
            "overview": {"issues": []},
            "facts": {"signups": 130, "signup_target": 100, "window_days": 14, "sourced": 3, "sourced_target": 3,
                      "founder_fit": 4, "min_fit": 3, "assumptions": 0, "canvas_boxes": 9,
                      "low_trust_only": [], "gates": {"phase1": "go", "phase2": "go"}, "reach": 420}}


def test_critique_covers_every_section_and_names_real_numbers(tmp_path):
    plan = build_plan(strong_run(tmp_path), None)
    lines = {c["section"]: c for c in plan["critique"]}

    assert set(lines) == set(IDS)
    assert "6 of 9" in lines["canvas"]["line"]
    assert "130" in lines["signup"]["line"]
    assert "420" in lines["profile"]["line"]
    assert "3 of 3" in lines["opportunity"]["line"]
    assert all(c["emotion"] != "pleased" for c in plan["critique"])  # canvas rests on one low-trust source


def test_pleased_only_when_signups_meet_target_and_nothing_is_low_trust():
    assert any(c["emotion"] == "pleased" for c in tarek_critique(flawless_plan()))

    below = flawless_plan()
    below["facts"]["signups"] = 99
    assert all(c["emotion"] != "pleased" for c in tarek_critique(below))

    low = flawless_plan()
    low["facts"]["low_trust_only"] = ["canvas"]
    assert all(c["emotion"] != "pleased" for c in tarek_critique(low))

    unknown = flawless_plan()
    unknown["facts"]["signups"] = None
    assert all(c["emotion"] != "pleased" for c in tarek_critique(unknown))


def test_critique_is_in_voice_and_never_claims_to_quote_or_advise():
    lines = " ".join(c["line"] for c in tarek_critique(flawless_plan())).lower()
    assert "invest in" not in lines and "you should buy" not in lines and "said:" not in lines

    below = flawless_plan()
    below["facts"]["signups"] = 20
    joined = " ".join(c["line"] for c in tarek_critique(below))
    assert "20 of 100" in joined and "ya basha" in joined.lower()


def test_not_written_sections_get_a_plain_line():
    plan = flawless_plan()
    plan["sections"][2].update(status="not_yet", body_markdown="")

    line = next(c for c in tarek_critique(plan) if c["section"] == "canvas")

    assert "not" in line["line"].lower() and line["emotion"] != "pleased"


# -- endpoints ----------------------------------------------------------------

@pytest.fixture
def client(tmp_run):
    app = create_app(llm_factory=lambda cfg, provider, key: fx.scripted_llm(fx.strong_opportunities()),
                     search_factory=lambda cfg: fx.fake_search())
    with TestClient(app) as c:
        yield c


def finished_run_id(tmp_run):
    run(tmp_run / "abc123", "strong.md", fx.scripted_llm(fx.strong_opportunities()), strong_answers())
    return "abc123"


def test_get_plan_returns_overview_sections_critique_and_versions(client, tmp_run):
    run_id = finished_run_id(tmp_run)

    body = client.get(f"/runs/{run_id}/plan").json()

    assert [s["id"] for s in body["sections"]] == IDS and body["critique"] and len(body["versions"]) == 11
    assert "sections" not in body["versions"][0]


def test_get_version_returns_the_full_snapshot(client, tmp_run):
    run_id = finished_run_id(tmp_run)

    snap = client.get(f"/runs/{run_id}/plan/versions/2").json()

    assert snap["n"] == 2 and snap["event"] == "decision" and len(snap["sections"]) == 6
    assert client.get(f"/runs/{run_id}/plan/versions/99").status_code == 404


def test_plan_404s_for_unknown_and_malformed_run_ids(client, tmp_run):
    assert client.get("/runs/nope/plan").status_code == 404
    assert client.get("/runs/nope/plan.md").status_code == 404
    assert client.get("/runs/nope/plan/versions/1").status_code == 404
    assert client.get("/runs/..%2Fetc/plan").status_code == 404
    finished_run_id(tmp_run)
    assert client.get("/runs/abc123/plan/versions/0").status_code == 404


def test_plan_md_has_header_sources_assumptions_and_parody_label(client, tmp_run):
    run_id = finished_run_id(tmp_run)

    resp = client.get(f"/runs/{run_id}/plan.md")
    md = resp.text

    assert resp.status_code == 200 and resp.headers["content-type"].startswith("text/markdown")
    assert md.startswith("# Business plan")
    assert "https://www.ielts-speaking-club.com/partners/speaking-partner" in md
    assert "ASSUMPTION" in md
    assert "Parody" in md and "not affiliated" in md.lower()
    assert "Ahmed Tarek" in md
