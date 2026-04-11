/**
 * POST /api/cron/refresh-prices
 *
 * Daily price-refresh cron job invoked by Vercel Cron (schedule: 0 7 * * *).
 * Protected by a shared secret in the `x-cron-secret` header — both Vercel
 * and manual `curl` calls must supply it.
 *
 * What it does:
 *  1. Finds every distinct cardId that appears in at least one InventoryItem.
 *  2. For each card, determines which Finish variants are in someone's inventory.
 *  3. Fetches the card's latest data from pokemontcg.io.
 *  4. Inserts one new PricePoint row per finish variant.
 *
 * Cards with no inventory items are skipped (no point refreshing orphaned data).
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
import { Finish, Prisma } from "@prisma/client";

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

  // --- Refresh each card ---
  let refreshed = 0;
  let skipped = 0;
  let errors = 0;

  for (const cardId of cardIds) {
    try {
      const upstream = await getCard(cardId);
      const finishes = cardFinishes.get(cardId)!;

      const inserts = Array.from(finishes).map((finish) => {
        const block = pricesForFinish(upstream, finish);
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
      refreshed += inserts.length;

      // Also freshen the Card metadata row in case set/name changed.
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
          tcgplayerUrl: upstream.tcgplayer?.url ?? null,
          lastFetchedAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`[refresh-prices] failed for cardId=${cardId}`, err);
      errors++;
      skipped++;
    }
  }

  console.log(`[refresh-prices] done — refreshed=${refreshed} skipped=${skipped} errors=${errors}`);
  return NextResponse.json({ refreshed, skipped, errors });
}
