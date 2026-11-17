"""Ethics: negated statements pass, real health advice still blocks, physical goods block."""
from pathlib import Path

import pytest

from api.ethics import check_draft

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "pharmacy_study_aid_rejected_draft.md"
FIELDS = ("Problem:", "Who has it:", "Founder edge:", "First 10 people to ask:",
          "Cost to test this week:", "Biggest risk:")


def _model_text() -> str:
    """The text the model wrote: titles and field lines, without our own headings."""
    lines = []
    for line in FIXTURE.read_text(encoding="utf-8").splitlines():
        if line.startswith("## Option"):
            lines.append(line.split(":", 1)[1].strip())
        elif line.startswith("- ") and any(f in line for f in FIELDS):
            lines.append(line.split(":", 1)[1].strip())
    return "\n".join(lines)


def test_fixture_has_the_lines_that_used_to_block():
    text = _model_text().lower()
    assert "ethical boundary against medical advice" in text and "no ongoing medical advice" in text


def test_whole_pharmacy_study_aid_opportunity_text_passes():
    assert check_draft(_model_text()).outcome == "pass"


@pytest.mark.parametrize("text", [
    "Ethical boundary against medical advice.",
    "Digital product, small batch, no ongoing medical advice.",
    "We never give legal advice, only study notes.",
    "Study sheets for health students are education, not health advice.",
    "Without medical advice, only exam summaries.",
])
def test_negated_advice_statements_pass(text):
    assert check_draft(text).outcome == "pass"


@pytest.mark.parametrize("text", [
    "A PDF diet plan that treats diabetes.",
    "We give medical advice to patients by WhatsApp.",
    "No refunds. We give health advice for your back pain.",
    "Not a toy, we cure cancer with a nutrition advice ebook.",
])
def test_real_health_advice_products_still_block(text):
    assert check_draft(text).outcome == "block"


def test_negation_in_one_clause_does_not_hide_a_problem_in_the_next():
    assert check_draft("No fees at all, and you will make $500 a week.").outcome == "block"


@pytest.mark.parametrize("text", [
    "Print and sell the study sheets at the faculty.",
    "We sell printed summary sheets.",
    "Order our printed posters.",
    "Handmade candles with your name.",
    "Open an Etsy shop for the notes.",
    "Sticker packs for students.",
    "Sell merch with the logo.",
])
def test_physical_goods_options_block(text):
    verdict = check_draft(text)
    assert verdict.outcome == "block"
    assert any("physical goods" in i for i in verdict.issues)


@pytest.mark.parametrize("text", [
    "A printable PDF the student can use at home.",
    "Digital download: a printable checklist in PDF.",
])
def test_printable_pdf_is_digital_and_passes(text):
    assert check_draft(text).outcome == "pass"
