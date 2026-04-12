/**
 * GET /api/cards/identify?q=<name>&number=<cardNumber>
 *
 * Used by the scan feature. Accepts an OCR-extracted card name and/or card
 * number and returns matching cards with their best available TCGPlayer market
 * price.
 *
 * Search strategy (most → least specific):
 *   1. name + number  → compound query, up to 5 results (should be 1–2)
 *   2. number only    → up to 20 results (many cards share a number across sets)
 *   3. name only      → up to 8 results
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
  const number = searchParams.get("number")?.trim() ?? "";

  // Need at least a 2-char name or a card number.
  if (q.length < 2 && !number) {
    return NextResponse.json({ results: [] satisfies ScanMatch[] });
  }

  // Determine page size based on how specific the query is.
  // number+name → very specific → 5 results
  // number only → moderately specific (shared across sets) → 20 results
  // name only → least specific → 8 results
  const pageSize = number ? (q.length >= 2 ? 5 : 20) : 8;

  let upstream: PokemonTcgCard[];
  try {
    upstream = await searchCards({
      query: q.length >= 2 ? q : undefined,
      cardNumber: number || undefined,
      pageSize,
    });
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
