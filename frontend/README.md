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
