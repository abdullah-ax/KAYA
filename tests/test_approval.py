"""Founder approval: a real option and a real reason, enforced in code."""
from types import SimpleNamespace

import pytest

from api.approval import Approval, ApprovalError, check_approval, require_approval

OPTIONS = ["Freelancer invoices", "Tutor scheduling", "Bakery pre-orders"]
GOOD_REASON = "I ran invoices for six years and know the pain well"


def make_cfg(min_reason_words=8):
    rejected = ["yes", "y", "ok", "okay", "sure", "fine", "looks good",
                "lgtm", "go", "next", "approve"]
    return SimpleNamespace(min_reason_words=min_reason_words,
                           approval=SimpleNamespace(rejected_answers=rejected))


def test_bare_yes_is_rejected():
    with pytest.raises(ApprovalError):
        check_approval(OPTIONS[0], "yes", OPTIONS, make_cfg(min_reason_words=1))


@pytest.mark.parametrize("answer", ["Yes!", "  OK.  ", "Looks good!!", "LGTM"])
def test_bare_answers_rejected_ignoring_case_and_punctuation(answer):
    with pytest.raises(ApprovalError):
        check_approval(OPTIONS[0], answer, OPTIONS, make_cfg(min_reason_words=1))


def test_approval_with_no_option_is_rejected():
    with pytest.raises(ApprovalError, match="option"):
        check_approval(None, GOOD_REASON, OPTIONS, make_cfg())


def test_unknown_option_is_rejected():
    with pytest.raises(ApprovalError, match="option"):
        check_approval("Crypto signals", GOOD_REASON, OPTIONS, make_cfg())


def test_short_reason_is_rejected_for_the_mode():
    with pytest.raises(ApprovalError, match="8 words"):
        check_approval(OPTIONS[0], "I know invoices well", OPTIONS, make_cfg())


def test_missing_reason_is_rejected():
    with pytest.raises(ApprovalError):
        check_approval(OPTIONS[0], None, OPTIONS, make_cfg())


def test_valid_answer_returns_founder_approval():
    approval = check_approval(" freelancer invoices ", GOOD_REASON, OPTIONS, make_cfg())
    assert approval == Approval("Freelancer invoices", GOOD_REASON, "founder")


@require_approval("publish landing page")
def publish(page: str, *, approval: Approval) -> str:
    return f"published {page}"


def test_publish_without_approval_does_not_run():
    with pytest.raises(ApprovalError, match="publish landing page"):
        publish("index.html")


def test_publish_with_wrong_object_does_not_run():
    with pytest.raises(ApprovalError):
        publish("index.html", approval="yes")


def test_publish_with_non_founder_approval_does_not_run():
    with pytest.raises(ApprovalError):
        publish("index.html", approval=Approval(OPTIONS[0], GOOD_REASON, "agent"))


def test_publish_with_valid_approval_runs():
    approval = check_approval(OPTIONS[0], GOOD_REASON, OPTIONS, make_cfg())
    assert publish("index.html", approval=approval) == "published index.html"


def test_hand_made_approval_does_not_run():
    with pytest.raises(ApprovalError):
        publish("index.html", approval=Approval(OPTIONS[0], GOOD_REASON))


@pytest.mark.parametrize("answer", ["ايوه تمام ماشي", "tamam aywa mashy", "Tamam, aywa, اه!"])
def test_strings_made_only_of_arabic_and_franco_arabic_fillers_are_rejected_by_the_shipped_config(answer):
    import yaml
    from pathlib import Path
    raw = yaml.safe_load((Path(__file__).resolve().parent.parent / "config.yaml").read_text(encoding="utf-8"))
    cfg = SimpleNamespace(min_reason_words=1,
                          approval=SimpleNamespace(rejected_answers=raw["approval"]["rejected_answers"]))
    with pytest.raises(ApprovalError):
        check_approval(OPTIONS[0], answer, OPTIONS, cfg)
