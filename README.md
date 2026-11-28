# Commerce

A standalone, multi-tenant e-commerce ERP built with ASP.NET Core 10, EF Core,
PostgreSQL and Next.js 16. It covers catalog, inventory, orders, customers,
pricing, purchasing, finance, reporting and the integration foundation for a
later Get Assist connection.

## What is included

- **Catalog** — products, variants, categories, brands, image URLs, CSV
  import/export.
- **Inventory** — warehouses, stock on hand/reserved, adjustments, transfers,
  movement history and low-stock views.
- **Orders** — server-side pricing, stock reservation, status workflow,
  invoices, returns and refunds.
- **Customers** — addresses, tags, notes, duplicate detection and external
  mapping.
- **Pricing** — offers, coupons and effective-price quotes.
- **Purchasing** — suppliers, purchase orders, goods receipts and supplier
  payments.
- **Finance** — payments, refunds, expenses and summaries.
- **Reports** — dashboard, sales, product, stock and customer reports, CSV
  export.
- **Settings** — company, team/roles, tax rates and audit log.
- **Integration foundation** — HMAC provisioning, scoped revocable API keys,
  read-only host APIs, transactional outbox with signed webhooks, retries,
  dead-letter status and connection lifecycle.
- **Multi-tenancy** — tenant + workspace model with server-side membership
  checks and EF global query filters.
- **Dashboard UI** — Next.js app for every module above, plus tenant
  registration, category/brand CRUD, printable invoices, a ⌘K command palette,
  theme/density settings and an embedded (host) mode.

Signing in from Get Assist works through a signed, single-use host launch (a
person links their Commerce account once). OIDC SSO and Get Assist-hosted
endpoints are **not implemented**. The integration documentation states exactly
what exists and what still depends on Get Assist.

## Stack

| Layer | Technology |
| --- | --- |
| API | ASP.NET Core 10 minimal APIs |
| Data | EF Core 10, PostgreSQL 17, SQLite for tests |
| Auth | JWT access tokens, rotating refresh tokens, PBKDF2-SHA256, scoped API keys |
| Frontend | Next.js 16.4 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Deployment | Docker Compose, standalone Next.js server, health checks, OpenAPI |

## Quick start

### Docker Compose

```bash
cp .env.example .env
# set AUTH_SIGNING_KEY in .env (openssl rand -base64 48)
docker compose up --build
```

- Dashboard: `http://localhost:3000`
- API: `http://localhost:5250`
- Swagger UI: `http://localhost:5250/docs`
- Health: `http://localhost:5250/health/live`

For a demo dataset, set `SEED_DEMO_ACCOUNT=true` in `.env` before the first run.
The seed only executes when the database has no tenants.

### Local development

```bash
# PostgreSQL
docker run --name commerce-pg \
  -e POSTGRES_DB=commerce -e POSTGRES_USER=commerce -e POSTGRES_PASSWORD=commerce \
  -p 5433:5432 -d postgres:17-alpine

# API
cd backend
dotnet run --project src/Commerce.Api

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Demo credentials (development seed):

```text
Username: admin (or admin@commerce.local)
Password: admin@123#
```

## Tests

```bash
cd backend
dotnet test
```

The suite uses SQLite and `WebApplicationFactory`. Stop a running API first on
Windows to avoid locked build outputs.

Covered scenarios include tenant isolation, membership enforcement, provisioning
idempotency, read scopes, disable/reconnect/revoke, outbox retry without
duplicates, host outage resilience, username login, password change, branch
creation, reorder thresholds, price history and the SSO `501` stub.

## Project layout

```text
backend/
  src/Commerce.Domain/          Entities and enums
  src/Commerce.Infrastructure/  EF Core, services, security, integrations
  src/Commerce.Api/             Minimal API, auth, middleware, composition
  tests/Commerce.Tests/         API integration tests
frontend/
  src/app/(app)/                Authenticated dashboard
  src/app/login/                Sign-in
  src/lib/                      API client, session, hooks, types
  src/components/               Shell, UI primitives, charts, forms
docs/                           Architecture and integration documentation
docker-compose.yml
```

## Documentation

| Document | Contents |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, layers, request lifecycle |
| [BUSINESS_MODULES.md](docs/BUSINESS_MODULES.md) | Shipped business behaviour and rules |
| [MULTI_TENANCY.md](docs/MULTI_TENANCY.md) | Isolation model and security boundaries |
| [API_CONTRACT.md](docs/API_CONTRACT.md) | Endpoints, auth, errors, examples |
| [GET_ASSIST_INTEGRATION.md](docs/GET_ASSIST_INTEGRATION.md) | Host integration contract, status and gaps |
| [SSO_INTEGRATION.md](docs/SSO_INTEGRATION.md) | Current 501 state and proposed OIDC contract |
| [EVENTS_AND_WEBHOOKS.md](docs/EVENTS_AND_WEBHOOKS.md) | Outbox, event catalog, signatures, retries |
| [DATA_OWNERSHIP.md](docs/DATA_OWNERSHIP.md) | Data ownership, PII, retention, open agreements |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Local/container deployment, migrations, backups |
| [FRONTEND_GAP_PLAN.md](docs/FRONTEND_GAP_PLAN.md) | Frontend coverage map and completion status |

## Integration status

- Provisioning and read APIs are implemented.
- Signing in from Get Assist: `POST /api/v1/integrations/sso/launch` (signed),
  then `/api/v1/auth/sso/redeem` / `/sso/link` (GET_ASSIST_INTEGRATION.md §4).
- OIDC is not implemented; `POST /api/v1/integrations/sso/exchange` returns `501`.
- No host endpoints are called by Commerce.
- API-key scopes are read-only; there are no write-back APIs.
- Contract version: **v1**.

## Known limitations

- No payment gateway, shipping carrier, email/SMS or tax engine.
- One currency per workspace; no FX conversion.
- No file upload service (product images are URLs).
- No hard-delete/subject-access workflow.
- The outbox dispatcher is not safe to run in multiple API replicas without a
  leader lock.
- Product images are URL-only and there is no media library.
- Reorder thresholds inform low-stock views but do not generate purchase
  orders automatically.

## License

No license has been declared for this repository.
