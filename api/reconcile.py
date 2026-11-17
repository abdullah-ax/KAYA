"""MOCKED reconciliation: match orders, payments, fees and payouts, list mismatches."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from api.payments import expected_fee

if TYPE_CHECKING:
    from api.payments import PaymentProcessor


@dataclass
class Mismatch:
    order_id: str
    kind: str  # missing_payout, amount_mismatch, fee_mismatch, payout_mismatch
    detail: str


@dataclass
class Report:
    mismatches: list[Mismatch] = field(default_factory=list)


def reconcile(proc: "PaymentProcessor") -> Report:
    report = Report()
    for oid, order in proc.orders.items():
        pay = proc.payments.get(oid)
        if pay is None:
            continue
        if pay.amount != order.amount:
            report.mismatches.append(Mismatch(oid, "amount_mismatch",
                f"MOCKED: order {order.amount} but payment {pay.amount}"))
        want = expected_fee(pay.amount)
        if pay.fee != want:
            report.mismatches.append(Mismatch(oid, "fee_mismatch",
                f"MOCKED: fee {pay.fee} but expected {want}"))
        if order.status == "refunded":
            continue  # no payout is expected for a refunded order
        if oid not in proc.payouts:
            report.mismatches.append(Mismatch(oid, "missing_payout", "MOCKED: no payout recorded"))
        elif proc.payouts[oid] != pay.amount - pay.fee:
            report.mismatches.append(Mismatch(oid, "payout_mismatch",
                f"MOCKED: payout {proc.payouts[oid]} but expected {pay.amount - pay.fee}"))
    proc.log.append("reconcile", "reconcile_orders", sources=list(proc.orders),
                    outcome=f"MOCKED reconcile: {len(report.mismatches)} mismatches")
    return report
