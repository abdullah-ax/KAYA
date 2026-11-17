"""Run a MOCKED sale-to-cash scenario and write outputs/payment_test_log.md. No real money."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.approval import check_approval  # noqa: E402
from api.log import DecisionLog  # noqa: E402
from api.payments import Order, PaymentProcessor, expected_fee  # noqa: E402
from api.reconcile import reconcile  # noqa: E402
from api.refunds import request_refund  # noqa: E402

PRODUCT = "IELTS speaking drills (digital)"


class _Cfg:
    min_reason_words = 8

    class approval:
        rejected_answers = ["yes", "ok", "okay", "sure", "fine", "looks good", "approve"]


def run(log_path: Path):
    proc = PaymentProcessor(DecisionLog(log_path))
    for oid, amount in (("order-1", 50000), ("order-2", 30000), ("order-3", 20000)):
        proc.create_order(Order(oid, amount, PRODUCT))
    rows: list[tuple[str, str, str]] = []

    def event(eid: str, oid: str, kind: str, **extra: int) -> None:
        result = proc.handle_event({"event_id": eid, "order_id": oid, "type": kind, **extra})
        rows.append((oid, f"{kind} ({eid})", result))

    event("evt-1", "order-1", "payment_succeeded", amount=50000, fee=expected_fee(50000))
    event("evt-2", "order-1", "payout_paid", amount=50000 - expected_fee(50000))
    event("evt-3", "order-2", "payment_succeeded", amount=30000, fee=expected_fee(30000))
    event("evt-3", "order-2", "payment_succeeded", amount=30000, fee=expected_fee(30000))  # same webhook twice
    event("evt-4", "order-3", "payment_succeeded", amount=20000, fee=999)  # fee is off
    approval = check_approval("Refund order-3", "The buyer asked and the drills did not fit their exam date",
                              ["Refund order-3"], _Cfg)
    rows.append(("order-3", "refund (founder approved)", request_refund(proc, "order-3", approval=approval)))
    # order-2 never gets a payout event: that is the missing payout
    return rows, proc, reconcile(proc)


def render(rows, proc, report) -> str:
    refunds = sum(1 for o in proc.orders.values() if o.status == "refunded")
    active = sum(1 for d in proc.fulfilment.deliveries if d.active)
    lines = ["# Payment test log (MOCKED)", "",
             "MOCKED: simulated events only. No real money moved, no real payment provider was called.", "",
             "| order_id | event | result |", "|---|---|---|"]
    lines += [f"| {o} | {e} | {r} |" for o, e, r in rows]
    lines += ["", "## Mismatches (MOCKED reconcile)", "", "| order_id | kind | detail |", "|---|---|---|"]
    lines += [f"| {m.order_id} | {m.kind} | {m.detail} |" for m in report.mismatches] or ["| none | | |"]
    lines += ["", "## Summary (MOCKED)", "",
              f"- Orders: {len(proc.orders)}",
              f"- Deliveries issued: {len(proc.fulfilment.deliveries)}",
              f"- Access tokens still active: {active}",
              f"- Duplicate events ignored: {proc.duplicates}",
              f"- Refunds: {refunds}",
              f"- Mismatches found: {len(report.mismatches)}", ""]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "outputs" / "payment_test_log.md"))
    ap.add_argument("--log", default=None, help="decision log path; default is decision_log.json at the repo root")
    args = ap.parse_args()
    log_path = Path(args.log) if args.log else ROOT / "decision_log.json"
    rows, proc, report = run(log_path)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(rows, proc, report), encoding="utf-8")
    print(f"MOCKED payment test written to {out}")


if __name__ == "__main__":
    main()
