"""Boss-style code check: banned phrases, reading grade, em dashes."""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

CLEAN = (
    "Freelancers in Cairo send bills by WhatsApp. Six of eight we asked forgot one last month. "
    "ASSUMPTION: they would pay EGP 100 a month to stop that."
)


@pytest.fixture
def cfg(monkeypatch):
    for var in ("OLLAMA_URL", "SEARXNG_URL", "MODE", "RUNS_DIR"):
        monkeypatch.delenv(var, raising=False)
    from api.config import load_config

    return load_config(ROOT / "config.yaml")


def test_clean_plain_draft_passes(cfg):
    from api.slop_check import check_text

    report = check_text(CLEAN, cfg)
    assert report.ok is True
    assert report.banned == []
    assert report.grade <= 8
    assert report.em_dash_paragraphs == 0


@pytest.mark.parametrize(
    "draft,phrase",
    [
        ("We leverage data to help you.", "leverage"),
        ("Our tool is seamless and fast.", "seamless"),
        ("Let's dive in to the plan.", "let's dive in"),
        ("In today's fast-paced world, bills pile up.", "in today's fast-paced"),
        ("It's not just a tool, it's a friend.", "it's not just x, it's y"),
        ("This app unlocks more time.", "unlock"),
        ("Let us delve into your invoices.", "delve"),
    ],
)
def test_draft_with_banned_phrase_is_rejected(cfg, draft, phrase):
    from api.slop_check import check_text

    report = check_text(draft, cfg)
    assert report.ok is False
    assert phrase in report.banned


def test_banned_list_is_read_from_style_files():
    from api.slop_check import banned_phrases

    phrases = banned_phrases()
    for word in ("delve", "game-changer", "stands as a testament", "cutting-edge", "empower"):
        assert word in phrases


def test_flesch_kincaid_grade_matches_known_values():
    from api.slop_check import fk_grade

    assert fk_grade("The cat sat on the mat.") < 2
    hard = (
        "Organizational transformation necessitates comprehensive interdepartmental "
        "communication methodologies, institutional accountability, and considerable "
        "administrative infrastructure modernization."
    )
    assert fk_grade(hard) > 16
    assert fk_grade("") == 0


def test_draft_above_grade_eight_is_rejected(cfg):
    from api.slop_check import check_text

    draft = (
        "Comprehensive organizational infrastructure modernization necessitates considerable "
        "interdepartmental communication and institutional accountability mechanisms."
    )
    report = check_text(draft, cfg)
    assert report.grade > 8
    assert report.ok is False
    assert report.banned == []


def test_too_many_em_dashes_in_a_paragraph_is_rejected(cfg):
    from api.slop_check import check_text

    draft = "We sell bills — cheap — fast — now.\n\nSecond part has one — only."
    report = check_text(draft, cfg)
    assert report.em_dash_paragraphs == 1
    assert report.ok is False


def test_two_em_dashes_is_allowed(cfg):
    from api.slop_check import check_text

    report = check_text("We sell bills — cheap ones — to shops.", cfg)
    assert report.em_dash_paragraphs == 0
