# Business Modules

This document describes the shipped business behaviour. Each module is backed
by persisted data and exposed through `/api/v1`. Unless stated otherwise, all
operations are tenant- and workspace-scoped.

## Catalog

**Purpose:** maintain the sellable product catalog.

- Products have a name, SKU, descriptions, category, brand, status
  (`Draft`/`Active`/`Archived`), cost price, base price, compare-at price, tax
  rate, tags, SEO fields and images (URLs).
- Every product has at least one variant. Variants carry SKU, attributes JSON,
  cost, price and an `IsDefault` flag. Variant prices drive order pricing.
- Categories support a parent, description, active flag and sort order.
- Brands carry a name and optional logo URL.
- Products can be exported to CSV (`GET /api/v1/products/export`) and imported
  from a CSV body (`POST /api/v1/products/import`, Manager+). Import creates or
  updates by SKU and reports created/updated counts.
- Product deletion is a soft delete (`IsDeleted`); the product disappears from
  normal queries and stock views.
- Changing a variant price on update records a `PriceChange` row (old price, new
  price, reason). `GET /api/v1/products/{id}/price-history` returns the newest
  200 entries, shown on the product detail screen.
- Product create/update/archive emits integration events (see
  `EVENTS_AND_WEBHOOKS.md`).

Role rules: read = Member; create/update/delete/import = Manager or above.

## Inventory

**Purpose:** know what is on hand, reserved and available.

- Warehouses are workspace-scoped; exactly one is the default. Orders reserve
  and consume stock from the default warehouse.
- Stock is tracked per warehouse + variant with `QuantityOnHand` and
  `QuantityReserved`. Available = on hand − reserved.
- Stock movements are append-only and typed: `Adjustment`, `TransferIn`,
  `TransferOut`, `PurchaseReceipt`, `Sale`, `Return`, `Reservation`, `Release`.
- Adjustments (`POST /api/v1/inventory/adjust`) accept a positive or negative
  quantity delta and are rejected if on-hand would go negative.
- Transfers move quantity between warehouses with paired out/in movements and
  reject negative source balances.
- Low-stock rows are determined by the variant's `ReorderPoint` compared with
  available quantity. The `GET /api/v1/inventory/low-stock` endpoint and
  `?lowStock=true` filter use this rule.
- Reorder point/quantity are persisted on stock items and editable through
  `PUT /api/v1/inventory/reorder` (Manager+) and the Reorder action on the
  inventory screen. Setting thresholds for a variant with no stock record
  creates a zero-quantity record for that warehouse.

Role rules: read = Member; adjust = Staff+; warehouses/transfers = Manager+.

## Orders

**Purpose:** capture, confirm, fulfil and reverse sales.

### Creation

1. The default warehouse is selected.
2. Every line must reference an active variant of an active product.
3. Available stock is checked before the order is created.
4. The effective unit price is recalculated server-side from the variant price
   and the best live offer for the requested quantity.
5. Coupon discounts are validated against subtotal, dates, activity and
   redemption limits.
6. Subtotal, offer discount, coupon discount, tax per line, shipping and grand
   total are computed with `decimal`.
7. Stock is reserved and `Reservation` movements are written in a transaction.
8. `commerce.order.created` is queued in the outbox.

An order starts `Pending`, `Unpaid`, `Unfulfilled`.

### Status workflow

```text
Pending ──► Confirmed ──► Processing ──► Shipped ──► Delivered
   │            │              │            │            │
   └────────────┴──────────────┴──► Cancelled           └──► Returned
                                                             │
                                                    Refunded ◄┘
```

- **Confirm** requires `Pending`, re-checks stock, converts reservations into a
  `Sale` movement (on hand decreases), and creates an invoice if none exists.
- **Processing** requires `Confirmed`.
- **Ship** accepts `Confirmed` or `Processing`, sets shipped timestamp and
  partial fulfilment.
- **Deliver** requires `Shipped`, sets fulfilled.
- **Cancel** accepts `Pending`, `Confirmed` or `Processing`. If the order was
  confirmed, stock is returned; otherwise the reservation is released.
- **Return** accepts `Shipped` or `Delivered`.
- **Refund** is not allowed from `Cancelled`/`Pending`.

Invalid transitions return `409 INVALID_STATE`.

### Invoices, returns and refunds

- An invoice is generated on confirmation with a sequential invoice number and
  the order's totals. `GET /api/v1/orders/{id}/invoice` returns it.
- Returns capture a reason, refund amount and optional items JSON. Managers
  approve or reject them.
- Approving a return records a refund, updates `RefundedTotal` and payment
  status, and may move the order to `Refunded`. A `commerce.refund.completed`
  event is queued.
- Payments recorded against an order update its payment status
  (`Unpaid`/`Partial`/`Paid`/`Refunded`).

Role rules: read = Member; create/status/returns = Staff+; approve/reject =
Manager+.

## Customers

**Purpose:** a lightweight CRM for B2C and B2B buyers.

- Customers store names, email, phone, company, notes, free-form tags and a
  business flag.
- Addresses are typed (`shipping`, `billing`, …), with a default per customer.
- Duplicate detection compares email and/or phone (`GET
  /api/v1/customers/duplicates`).
- A customer can be linked to one external system/id
  (`ExternalSource`/`ExternalId`) and unlinked later. This is the hook intended
  for future Get Assist mapping.
- Customer detail includes order count, total spent, last order and order
  history.
- Deletion is soft (`IsDeleted`); orders keep their denormalised customer name.

Role rules: read = Member; create/update/addresses = Staff+; delete/link =
Manager+.

## Pricing, offers and coupons

**Purpose:** derive the price a customer should pay, without trusting clients.

- Offers are percentage or fixed-amount discounts, optionally limited to all
  products, one product or one category, with a minimum quantity and a live
  date window.
- Coupons are percentage or fixed-amount codes with a minimum subtotal,
  validity window, active flag and optional redemption cap.
- `POST /api/v1/pricing/quote` returns the effective unit price, list price,
  offer discount and applicable coupon discount for a variant/quantity.
- Order creation recomputes all of this server-side.
- Redemptions increment on order creation; a capped coupon deactivates when the
  cap is reached.
- One currency per workspace; percentage values are 0–100.

Role rules: read/quote = Member; create/update/delete = Manager+.

## Purchasing

**Purpose:** replenish stock from suppliers.

- Suppliers store contact details, address, notes and active flag. Views include
  open purchase-order count and total purchased.
- Purchase orders contain variant lines with quantity ordered and unit cost.
  Totals are computed server-side.
- Lifecycle: `Draft` → `Ordered` → `PartiallyReceived`/`Received`, or
  `Cancelled`.
- Receiving records a goods receipt per warehouse, increments on-hand stock with
  `PurchaseReceipt` movements, updates received quantities, and queues
  `commerce.stock.changed`.
- Supplier payments can be recorded against a supplier and optionally a
  purchase order.

Role rules: read = Member; write = Manager+.

## Finance

**Purpose:** record cash movements and receivables/payables.

- Incoming payments can be tied to an order or recorded as unallocated.
- Recording a payment updates the order's paid/refund total and payment status,
  and queues `commerce.payment.recorded`.
- Refunds are manager-only and update the related order.
- Expenses capture category, description, amount, paid date, method and
  reference; deletion is manager-only.
- `GET /api/v1/finance/summary` returns revenue, refunds, expenses, net
  revenue, receivables, payables, cash collected, totals by method and a daily
  series.
- `GET /api/v1/payments` supports search, method and date filters.

Role rules: read = Member; record payment = Staff+; refunds/expenses = Manager+.

## Reports and dashboard

- `GET /api/v1/dashboard` — headline metrics, sales trend, recent orders,
  low-stock items and top products for the current workspace.
- `GET /api/v1/reports/sales` — revenue/orders trend and totals.
- `GET /api/v1/reports/products` — units sold, revenue and profit per product.
- `GET /api/v1/reports/stock` — on-hand, reserved, available, reorder point,
  stock value and low-stock flag.
- `GET /api/v1/reports/customers` — new customers, orders and revenue by period.
- `GET /api/v1/reports/export?type=sales|products|stock|customers` — CSV.
- All report endpoints accept optional `from`/`to` dates where meaningful.

## Settings, team and audit

- Company settings: company name, workspace name, three-letter currency code
  and time zone.
- Team: list members, create a member with a password and role, change role or
  active flag. Owner-only rules protect the owner role and self-deactivation.
- Tax rates: name, percentage rate, default flag and inclusive flag.
- Audit log: paginated, searchable list of recorded actions with user and
  timestamp.
- Workspace list is also available through `/api/v1/auth/workspaces`.
- Branches: `POST /api/v1/settings/workspaces` adds a workspace to the tenant,
  grants the caller a membership there and creates a default `MAIN` warehouse.
  Switch into it with `POST /api/v1/auth/switch-workspace`.
- Password change: `POST /api/v1/auth/change-password` verifies the current
  password, stores a new PBKDF2 hash and revokes every refresh token for the
  account (other sessions end when their access token expires).

Role rules: read = Member; changes = Admin (and owner rules inside the
service).

## Integration settings

See `GET_ASSIST_INTEGRATION.md`. In short: status, disable, reconnect, revoke,
API-key management, outbox events and delivery logs are available to workspace
Admins. Provisioning is a separate HMAC-authenticated host endpoint.

## Deliberate gaps

- No recurring invoices, subscriptions, gift cards, loyalty points or
  marketplace connectors.
- No automated reorder purchase-order generation.
- No multi-currency conversion or per-customer price lists.
- No file upload service; product images are URLs.
- No outbound email/SMS, payment gateway or shipping integration.
- Integration API keys are read-only and cannot mutate orders, stock or
  payments.
