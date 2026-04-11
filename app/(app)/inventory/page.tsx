import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { InventoryRow, type InventoryRowData } from "./inventory-row";

/**
 * Inventory list page.
 *
 * Fetches the signed-in user's inventory rows with the card metadata and
 * the latest PricePoint per (card, finish) so we can show current market
 * price alongside the vendor's purchase/list prices.
 *
 * The row rendering (inline edit, delete) lives in the `InventoryRow`
 * client component; this page stays a server component so the initial
 * render is a single RSC hop with no client-side fetching.
 */
export default async function InventoryPage() {
  const session = await auth();
  const userId = session!.user!.id; // guaranteed by the (app) layout

  const items = await prisma.inventoryItem.findMany({
    where: { userId },
    include: {
      card: {
        include: {
          // Pull the most recent price per card. Filtering by finish is
          // done in memory below — Prisma can't match "latest per finish"
          // in a single relation include without a raw query.
          prices: {
            orderBy: { capturedAt: "desc" },
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
          className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
        >
          Add a card
        </Link>
      </div>
    );
  }

  // Flatten to the shape the row component expects. Decimals become strings
  // so we don't ship Prisma.Decimal classes to the client.
  const rows: InventoryRowData[] = items.map((item) => {
    const latestMatchingPrice = item.card.prices.find(
      (p) => p.finish === item.finish,
    );
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
      },
      marketPrice: latestMatchingPrice?.market?.toString() ?? null,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-xs text-neutral-500">
            {rows.length} {rows.length === 1 ? "item" : "items"}
          </p>
        </div>
        <Link
          href="/add"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Add
        </Link>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-black/10 md:block dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/[.03] text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-white/[.03]">
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
    </div>
  );
}
