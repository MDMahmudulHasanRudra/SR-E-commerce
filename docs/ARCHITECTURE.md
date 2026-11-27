# Architecture

Commerce is a standalone, multi-tenant e-commerce ERP. It is a modular monolith:
one deployable ASP.NET Core API backed by PostgreSQL, and one Next.js dashboard.
The code is organised so that individual business modules can be extracted later,
but no network boundary between modules is required today.

## System context

```text
┌────────────────────┐        HTTPS/JSON        ┌──────────────────────────┐
│ Next.js dashboard  │ ───────────────────────► │ ASP.NET Core 10 Web API  │
│ (App Router, CSR)  │ ◄─────────────────────── │ /api/v1/*                │
└────────────────────┘                          └────────────┬─────────────┘
                                                             │ EF Core 10
┌────────────────────┐        HTTPS/JSON        ┌────────────▼─────────────┐
│ Get Assist host    │ ───────────────────────► │ PostgreSQL               │
│ (future client)    │ ◄── signed webhooks ──── │ tenant-scoped schema     │
└────────────────────┘                          └──────────────────────────┘
```

The dashboard and the future Get Assist integration consume the same business
services. There is no separate "integration edition" of the application logic.

## Repository layout

```text
backend/
  Commerce.slnx
  src/
    Commerce.Domain/          Entities, enums and domain rules. No EF or HTTP.
    Commerce.Infrastructure/  EF Core DbContext, migrations, services, security,
                              seeding, outbox dispatcher, integration services.
    Commerce.Api/             Minimal API endpoints, auth handlers, middleware,
                              DI composition, OpenAPI, health checks.
  tests/
    Commerce.Tests/           SQLite-backed integration tests against the API.
frontend/
  src/app/(app)/              Authenticated dashboard routes.
  src/app/login/              Sign-in screen.
  src/lib/                    API client, session storage, hooks, formatting, types.
  src/components/             Shell, design-system primitives, charts, forms.
docs/                         This documentation set.
docker-compose.yml            PostgreSQL + API + web.
```

## Backend layering

### Commerce.Domain

Plain entities and enums: tenants, workspaces, users, memberships, catalog,
inventory, customers, orders, purchasing, pricing, payments and integration
records. Domain exceptions (`DomainException`) carry a stable error code.

### Commerce.Infrastructure

- `Persistence/CommerceDbContext` — EF Core model, global query filters and
  automatic tenant/workspace stamping.
- `Migrations/` — the PostgreSQL `InitialCreate` migration.
- `Services/` — application services per module. All money arithmetic and
  effective-price calculation lives here, never in the client.
- `Security/` — PBKDF2-SHA256 password hashing, HMAC helpers, role permissions.
- `Integrations/` — provisioning, API keys, host read APIs, outbox dispatch.
- `Seeding/DemoDataSeeder` — development demo data.
- `Abstractions/TenantContext` — ambient tenant/workspace/user for the request.

### Commerce.Api

Minimal APIs grouped per module (`Endpoints/*.cs`). Cross-cutting concerns are
middleware and policies:

1. `CorrelationMiddleware` — correlation id on every request/response.
2. `ExceptionHandlingMiddleware` — maps domain errors to the standard envelope.
3. `SecurityHeadersMiddleware` — defensive response headers.
4. Rate limiter — `auth`, `integration`, `provisioning` policies.
5. CORS — explicit origin allowlist.
6. Authentication — JWT bearer for people, custom API-key scheme for hosts.
7. `MembershipMiddleware` — re-verifies membership and workspace on every JWT
   request, then sets tenant context.
8. Authorization — role policies (`Member`, `Staff`, `Manager`, `Admin`) and
   scope policies (`scope:products.read`, …).

## Frontend architecture

- Next.js 16 App Router with `cacheComponents` and `partialPrefetching` enabled.
- `src/app/(app)/layout.tsx` renders `AppShell` inside a `<Suspense>` boundary
  because the shell reads `usePathname()`. `export const instant = false` marks
  the segment as intentionally blocking.
- `AuthProvider` hydrates the session from `localStorage`, exposes sign-in,
  sign-out and workspace switching, and handles `commerce:unauthorized` events.
- `lib/api.ts` is the single fetch wrapper. It attaches the bearer token,
  rotates refresh tokens once on `401`, and normalises API errors.
- Pages are client components using `useApi`/`useDebounced`. No server-side data
  fetching is performed; the API is the only source of truth.
- `next.config.ts` uses `output: "standalone"` for container builds.

## Request lifecycle (dashboard)

```text
Browser
  │  Authorization: Bearer <access token>
  ▼
Next.js page → lib/api.ts
  ▼
ASP.NET Core
  ├─ correlation / exception / security headers
  ├─ JWT validation (issuer, audience, signature, lifetime)
  ├─ MembershipMiddleware (user, tenant, workspace, active flags)
  ├─ role/scope policy
  ├─ endpoint → service
  ├─ CommerceDbContext (global query filters + stamped tenant ids)
  └─ PostgreSQL
```

If the access token expires, the client calls `POST /api/v1/auth/refresh` once,
stores the rotated refresh token, and replays the original request.

## Money and numeric rules

- Money columns are `decimal(18,2)`.
- All totals, discounts, tax and effective prices are calculated server-side.
- Clients may send prices when creating catalog records (list/cost prices), but
  order pricing is re-read from persisted variants and offers.
- Effective unit price = best live offer applicable to the product/category at
  the requested quantity. The lower of list price and offer price wins; prices
  never go below zero.
- Tax rates are stored as percentages (for example `10` means 10%).
- One currency per workspace. There is no FX conversion.

## Reliability

- Order confirmation, cancellation and goods receipt run in database
  transactions.
- Integration events are written to an outbox in the same transaction as the
  business change.
- A background dispatcher delivers events with bounded exponential backoff and
  records every attempt. A host-platform outage does not roll back commerce
  operations.
- Migrations run on startup when `Database:Initialize` is `true`; the API waits
  for PostgreSQL and retries up to ten times.

## Observability and operations

- `GET /health/live` — process liveness.
- `GET /health/ready` — database connectivity.
- `GET /openapi/v1.json` — OpenAPI document.
- `GET /docs` — Swagger UI pointing at the OpenAPI document.
- Structured console logging with correlation ids and redacted secrets.
- Audit log for privileged business actions (settings, team, catalog, orders,
  stock, payments, integration lifecycle).

## Explicit non-goals / not implemented

- Get Assist endpoints, SSO exchange and host-driven user provisioning are not
  implemented. See `GET_ASSIST_INTEGRATION.md` and `SSO_INTEGRATION.md`.
- Integration write APIs do not exist; all API-key scopes are read-only.
- No payment gateway, shipping carrier, email/SMS delivery, tax engine or
  multi-currency conversion is integrated.
- No public storefront is included. Catalog data is exposed through the
  authenticated dashboard and the versioned integration read API.
