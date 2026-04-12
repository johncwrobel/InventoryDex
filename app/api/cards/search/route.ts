/**
 * GET /api/cards/search?q=<query>&setId=<setId>&sort=<sort>
 *
 * Authenticated proxy to pokemontcg.io. Returns a compact list the add-card
 * UI can render, and upserts each result into our local `Card` table so the
 * subsequent "add to inventory" server action doesn't have to re-fetch.
 *
 * Accepts any combination of:
 *   - `q`      — name prefix (2+ chars required when used alone)
 *   - `setId`  — restrict to a single set; can be used without `q`
 *   - `sort`   — one of CARD_SEARCH_SORTS; defaults to releaseDate:desc
 *
 * Auth: any signed-in user.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { CardSearchResult } from "@/lib/card-search-types";
import {
  CARD_SEARCH_SORTS,
  searchCards,
  type CardSearchSort,
  type PokemonTcgCard,
} from "@/lib/pokemontcg";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const setId = searchParams.get("setId")?.trim() || undefined;
  const sortParam = searchParams.get("sort") ?? "releaseDate:desc";
  const sort: CardSearchSort = (CARD_SEARCH_SORTS as readonly string[]).includes(
    sortParam,
  )
    ? (sortParam as CardSearchSort)
    : "releaseDate:desc";

  // At least one of a substantive query OR a set filter is required.
  // An empty form shouldn't dump the entire card database.
  if (q.length < 2 && !setId) {
    return NextResponse.json({ results: [] satisfies CardSearchResult[] });
  }

  let upstream: PokemonTcgCard[];
  try {
    upstream = await searchCards({
      query: q.length >= 2 ? q : undefined,
      setId,
      sort,
      // Larger page when set-filtering — users browsing a whole set
      // expect to see most of it without pagination.
      pageSize: setId ? 60 : 24,
    });
  } catch (err) {
    console.error("[cards/search] upstream error", err);
    return NextResponse.json(
      { error: "Search failed. Try again in a moment." },
      { status: 502 },
    );
  }

  // Cache every returned card locally. We do this in parallel; failure to
  // cache is not fatal (the add action will upsert again if needed).
  await Promise.all(
    upstream.map((card) =>
      prisma.card
        .upsert({
          where: { id: card.id },
          create: {
            id: card.id,
            name: card.name,
            setId: card.set.id,
            setName: card.set.name,
            number: card.number,
            rarity: card.rarity ?? null,
            imageSmall: card.images?.small ?? null,
            imageLarge: card.images?.large ?? null,
            tcgplayerUrl: card.tcgplayer?.url || null,
          },
          update: {
            name: card.name,
            setId: card.set.id,
            setName: card.set.name,
            number: card.number,
            rarity: card.rarity ?? null,
            imageSmall: card.images?.small ?? null,
            imageLarge: card.images?.large ?? null,
            tcgplayerUrl: card.tcgplayer?.url || null,
            lastFetchedAt: new Date(),
          },
        })
        .catch((err) => {
          console.error(`[cards/search] cache upsert failed for ${card.id}`, err);
        }),
    ),
  );

  const results: CardSearchResult[] = upstream.map((card) => ({
    id: card.id,
    name: card.name,
    setId: card.set.id,
    setName: card.set.name,
    number: card.number,
    rarity: card.rarity ?? null,
    imageSmall: card.images?.small ?? null,
    imageLarge: card.images?.large ?? null,
    tcgplayerUrl: card.tcgplayer?.url || null,
  }));

  return NextResponse.json({ results });
}
