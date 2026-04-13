import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { recentChange, classifyListPrice } from "@/lib/pricing";
import { InventoryRow, type InventoryRowData } from "./inventory-row";
import { InventorySearch } from "./inventory-search";

const PRICE_CHANGE_DAYS = 7;

type SearchParams = Promise<{
  filter?: string;
  q?: string;
  sort?: string;
  dir?: string;
}>;

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

const SORT_DEFAULT_DIR: Record<string, "asc" | "desc"> = {
  dateAdded: "desc",
  cardName: "asc",
  setName: "asc",
  rarity: "asc",
  marketPrice: "desc",
  listPrice: "desc",
  purchasePrice: "desc",
  priceChange: "desc",
};

const VALID_SORTS = new Set(Object.keys(SORT_DEFAULT_DIR));

function defaultDir(field: string): "asc" | "desc" {
  return SORT_DEFAULT_DIR[field] ?? "desc";
}

function sortHref(
  field: string,
  currentSort: string,
  currentDir: string,
  q: string,
  filter: string,
): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter) params.set("filter", filter);
  params.set("sort", field);
  const newDir =
    field === currentSort
      ? currentDir === "asc"
        ? "desc"
        : "asc"
      : defaultDir(field);
  params.set("dir", newDir);
  return `/inventory?${params.toString()}`;
}

function sortRows(
  rows: InventoryRowData[],
  sort: string,
  dir: string,
): InventoryRowData[] {
  const multiplier = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "cardName":
        cmp = a.card.name.localeCompare(b.card.name);
        break;
      case "setName":
        cmp = a.card.setName.localeCompare(b.card.setName);
        break;
      case "marketPrice":
        cmp = Number(a.marketPrice ?? -1) - Number(b.marketPrice ?? -1);
        break;
      case "listPrice":
        cmp = Number(a.listPrice ?? -1) - Number(b.listPrice ?? -1);
        break;
      case "purchasePrice":
        cmp = Number(a.purchasePrice) - Number(b.purchasePrice);
        break;
      case "priceChange":
        cmp =
          Math.abs(a.priceChangePct ?? 0) - Math.abs(b.priceChangePct ?? 0);
        break;
      case "rarity":
        cmp = (a.card.rarity ?? "").localeCompare(b.card.rarity ?? "");
        break;
      default:
        // dateAdded
        cmp = a.createdAt < b.createdAt ? -1 : 1;
    }
    return cmp * multiplier;
  });
}

// ---------------------------------------------------------------------------
// Sort column header
// ---------------------------------------------------------------------------

function SortTh({
  field,
  label,
  currentSort,
  currentDir,
  q,
  filter,
  className = "",
}: {
  field: string;
  label: string;
  currentSort: string;
  currentDir: string;
  q: string;
  filter: string;
  className?: string;
}) {
  const active = currentSort === field;
  const indicator = active ? (currentDir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th className={`px-3 py-2 font-medium ${className}`}>
      <Link
        href={sortHref(field, currentSort, currentDir, q, filter)}
        className={`transition ${
          active
            ? "text-red-600 dark:text-red-400"
            : "hover:text-neutral-800 dark:hover:text-neutral-200"
        }`}
      >
        {label}
        {indicator}
      </Link>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Inventory list page.
 *
 * Fetches the signed-in user's inventory with card metadata and recent
 * PricePoint history. Computes delta badges and list-price flags server-side
 * via lib/pricing.ts so the client components receive plain numbers.
 *
 * Supports:
 *   ?q=text        — search by card name or set name
 *   ?sort=field    — sort field (dateAdded | cardName | setName | marketPrice |
 *                    listPrice | purchasePrice | priceChange | rarity)
 *   ?dir=asc|desc  — sort direction
 *   ?filter=attention — show only rows that need attention
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { filter, q, sort: rawSort, dir: rawDir } = await searchParams;

  const attentionOnly = filter === "attention";
  const searchQuery = q?.trim().toLowerCase() ?? "";
  const sort = rawSort && VALID_SORTS.has(rawSort) ? rawSort : "dateAdded";
  const dir: "asc" | "desc" =
    rawDir === "asc" || rawDir === "desc" ? rawDir : defaultDir(sort);

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
    // Fetch newest-first so the default dateAdded sort is just the natural order
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
    const history = rawHistory.map((p) => ({
      market: p.market?.toString() ?? null,
      capturedAt: p.capturedAt,
    }));

    const marketPrice = latestPrice?.market?.toString() ?? null;
    const priceChangePct = recentChange(history, PRICE_CHANGE_DAYS);
    const listFlag = classifyListPrice(
      item.listPrice?.toString(),
      latestPrice?.market?.toString(),
      listPct,
    );

    return {
      id: item.id,
      createdAt: item.createdAt.toISOString(),
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
        rarity: item.card.rarity,
        imageSmall: item.card.imageSmall,
        tcgplayerUrl: item.card.tcgplayerUrl,
      },
      marketPrice,
      priceChangePct,
      listFlag,
      isGraded: item.isGraded,
      gradingCompany: item.gradingCompany,
      grade: item.grade,
    };
  });

  // 1. Search filter
  const searchedRows = searchQuery
    ? allRows.filter(
        (r) =>
          r.card.name.toLowerCase().includes(searchQuery) ||
          r.card.setName.toLowerCase().includes(searchQuery),
      )
    : allRows;

  // 2. Attention filter (applied within search results)
  const attentionRows = searchedRows.filter(
    (r) =>
      (r.priceChangePct != null && Math.abs(r.priceChangePct) >= changePct) ||
      r.listFlag != null,
  );
  const attentionCount = attentionRows.length;
  const filteredRows = attentionOnly ? attentionRows : searchedRows;

  // 3. Sort
  const rows = sortRows(filteredRows, sort, dir);

  // Shared context for sort links
  const sortCtx = { currentSort: sort, currentDir: dir, q: q ?? "", filter: filter ?? "" };

  return (
    <div className="space-y-4">
      {/* Title + buttons */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-xs text-neutral-500">
            {searchQuery && rows.length !== allRows.length ? (
              <>
                {rows.length} of {allRows.length}{" "}
                {allRows.length === 1 ? "item" : "items"}
              </>
            ) : (
              <>
                {rows.length} {rows.length === 1 ? "item" : "items"}
              </>
            )}
            {attentionOnly && searchedRows.length !== rows.length && (
              <>
                {" "}
                ·{" "}
                <Link
                  href={`/inventory${searchQuery ? `?q=${encodeURIComponent(q!)}` : ""}`}
                  className="underline underline-offset-2"
                >
                  Show all
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {attentionCount > 0 && (
            <Link
              href={
                attentionOnly
                  ? `/inventory${searchQuery ? `?q=${encodeURIComponent(q!)}` : ""}`
                  : `/inventory?filter=attention${searchQuery ? `&q=${encodeURIComponent(q!)}` : ""}`
              }
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

      {/* Search input */}
      <Suspense fallback={<div className="input-base w-full opacity-50">Search cards or sets…</div>}>
        <InventorySearch defaultValue={q ?? ""} />
      </Suspense>

      {rows.length === 0 && attentionOnly && (
        <p className="py-10 text-center text-sm text-neutral-500">
          No items need attention right now.{" "}
          <Link
            href={searchQuery ? `/inventory?q=${encodeURIComponent(q!)}` : "/inventory"}
            className="underline underline-offset-2"
          >
            View all
          </Link>
        </p>
      )}

      {rows.length === 0 && searchQuery && !attentionOnly && (
        <p className="py-10 text-center text-sm text-neutral-500">
          No cards matched &ldquo;{q}&rdquo;.
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
                  <SortTh field="cardName" label="Card" {...sortCtx} />
                  <th className="px-3 py-2 font-medium">Cond/Finish</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <SortTh field="purchasePrice" label="Paid" {...sortCtx} className="text-right" />
                  <SortTh field="marketPrice" label="Market" {...sortCtx} className="text-right" />
                  <SortTh field="listPrice" label="List" {...sortCtx} className="text-right" />
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

          {/* Mobile: sort form + card list */}
          <div className="space-y-3 md:hidden">
            <form method="get" action="/inventory" className="flex gap-2">
              {searchQuery && (
                <input type="hidden" name="q" value={q} />
              )}
              {filter && (
                <input type="hidden" name="filter" value={filter} />
              )}
              <select
                name="sort"
                defaultValue={sort}
                className="input-base flex-1 text-sm"
              >
                <option value="dateAdded">Date Added</option>
                <option value="cardName">Card Name</option>
                <option value="setName">Set</option>
                <option value="marketPrice">Market Price</option>
                <option value="listPrice">List Price</option>
                <option value="purchasePrice">Paid Price</option>
                <option value="priceChange">Price Change</option>
                <option value="rarity">Rarity</option>
              </select>
              <select
                name="dir"
                defaultValue={dir}
                className="input-base text-sm"
              >
                <option value="desc">↓ Desc</option>
                <option value="asc">↑ Asc</option>
              </select>
              <button
                type="submit"
                className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                Sort
              </button>
            </form>

            <ul className="space-y-3">
              {rows.map((row) => (
                <InventoryRow key={row.id} item={row} variant="mobile" />
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
