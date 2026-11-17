# Payment test log (MOCKED)

MOCKED: simulated events only. No real money moved, no real payment provider was called.

| order_id | event | result |
|---|---|---|
| order-1 | payment_succeeded (evt-1) | delivered |
| order-1 | payout_paid (evt-2) | payout_recorded |
| order-2 | payment_succeeded (evt-3) | delivered |
| order-2 | payment_succeeded (evt-3) | duplicate |
| order-3 | payment_succeeded (evt-4) | delivered |
| order-3 | refund (founder approved) | refunded |

## Mismatches (MOCKED reconcile)

| order_id | kind | detail |
|---|---|---|
| order-2 | missing_payout | MOCKED: no payout recorded |
| order-3 | fee_mismatch | MOCKED: fee 999 but expected 600 |

## Summary (MOCKED)

- Orders: 3
- Deliveries issued: 3
- Access tokens still active: 2
- Duplicate events ignored: 1
- Refunds: 1
- Mismatches found: 2
