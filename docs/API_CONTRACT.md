# API Contract

- **Base URL (local):** `http://localhost:5250`
- **Version:** `v1` in the path (`/api/v1/...`)
- **Format:** JSON, camelCase properties, UTF-8
- **Enums:** serialized as strings (for example `"Confirmed"`, `"products.read"`)
- **Dates:** ISO 8601 UTC (`2026-11-14T09:30:00Z`)
- **Money:** decimal numbers as JSON numbers, two fractional digits
- **OpenAPI:** `GET /openapi/v1.json`; interactive UI at `GET /docs`

The dashboard API (`/api/v1/*`) and the host-platform API
(`/api/v1/integrations/*`) share the same process and business services. The
host API is the stable external contract; dashboard endpoints are versioned with
the same `v1` prefix but may gain fields.

## Authentication

### People (dashboard)

```http
Authorization: Bearer <access token>
```

- Access tokens: JWT HS256, 30 minutes (configurable).
- Refresh tokens: opaque, hashed at rest, 14 days, rotated on use.
- Every request re-validates membership server-side.

### Host platform (machine)

```http
X-Api-Key: cmk_<prefix>_<secret>
```

- Keys are shown once at creation/provisioning, stored only as SHA-256 hashes.
- Keys carry read-only scopes: `products.read`, `customers.read`,
  `orders.read`, `offers.read`.
- A key is rejected when revoked, when its workspace is inactive, or when
  `GetAssist:RequireActiveConnection` is true and the workspace connection is
  not `Active`.
- Key requests never receive cookies and never fall back to a user session.

### Provisioning

HMAC-SHA256 over `{timestamp}.{rawBody}`:

```http
X-GetAssist-Timestamp: 1763112345
X-GetAssist-Signature: <lowercase hex or sha256=hex>
```

Timestamp must be within five minutes of server time.

## Response envelopes

### Success

Most endpoints return the resource or a page object directly:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "totalCount": 0,
  "totalPages": 0
}
```

### Error

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Only pending orders can be confirmed."
  },
  "correlationId": "9f6f2f2d8a4c4d1e9f0b0a1b2c3d4e5f"
}
```

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid input or business rule |
| 400 | `INVALID_REQUEST` | Malformed HTTP request |
| 401 | `UNAUTHORIZED` | Missing/invalid token or key |
| 403 | `FORBIDDEN` | Role, membership or scope denied |
| 403 | `INTEGRATION_DISABLED` | Host connection is not active |
| 404 | `NOT_FOUND` | Resource does not exist in this workspace |
| 409 | `CONFLICT` | Duplicate or uniqueness conflict |
| 409 | `INSUFFICIENT_STOCK` | Not enough available stock |
| 409 | `INVALID_STATE` | Illegal workflow transition |
| 429 | — | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected failure |
| 501 | `SSO_NOT_CONFIGURED` | SSO exchange is not implemented |
| 503 | `INTEGRATION_NOT_CONFIGURED` | Provisioning secret is absent |

`X-Correlation-ID` is accepted and echoed; otherwise the server generates one.
Logs and error responses use the same value.

## Rate limits

| Policy | Applies to | Limit |
| --- | --- | --- |
| `auth` | `/auth/register`, `/login`, `/refresh` | 20/min per IP |
| `integration` | `/integrations/*` | 180/min per key prefix/IP |
| `provisioning` | `/integrations/provision` | 30/min per IP |

## Authorization roles

| Policy | Roles |
| --- | --- |
| `Member` | Owner, Admin, Manager, Staff, Viewer |
| `Staff` | Owner, Admin, Manager, Staff |
| `Manager` | Owner, Admin, Manager |
| `Admin` | Owner, Admin |
| `scope:<name>` | API key with that scope |

## Endpoints

### Health and docs

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/health/live` | anonymous |
| GET | `/health/ready` | anonymous |
| GET | `/openapi/v1.json` | anonymous |
| GET | `/docs` | anonymous |

### Authentication

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | anonymous, rate-limited |
| POST | `/api/v1/auth/login` | anonymous, rate-limited |
| POST | `/api/v1/auth/refresh` | anonymous, rate-limited |
| POST | `/api/v1/auth/logout` | anonymous |
| GET | `/api/v1/auth/me` | Member |
| GET | `/api/v1/auth/workspaces` | Member |
| POST | `/api/v1/auth/switch-workspace` | Member |
| POST | `/api/v1/auth/change-password` | Member, rate-limited |
| GET | `/api/v1/auth/sso/status` | anonymous |

`POST /api/v1/auth/register`

```json
{
  "companyName": "Northwind Commerce",
  "fullName": "Alex Morgan",
  "email": "admin@commerce.local",
  "password": "admin@123#",
  "workspaceName": "Main Store",
  "currency": "USD",
  "seedDemoData": true
}
```

`POST /api/v1/auth/login`

```json
{ "email": "admin@commerce.local", "password": "admin@123#" }
```

`email` accepts a bare username too: `"admin"` is resolved to
`admin@{Auth:UsernameDomain}` (`commerce.local` by default) before lookup.

Auth response:

```json
{
  "accessToken": "eyJ...",
  "accessTokenExpiresAtUtc": "2026-11-14T10:00:00Z",
  "refreshToken": "opaque-token",
  "refreshTokenExpiresAtUtc": "2026-11-28T09:30:00Z",
  "user": {
    "userId": "…",
    "tenantId": "…",
    "workspaceId": "…",
    "email": "admin@commerce.local",
    "fullName": "Alex Morgan",
    "companyName": "Northwind Commerce",
    "workspaceName": "Main Store",
    "role": "Owner",
    "currencyCode": "USD",
    "timeZone": "UTC",
    "permissions": ["dashboard.read", "products.read", "…"]
  }
}
```

`POST /api/v1/auth/switch-workspace`

```json
{ "workspaceId": "…" }
```

Returns the same auth response scoped to the new workspace.

`POST /api/v1/auth/change-password`

```json
{ "currentPassword": "admin@123#", "newPassword": "NewPassword123!" }
```

Returns `204`. A wrong current password returns `401`; a new password shorter
than 8 characters returns `400`. Changing the password revokes every refresh
token for the account, so other sessions end when their access token expires.

### Catalog

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/products` | Member |
| GET | `/api/v1/products/{id}` | Member |
| GET | `/api/v1/products/{id}/price-history` | Member |
| POST | `/api/v1/products` | Manager |
| PUT | `/api/v1/products/{id}` | Manager |
| DELETE | `/api/v1/products/{id}` | Manager |
| GET | `/api/v1/products/export` | Member |
| POST | `/api/v1/products/import` | Manager |
| GET/POST | `/api/v1/categories` | Member / Manager |
| PUT/DELETE | `/api/v1/categories/{id}` | Manager |
| GET/POST | `/api/v1/brands` | Member / Manager |
| PUT/DELETE | `/api/v1/brands/{id}` | Manager |

Product list filters: `search`, `categoryId`, `brandId`, `status`, `lowStock`,
`sort`, `page`, `pageSize`.

`POST /api/v1/products` body (abridged):

```json
{
  "name": "Aurora Desk Lamp",
  "sku": "LAMP-AUR-01",
  "shortDescription": "Warm dimmable desk lamp",
  "categoryId": "…",
  "brandId": "…",
  "status": "Active",
  "costPrice": 24.5,
  "basePrice": 59.0,
  "compareAtPrice": 69.0,
  "taxRate": 10,
  "isFeatured": true,
  "tags": "lighting,desk",
  "variants": [
    {
      "name": "Default",
      "sku": "LAMP-AUR-01-STD",
      "costPrice": 24.5,
      "price": 59.0,
      "isActive": true,
      "isDefault": true
    }
  ],
  "images": ["https://example.com/lamp.jpg"]
}
```

CSV import accepts `text/csv`, `text/plain`, or a multipart form body.

`GET /api/v1/products/{id}/price-history` returns up to 200 variant price
changes, newest first, recorded automatically when `PUT /api/v1/products/{id}`
changes a variant price:

```json
[
  {
    "variantId": "…",
    "variantName": "Default",
    "sku": "LAMP-AUR-01-STD",
    "oldPrice": 59.0,
    "newPrice": 64.0,
    "reason": "Product update",
    "changedBy": null,
    "changedAtUtc": "2026-11-28T09:15:00Z"
  }
]
```

### Inventory

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/warehouses` | Member |
| POST | `/api/v1/warehouses` | Manager |
| PUT/DELETE | `/api/v1/warehouses/{id}` | Manager |
| GET | `/api/v1/inventory/stock` | Member |
| GET | `/api/v1/inventory/low-stock` | Member |
| GET | `/api/v1/inventory/movements` | Member |
| POST | `/api/v1/inventory/adjust` | Staff |
| POST | `/api/v1/inventory/transfer` | Manager |
| PUT | `/api/v1/inventory/reorder` | Manager |

Stock filters: `search`, `warehouseId`, `lowStock`, `page`, `pageSize`.
Movement filters: `variantId`, `warehouseId`, `type`, `page`, `pageSize`.

Adjust:

```json
{ "warehouseId": "…", "variantId": "…", "quantityDelta": -2, "note": "Damaged" }
```

Transfer:

```json
{
  "fromWarehouseId": "…",
  "toWarehouseId": "…",
  "variantId": "…",
  "quantity": 5,
  "note": "Rebalance"
}
```

Reorder thresholds (creates the stock record with zero quantities if the
variant has never been stocked in that warehouse):

```json
{ "warehouseId": "…", "variantId": "…", "reorderPoint": 5, "reorderQuantity": 20 }
```

### Customers

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/customers` | Member |
| GET | `/api/v1/customers/duplicates` | Member |
| GET | `/api/v1/customers/{id}` | Member |
| POST | `/api/v1/customers` | Staff |
| PUT | `/api/v1/customers/{id}` | Staff |
| DELETE | `/api/v1/customers/{id}` | Manager |
| POST | `/api/v1/customers/{id}/addresses` | Staff |
| DELETE | `/api/v1/customers/{id}/addresses/{addressId}` | Staff |
| POST | `/api/v1/customers/{id}/link-external` | Manager |
| DELETE | `/api/v1/customers/{id}/link-external` | Manager |

List filters: `search`, `tag`, `isBusiness`, `page`, `pageSize`.

### Orders

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/orders` | Member |
| GET | `/api/v1/orders/{id}` | Member |
| POST | `/api/v1/orders` | Staff |
| POST | `/api/v1/orders/{id}/status` | Staff |
| GET | `/api/v1/orders/{id}/invoice` | Member |
| POST | `/api/v1/orders/{id}/returns` | Staff |
| POST | `/api/v1/orders/{id}/returns/{returnId}/process` | Manager |

List filters: `search`, `status`, `paymentStatus`, `customerId`, `from`, `to`,
`page`, `pageSize`.

Create:

```json
{
  "customerId": "…",
  "customerName": null,
  "customerEmail": null,
  "customerPhone": null,
  "items": [{ "variantId": "…", "quantity": 2 }],
  "couponCode": "WELCOME10",
  "shippingTotal": 5.0,
  "notes": "Leave at reception",
  "source": "standalone",
  "externalOrderId": null
}
```

Status change:

```json
{ "status": "Confirmed", "note": "Paid and verified" }
```

Return:

```json
{ "reason": "Damaged in transit", "refundAmount": 59.0, "itemsJson": null }
```

Process return:

```json
{ "approve": true }
```

### Pricing

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/pricing/offers` | Member |
| POST | `/api/v1/pricing/offers` | Manager |
| PUT/DELETE | `/api/v1/pricing/offers/{id}` | Manager |
| POST | `/api/v1/pricing/coupons` | Manager |
| PUT/DELETE | `/api/v1/pricing/coupons/{id}` | Manager |
| POST | `/api/v1/pricing/quote` | Member |

Quote:

```json
{ "variantId": "…", "quantity": 3, "couponCode": "WELCOME10" }
```

### Purchasing

| Method | Path | Auth |
| --- | --- | --- |
| GET/POST | `/api/v1/suppliers` | Member / Manager |
| PUT/DELETE | `/api/v1/suppliers/{id}` | Manager |
| GET | `/api/v1/purchase-orders` | Member |
| GET | `/api/v1/purchase-orders/{id}` | Member |
| POST | `/api/v1/purchase-orders` | Manager |
| POST | `/api/v1/purchase-orders/{id}/order` | Manager |
| POST | `/api/v1/purchase-orders/{id}/receive` | Manager |
| POST | `/api/v1/purchase-orders/{id}/cancel` | Manager |
| GET/POST | `/api/v1/supplier-payments` | Member / Manager |

PO list filters: `status`, `search`, `page`, `pageSize`.

Receive:

```json
{
  "warehouseId": "…",
  "lines": [{ "purchaseOrderItemId": "…", "quantity": 10 }],
  "notes": "Partial delivery"
}
```

### Finance

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/payments` | Member |
| POST | `/api/v1/payments` | Staff |
| GET | `/api/v1/refunds` | Member |
| POST | `/api/v1/refunds` | Manager |
| GET | `/api/v1/expenses` | Member |
| POST | `/api/v1/expenses` | Manager |
| DELETE | `/api/v1/expenses/{id}` | Manager |
| GET | `/api/v1/finance/summary` | Member |

Payment:

```json
{
  "orderId": "…",
  "amount": 118.0,
  "method": "card",
  "reference": "TXN-1123",
  "notes": null,
  "paidAtUtc": "2026-11-14T09:00:00Z"
}
```

### Reports and dashboard

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/dashboard` | Member |
| GET | `/api/v1/reports/sales` | Member |
| GET | `/api/v1/reports/products` | Member |
| GET | `/api/v1/reports/stock` | Member |
| GET | `/api/v1/reports/customers` | Member |
| GET | `/api/v1/reports/export` | Member |

Query parameters: `from`, `to`, `take` (products), `lowStock` (stock), and
`type=sales|products|stock|customers` (export).

### Settings

| Method | Path | Auth |
| --- | --- | --- |
| GET/PUT | `/api/v1/settings/company` | Member / Admin |
| GET | `/api/v1/settings/workspaces` | Member |
| POST | `/api/v1/settings/workspaces` | Admin |
| GET/POST | `/api/v1/settings/team` | Member / Admin |
| PUT | `/api/v1/settings/team/{userId}` | Admin |
| GET/POST | `/api/v1/settings/tax-rates` | Member / Admin |
| PUT/DELETE | `/api/v1/settings/tax-rates/{id}` | Admin |
| GET | `/api/v1/settings/audit` | Admin |

Audit query: `search`, `page`, `pageSize`.

`POST /api/v1/settings/workspaces` creates a branch in the current tenant:

```json
{ "name": "Downtown Branch", "currencyCode": "EUR", "timeZone": "Europe/Berlin" }
```

The caller receives a membership in the new workspace, and a default
`MAIN` warehouse is created so stock can be tracked there immediately. The
response has the same shape as the workspace list.

### Integration settings (workspace admin)

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/integration/status` | Admin |
| POST | `/api/v1/integration/disable` | Admin |
| POST | `/api/v1/integration/reconnect` | Admin |
| POST | `/api/v1/integration/revoke` | Admin |
| GET/POST | `/api/v1/integration/api-keys` | Admin |
| DELETE | `/api/v1/integration/api-keys/{id}` | Admin |
| GET | `/api/v1/integration/events` | Admin |
| GET | `/api/v1/integration/deliveries` | Admin |
| POST | `/api/v1/integration/events/{id}/retry` | Admin |

### Host platform API

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/api/v1/integrations/products/search` | `products.read` |
| GET | `/api/v1/integrations/products/{id}` | `products.read` |
| GET | `/api/v1/integrations/products/{id}/availability` | `products.read` |
| GET | `/api/v1/integrations/products/{id}/pricing` | `products.read` |
| GET | `/api/v1/integrations/offers/active` | `offers.read` |
| GET | `/api/v1/integrations/customers/search` | `customers.read` |
| GET | `/api/v1/integrations/customers/{id}` | `customers.read` |
| GET | `/api/v1/integrations/customers/{id}/orders` | `customers.read` |
| GET | `/api/v1/integrations/orders/{id}` | `orders.read` |
| GET | `/api/v1/integrations/orders/{id}/status` | `orders.read` |
| POST | `/api/v1/integrations/provision` | HMAC signature |
| POST | `/api/v1/integrations/sso/exchange` | returns 501 |

Example:

```http
GET /api/v1/integrations/products/search?q=lamp&page=1&pageSize=20
X-Api-Key: cmk_ab12cd34ef_…
```

See `GET_ASSIST_INTEGRATION.md` for payloads, scopes and lifecycle.

## Stable vs. internal

- **Stable external contract:** everything under `/api/v1/integrations/*`
  plus the provisioning request/response. Changes require a contract version
  discussion with Get Assist.
- **Dashboard contract:** `/api/v1/*` (non-integration). The Next.js client and
  API ship together; additive changes are expected. Breaking changes require a
  new path version.
