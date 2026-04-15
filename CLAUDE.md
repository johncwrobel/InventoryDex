@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**InventoryDex** — a web-based inventory management tool for Pokémon TCG vendors. Tracks purchase price, list price, and live market price (via pokemontcg.io), flags cards whose market value has moved recently, and highlights cards priced significantly above or below market. Mobile-friendly. Invite-only (small private group).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (CSS-first config in `app/globals.css`, no `tailwind.config.js`)
- **PostgreSQL** via **Prisma** (hosted on Neon or Vercel Postgres)
- **Auth.js v5** with email magic links; allowlist enforced in `signIn` callback
- **pokemontcg.io** for card metadata + TCGPlayer price snapshots
- **GitHub Actions** for 3× daily price refresh (`.github/workflows/refresh-prices.yml`)
- Hosted on **Vercel**

## Common commands

```bash
npm run dev          # start dev server (Turbopack)
npm run build        # production build
npm run start        # run built app
npm run lint         # eslint

# Database — always use these wrappers, not `npx prisma` directly.
# The Prisma CLI reads .env, NOT .env.local, so bare `npx prisma migrate dev`
# fails with "Environment variable not found: DATABASE_URL". The wrappers
# load .env.local via dotenv-cli.
npm run db:migrate   # prisma migrate dev (pass `-- --name foo` to set a name)
npm run db:deploy    # prisma migrate deploy (for prod-style application)
npm run db:generate  # prisma generate
npm run db:studio    # open Prisma Studio
npm run db:push      # prisma db push (dev-only, skips migration history)
```

npm test             # vitest unit tests (tests/*.test.ts)
npm run test:watch   # vitest in watch mode
npm run test:e2e     # playwright smoke tests (tests/e2e/*.spec.ts)
                     # requires: npx playwright install chromium (first time)
                     # requires: npm run build && npm run start (or a running dev server)

## Important: Next.js 16 specifics

Next.js 16 has breaking changes from prior versions. **Before writing any Next-specific code**, read the relevant bundled doc in `node_modules/next/dist/docs/` — your training data is likely outdated. (See `AGENTS.md` — this is a hard rule, not a suggestion.)

## Architecture

### Data model
Six domain tables sit alongside the Auth.js tables:

- **`Card`** — canonical pokemontcg.io card metadata (name, set, images, TCGPlayer URL). Keyed by the upstream id (e.g. `sv1-25`) and **shared across all users** so we fetch/cache each unique card once.
- **`InventoryItem`** — one vendor's copy of a card. Multiple rows per card are allowed (different condition / finish / purchase lots). Owns `purchasePrice`, `listPrice`, `quantity`, `condition`, `finish`, `notes`. Scoped to `userId`. Also supports graded cards via `isGraded` (boolean), `gradingCompany` (e.g. "PSA"), and `grade` (e.g. "10"). When `isGraded=true`, `condition` is stored as `NEAR_MINT` as a DB placeholder and is hidden from the UI; `gradingCompany` and `grade` are the authoritative condition descriptor. Market pricing for graded cards is not yet implemented.
- **`PricePoint`** — historical market-price snapshots per `(cardId, finish)`. Enables "recent change over N days" math. Never mutate existing rows — always insert a new snapshot.
- **`SealedProduct`** — shared catalog of sealed products (booster boxes, ETBs, packs, etc.), mirroring the `Card` pattern. One entry per distinct product, shared across all users. Fields: `productType`, `name`, `setId`, `setName`, `tcgplayerUrl` (used by cron for price scraping), `imageUrl`. Server actions: `createSealedProduct`, `searchSealedProducts` in `lib/sealed-actions.ts`.
  - `SealedProductType` enum values: `BOOSTER_PACK`, `BOOSTER_BUNDLE`, `BOOSTER_BOX`, `ELITE_TRAINER_BOX`, `SUPER_PREMIUM_COLLECTION`, `SPECIAL_COLLECTION`, `THEME_DECK`, `TIN`, `OTHER`.
- **`SealedInventoryItem`** — one user's lot of a sealed product, linked to a `SealedProduct` via `sealedProductId` FK. Scoped to `userId`. Inventory-only fields: `quantity`, `isSealed`, `purchasePrice`, `listPrice`, `purchasedAt`, `notes`. Server actions live in `lib/sealed-actions.ts`; shared row types in `lib/sealed-types.ts`. Detail page at `/inventory/sealed/[id]`.
- **`SealedPricePoint`** — historical market-price snapshots per `SealedProduct`, inserted by the cron job via TCGPlayer HTML scraping. Fields: `market`, `low`, `high`, `capturedAt`. Never mutate — always INSERT a new row.

### Routing layout
- `app/(auth)/*` — sign-in and not-invited pages (unauthenticated).
- `app/(app)/*` — everything behind the session gate. The `(app)/layout.tsx` calls `auth()` and redirects to `/sign-in` if there's no session, so pages inside can assume `session.user.id` is non-null.
- `app/api/*` — route handlers. Auth-gated endpoints must call `auth()` themselves; being under `(app)` doesn't protect API routes.
- **Dynamic segment params are async in Next.js 16.** Page props are `{ params: Promise<{ id: string }> }`, not `{ params: { id: string } }`. Destructure with `const { id } = await params;` at the top of the server component. Same rule for `searchParams`.

### Server actions (`lib/actions.ts`, `lib/sealed-actions.ts`)
Card actions live in `lib/actions.ts`; sealed product actions live in `lib/sealed-actions.ts`. Both use a top-of-file `"use server"` directive and follow this pattern:
1. `const session = await auth()` — reject if no `session.user.id`.
2. Zod-validate the `FormData` payload. Return `{ ok: false, error, fieldErrors }` on failure.
3. For updates/deletes, scope the Prisma query with `where: { id, userId }` (use `updateMany`/`deleteMany` and check `count`) so users can only touch their own rows.
4. Convert numbers to `new Prisma.Decimal(...)` before writing money columns.
5. `revalidatePath('/inventory')` (or the relevant path) before returning `{ ok: true }`.

### Server → client data passing
Prisma returns `Decimal` instances for money columns. **Do not** pass them directly to client components — serialize to strings in the server component first (`item.purchasePrice.toString()`). Client components format them back with `Number(...)`.

### Client component file layout
When a route needs client-side interactivity (e.g. the add-card search, the inline price editor), the pattern is:
- `app/(app)/<route>/page.tsx` stays a server component. It fetches data and renders a thin wrapper.
- `app/(app)/<route>/<name>-client.tsx` (or `<name>.tsx` with `"use client"`) holds the interactive piece.

### Inventory list (`app/(app)/inventory/page.tsx`)
The inventory page fetches both `InventoryItem` (cards) and `SealedInventoryItem` (sealed products) in parallel and merges them into a unified `InventoryRowData` union type before passing to the client. `InventoryRowData = CardInventoryRowData | SealedInventoryRowData` — both have `itemType: "card" | "sealed"` discriminants. Sort and search helpers in the page use helper functions `itemName(r)` and `itemSetName(r)` to safely handle both types. The "Needs attention" filter covers both card and sealed rows — sealed rows get price-change and list-flag signals once SealedPricePoint data exists. The `InventoryRow` client component dispatches to `CardRow` or `SealedRow` based on `item.itemType`. Sealed items without a linked `SealedProduct` (shouldn't happen after migration) are silently skipped.

### Add page (`app/(app)/add/`)
`add-card-client.tsx` renders two tabs ("Single Card" / "Sealed Product") at the top. Selecting "Sealed Product" renders `AddSealedForm` from `add-sealed-client.tsx`. The add-sealed flow is search-then-select-or-create: search the `SealedProduct` catalog, select an existing product or create a new one (calls `createSealedProduct`), then fill inventory lot details and submit via `addSealedItem`. The tab is reflected in the URL param `?type=sealed` and the page server component passes `defaultTab` so deep links work.

### Sealed product pricing (`lib/scrape-sealed-price.ts`, cron)
- `scrapeTcgplayerSealedPrice(url)` — best-effort TCGPlayer HTML scraper. Two-pass: (1) JSON-LD `<script type="application/ld+json">` with `"@type": "Product"` offers block; (2) `__NEXT_DATA__` embedded JSON. Returns `{ market, low, high }` — all-null on failure, never throws.
- The cron job (`app/api/cron/refresh-prices/route.ts`) runs the sealed refresh phase after cards: queries `SealedProduct` rows with a `tcgplayerUrl` that have at least one inventory item, calls the scraper, inserts a `SealedPricePoint`. Rate limited at 1 s between requests. Returns `{ cards: {...}, sealed: {...} }` counters.
- The cron response format changed from `{ refreshed, skipped, errors }` (flat) to `{ cards: { refreshed, skipped, errors }, sealed: { refreshed, skipped, errors } }` — update any monitoring/CI that parses this.

### Shared types across server/client
Don't `import type { Foo } from "@/app/api/**/route"` in client components — even type-only imports can drag the route handler's server-only dependencies (`auth`, `prisma`) into the client bundle graph. Put shared shapes in `lib/*-types.ts` (see `lib/card-search-types.ts`, `lib/sealed-types.ts` for the pattern).

### User management (invite system)
- `ALLOWED_EMAILS` env var = admin list (bypass DB, auto-promoted to `ADMIN` role on first sign-in).
- All other users need an `Invite` row in the DB (created via `/admin` UI by an admin).
- `signIn` callback in `lib/auth.ts` checks ALLOWED_EMAILS first, then the Invite table. Invite rows are stamped `acceptedAt` on first use.
- Admin UI lives at `/admin` (server component + `admin-client.tsx`). Protected by `session.user.role === "ADMIN"` check; non-admins get `notFound()`.
- `lib/admin-actions.ts` contains the `inviteUser`, `revokeUser`, and `getAdminData` server actions. Admin-only check is done in a `requireAdmin()` helper at the top of each.
- Beta user cap is enforced in `inviteUser`: `count(User) + count(pending Invite) < 50`.
- `POKEMONTCG_API_KEY` is strongly recommended — without it the price-refresh job can approach Vercel's 60-second function timeout for large inventories.
- `CRON_SECRET` must also be set as a **GitHub Actions secret** (repo Settings → Secrets and variables → Actions → `CRON_SECRET`) so the workflow can authenticate its POST requests to `/api/cron/refresh-prices`. The Vercel cron block has been removed from `vercel.json`; GitHub Actions is the sole trigger.

### pokemontcg.io integration
- `lib/pokemontcg.ts` wraps the upstream REST API. Only call it from server code.
- `finishPriceKeys()` / `pricesForFinish()` handle the fact that TCGPlayer exposes different price blocks per finish variant (`normal`, `holofoil`, `1stEditionHolofoil`, etc.), and some variants are missing on some cards.
- `pricesForFinish(card, finish, { allowFallback: true })` — pass `allowFallback` in the cron and add-card action so cards where TCGPlayer uses a different finish key than the stored one still get real prices instead of all-null rows.
- The `/api/cards/search` route upserts every returned card into the local `Card` table, so the subsequent add action usually hits cache. It still re-fetches defensively if the card is missing.

### Pricing intelligence
- `lib/pricing.ts` — pure functions (`recentChange`, `classifyListPrice`) with no DB/Prisma dependency. Safe to import in both server components and unit tests.
- `recentChange(history, days)` requires at least 50% of the requested window to be present in history, or returns null. Prevents misleading badges from sparse data.
- Unit tests live in `tests/pricing.test.ts`.

### Scan feature (`app/(app)/scan/`)
- **Card identification:** Client-side OCR via `tesseract.js` (WASM, runs in browser). Captures a video frame, crops to the top 25% (card name region), runs OCR with PSM 7 (single-line mode), cleans the extracted text, and searches via `/api/cards/identify`.
- **`/api/cards/identify`** — like `/api/cards/search` but returns top 5 results plus a `marketPrice` field extracted from the TCGPlayer data in the pokemontcg.io response. Uses `pricesForFinish(card, "NORMAL", { allowFallback: true })`.
- **`lib/scan-types.ts`** — shared `ScanMatch` type `{ card: CardSearchResult; marketPrice: number | null }`.
- **`use-camera.ts`** — hook wrapping native `getUserMedia`. Sets `playsinline` for iOS Safari. Exposes `start`, `stop`, `capture` (returns `Blob`). Cleans up tracks on unmount.
- **`use-ocr.ts`** — hook wrapping Tesseract.js with lazy worker initialization. Terminates worker on unmount. Crops image before OCR via an offscreen canvas.
- **`scan-client.tsx`** — state machine: `idle → scanning → processing → result → add-form → added → (back to scanning)`. After a successful add, loops back to scanning so users can batch-scan multiple cards without re-navigating. Uses the existing `addInventoryItem` server action.
- **Future v2 enhancement:** A hybrid approach (OCR first, AI vision fallback for low-confidence results) could improve accuracy for damaged or obscured cards. Would require a vision API key and a new server-side proxy route.

### Styling conventions
- Tailwind v4 with `@import "tailwindcss"` in `app/globals.css`. No `tailwind.config.js` — use `@theme` blocks and `@layer components` directly in CSS.
- Form controls share a `.input-base` utility class defined in `globals.css`. Use it for `<input>`, `<select>`, `<textarea>` so the app has one consistent input style.

## Git Workflow

**Before starting a new milestone, pull the latest from GitHub** with `git pull --rebase origin main`, then run `npm install` if `package.json` changed. Vercel bots and manual commits land on `main` between sessions, and starting a milestone against stale state guarantees a messy rebase at push time.

Commit work frequently with clean, descriptive commit messages and push to GitHub regularly so progress is never lost. After completing any meaningful unit of work (a feature, a fix, a refactor), commit and push before moving on. Prefer small, focused commits over large bundled ones.

**Before every commit, review CLAUDE.md and update it if the change being committed introduces new architecture, patterns, commands, conventions, or gotchas that a future Claude instance would otherwise have to rediscover. Also update README.md whenever completing a milestone or shipping a major feature set.** Include the CLAUDE.md update in the same commit as the change it describes. If nothing in CLAUDE.md is affected, skip the update — don't churn the file for its own sake.

When pushing fails with "fetch first," someone (or a Vercel bot) has landed a commit on `main` upstream. Rebase with `git pull --rebase origin main`, re-run `npm install` if `package.json` changed, re-verify the build, then push.
