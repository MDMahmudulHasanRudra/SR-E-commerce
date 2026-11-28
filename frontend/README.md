# Commerce Dashboard

Next.js 16 App Router frontend for the Commerce ERP. See the repository
[README](../README.md) and [docs](../docs) for the full system.

## Run

```bash
npm install
cp .env.example .env.local   # optional; defaults to http://localhost:5250
npm run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
npm run dev     # development server
npm run build   # production build (standalone output)
npm start       # not supported with output: "standalone"
npm run lint    # ESLint
```

`npm start` runs `next start`, which Next.js rejects when
`output: "standalone"` is set. To run the production build locally:

```bash
npm run build
node .next/standalone/server.js   # serves on $PORT, default 3000
```

## Screens

| Route | Purpose |
| --- | --- |
| `/login`, `/register` | Sign in (email or username) and tenant/workspace registration |
| `/dashboard` | KPIs, sales trend, low-stock items, recent orders |
| `/products`, `/products/new`, `/products/[id]`, `/products/[id]/edit` | Catalog, variants/attributes, image gallery, price history |
| `/categories`, `/brands` | Category hierarchy and brand CRUD |
| `/inventory` | Stock levels, movements, warehouses, reorder thresholds |
| `/orders`, `/orders/[id]`, `/orders/[id]/invoice` | Orders, returns, printable tax invoice |
| `/customers`, `/customers/[id]` | Customers, addresses, duplicates, tags |
| `/offers` | Offers, coupons and the effective-price quote simulator |
| `/purchasing` | Suppliers, purchase orders, receipts, supplier payments |
| `/finance` | Payments, refunds, expenses, receivables/payables |
| `/reports` | Sales, product, stock and customer reports with CSV export |
| `/settings` | Company, branches, team, tax rates, password, audit log |
| `/integration` | Get Assist status, API keys, events, deliveries |
| `/sso/launch` | Host launch hand-off |

## Shell

- `⌘K` / `Ctrl+K` opens the command palette (products, orders, customers and
  navigation routes).
- `lib/permissions.ts` mirrors the backend role policies; the UI hides actions
  the API would reject.
- `lib/theme.tsx` stores the theme preset, density and brand name. Embedded
  mode is enabled with `?embedded=true` or a host launch context and shows a
  "Back to Workspace" action.
- `lib/csv.ts` builds the product import template and client-side CSV exports.

## Notes

- `NEXT_PUBLIC_API_URL` is inlined at build time and must be reachable from the
  browser.
- The app is client-rendered. `AuthProvider` stores the session in
  `localStorage` and `lib/api.ts` rotates refresh tokens once on `401`.
- `src/app/(app)/layout.tsx` wraps `AppShell` in `<Suspense>` because the shell
  reads `usePathname()`. `export const instant = false` marks the segment as
  intentionally blocking.
- `next.config.ts` enables `cacheComponents`, `partialPrefetching` and
  `output: "standalone"`.
