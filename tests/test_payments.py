"""MOCKED sale to cash: payment -> one delivery, idempotency, refunds, reconcile, script."""
import subprocess
import sys
from pathlib import Path

import pytest

from api.approval import Approval, ApprovalError, check_approval
from api.fulfilment import Fulfilment
from api.log import DecisionLog
from api.payments import Order, PaymentProcessor
from api.refunds import request_refund
from api.reconcile import reconcile
from test_approval import GOOD_REASON, make_cfg

ROOT = Path(__file__).resolve().parent.parent
OPTS = ["Refund order o1"]


@pytest.fixture
def proc(tmp_path):
    p = PaymentProcessor(DecisionLog(tmp_path / "decision_log.json"))
    p.create_order(Order("o1", 50000, "IELTS drills"))
    return p


def paid(event_id="e1", order_id="o1", amount=50000, fee=1500):
    return {"event_id": event_id, "order_id": order_id, "type": "payment_succeeded",
            "amount": amount, "fee": fee}


def founder_ok():
    return check_approval(OPTS[0], GOOD_REASON, OPTS, make_cfg())


def test_payment_triggers_exactly_one_delivery(proc):
    assert proc.handle_event(paid()) == "delivered"
    assert len(proc.fulfilment.deliveries) == 1
    assert proc.fulfilment.is_active(proc.fulfilment.deliveries[0].token)
    assert proc.orders["o1"].status == "paid"


def test_duplicate_event_is_ignored(proc):
    proc.handle_event(paid())
    assert proc.handle_event(paid()) == "duplicate"
    assert len(proc.fulfilment.deliveries) == 1
    assert proc.duplicates == 1


def test_second_payment_event_for_same_order_does_not_deliver_again(proc):
    proc.handle_event(paid("e1"))
    assert proc.handle_event(paid("e2")) == "already_delivered"
    assert len(proc.fulfilment.deliveries) == 1


def test_unknown_order_and_event_type_are_refused(proc):
    assert proc.handle_event(paid(order_id="nope")) == "unknown_order"
    assert proc.handle_event({"event_id": "x", "order_id": "o1", "type": "weird"}) == "unknown_type"
    assert proc.fulfilment.deliveries == []


def test_provider_refund_event_revokes_token(proc):
    proc.handle_event(paid())
    token = proc.fulfilment.deliveries[0].token
    assert proc.handle_event({"event_id": "r1", "order_id": "o1", "type": "refunded"}) == "refunded"
    assert not proc.fulfilment.is_active(token)
    assert proc.orders["o1"].status == "refunded"


def test_refund_for_unpaid_order_does_nothing(proc):
    assert proc.handle_event({"event_id": "r1", "order_id": "o1", "type": "refunded"}) == "not_paid"
    assert proc.orders["o1"].status == "created"


def test_founder_approved_refund_revokes_token(proc):
    proc.handle_event(paid())
    token = proc.fulfilment.deliveries[0].token
    assert request_refund(proc, "o1", approval=founder_ok()) == "refunded"
    assert not proc.fulfilment.is_active(token)


def test_refund_without_founder_approval_is_refused(proc):
    proc.handle_event(paid())
    token = proc.fulfilment.deliveries[0].token
    for bad in (None, Approval("x", "y words here now", "founder"), "yes"):
        with pytest.raises(ApprovalError):
            request_refund(proc, "o1", approval=bad)
    assert proc.fulfilment.is_active(token)
    assert proc.orders["o1"].status == "paid"


def test_decision_log_entries_say_mocked_and_refund_is_gated(proc):
    proc.handle_event(paid())
    proc.handle_event(paid())
    request_refund(proc, "o1", approval=founder_ok())
    entries = proc.log.entries()
    assert all("MOCKED" in (e["outcome"] or "") for e in entries)
    agents = [e["agent"] for e in entries]
    assert {"payments", "delivery", "refunds"} <= set(agents)
    refund = [e for e in entries if e["agent"] == "refunds"][0]
    assert refund["approved_by"] == "founder" and refund["founder_input"] == GOOD_REASON


def test_provider_refund_is_logged_as_provider_not_founder(proc):
    proc.handle_event(paid())
    proc.handle_event({"event_id": "r1", "order_id": "o1", "type": "refunded"})
    refund = [e for e in proc.log.entries() if e["agent"] == "refunds"][0]
    assert refund["approved_by"] is None and "provider" in refund["outcome"]


def test_reconcile_flags_missing_payout_and_fee_mismatch(proc):
    proc.create_order(Order("o2", 20000, "IELTS drills"))
    proc.handle_event(paid())
    proc.handle_event(paid("e2", "o2", 20000, fee=999))
    proc.handle_event({"event_id": "p1", "order_id": "o1", "type": "payout_paid", "amount": 48500})
    found = reconcile(proc)
    kinds = {(m.order_id, m.kind) for m in found.mismatches}
    assert ("o2", "missing_payout") in kinds
    assert ("o2", "fee_mismatch") in kinds
    assert not [m for m in found.mismatches if m.order_id == "o1"]
    assert all("MOCKED" in m.detail for m in found.mismatches)


def test_reconcile_flags_amount_mismatch(proc):
    proc.handle_event(paid(amount=40000, fee=1200))
    kinds = {m.kind for m in reconcile(proc).mismatches}
    assert "amount_mismatch" in kinds


def test_reconcile_ignores_payout_for_refunded_order(proc):
    proc.handle_event(paid())
    proc.handle_event({"event_id": "r1", "order_id": "o1", "type": "refunded"})
    assert reconcile(proc).mismatches == []


def test_reconcile_logs_one_entry(proc):
    reconcile(proc)
    assert [e["agent"] for e in proc.log.entries()] == ["reconcile"]


def test_fulfilment_tokens_are_unique_and_labelled():
    f = Fulfilment()
    a, b = f.issue("o1", "p"), f.issue("o2", "p")
    assert a.token != b.token and a.token.startswith("MOCKED-")


def test_script_writes_log_with_mocked_and_counts(tmp_path):
    out = tmp_path / "payment_test_log.md"
    subprocess.run([sys.executable, str(ROOT / "scripts" / "payment_test.py"),
                    "--out", str(out), "--log", str(tmp_path / "dl.json")],
                   check=True, cwd=ROOT)
    text = out.read_text(encoding="utf-8")
    assert "MOCKED" in text and "| order_id |" in text
    assert "Orders: 3" in text
    assert "Deliveries issued: 3" in text
    assert "Duplicate events ignored: 1" in text
    assert "Refunds: 1" in text
    assert "Mismatches found: 2" in text
    assert "missing_payout" in text and "fee_mismatch" in text
    assert "·" not in text and "•" not in text


def test_reconcile_checks_fee_on_refunded_order_but_not_payout(proc):
    proc.handle_event(paid(fee=999))
    proc.handle_event({"event_id": "r1", "order_id": "o1", "type": "refunded"})
    assert [m.kind for m in reconcile(proc).mismatches] == ["fee_mismatch"]
