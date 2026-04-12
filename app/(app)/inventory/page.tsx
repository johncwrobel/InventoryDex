import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { recentChange, classifyListPrice } from "@/lib/pricing";
import { InventoryRow, type InventoryRowData } from "./inventory-row";

const PRICE_CHANGE_DAYS = 7;

type SearchParams = Promise<{ filter?: string }>;

/**
 * Inventory list page.
 *
 * Fetches the signed-in user's inventory with card metadata and recent
 * PricePoint history. Computes delta badges and list-price flags server-side
 * via lib/pricing.ts so the client components receive plain numbers.
 *
 * Supports ?filter=attention to show only rows that need attention.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { filter } = await searchParams;
  const attentionOnly = filter === "attention";

  const session = await auth();
  const userId = session!.user!.id;

  const items = await prisma.inventoryItem.findMany({
    where: { userId },
    include: {
      card: {
        include: {
          prices: {
            orderBy: { capturedAt: "desc" },
            // 20 snapshots is plenty for a 7-day delta at 1 snapshot/day
            take: 20,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  if (items.length === 0) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">No cards yet</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Your inventory is empty. Add your first card to get started.
          </p>
        </div>
        <Link
          href="/add"
          className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700"
        >
          Add a card
        </Link>
      </div>
    );
  }

  const changePct = env.PRICE_CHANGE_THRESHOLD_PCT;
  const listPct = env.LIST_PRICE_THRESHOLD_PCT;

  // Build the full row list with pre-computed badges.
  const allRows: InventoryRowData[] = items.map((item) => {
    const rawHistory = item.card.prices.filter((p) => p.finish === item.finish);
    const latestPrice = rawHistory[0];
    // Serialize Decimal → string so recentChange (which is browser-safe) can consume it.
    const history = rawHistory.map((p) => ({
      market: p.market?.toString() ?? null,
      capturedAt: p.capturedAt,
    }));

    const marketPrice = latestPrice?.market?.toString() ?? null;
    const priceChangePct = recentChange(history, PRICE_CHANGE_DAYS);
    const listFlag = classifyListPrice(item.listPrice?.toString(), latestPrice?.market?.toString(), listPct);

    return {
      id: item.id,
      quantity: item.quantity,
      condition: item.condition,
      finish: item.finish,
      purchasePrice: item.purchasePrice.toString(),
      listPrice: item.listPrice?.toString() ?? null,
      notes: item.notes,
      card: {
        id: item.card.id,
        name: item.card.name,
        setName: item.card.setName,
        number: item.card.number,
        imageSmall: item.card.imageSmall,
        tcgplayerUrl: item.card.tcgplayerUrl,
      },
      marketPrice,
      priceChangePct,
      listFlag,
    };
  });

  // Count rows that need attention (significant price move OR list-price flag).
  const attentionRows = allRows.filter(
    (r) =>
      (r.priceChangePct != null && Math.abs(r.priceChangePct) >= changePct) ||
      r.listFlag != null,
  );
  const attentionCount = attentionRows.length;
  const rows = attentionOnly ? attentionRows : allRows;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-xs text-neutral-500">
            {rows.length} {rows.length === 1 ? "item" : "items"}
            {attentionOnly && allRows.length !== rows.length && (
              <> · <Link href="/inventory" className="underline underline-offset-2">Show all</Link></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {attentionCount > 0 && (
            <Link
              href={attentionOnly ? "/inventory" : "/inventory?filter=attention"}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                attentionOnly
                  ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                  : "border-black/10 text-neutral-600 hover:bg-black/5 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/10"
              }`}
            >
              {attentionOnly ? "✕ " : ""}Needs attention ({attentionCount})
            </Link>
          )}
          <Link
            href="/add"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            Add
          </Link>
        </div>
      </div>

      {rows.length === 0 && attentionOnly && (
        <p className="py-10 text-center text-sm text-neutral-500">
          No items need attention right now.{" "}
          <Link href="/inventory" className="underline underline-offset-2">
            View all
          </Link>
        </p>
      )}

      {rows.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-black/10 md:block dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-red-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-red-950/20">
                <tr>
                  <th className="px-3 py-2 font-medium"> </th>
                  <th className="px-3 py-2 font-medium">Card</th>
                  <th className="px-3 py-2 font-medium">Cond/Finish</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Paid</th>
                  <th className="px-3 py-2 text-right font-medium">Market</th>
                  <th className="px-3 py-2 text-right font-medium">List</th>
                  <th className="px-3 py-2 text-right font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <InventoryRow key={row.id} item={row} variant="desktop" />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <InventoryRow key={row.id} item={row} variant="mobile" />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
