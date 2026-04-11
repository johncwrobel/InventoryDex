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
- **Vercel Cron** for daily price refresh
- Hosted on **Vercel**

## Common commands

```bash
npm run dev      # start dev server (Turbopack)
npm run build    # production build
npm run start    # run built app
npm run lint     # eslint
```

Database/test commands will be added here as they're introduced.

## Important: Next.js 16 specifics

Next.js 16 has breaking changes from prior versions. **Before writing any Next-specific code**, read the relevant bundled doc in `node_modules/next/dist/docs/` — your training data is likely outdated. (See `AGENTS.md` — this is a hard rule, not a suggestion.)

## Git Workflow

Commit work frequently with clean, descriptive commit messages and push to GitHub regularly so progress is never lost. After completing any meaningful unit of work (a feature, a fix, a refactor), commit and push before moving on. Prefer small, focused commits over large bundled ones.
