# InventoryDex

A web-based inventory management tool for Pokémon TCG vendors. Track purchase price, list price, and live market price (via pokemontcg.io). Flags cards whose market value has moved recently and highlights cards priced significantly above or below market. Mobile-friendly. Invite-only.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · PostgreSQL (Prisma 6) · Auth.js v5 (Resend magic links) · Vercel + Vercel Cron

## Getting started (local dev)

```bash
npm install
cp .env.example .env.local          # then fill in real values
npx prisma migrate dev --name init  # after DATABASE_URL is set
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/sign-in`. Enter an allowlisted email, click the magic link, and land on an empty `/inventory` page.

## Scripts

```bash
npm run dev     # dev server (Turbopack)
npm run build   # production build
npm run start   # run built app
npm run lint    # eslint
```

See `CLAUDE.md` for working conventions and `.env.example` for the full list of required environment variables.
