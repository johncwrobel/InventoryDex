# InventoryDex

A web-based inventory management tool for Pokémon TCG vendors. Track purchase price, list price, and live market price (via pokemontcg.io). Flags cards whose market value has moved recently and highlights cards priced significantly above or below market. Mobile-friendly. Invite-only.

## Features

- **Invite-only auth** — magic links via Resend, no passwords. Admins manage users from the `/admin` UI; no redeployment needed to add/remove users. Up to 50 beta users enforced by a cap check.
- **Admin panel** — `/admin` (ADMIN role only): view active users, send email invites, revoke access.
- **Card search** against pokemontcg.io with a local `Card` table cache shared across users.
- **Per-user inventory** with condition, finish, quantity, purchase price, list price, and notes — multiple rows per card allowed for different lots.
- **Responsive inventory list** — table on desktop, stacked cards on mobile. Inline list-price editing and one-click delete. Market price links to TCGPlayer.
- **Price delta badges** — ▲/▼ % change badge when market price moves more than ±5% over 7 days.
- **List-price flags** — ⬇ Low / ⬆ High pill when list price is more than 15% from market.
- **Needs attention filter** — surfaces rows with a price move or list-price flag.
- **Card detail page** — large image, full metadata, pricing section, notes, Recharts market-price history chart.
- **Price refresh** — Vercel Cron 3× daily (`0 */8 * * *`), batched 10 cards at a time with rate-limit handling.
- **PWA** — `manifest.webmanifest` with standalone display and brand red theme; `apple-touch-icon` for iOS.

### Roadmap

- ✅ **M1 — Bootstrap** — scaffold, Prisma schema on Neon, Auth.js, Vercel deploy.
- ✅ **M2 — Inventory CRUD** — card search, add flow, inventory list, inline edit, delete, card detail page.
- ✅ **M3 — Pricing intelligence** — refresh cron, delta badges, "needs attention" filter, price-history chart.
- ✅ **M4 — Polish + PWA** — PWA manifest + icons, Vitest unit tests, Playwright smoke tests.
- ✅ **M5 — Beta readiness** — DB-backed invite system + admin UI, TCGPlayer market price links, 3× daily refresh with batch concurrency.

Camera scan is explicitly deferred (v2).

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · PostgreSQL (Prisma 6) · Auth.js v5 (Resend magic links) · Vercel + Vercel Cron

## Getting started (local dev)

```bash
npm install
cp .env.example .env.local              # then fill in real values
npm run db:migrate -- --name init       # create the schema in your database
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/sign-in`. Enter an email from `ALLOWED_EMAILS`, click the magic link, and land on `/inventory`. The first `ALLOWED_EMAILS` user to sign in is automatically promoted to Admin and can invite others via `/admin`.

## Scripts

```bash
npm run dev          # dev server (Turbopack)
npm run build        # production build
npm run start        # run built app
npm run lint         # eslint

# Database (all load .env.local via dotenv-cli; the Prisma CLI doesn't read
# .env.local on its own)
npm run db:migrate   # prisma migrate dev — create a new migration + apply it
npm run db:deploy    # prisma migrate deploy — apply pending migrations (prod)
npm run db:generate  # prisma generate — regenerate the client
npm run db:studio    # open Prisma Studio
npm run db:push      # prisma db push — sync schema without a migration (dev only)

# Tests
npm test             # vitest unit tests
npm run test:e2e     # playwright smoke tests (run npm run build first;
                     # first time: npx playwright install chromium)
```

See `CLAUDE.md` for working conventions and `.env.example` for the full list of required environment variables.
