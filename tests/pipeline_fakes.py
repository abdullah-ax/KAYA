"""Offline fakes for pipeline tests: canned model replies and search results."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from api.config import load_config
from api.llm import FakeLLM
from api.research import FakeSearch, SearchResult

ROOT_CONFIG = str(Path(__file__).resolve().parent.parent / "config.yaml")

PROFILE: dict[str, Any] = {
    "strengths": [{"strength": "Teaches IELTS speaking", "quote": "I have coached 300 students since 2021"}],
    "access": [{"group": "IELTS Alexandria WhatsApp group", "how_many": "420", "reach_today": True}],
    "constraints": ["10 hours a week", "EGP 2,000 to spend"],
    "personality": [{"signal": "careful", "quote": "I test before I buy"}],
    "cofounder_type": "warm_skeptic",
    "cofounder_why": "She plans well but avoids hard calls.",
    "teaching_level": "strengths-led",
    "markets": [{"market": "IELTS test takers in Egypt", "why": "Coached 300 students"}],
    "open_questions": ["How much do students pay for mock tests now?"],
}

LOW_URL = "https://www.reddit.com/r/IELTS/comments/abc/speaking_partner/"  # forum: low trust

URLS = [
    "https://www.ielts-speaking-club.com/partners/speaking-partner",
    "https://www.britishcouncil.org/exam/ielts/results",
    "https://example.edu/ielts-speaking-study",
    LOW_URL,
]

RESULTS = [SearchResult(f"Source {i}", url, f"Snippet {i} about IELTS speaking.", "duckduckgo")
           for i, url in enumerate(URLS)]

UNSEEN = "https://not-in-search.example.com/made-up"


def opportunity(title: str, url: str, fit: int = 4) -> dict[str, Any]:
    return {
        "title": title,
        "problem": f"Students fail the speaking part because they lack practice ({title}).",
        "who": "IELTS students in Alexandria who sit the test this year.",
        "evidence_urls": [url],
        "founder_edge": "Coached 300 students since 2021.",
        "first_10": "Ten students from the WhatsApp group.",
        "cost_to_test": "EGP 0 and 5 hours.",
        "risk": "Students may want a live tutor, not a recording.",
        "founder_fit": fit,
    }


def strong_opportunities() -> dict[str, Any]:
    return {"opportunities": [opportunity("Speaking drills", URLS[0]),
                              opportunity("Mock test feedback", URLS[1]),
                              opportunity("Band score tracker", URLS[2])]}


def weak_opportunities() -> dict[str, Any]:
    return {"opportunities": [opportunity("Habit app for everyone", UNSEEN, fit=2),
                              opportunity("To-do list with AI", URLS[0], fit=2)]}


def canvas(url: str = LOW_URL) -> dict[str, Any]:
    box = {"content": "Students in the group practice alone.", "source_url": url}
    plain = {"content": "Sell by hand in the WhatsApp group.", "source_url": None}
    return {"customer_segments": box, "problem": box, "uvp": plain, "solution": plain,
            "channels": plain, "revenue": {"content": "EGP 150 a month.", "source_url": None},
            "costs": plain, "key_metrics": {"content": "Sign-ups in 14 days.", "source_url": None}}


def interview_script() -> dict[str, Any]:
    return {"questions": ["Tell me about the last time you practised speaking before a test.",
                          "What happened the last time you could not find a partner?",
                          "Why was that hard for you?",
                          "What did you do to fix it?",
                          "What did you not like about what you tried?"],
            "first_people": ["The ten most active students in the IELTS Alexandria WhatsApp group."]}


def story(who: str, want: str, why: str, priority: str, hours: int, first: str,
          url: str | None = None) -> dict[str, Any]:
    return {"who": who, "want": want, "why": why, "priority": priority, "hours": hours,
            "criteria": [f"Given a student in the group, when they ask for {want.lower()}, then they get it within a day.",
                         "Given the first ten students, when they try it, then at least seven finish it."],
            "first_version": first, "backed_by": url}


def user_stories(must_hours: int = 4) -> dict[str, Any]:
    """Five stories. Three are must-haves that share must_hours hours between them."""
    a, b = must_hours // 3, must_hours // 3
    c = max(1, must_hours - a - b)
    who = "IELTS student in Alexandria"
    return {"stories": [
        story(who, "a short speaking drill every day", "I practise before the test", "must", max(1, a),
              "Send one prompt a day in the WhatsApp group by hand.", URLS[0]),
        story(who, "feedback on my answer", "I know what to fix", "must", max(1, b),
              "Coach listens to each voice note and replies with three notes.", None),
        story(who, "a sign-up form for the weekly drill", "I get a spot without chasing anyone", "must", c,
              "A free form that collects a name and a phone number.", None),
        story(who, "a score tracker", "I see my progress", "should", 6,
              "A shared spreadsheet with one row per student.", None),
        story(who, "reminders before the test", "I do not forget to practise", "could", 3,
              "A calendar note sent to the group every Sunday.", None)]}


def mvp_plan() -> dict[str, Any]:
    return {"not_building": ["An app or a website", "Payments", "A score tracker for every student"],
            "tools": ["WhatsApp group you already run", "Google Forms (free)", "Google Sheets (free)"],
            "checklist": [{"when": "Days 1-2", "task": "Write seven speaking prompts and a short feedback guide."},
                          {"when": "Days 3-5", "task": "Make the sign-up form and test it with a friend."},
                          {"when": "Week 1", "task": "Send the first prompt to ten students from the group."},
                          {"when": "Days 8-12", "task": "Reply to every voice note by hand with three notes."},
                          {"when": "Days 13-14", "task": "Ask each student what they would change, then list the fixes."}],
            "first_10": ["Pick the ten most active students in the IELTS Alexandria WhatsApp group.",
                         "Message each one by name and offer a free week of daily drills.",
                         "Do not post in the whole group until these ten have tried it."],
            "one_metric": "How many of the ten students finish at least five drills in the first week."}


def scripted_llm(opps: dict[str, Any], questions: int = 2, boss: str = "pass",
                 overrides: dict[str, list[dict[str, Any]]] | None = None) -> FakeLLM:
    """A FakeLLM that answers by schema name. overrides hold queued replies per schema."""
    queued = {k: list(v) for k, v in (overrides or {}).items()}
    replies: dict[str, dict[str, Any]] = {
        "IntakePlan": {"answered": ["skills"], "questions": [f"Gap question {i}?" for i in range(questions)]},
        "FounderProfile": PROFILE,
        "SearchPlan": {"queries": ["ielts speaking practice egypt"]},
        "OpportunityDraft": opps,
        "BossVerdict": {"verdict": boss, "checks": [], "delete_lines": []},
        "LeanCanvas": canvas(),
        "InterviewScript": interview_script(),
        "UserStories": user_stories(),
        "MvpPlan": mvp_plan(),
    }

    def reply(system: str, user: str, schema: type) -> dict[str, Any]:
        name = schema.__name__
        if queued.get(name):
            return queued[name].pop(0)
        return replies[name]

    return FakeLLM(reply)


def fake_search() -> FakeSearch:
    return FakeSearch({"ielts speaking practice egypt": RESULTS})


def config():
    return load_config(ROOT_CONFIG)
