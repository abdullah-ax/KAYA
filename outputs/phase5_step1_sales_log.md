# Sales log (MOCKED)

MOCKED: simulated checkout events. No payment provider, no real money.

| Order | Event | Result |
|---|---|---|
| order-1 | payment_succeeded | delivered |
| order-1 | payment_succeeded again (duplicate webhook) | duplicate |
| order-1 | payout_paid | payout_recorded |
| order-2 | payment_succeeded | delivered |
| order-2 | payout_paid | payout_recorded |
| order-3 | payment_succeeded | delivered |
| order-3 | payout_paid | payout_recorded |
| order-4 | payment_succeeded | delivered |
| order-4 | payout_paid | payout_recorded |
| order-5 | payment_succeeded | delivered |
| order-5 | payout_paid | payout_recorded |
| order-6 | payment_succeeded | delivered |
| order-6 | payout_paid | payout_recorded |
| order-1 | refund (founder approved) | refunded |

- Paid orders: 6
- Refunded: 1
- Access links still active: 5
- Duplicate webhooks ignored: 1
