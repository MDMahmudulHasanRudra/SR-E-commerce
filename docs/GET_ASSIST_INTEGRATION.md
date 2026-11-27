# Get Assist Integration

**Integration contract version: `v1`.**

This document separates what is implemented in this repository from what still
depends on Get Assist. Nothing here should be read as a claim that Get Assist
endpoints, SSO or marketplace installation already work.

## 1. How Commerce connects to the Host Platform

Commerce is a standalone system. There is no runtime dependency on Get Assist:
sales, stock adjustments, purchasing, finance and reporting continue to work
when Get Assist is unavailable or not configured.

The connection has three parts:

| Part | Direction | Transport | Implemented |
| --- | --- | --- | --- |
| Provisioning | Get Assist → Commerce | `POST /api/v1/integrations/provision`, HMAC-SHA256 | Yes |
| Read APIs | Get Assist → Commerce | `GET /api/v1/integrations/*`, `X-Api-Key` | Yes |
| Events | Commerce → Get Assist | signed HTTP webhooks from the outbox | Yes |

Configuration lives under `GetAssist` and `HostPlatform` in
`appsettings.json`:

```json
{
  "GetAssist": {
    "ProvisioningSecret": "",
    "SignatureHeader": "X-GetAssist-Signature",
    "RequireActiveConnection": true,
    "EventDispatchSeconds": 10,
    "MaxDeliveryAttempts": 8,
    "WebhookSignatureEnabled": true
  },
  "HostPlatform": {
    "Name": "Get Assist",
    "WorkspaceLaunchUrl": "",
    "AllowedParentOrigins": "",
    "OidcEnabled": false,
    "OidcAuthority": "",
    "OidcClientId": "",
    "OidcAudience": ""
  }
}
```

When `GetAssist:ProvisioningSecret` is empty, provisioning is disabled and the
endpoint returns `503 INTEGRATION_NOT_CONFIGURED`. The integration status screen
reports this as `provisioningConfigured: false`.

## 2. How a Host project maps to a Commerce workspace

An `AppConnection` is the mapping record:

```text
HostPlatform + HostCustomerId + HostProjectId  ──►  TenantId + WorkspaceId
```

- The tuple is unique. One host project maps to at most one Commerce workspace.
- A new project creates a new tenant and primary workspace.
- Alternatively, `commerceWorkspaceId` can link an existing, unlinked Commerce
  workspace.
- `externalWorkspaceReference` is returned to the host and defaults to the
  Commerce workspace id.
- The Commerce workspace id is never accepted as an authorization input on
  read APIs. It is resolved from the API key.

## 3. Installation and provisioning

### Request

```http
POST /api/v1/integrations/provision
Content-Type: application/json
X-GetAssist-Timestamp: 1763112345
X-GetAssist-Signature: 4f1c…   (lowercase hex or sha256=…)
```

The signature is HMAC-SHA256 over the exact bytes of
`{timestamp}.{rawBody}` using the shared provisioning secret. The timestamp must
be a Unix seconds value within ±5 minutes. An invalid or expired signature
returns `401`. The endpoint is rate-limited to 30 requests/minute per IP.

Body:

```json
{
  "hostPlatform": "Get Assist",
  "hostCustomerId": "cust_8123",
  "hostProjectId": "proj_4410",
  "customerName": "Northwind Retail",
  "projectName": "Northwind Store",
  "workspaceName": "Northwind Store",
  "currency": "USD",
  "webhookUrl": "https://getassist.example.com/webhooks/commerce",
  "externalWorkspaceReference": "ga-proj-4410",
  "commerceWorkspaceId": null,
  "contractVersion": "v1"
}
```

Validation:

- `hostCustomerId` and `hostProjectId` are required.
- `currency` must be a three-letter code; defaults to `USD`.
- `webhookUrl`, when supplied, is stored and must later be an absolute HTTPS URL
  to reconnect. Provisioning does not currently validate the URL scheme; see the
  hardening note in section 11.
- `contractVersion` defaults to `v1`.

### Behaviour

1. Look up an existing connection by host platform + customer + project.
2. **Already provisioned:** return the existing ids, status, contract version and
   a note. No duplicate workspace or key is created. `apiKey` is `null`.
3. **Link mode:** if `commerceWorkspaceId` is supplied, validate the workspace
   exists and is not already linked. Use its tenant/workspace.
4. **New mode:** create tenant, primary workspace, default warehouse ("Main
   Warehouse"), standard 0% tax rate and connection.
5. Generate a webhook secret.
6. Generate a read-only API key and store only its SHA-256 hash.
7. Record an audit entry and return the result.

### Response

```json
{
  "tenantId": "…",
  "workspaceId": "…",
  "connectionId": "…",
  "workspaceReference": "ga-proj-4410",
  "status": "Active",
  "apiContractVersion": "v1",
  "apiKey": "cmk_ab12cd34ef_…",
  "note": "Store this API key now. It is shown only once."
}
```

The key is returned **only** on first provisioning. It cannot be retrieved later.
A workspace admin can create additional keys under Integration settings.

## 4. Signing in from Get Assist (host launch)

**Implemented** (14 Nov 2026). Get Assist signs a person in to Commerce with a
single-use code; Commerce still decides who that person is here.

```http
POST /api/v1/integrations/sso/launch          (signed exactly like provisioning)
X-GetAssist-Timestamp: <unix seconds>
X-GetAssist-Signature: <hex HMAC-SHA256 of "{timestamp}.{rawBody}">

{ "hostPlatform": "Get Assist", "hostCustomerId": "…", "hostProjectId": "…",
  "subject": "<16-128 letters/digits, pseudonymous, stable per person per project>",
  "displayName": "Rudra", "returnPath": "/products" }

→ 200 { "mode": "signIn" | "link",
        "launchPath": "/sso/launch#code=<single-use code>",
        "expiresAtUtc": "…" }
```

- The host project must be connected and **Active**, and its workspace active;
  otherwise `403`. No secret configured → `503`. Bad signature → `401`.
- Get Assist opens `{dashboard origin}{launchPath}`. The code is in the
  fragment, so it never reaches a server log or a referrer. The page
  (`frontend/src/app/sso/launch`) removes it from the address at once.
- Only a SHA-256 hash of the code is stored (`HostLaunchCodes`). It expires in
  2 minutes (sign-in) or 5 minutes (link) and is spent by a conditional update,
  so two presentations cannot both win.

The page presents the code:

```http
POST /api/v1/auth/sso/redeem   { "code": "…" }
→ { "session": <normal AuthResponse> | null, "returnPath": "/products",
    "linkRequired": false, "hostName", "displayName", "workspaceName" }

POST /api/v1/auth/sso/link     { "code": "…" }   (Authorization: Bearer <just signed in>)
→ { "session": <AuthResponse for the connected workspace>, … }
```

**Who gets signed in.** Commerce never trusts Get Assist's word for that. The
first time, the code is a *link* code: the page asks the person to sign in with
their Commerce email and password once, and `/sso/link` then records
`HostIdentityLink (connection, subject → user)` — only if that user is an
active member of the connection's workspace. From then on the code is a
*sign-in* code and `/sso/redeem` issues a normal Commerce session for that
workspace. Every redeem re-checks the connection (Active), the workspace
(Active), the user (active) and the membership (active); disabling any of them
stops the next sign-in. Without the host's auto-provision policy (§4.1) nothing here creates a user or a
membership, and Get Assist's roles grant nothing: the Commerce role does.

One host person ↔ one Commerce user per connection; re-linking moves the link.
Links are per connection, so a link made from one Get Assist project does not
work from another. `returnPath` is kept only if it is a plain path inside
Commerce (never `//…`, a scheme, `/sso` or `/login`).

### 4.1 Same login: members created on first launch (27 Nov 2026)

**Implemented in this repository, not yet deployed.** The host's written policy (the owner of Chithii / Get Assist,
27 Nov 2026: "same ID and password"), set only through signed requests:

- **Provisioning** may carry `"autoProvisionMembers": true` and `"hostSignInUrl": "https://…/apps/commerce/continue"`.
  Both are stored on the `AppConnection` (migration `HostAutoProvision`); a signed re-provision of an existing
  connection may change them and nothing else (audited `integration.host_policy_changed`). The address is kept only if
  it is HTTPS (HTTP only on loopback) without credentials.
- **The launch** may carry `"email"`, `"role": "OWNER" | "MEMBER"` and `"autoProvision": true`. When the connection's
  policy is on, the launch asks for it and the subject has no link, Commerce creates the account and membership and
  answers `signIn` (audited `integration.member_auto_provisioned`):
  - the account's role is set once from the host's: the workspace's first `OWNER` becomes Owner, a later one Admin,
    anyone else Staff. Later changes are made in Commerce, and the host's role never changes them;
  - the account gets a random, unusable password (it opens only through the host), `ExternalIssuer = host:<connection>`
    and `ExternalSubject = <subject>`;
  - an email that already belongs to ANY Commerce account is never taken over (the host's email is not verified here):
    that person links once, exactly as before;
  - a person this connection created before is signed in again only while still an active member: a workspace admin
    who removed someone is never overruled.
- Without the policy, or without `autoProvision`, everything above §4.1 is unchanged.
- **"Continue with Chithii"**: `/sso/redeem` and `/sso/link` also return `hostSignInUrl`. The launch page remembers it
  in that browser; Commerce's sign-in page then offers "Continue with Chithii", which sends the person to the host,
  which signs them in and launches them back through the ordinary single-use code. A convenience only.
- Tests: `HostAutoProvisionTests` (each confirmed to fail with the policy switched off).

`POST /api/v1/integrations/sso/exchange` (OIDC code exchange) is still
**reserved and answers 501**: OIDC is not needed for this launch and is not
implemented. `GET /api/v1/auth/sso/status` reports
`{ enabled: <provisioning secret set>, mode: "host-launch" }`.

## 5. How the full Commerce UI is opened

Get Assist shows the Commerce dashboard inside its workspace in a sandboxed
frame, opened on the launch address from §4, so a linked person lands signed
in. The dashboard can also be opened directly and signed in to with Commerce
credentials.

- `HOST_PLATFORM_ALLOWED_ORIGINS` (comma-separated Get Assist origins) is the
  `Content-Security-Policy: frame-ancestors` allowlist for **both** the API
  (`HostPlatform:AllowedParentOrigins`) and the dashboard (`src/proxy.ts`, read
  at runtime). Empty means `'none'`: nobody can frame Commerce, including Get
  Assist. Set it to the exact Get Assist address(es) for the embedded view.
- Do not use wildcard frame ancestors.
- The dashboard keeps its session in the frame's own storage (the Commerce
  origin), never in Get Assist.

## 6. APIs Commerce provides

All host APIs are under `/api/v1/integrations` and require `X-Api-Key` with the
listed scope. They are read-only and workspace-scoped by the key.

| Method | Path | Scope | Returns |
| --- | --- | --- | --- |
| GET | `/products/search?q=&sku=&categoryId=&page=&pageSize=` | `products.read` | Paged active-product summaries with effective price, availability, image |
| GET | `/products/{id}?quantity=` | `products.read` | Product detail, variants, effective price, images, active offers |
| GET | `/products/{id}/availability` | `products.read` | Available quantity and per-warehouse on-hand/reserved |
| GET | `/products/{id}/pricing?quantity=&couponCode=` | `products.read` | Variant prices and optional coupon discount |
| GET | `/offers/active` | `offers.read` | Live offers |
| GET | `/customers/search?q=&page=&pageSize=` | `customers.read` | Customer summaries with order count and spend |
| GET | `/customers/{id}` | `customers.read` | Customer detail and addresses |
| GET | `/customers/{id}/orders` | `customers.read` | Customer order history |
| GET | `/orders/{id}` | `orders.read` | Order detail, items, totals, invoice number |
| GET | `/orders/{id}/status` | `orders.read` | Status, payment, fulfilment and timestamps |

There are **no write scopes** and no host endpoints that create or mutate
orders, stock, customers or payments. A read-only key cannot perform mutations;
the scope policy is enforced before the endpoint runs.

Example:

```http
GET /api/v1/integrations/products/search?q=lamp&page=1&pageSize=20
X-Api-Key: cmk_ab12cd34ef_…
```

```json
{
  "items": [
    {
      "id": "…",
      "name": "Aurora Desk Lamp",
      "sku": "LAMP-AUR-01",
      "category": "Lighting",
      "brand": "Northwind",
      "price": 53.1,
      "compareAtPrice": 69.0,
      "currencyCode": "USD",
      "available": 12,
      "inStock": true,
      "imageUrl": "https://…",
      "status": "Active"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalCount": 1,
  "totalPages": 1
}
```

## 7. Events Commerce emits

Events are written to a transactional outbox and delivered to the connection's
`webhookUrl`. Delivery is at-least-once; consumers must deduplicate on
`X-Commerce-Event-Id`.

| Event type | Trigger |
| --- | --- |
| `commerce.product.created` | Product created |
| `commerce.product.updated` | Product updated or archived |
| `commerce.price.changed` | Variant price changed |
| `commerce.stock.changed` | Purchase receipt increases stock |
| `commerce.order.created` | Order created (stock reserved) |
| `commerce.order.confirmed` | Order confirmed (stock sold, invoice created) |
| `commerce.order.shipped` | Order shipped |
| `commerce.order.delivered` | Order delivered |
| `commerce.order.cancelled` | Order cancelled (stock restored or released) |
| `commerce.payment.recorded` | Incoming payment recorded |
| `commerce.refund.completed` | Refund completed via order return or refund |

Envelope:

```json
{
  "id": "…",
  "type": "commerce.order.created",
  "version": 1,
  "occurredAt": "2026-11-14T09:30:00Z",
  "workspaceId": "…",
  "subjectId": "…",
  "data": { }
}
```

Headers and signature verification are documented in
`EVENTS_AND_WEBHOOKS.md`. Note that stock adjustments made through
`POST /api/v1/inventory/adjust` or transfers are audited but do not currently
emit `commerce.stock.changed`; only purchase receipts do.

## 8. What Get Assist APIs are required

None of the following exist in this repository. They are the agreements and
endpoints needed from Get Assist before a production integration:

1. **Installation / marketplace flow** — how a Get Assist customer installs
   Commerce, captures the Commerce base URL, and triggers provisioning.
2. **Shared provisioning secret delivery** — a secure channel to distribute
   `GETASSIST_PROVISIONING_SECRET`, plus rotation procedure.
3. **OIDC provider** (optional now) — only if OIDC sign-in is ever wanted in
   addition to the host launch in §4 (see `SSO_INTEGRATION.md`).
4. **Launch context** — done: the signed host launch in §4.
5. **Webhook receiver** — a stable HTTPS URL per environment, expected response
   semantics, signature verification expectations and a test endpoint.
6. **Webhook secret rotation** — how a new webhook secret is delivered and when
   the old one stops being accepted.
7. **Host-initiated disconnect** — Get Assist needs an agreed way to ask
   Commerce to disable/revoke a connection. Commerce currently exposes
   admin-only `disable`/`revoke`; there is no host-authenticated counterpart.
8. **Status reconciliation** (optional but recommended) — a host endpoint
   Commerce can call to report connection health, or a shared status page.
9. **Environment matrix** — sandbox and production base URLs, project ids and
   test tenants.
10. **Support and incident contacts** — who to contact when deliveries fail or
    keys are compromised.

## 9. Permissions and scopes

### API-key scopes

| Scope | Grants |
| --- | --- |
| `products.read` | Product search/detail/availability/pricing |
| `offers.read` | Active offers |
| `customers.read` | Customer search/detail/order history |
| `orders.read` | Order detail/status |

`IntegrationScopes.All` currently equals the read-only set. Creating a key with
an unknown or write scope returns `400 VALIDATION_ERROR`.

### Workspace roles (dashboard)

| Role | Integration settings | Business access |
| --- | --- | --- |
| Owner / Admin | Full | Full |
| Manager | No | Catalog, inventory, orders, customers, pricing, purchasing, finance |
| Staff | No | Orders, inventory adjustments, customers, payments |
| Viewer | No | Read-only |

Integration admin endpoints require the `Admin` policy. A normal member cannot
read the API-key list, disable a connection or retry events.

### Host requirements

Get Assist must:

- store the provisioning secret and API key in a secret manager;
- never expose the API key to a browser;
- request only the scopes it needs;
- rotate keys by creating a new key, deploying it, then revoking the old one;
- verify webhook signatures before acting on events;
- deduplicate on event id;
- tolerate a 10-second webhook timeout and retries.

## 10. Connection status, disabling and reconnection

`GET /api/v1/integration/status` returns:

```json
{
  "provisioningConfigured": true,
  "connected": true,
  "hostPlatform": "Get Assist",
  "status": "Active",
  "connectionId": "…",
  "workspaceId": "…",
  "workspaceName": "Northwind Store",
  "hostCustomerId": "cust_8123",
  "hostProjectId": "proj_4410",
  "webhookUrl": "https://getassist.example.com/webhooks/commerce",
  "apiContractVersion": "v1",
  "lastConnectedAtUtc": "…",
  "lastEventDeliveredAtUtc": "…",
  "lastError": null,
  "activeApiKeys": 1,
  "pendingEvents": 0,
  "failedDeliveries": 0,
  "provisionedAtUtc": "…"
}
```

States: `NotConnected`, `Pending`, `Connecting`, `Active`, `Error`, `Disabled`,
`Revoked`.

- **Disable** sets `Disabled`. It is reversible. Keys are not revoked, but key
  authentication fails while the connection is inactive (when
  `RequireActiveConnection` is true). Outbox delivery pauses.
- **Reconnect** sets `Active`, clears the error and optionally updates the
  webhook URL. The URL must be absolute HTTPS. A revoked connection cannot be
  reconnected; it must be re-provisioned.
- **Revoke** sets `Revoked` and permanently revokes every API key in the
  workspace. It cannot be undone. The host project must provision again to get a
  new key.

All three actions are audited and require workspace Admin.

### Actions the host may take on its own connection

Signed exactly like provisioning (`X-GetAssist-Timestamp` + HMAC over `{timestamp}.{rawBody}`), body
`{ "hostPlatform", "hostCustomerId", "hostProjectId" }`, answered with
`{ workspaceId, connectionId, status, apiKey, note }` (`HostConnectionService`):

- `POST /api/v1/integrations/connection/key` — a replacement key when the host lost its own. Every
  non-revoked key named `"<hostPlatform> integration"` in the workspace is revoked at once; keys an admin
  created by hand are untouched. Only for an `Active` connection. The key is shown once.
- `POST /api/v1/integrations/connection/pause` — sets an `Active` connection to `Disabled`, marked as paused
  by the host (`lastError` = "Paused from the host platform."). Anything else is left as it is.
- `POST /api/v1/integrations/connection/resume` — re-activates ONLY a connection the host paused. A
  connection a Commerce admin disabled, or a revoked one, is refused (403): the Commerce admin stays in charge.

All three are audited (`integration.key_replaced`, `integration.host_paused`, `integration.host_resumed`)
and share the provisioning rate limit. Tests: `HostConnectionTests`.

## 11. Implemented vs. depends on Get Assist

### Implemented in this repository

- Connection model and workspace mapping, with uniqueness and idempotency.
- HMAC-signed provisioning, 5-minute skew, rate limit and 503 when unconfigured.
- Hashed, prefixed, scoped, revocable API keys.
- Read-only host APIs for products, offers, customers and orders.
- Scope authorization and tenant isolation enforced server-side.
- Connection status, disable, reconnect, revoke, audit.
- Transactional outbox with signed webhooks, retry/backoff, delivery logs,
  dead-letter status and manual retry.
- Health checks, OpenAPI, Docker deployment.
- Automated integration tests for provisioning idempotency, scopes, isolation,
  disable/reconnect/revoke, outbox retry and SSO 501.
- Signing in from Get Assist (§4): signed launch, single-use hashed codes,
  link-once identity mapping, dashboard frame-ancestors (`HostSignInTests`).

### Depends on Get Assist (not implemented)

- OIDC SSO (not needed for the host launch in §4).
- Marketplace/installation UI and secret delivery.
- Host-initiated disconnect/status APIs.
- A Get Assist webhook receiver and secret rotation process.
- Any Get Assist-specific customer/product/order write-back.
- Production URLs, certificates, DNS and environment approvals.

### Known hardening items before production

- Provisioning accepts a `webhookUrl` without validating HTTPS; reconnect does
  validate it. Add the same check to provisioning.
- `WebhookSignatureEnabled` is configured but the dispatcher always signs when a
  webhook secret exists. Treat signatures as always-on.
- No key-expiry policy; revocation is manual.
- No per-event ordering guarantee. Consumers must use `occurredAt` and event ids.
- `OidcAuthority`, `OidcClientId`, `OidcAudience` and `WorkspaceLaunchUrl` are
  placeholders and are not used by any request path yet.

## 12. Exact contract version

- **Commerce integration contract:** `v1`
- **Provisioning field:** `contractVersion` (default `"v1"`, stored on
  `AppConnection.ApiContractVersion`)
- **API key scopes:** `v1` read scopes above
- **Webhook event version:** `version: 1` in each envelope
- **Breaking changes:** require a new contract version and a migration/compat
  window agreed with Get Assist. The current implementation rejects nothing
  based on `contractVersion`; it stores the value for reconciliation.
