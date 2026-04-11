# InventoryDex

A web-based inventory management tool for Pokémon TCG vendors. Track purchase price, list price, and live market price (via pokemontcg.io). Flags cards whose market value has moved recently and highlights cards priced significantly above or below market. Mobile-friendly. Invite-only.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · PostgreSQL (Prisma 6) · Auth.js v5 (Resend magic links) · Vercel + Vercel Cron

## Getting started (local dev)

```bash
npm install
cp .env.example .env.local              # then fill in real values
npm run db:migrate -- --name init       # create the schema in your database
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/sign-in`. Enter an allowlisted email, click the magic link, and land on an empty `/inventory` page.

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
```

See `CLAUDE.md` for working conventions and `.env.example` for the full list of required environment variables.
