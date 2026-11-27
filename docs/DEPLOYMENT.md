# Deployment

## Prerequisites

- .NET SDK 10.0
- Node.js 22+ and npm
- PostgreSQL 17 (or Docker)
- Docker + Compose v2 for the container path
- `dotnet-ef` 10.0.3 for migration commands

```bash
dotnet tool install --global dotnet-ef --version 10.0.3
```

## Local development

### 1. PostgreSQL

```bash
docker run --name commerce-pg \
  -e POSTGRES_DB=commerce \
  -e POSTGRES_USER=commerce \
  -e POSTGRES_PASSWORD=commerce \
  -p 5433:5432 \
  -d postgres:17-alpine
```

The default connection string in `backend/src/Commerce.Api/appsettings.json` is:

```text
Host=localhost;Port=5433;Database=commerce;Username=commerce;Password=commerce
```

### 2. API

```bash
cd backend
dotnet run --project src/Commerce.Api
```

- HTTP: `http://localhost:5250`
- Swagger UI: `http://localhost:5250/docs`
- OpenAPI: `http://localhost:5250/openapi/v1.json`
- Liveness: `http://localhost:5250/health/live`
- Readiness: `http://localhost:5250/health/ready`

In Development the demo account is seeded on first run when no tenant exists:

```text
admin@commerce.local / Admin123!
```

The seed creates a tenant, owner, workspace, warehouse, tax rate, 10 products,
customers and orders. Seeding is skipped when any tenant already exists.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The API base URL is
`NEXT_PUBLIC_API_URL` (default `http://localhost:5250`).

### 4. Tests

Stop the running API first on Windows so build outputs are not locked.

```bash
cd backend
dotnet test
```

Tests use SQLite and `WebApplicationFactory`; they do not need PostgreSQL.

## Database migrations

The initial migration is `20261114073809_InitialCreate`.

```bash
cd backend
dotnet ef migrations add <Name> \
  --project src/Commerce.Infrastructure \
  --startup-project src/Commerce.Api

dotnet ef database update \
  --project src/Commerce.Infrastructure \
  --startup-project src/Commerce.Api
```

On startup, with `Database:Initialize=true`, the API applies pending migrations
(PostgreSQL) or `EnsureCreated` (SQLite) and retries up to ten times, three
seconds apart. Disable this in environments where a dedicated migration job is
preferred.

### Rollback strategy

Migrations are forward-only. Two supported approaches:

1. **Preferred:** deploy the previous application image and restore the database
   from the pre-deploy backup. Keep the backup until the release is verified.
2. **Schema rollback:** generate a new "down" migration and apply it. EF's
   `database update <previous-migration>` reverts only the schema changes EF
   knows how to reverse; it does not restore deleted data.

Never run destructive migrations without a verified backup. Test rollback in a
staging copy first.

## Docker Compose

```bash
cp .env.example .env
# edit .env and set AUTH_SIGNING_KEY (openssl rand -base64 48)
docker compose up --build
```

Services:

| Service | Host port | Container port | Notes |
| --- | --- | --- | --- |
| `db` | 5433 | 5432 | PostgreSQL 17, named volume `commerce-db` |
| `api` | 5250 | 8080 | ASP.NET Core, migrations on startup |
| `web` | 3000 | 3000 | Next.js standalone server |

The API waits for PostgreSQL health and the web app waits for API health.

`NEXT_PUBLIC_API_URL` is **build-time** for the browser bundle. If you change
it, rebuild the web image:

```bash
docker compose build web
docker compose up -d web
```

The URL must be reachable from the user's browser, not just from the `web`
container. `http://localhost:5250` works for a local Compose deployment.

### First run

Set `SEED_DEMO_ACCOUNT=true` in `.env` for a demo deployment, then remove it
after first boot. Seeding only runs when the database has no tenants.

### Stop and clean up

```bash
docker compose down          # keep data
docker compose down -v       # delete the database volume
```

## Environment variables

ASP.NET Core maps `Section__Key` to configuration. Important settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` | Environment |
| `ASPNETCORE_URLS` | `http://+:8080` | Listen address in container |
| `Database__Provider` | `Postgres` | `Postgres` or `Sqlite` |
| `Database__Initialize` | `true` | Apply migrations/EnsureCreated at startup |
| `ConnectionStrings__Default` | local Postgres | Database connection |
| `Auth__Issuer` | `commerce` | JWT issuer |
| `Auth__Audience` | `commerce-api` | JWT audience |
| `Auth__SigningKey` | empty | ≥32 chars; required for stable sessions |
| `Auth__AccessTokenMinutes` | `30` | Access-token lifetime |
| `Auth__RefreshTokenDays` | `14` | Refresh-token lifetime |
| `GetAssist__ProvisioningSecret` | empty | Enables provisioning when set |
| `GetAssist__SignatureHeader` | `X-GetAssist-Signature` | Provisioning signature header |
| `GetAssist__RequireActiveConnection` | `true` | API keys require an active connection |
| `GetAssist__EventDispatchSeconds` | `10` | Outbox loop interval |
| `GetAssist__MaxDeliveryAttempts` | `8` | Dead-letter threshold |
| `HostPlatform__AllowedParentOrigins` | empty | CSP `frame-ancestors` allowlist |
| `HostPlatform__OidcEnabled` | `false` | Status flag only; does not enable SSO |
| `Cors__AllowedOrigins__0` | `http://localhost:3000` | Browser origin |
| `RateLimiting__Enabled` | `true` | Auth/integration/provisioning limits |
| `Seed__DemoAccount` | `false` | Seed demo data |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5250` | Frontend API base (build-time) |

If `Auth__SigningKey` is missing or shorter than 32 characters, the API generates
an ephemeral key and logs a warning. Tokens become invalid on restart, so always
set it outside local development.

## Reverse proxy and HTTPS

Terminate TLS at a reverse proxy (nginx, Caddy, a cloud load balancer) in front
of the web and API containers.

- Forward `Host`, `X-Forwarded-Proto` and `X-Forwarded-For`.
- Set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` if the proxy supplies forwarded
  headers.
- Redirect HTTP to HTTPS.
- Set `Cors__AllowedOrigins__0` to the exact public web origin.
- Set `NEXT_PUBLIC_API_URL` to the public API URL and rebuild the web image.
- Do not expose PostgreSQL publicly.
- Only allow the web origin and trusted Get Assist parent origins to frame the
  app; the API sends `frame-ancestors` based on
  `HostPlatform__AllowedParentOrigins`.

## Health checks and monitoring

```bash
curl -fsS http://localhost:5250/health/live
curl -fsS http://localhost:5250/health/ready
```

- `live` proves the process is up.
- `ready` proves the database is reachable.
- Compose uses `/health/live` for the API health check.
- Logs are structured console output; ship them to your log platform.
- Watch the integration status counters `pendingEvents` and `failedDeliveries`.
- Every request has an `X-Correlation-ID`; include it in support tickets.

## Backup and restore

### Backup

```bash
docker compose exec -T db pg_dump \
  -U commerce -d commerce -Fc > commerce-$(date +%Y%m%d-%H%M).dump
```

Store backups encrypted, off-host, with a retention policy.

### Restore

Stop writers first.

```bash
docker compose stop api web
docker compose exec -T db dropdb -U commerce --if-exists commerce
docker compose exec -T db createdb -U commerce commerce
docker compose exec -T db pg_restore -U commerce -d commerce --clean --if-exists < backup.dump
docker compose start api web
```

For a different database name, adjust the `ConnectionStrings__Default` value.

Verify after restore:

```bash
curl -fsS http://localhost:5250/health/ready
```

Then sign in and check dashboard totals, a recent order and stock levels.

## Scaling notes

- The API is stateless apart from the outbox dispatcher. Do **not** run multiple
  API replicas without addressing the dispatcher: each instance runs its own
  `OutboxDispatcher`, which can deliver the same event concurrently and race on
  attempt counters. At-least-once delivery tolerates duplicates, but delivery
  logs and dead-letter counts may be noisy. Use a single dispatcher instance, a
  leader lock, or `FOR UPDATE SKIP LOCKED` before horizontal scaling.
- Startup migrations can race across instances. Run one migration job or set
  `Database__Initialize=false` on all but one instance.
- Next.js `output: "standalone"` can run multiple replicas behind a load
  balancer. The local cache is per-instance; configure a shared cache if you
  rely on caching.
- PostgreSQL should be tuned and backed up according to load. Add indexes only
  with query evidence.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| API exits at startup | Database reachable; connection string; port 5433/5432 |
| `relation "..." does not exist` | Migrations not applied; set `Database__Initialize=true` or run `dotnet ef database update` |
| 401 after restart | `Auth__SigningKey` changed or ephemeral; set a stable key |
| 403 for a valid user | Membership/workspace inactive; sign in again after re-enabling |
| CORS error in browser | `Cors__AllowedOrigins__0` must exactly match the web origin |
| Frontend calls `localhost:5250` in production | Rebuild with the correct `NEXT_PUBLIC_API_URL` |
| Provisioning returns 503 | `GetAssist__ProvisioningSecret` is empty |
| Integration reads return 403 | Key lacks scope, is revoked, or connection is not `Active` |
| Webhooks never arrive | Connection has no `webhookUrl`, is disabled, or host blocks the request; check delivery logs |
| `dotnet build` fails with file lock | Stop the running API |
| Next build fails on URL data | Keep `usePathname`/`useSearchParams` consumers inside Suspense in `src/app/(app)/layout.tsx` |

## Production security checklist

- [ ] Strong, persisted `Auth__SigningKey` (≥32 random bytes).
- [ ] HTTPS everywhere; HTTP redirects.
- [ ] PostgreSQL not publicly exposed; strong password; backups encrypted.
- [ ] `Cors__AllowedOrigins` restricted to the real web origin.
- [ ] `HostPlatform__AllowedParentOrigins` empty or exact trusted origins.
- [ ] `GetAssist__ProvisioningSecret` set only if provisioning is needed; rotate
      on a schedule.
- [ ] Demo seeding disabled after first run; demo password changed.
- [ ] API keys stored in a secret manager; read-only scopes only.
- [ ] Webhook receiver verifies signatures and deduplicates.
- [ ] Rate limiting enabled.
- [ ] Health checks wired to the orchestrator.
- [ ] Backup and restore rehearsed.
- [ ] Logs shipped and correlation ids searchable.
- [ ] SSO remains disabled until the contract in `SSO_INTEGRATION.md` is tested.
