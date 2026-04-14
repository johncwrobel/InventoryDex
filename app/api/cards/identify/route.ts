/**
 * GET /api/cards/identify?q=<name>&number=<cardNumber>&bodyWords=<word1,word2,...>
 *
 * Used by the scan feature. Accepts OCR-extracted card name, number, and body
 * text words, then returns matching cards ranked by relevance with their best
 * available TCGPlayer market price.
 *
 * Search strategy:
 *   1. Fetch candidates from pokemontcg.io using number + name (most specific first).
 *   2. If bodyWords are provided (≥ 2 words), re-rank candidates by counting how
 *      many OCR body words appear in each card's text fields (attacks, abilities,
 *      flavorText, rules). This approach is inspired by prateekt/pokemon-card-recognizer
 *      (GPL-3.0, Prateek Tandon): https://github.com/prateekt/pokemon-card-recognizer
 *      — body text uses regular fonts → reliable OCR → strong re-ranking signal.
 *   3. Return the top 5 results.
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
  const bodyWordsRaw = searchParams.get("bodyWords")?.trim() ?? "";
  const bodyWords = bodyWordsRaw
    ? bodyWordsRaw
        .split(",")
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length >= 4)
        .slice(0, 10)
    : [];

  const hasBodyWords = bodyWords.length >= 2;

  // Need at least a 2-char name, a card number, or body words to search.
  if (q.length < 2 && !number && !hasBodyWords) {
    return NextResponse.json({ results: [] satisfies ScanMatch[] });
  }

  // Fetch more candidates when body words are available so re-ranking has a
  // wider pool to work with.
  let pageSize: number;
  if (number && q.length >= 2) {
    pageSize = hasBodyWords ? 10 : 5;
  } else if (number) {
    pageSize = hasBodyWords ? 30 : 20;
  } else {
    pageSize = hasBodyWords ? 12 : 8;
  }

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

  // Re-rank candidates by shared body-word count when we have enough words.
  // Mirrors the classify_shared_words function from prateekt/pokemon-card-recognizer.
  if (hasBodyWords && upstream.length > 1) {
    upstream = rankByBodyWords(upstream, bodyWords);
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

  const results: ScanMatch[] = upstream.slice(0, 5).map((card) => {
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

/**
 * Score a card by counting how many query words appear in its body text fields.
 * Higher score = better match. Ties preserve original API order (stable sort).
 *
 * Directly adapted from classify_shared_words in prateekt/pokemon-card-recognizer:
 * https://github.com/prateekt/pokemon-card-recognizer
 */
function scoreCard(card: PokemonTcgCard, queryWords: string[]): number {
  const parts: string[] = [
    card.name ?? "",
    card.evolvesFrom ?? "",
    card.flavorText ?? "",
    ...(card.abilities?.flatMap((a) => [a.name, a.text ?? ""]) ?? []),
    ...(card.attacks?.flatMap((a) => [a.name, a.damage ?? "", a.text ?? ""]) ?? []),
    ...(card.rules ?? []),
  ];

  const cardWords = new Set(
    parts
      .join(" ")
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 4),
  );

  return queryWords.filter((w) => cardWords.has(w)).length;
}

function rankByBodyWords(cards: PokemonTcgCard[], bodyWords: string[]): PokemonTcgCard[] {
  // Attach scores without mutating, then stable-sort descending.
  const scored = cards.map((card, i) => ({
    card,
    score: scoreCard(card, bodyWords),
    originalIndex: i,
  }));
  scored.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.originalIndex - b.originalIndex,
  );
  return scored.map((s) => s.card);
}
