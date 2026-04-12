/**
 * GET /api/cards/identify?q=<name>
 *
 * Used by the scan feature. Like /api/cards/search but also returns the best
 * available TCGPlayer market price for each result, so the scan UI can show
 * market price without a separate request.
 *
 * Returns the top 5 matches — the scan flow only needs a small result set to
 * surface the best match and a few alternatives.
 *
 * Auth: any signed-in user.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { CardSearchResult } from "@/lib/card-search-types";
import type { ScanMatch } from "@/lib/scan-types";
import { searchCards, pricesForFinish, type PokemonTcgCard } from "@/lib/pokemontcg";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ results: [] satisfies ScanMatch[] });
  }

  let upstream: PokemonTcgCard[];
  try {
    upstream = await searchCards({ query: q, pageSize: 5 });
  } catch (err) {
    console.error("[cards/identify] upstream error", err);
    return NextResponse.json(
      { error: "Search failed. Try again in a moment." },
      { status: 502 },
    );
  }

  // Cache every returned card locally — same pattern as /api/cards/search.
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
          console.error(`[cards/identify] cache upsert failed for ${card.id}`, err);
        }),
    ),
  );

  const results: ScanMatch[] = upstream.map((card) => {
    // Try to extract a market price. Use allowFallback so cards where TCGPlayer
    // uses a different finish key than "normal" still get a price shown.
    const priceBlock = pricesForFinish(card, "NORMAL", { allowFallback: true });
    const marketPrice = priceBlock?.market ?? null;

    const cardResult: CardSearchResult = {
      id: card.id,
      name: card.name,
      setId: card.set.id,
      setName: card.set.name,
      number: card.number,
      rarity: card.rarity ?? null,
      imageSmall: card.images?.small ?? null,
      imageLarge: card.images?.large ?? null,
      tcgplayerUrl: card.tcgplayer?.url || null,
    };

    return { card: cardResult, marketPrice };
  });

  return NextResponse.json({ results });
}
