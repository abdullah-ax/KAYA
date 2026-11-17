"""MOCKED payments. Events come from a fake provider. No real money, not even sandbox."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from api.fulfilment import Fulfilment
from api.log import DecisionLog
from api.refunds import apply_refund

CURRENCY = "EGP"  # amounts are whole piastres, MOCKED
FEE_RATE = 0.03   # the fee the mock provider is expected to charge


def expected_fee(amount: int) -> int:
    return round(amount * FEE_RATE)


@dataclass
class Order:
    order_id: str
    amount: int
    product: str
    status: str = "created"  # created, paid, refunded


@dataclass
class Payment:
    order_id: str
    amount: int
    fee: int


@dataclass
class PaymentProcessor:
    """MOCKED webhook handler. Idempotent by event_id; delivers once per order."""
    log: DecisionLog
    fulfilment: Fulfilment = field(default_factory=Fulfilment)
    orders: dict[str, Order] = field(default_factory=dict)
    payments: dict[str, Payment] = field(default_factory=dict)
    payouts: dict[str, int] = field(default_factory=dict)
    seen: set[str] = field(default_factory=set)
    duplicates: int = 0

    def create_order(self, order: Order) -> None:
        self.orders[order.order_id] = order

    def handle_event(self, event: dict[str, Any]) -> str:
        event_id, order_id, kind = event.get("event_id"), event.get("order_id"), event.get("type")
        if event_id in self.seen:
            self.duplicates += 1
            self._log("duplicate_event", order_id, f"MOCKED duplicate event {event_id} ignored")
            return "duplicate"
        if order_id not in self.orders:
            return "unknown_order"
        if kind not in ("payment_succeeded", "refunded", "payout_paid"):
            return "unknown_type"
        self.seen.add(event_id)
        if kind == "payment_succeeded":
            return self._paid(event)
        if kind == "payout_paid":
            self.payouts[order_id] = int(event["amount"])
            self._log("payout_recorded", order_id, "MOCKED payout recorded")
            return "payout_recorded"
        return apply_refund(self, order_id)

    def _paid(self, event: dict[str, Any]) -> str:
        order = self.orders[event["order_id"]]
        if order.status != "created":
            self._log("payment_ignored", order.order_id, "MOCKED payment for an order already handled")
            return "already_delivered"
        self.payments[order.order_id] = Payment(order.order_id, int(event["amount"]), int(event.get("fee", 0)))
        order.status = "paid"
        self._log("payment_succeeded", order.order_id, "MOCKED payment recorded, no real money")
        delivery = self.fulfilment.issue(order.order_id, order.product)
        self.log.append("delivery", "issue_access_token", sources=[order.order_id],
                        outcome=f"MOCKED delivery: access token {delivery.token[:11]}... issued, nothing sent")
        return "delivered"

    def _log(self, action: str, order_id: Any, outcome: str) -> None:
        self.log.append("payments", action, sources=[str(order_id)], outcome=outcome)
