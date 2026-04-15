/**
 * POST /api/cron/refresh-prices
 *
 * Price-refresh cron job invoked by Vercel Cron (schedule: 0 *\/8 * * * — 3× per day).
 * Protected by a shared secret in the `x-cron-secret` header — both Vercel
 * and manual `curl` calls must supply it.
 *
 * What it does:
 *  1. Finds every distinct cardId that appears in at least one InventoryItem.
 *  2. For each card, determines which Finish variants are in someone's inventory.
 *  3. Fetches the card's latest data from pokemontcg.io (in batches of 10).
 *  4. Inserts one new PricePoint row per finish variant.
 *
 * Cards with no inventory items are skipped (no point refreshing orphaned data).
 *
 * Batching: cards are processed 10 at a time concurrently. Without
 * POKEMONTCG_API_KEY (100 req/min limit) a 600ms inter-batch pause keeps
 * throughput safely under the limit. With an API key (1 000 req/min) the
 * pause is skipped entirely and the job runs ~10× faster.
 *
 * POKEMONTCG_API_KEY is strongly recommended for beta deployments — without
 * it the function may approach Vercel's 60-second timeout for large inventories.
 *
 * Manual test:
 *   curl -X POST \
 *     -H "x-cron-secret: <CRON_SECRET>" \
 *     https://your-deployment.vercel.app/api/cron/refresh-prices
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getCard, pricesForFinish } from "@/lib/pokemontcg";
import { scrapeTcgplayerSealedPrice } from "@/lib/scrape-sealed-price";
import { Finish, Prisma } from "@prisma/client";

const BATCH_SIZE = 10;
// Inter-batch pause (ms) when running without an API key to stay under 100 req/min.
// 10 concurrent requests per batch at 600ms spacing ≈ 60 req/min — safely within limits.
const NO_KEY_BATCH_DELAY_MS = 600;

interface RefreshCounters {
  refreshed: number;
  skipped: number;
  errors: number;
}

/**
 * Refresh a single card: fetch upstream data, insert PricePoints for every
 * finish variant in inventory, and update the Card metadata row.
 */
async function refreshCard(
  cardId: string,
  cardFinishes: Map<string, Set<Finish>>,
  counters: RefreshCounters,
): Promise<void> {
  try {
    const upstream = await getCard(cardId);
    const finishes = cardFinishes.get(cardId)!;

    const inserts = Array.from(finishes).map((finish) => {
      const block = pricesForFinish(upstream, finish, { allowFallback: true });
      return prisma.pricePoint.create({
        data: {
          cardId,
          finish,
          market: block?.market != null ? new Prisma.Decimal(block.market) : null,
          low: block?.low != null ? new Prisma.Decimal(block.low) : null,
          mid: block?.mid != null ? new Prisma.Decimal(block.mid) : null,
          high: block?.high != null ? new Prisma.Decimal(block.high) : null,
        },
      });
    });

    await Promise.all(inserts);
    counters.refreshed += inserts.length;

    // Freshen the Card metadata row in case set/name/image/URL changed.
    await prisma.card.update({
      where: { id: cardId },
      data: {
        name: upstream.name,
        setId: upstream.set.id,
        setName: upstream.set.name,
        number: upstream.number,
        rarity: upstream.rarity ?? null,
        imageSmall: upstream.images?.small ?? null,
        imageLarge: upstream.images?.large ?? null,
        tcgplayerUrl: upstream.tcgplayer?.url || null,
        lastFetchedAt: new Date(),
      },
    });
  } catch (err) {
    console.error(`[refresh-prices] failed for cardId=${cardId}`, err);
    counters.errors++;
    counters.skipped++;
  }
}

export async function POST(request: Request) {
  // --- Auth ---
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Find cards that need refreshing ---
  // Group by cardId + collect all finish variants for that card.
  const inventoryRows = await prisma.inventoryItem.findMany({
    select: { cardId: true, finish: true },
    distinct: ["cardId", "finish"],
  });

  if (inventoryRows.length === 0) {
    return NextResponse.json({ refreshed: 0, skipped: 0, errors: 0 });
  }

  // Build map: cardId → Set<Finish>
  const cardFinishes = new Map<string, Set<Finish>>();
  for (const row of inventoryRows) {
    const set = cardFinishes.get(row.cardId) ?? new Set<Finish>();
    set.add(row.finish);
    cardFinishes.set(row.cardId, set);
  }

  const cardIds = Array.from(cardFinishes.keys());
  const counters: RefreshCounters = { refreshed: 0, skipped: 0, errors: 0 };

  // --- Refresh in batches ---
  for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
    const batch = cardIds.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((id) => refreshCard(id, cardFinishes, counters)));

    // Throttle between batches when running without an API key.
    const hasMore = i + BATCH_SIZE < cardIds.length;
    if (!env.POKEMONTCG_API_KEY && hasMore) {
      await new Promise((r) => setTimeout(r, NO_KEY_BATCH_DELAY_MS));
    }
  }

  const { refreshed, skipped, errors } = counters;
  console.log(`[refresh-prices] cards done — refreshed=${refreshed} skipped=${skipped} errors=${errors}`);

  // --- Refresh sealed product prices ---
  // Find SealedProducts that have at least one inventory item and a tcgplayerUrl.
  const sealedProducts = await prisma.sealedProduct.findMany({
    where: {
      tcgplayerUrl: { not: null },
      inventoryItems: { some: {} },
    },
    select: { id: true, tcgplayerUrl: true },
  });

  const sealedCounters = { refreshed: 0, skipped: 0, errors: 0 };

  for (const product of sealedProducts) {
    if (!product.tcgplayerUrl) continue;
    try {
      const prices = await scrapeTcgplayerSealedPrice(product.tcgplayerUrl);
      await prisma.sealedPricePoint.create({
        data: {
          sealedProductId: product.id,
          market: prices.market != null ? new Prisma.Decimal(prices.market) : null,
          low: prices.low != null ? new Prisma.Decimal(prices.low) : null,
          high: prices.high != null ? new Prisma.Decimal(prices.high) : null,
        },
      });
      sealedCounters.refreshed++;
    } catch (err) {
      console.error(`[refresh-prices] sealed failed for product=${product.id}`, err);
      sealedCounters.errors++;
      sealedCounters.skipped++;
    }

    // 1-second delay between TCGPlayer requests (live site, not an API).
    if (sealedProducts.indexOf(product) < sealedProducts.length - 1) {
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }

  console.log(
    `[refresh-prices] sealed done — refreshed=${sealedCounters.refreshed} skipped=${sealedCounters.skipped} errors=${sealedCounters.errors}`,
  );

  return NextResponse.json({
    cards: { refreshed, skipped, errors },
    sealed: sealedCounters,
  });
}
