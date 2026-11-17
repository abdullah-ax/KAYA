"""MOCKED delivery of a digital product: issue and revoke an access token. Nothing is sent."""
from __future__ import annotations

import secrets
from dataclasses import dataclass


@dataclass
class Delivery:
    order_id: str
    product: str
    token: str
    active: bool = True


class Fulfilment:
    """MOCKED. Keeps access tokens in memory. No email, no download, no real link."""

    def __init__(self) -> None:
        self.deliveries: list[Delivery] = []

    def issue(self, order_id: str, product: str) -> Delivery:
        delivery = Delivery(order_id, product, "MOCKED-" + secrets.token_urlsafe(16))
        self.deliveries.append(delivery)
        return delivery

    def revoke(self, order_id: str) -> int:
        """Disable every token for the order. Returns how many were switched off."""
        count = 0
        for d in self.deliveries:
            if d.order_id == order_id and d.active:
                d.active = False
                count += 1
        return count

    def is_active(self, token: str) -> bool:
        return any(d.token == token and d.active for d in self.deliveries)

    def for_order(self, order_id: str) -> list[Delivery]:
        return [d for d in self.deliveries if d.order_id == order_id]
