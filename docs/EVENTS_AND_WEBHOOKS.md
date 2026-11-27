# Events and Webhooks

Commerce uses a transactional outbox. Business changes and their events are
committed in the same database transaction; a background dispatcher delivers
them to the connected Get Assist webhook URL. A host outage cannot roll back an
order, a stock receipt or a payment.

## Outbox lifecycle

```text
business transaction
  ├── order/payment/stock row
  └── OutboxEvent (Pending)
             │
             ▼
     OutboxDispatcher (every 10s, batch of 25)
             │  POST + signature
             ├── 2xx ─────────────► Delivered (delivery log)
             └── non-2xx/error ───► Failed (backoff)
                                       │ attempts < max
                                       ▼
                                  retry later
                                       │ attempts >= max
                                       ▼
                                  DeadLettered
```

- **At-least-once delivery.** A host must deduplicate on event id.
- **No global ordering guarantee.** Events are selected oldest-first, but
  retries and per-event backoff can reorder them. Use `occurredAt` and business
  state if order matters.
- **No duplicate business effects.** The outbox writes once per transaction;
  only webhook delivery is repeated.
- **Commerce keeps working** when the host is unavailable. Events stay queued.

## Event envelope

```json
{
  "id": "3f6b2a1c-8d4e-4f0a-9c1b-2d7e6a5f4c3b",
  "type": "commerce.order.confirmed",
  "version": 1,
  "occurredAt": "2026-11-14T09:30:00.1234567Z",
  "workspaceId": "…",
  "subjectId": "…",
  "data": { }
}
```

- `subjectId` is the primary business entity id (order id, product id, variant
  id, payment id), or the order id for refunds.
- The whole envelope is signed; `data` is the persisted event payload.

## Event catalog

### `commerce.product.created` (v1)

```json
{
  "productId": "…",
  "name": "Aurora Desk Lamp",
  "sku": "LAMP-AUR-01",
  "status": "Active",
  "basePrice": 59.0,
  "currency": "USD"
}
```

### `commerce.product.updated` (v1)

```json
{
  "productId": "…",
  "name": "Aurora Desk Lamp",
  "sku": "LAMP-AUR-01",
  "status": "Active",
  "basePrice": 59.0
}
```

Archive/delete also emits `commerce.product.updated` with
`{ "productId": "…", "status": "ARCHIVED" }`.

### `commerce.price.changed` (v1)

One event per changed variant:

```json
{
  "variantId": "…",
  "oldPrice": 59.0,
  "newPrice": 53.1,
  "currency": "USD"
}
```

### `commerce.stock.changed` (v1)

Emitted on purchase receipts only (one per received line):

```json
{
  "variantId": "…",
  "warehouseId": "…",
  "change": 10,
  "reference": "PO-2026-0004"
}
```

Stock adjustments and inter-warehouse transfers are audited but do not currently
emit this event.

### `commerce.order.created` (v1)

```json
{
  "orderId": "…",
  "orderNumber": "ORD-2026-0008",
  "status": "PENDING",
  "grandTotal": 118.0,
  "currency": "USD",
  "itemCount": 2
}
```

### `commerce.order.confirmed` (v1)

```json
{
  "orderId": "…",
  "orderNumber": "ORD-2026-0008",
  "status": "CONFIRMED",
  "grandTotal": 118.0,
  "currency": "USD"
}
```

### `commerce.order.shipped` (v1)

```json
{ "orderId": "…", "orderNumber": "ORD-2026-0008", "status": "SHIPPED" }
```

### `commerce.order.delivered` (v1)

```json
{
  "orderId": "…",
  "orderNumber": "ORD-2026-0008",
  "status": "DELIVERED",
  "deliveredAt": "2026-11-14T12:00:00Z"
}
```

### `commerce.order.cancelled` (v1)

```json
{ "orderId": "…", "orderNumber": "ORD-2026-0008", "status": "CANCELLED" }
```

### `commerce.payment.recorded` (v1)

```json
{
  "paymentId": "…",
  "orderId": "…",
  "orderNumber": "ORD-2026-0008",
  "amount": 118.0,
  "currency": "USD",
  "method": "card",
  "status": "COMPLETED"
}
```

### `commerce.refund.completed` (v1)

Two code paths emit this type with slightly different payloads:

Return approval:

```json
{
  "orderId": "…",
  "orderNumber": "ORD-2026-0008",
  "refundAmount": 59.0,
  "currency": "USD"
}
```

Manager refund:

```json
{
  "refundId": "…",
  "orderId": "…",
  "orderNumber": "ORD-2026-0008",
  "amount": 59.0,
  "currency": "USD"
}
```

Consumers should tolerate missing optional fields (`refundId`/`refundAmount`).
This is a known v1 inconsistency.

## Webhook request

```http
POST https://getassist.example.com/webhooks/commerce
Content-Type: application/json; charset=utf-8
User-Agent: Commerce-ERP/1.0
X-Commerce-Event-Id: 3f6b2a1c-…
X-Commerce-Event-Type: commerce.order.confirmed
X-Commerce-Timestamp: 1763112345
X-Commerce-Signature: sha256=<lowercase hex>
```

### Signature

```text
signature = HMAC_SHA256(webhookSecret, "{timestamp}.{rawBody}")
```

Hex encode lowercase and prefix with `sha256=`. `timestamp` is Unix seconds.
Verify with a constant-time comparison and reject timestamps outside your
agreed tolerance (Commerce uses five minutes for provisioning; recommend five
minutes for webhooks too).

The webhook secret is generated per connection at provisioning time. It is not
exposed by any read endpoint; the current admin UI/API does not display it.
Secret rotation requires a future agreement (see `GET_ASSIST_INTEGRATION.md`,
section 8).

### Success

Any `2xx` response counts as delivered. The body is ignored. Commerce allows
up to 10 seconds (HTTP client timeout 12 seconds) before treating the attempt as
failed.

## Retry policy

- Maximum attempts: `GetAssist:MaxDeliveryAttempts` (default `8`).
- Backoff after failure: `min(3600, 30 × 2^(attempt−1))` seconds.
  - 30s, 60s, 120s, 240s, 480s, 960s, 1920s, then capped at 3600s.
- Dispatcher interval: `GetAssist:EventDispatchSeconds` (default `10`).
- Batch size: 25 events per cycle.
- If no `Active` connection or no `webhookUrl`, the event remains queued and is
  retried on a later cycle. This is not counted as an attempt.
- After the maximum attempts, status becomes `DeadLettered`. It is not retried
  automatically.
- An admin can requeue a dead-lettered event:
  `POST /api/v1/integration/events/{id}/retry`. This resets status to `Pending`
  and clears the error; attempts are preserved, so a manual retry after the
  limit immediately dead-letters again unless `MaxDeliveryAttempts` is raised.
  This is a known operational limitation.

## Delivery logs

Every attempt writes a `DeliveryLog`:

| Field | Meaning |
| --- | --- |
| `OutboxEventId` | Event |
| `EventType` | Type string |
| `Attempt` | Attempt number |
| `Success` | 2xx |
| `StatusCode` | HTTP status when received |
| `Error` | Transport/HTTP error |
| `DurationMs` | Request duration |

Admin endpoints:

```http
GET /api/v1/integration/events?limit=100
GET /api/v1/integration/deliveries?eventId=<guid>&limit=100
POST /api/v1/integration/events/{id}/retry
```

All require workspace Admin.

## Consumer requirements

1. Verify the signature before parsing or acting.
2. Deduplicate on `X-Commerce-Event-Id` (store processed ids for at least the
   retry window).
3. Return `2xx` only after durable acceptance.
4. Treat payloads as additive. New fields may appear within `v1`; unknown fields
   must be ignored.
5. Do not assume exactly one event per business action (a product update can
   emit multiple price events).
6. Do not call back into Commerce synchronously from the webhook handler. If a
   read is needed, use the scoped read APIs with a separate key.
7. Log the event id and type; never log the signature secret.

## What is not implemented

- Inbound webhooks from Get Assist (no host events are accepted).
- Event replay by time range or bulk requeue.
- Webhook secret rotation endpoints or UI display.
- Per-connection retry configuration.
- Ordering, exactly-once delivery or transactional acknowledgement.
- Additional event types for customers, suppliers, expenses or stock
  adjustments.
