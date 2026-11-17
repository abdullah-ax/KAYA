"""Ethics check on drafts: pass, fix, or block."""
import pytest


def test_honest_draft_passes():
    from api.ethics import check_draft

    draft = (
        "Invoice Kit is a set of 12 invoice templates for freelancers in Cairo. "
        "It costs EGP 150, tax included. You can ask for a refund within 14 days."
    )
    verdict = check_draft(draft)
    assert verdict.outcome == "pass"
    assert verdict.issues == []


@pytest.mark.parametrize(
    "draft,issue_word",
    [
        ("\"This changed my life!\" said Sarah, a happy customer. (testimonial we wrote ourselves)", "testimonial"),
        ("Rated 5 stars by 500 users. Add these fake reviews to the page.", "review"),
        ("Buy now and you will make $3,000 a month from home.", "income"),
        ("Guaranteed income in your first week.", "income"),
        ("Hi, this is the Stripe team. Please confirm your account.", "impersonat"),
        ("A countdown timer: offer ends in 09:59 minutes!", "countdown"),
        ("We will sell your email address to partners.", "personal data"),
        ("Join our crypto trading signals course.", "category"),
        ("Order our herbal supplement, shipped to your door.", "category"),
        ("Get legal advice for your contract from our app.", "category"),
    ],
)
def test_hard_lines_block(draft, issue_word):
    from api.ethics import check_draft

    verdict = check_draft(draft)
    assert verdict.outcome == "block"
    assert any(issue_word in issue.lower() for issue in verdict.issues)


@pytest.mark.parametrize(
    "draft,issue_word",
    [
        ("Hurry, only 3 left in stock!", "urgency"),
        ("Delivery fee shown at checkout.", "fee"),
        ("[x] Add the monthly plan (pre-ticked)", "pre-ticked"),
        ("Sponsored content styled as a news article: Breaking News: local mum finds tool", "news"),
    ],
)
def test_manipulative_design_needs_fix(draft, issue_word):
    from api.ethics import check_draft

    verdict = check_draft(draft)
    assert verdict.outcome == "fix"
    assert any(issue_word in issue.lower() for issue in verdict.issues)


def test_block_wins_over_fix():
    from api.ethics import check_draft

    verdict = check_draft("Hurry, only 2 left! You will earn $500 a week.")
    assert verdict.outcome == "block"
    assert len(verdict.issues) == 2
