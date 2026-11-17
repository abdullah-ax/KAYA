"""Phases 4-6 in the run: commercial setup, a MOCKED sale-to-cash test, then operate and learn."""
import json

import pipeline_fakes as fx
from api.gates import phase4_gate, phase5_gate, phase6_gate
from test_pipeline import REASON4, REASON6, REASON_REFUND, out, run, strong_answers


def full_run(tmp_run, **changes):
    return run(tmp_run, "strong.md", fx.scripted_llm(fx.strong_opportunities()), strong_answers(**changes))


def test_a_full_run_goes_through_all_six_phases(tmp_run):
    ctx, result = full_run(tmp_run)

    assert result.stopped_at == "phase6_gate" and result.outcome == "go"
    state = json.loads((tmp_run / "state.json").read_text())
    assert state["phase4"] == "go" and state["phase5"] == "go" and state["phase6"] == "go"
    for name in ("phase4_step1_offer.md", "phase4_gate_decision.md", "phase5_step1_sales_log.md",
                 "phase5_step2_reconciliation.md", "phase5_gate_decision.md",
                 "phase6_step1_learning_review.md", "phase6_gate_decision.md"):
        assert (tmp_run / "outputs" / name).exists(), name


def test_the_offer_names_price_refund_policy_and_says_mocked(tmp_run):
    full_run(tmp_run)

    offer = out(tmp_run, "phase4_step1_offer.md")
    assert "EGP 400" in offer and "refund" in offer.lower() and "MOCKED" in offer
    assert "guarantee" not in offer.lower()
    assert REASON4 in out(tmp_run, "phase4_gate_decision.md")


def test_sales_are_mocked_idempotent_and_the_refund_needs_the_founder(tmp_run):
    ctx, _ = full_run(tmp_run)

    log = out(tmp_run, "phase5_step1_sales_log.md")
    assert "MOCKED" in log and "duplicate" in log.lower()
    refund = next(e for e in ctx.log.entries() if e["action"] == "refund_order")
    assert refund["approved_by"] == "founder" and refund["founder_input"] == REASON_REFUND
    issued = [e for e in ctx.log.entries() if e["action"] == "issue_access_token"]
    assert len(issued) == 6  # one per order, the duplicate webhook delivers nothing
    recon = out(tmp_run, "phase5_step2_reconciliation.md")
    assert "Mismatches: 0" in recon


def test_keeping_the_order_means_no_refund(tmp_run):
    ctx, _ = full_run(tmp_run, refund_option="Keep the order",
                      refund_reason="The buyer already used most of the drills, so I will offer a reschedule")

    assert not any(e["action"] == "refund_order" for e in ctx.log.entries())


def test_operate_and_learn_writes_the_review_with_the_founders_numbers(tmp_run):
    full_run(tmp_run)

    review = out(tmp_run, "phase6_step1_learning_review.md")
    assert "3 of 6" in review and "pronunciation" in review and "founder-entered" in review
    assert REASON6 in out(tmp_run, "phase6_gate_decision.md")


def test_stop_at_commercial_setup_ends_the_run(tmp_run):
    _, result = full_run(tmp_run, phase4_option="Stop here",
                         phase4_reason="I am not ready to charge my students yet, so I will stop here for now")

    assert result.outcome == "stop" and result.stopped_at == "phase4_gate"
    assert not (tmp_run / "outputs" / "phase5_step1_sales_log.md").exists()


def test_phase4_gate_needs_a_price_above_zero():
    assert phase4_gate(400, ethics_ok=True).outcome == "go"
    assert phase4_gate(0, ethics_ok=True).outcome == "repeat"
    assert phase4_gate(400, ethics_ok=False).outcome == "repeat"


def test_phase5_gate_wants_paid_orders_and_clean_books():
    assert phase5_gate(paid=6, mismatches=0).outcome == "go"
    assert phase5_gate(paid=0, mismatches=0).outcome == "repeat"
    assert phase5_gate(paid=6, mismatches=2).outcome == "repeat"


def test_phase6_gate_reads_repeat_buyers():
    assert phase6_gate(came_back=3, paid=6).outcome == "go"
    assert phase6_gate(came_back=1, paid=6).outcome == "repeat"
    assert phase6_gate(came_back=0, paid=6).outcome == "pivot"
    assert phase6_gate(came_back=0, paid=0).outcome == "stop"
