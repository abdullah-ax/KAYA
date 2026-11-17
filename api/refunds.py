"""MOCKED refunds. They start only from a founder approval or a mock provider event."""
from __future__ import annotations

from typing import TYPE_CHECKING

from api.approval import Approval, ensure_approved

if TYPE_CHECKING:
    from api.payments import PaymentProcessor


def apply_refund(proc: "PaymentProcessor", order_id: str, *, approval: Approval | None = None) -> str:
    """Mark a paid order refunded and revoke access. No money moves: this is MOCKED."""
    order = proc.orders.get(order_id)
    if order is None:
        return "unknown_order"
    if order.status != "paid":
        return "not_paid" if order.status == "created" else order.status
    order.status = "refunded"
    revoked = proc.fulfilment.revoke(order_id)
    if approval is not None:
        proc.log.append("refunds", "refund_order", sources=[order_id], approved_by="founder",
                        founder_input=approval.reason, gated=True,
                        outcome=f"MOCKED refund approved by the founder, {revoked} access token revoked, no money moved")
    else:
        proc.log.append("refunds", "refund_order", sources=[order_id],
                        outcome=f"MOCKED refund from provider event, {revoked} access token revoked, no money moved")
    return "refunded"


def request_refund(proc: "PaymentProcessor", order_id: str, *, approval: object) -> str:
    """Refund only with a real founder approval made by check_approval."""
    ok = ensure_approved(approval, f"refund order {order_id}")
    return apply_refund(proc, order_id, approval=ok)
