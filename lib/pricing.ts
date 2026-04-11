/**
 * Pure pricing utility functions for InventoryDex.
 *
 * These functions have no database or API dependencies and can be unit-tested
 * in isolation. They consume serialised Decimal values (strings or numbers)
 * so that they work cleanly from both server components and client components
 * without shipping the Prisma Decimal class to the browser.
 */

// ---------- Types ----------

export type ListFlag = "underpriced" | "overpriced" | null;

/**
 * Minimal price-snapshot shape. Mirrors the fields we read from PricePoint
 * rows but uses plain JS types so this module has no Prisma dependency.
 */
export interface PriceSnapshot {
  market: string | number | null;
  capturedAt: Date | string;
}

// ---------- recentChange ----------

/**
 * Compute the percentage change in market price between the most recent
 * snapshot and the snapshot closest to `days` days ago.
 *
 * Returns `null` when:
 *  - There are fewer than 2 snapshots.
 *  - The oldest snapshot available is less than half the requested window
 *    away (i.e. we don't have enough history to make a meaningful comparison).
 *  - Either the latest or the historical market price is null / zero.
 *
 * @param history  Array of price snapshots for a single (card, finish) pair,
 *                 in **descending** capturedAt order (newest first).
 * @param days     Look-back window in days (e.g. 7).
 * @returns        Percentage change (positive = price rose), or null.
 */
export function recentChange(
  history: PriceSnapshot[],
  days: number,
): number | null {
  if (history.length < 2) return null;

  const latest = history[0];
  const latestMarket = toNumber(latest.market);
  if (!latestMarket) return null;

  const cutoff = new Date(toDate(latest.capturedAt).getTime() - days * 86_400_000);

  // Find the snapshot closest to the cutoff that is strictly older than the
  // latest snapshot.
  let best: PriceSnapshot | null = null;
  let bestDiff = Infinity;

  for (let i = 1; i < history.length; i++) {
    const snap = history[i];
    const snapDate = toDate(snap.capturedAt);
    const diff = Math.abs(snapDate.getTime() - cutoff.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = snap;
    }
  }

  if (!best) return null;

  // Require that the historical snapshot is at least half the window away.
  // This prevents a misleading badge when we only have a few hours of data.
  const historicalDate = toDate(best.capturedAt);
  const latestDate = toDate(latest.capturedAt);
  const actualDays =
    (latestDate.getTime() - historicalDate.getTime()) / 86_400_000;
  if (actualDays < days * 0.5) return null;

  const historicalMarket = toNumber(best.market);
  if (!historicalMarket) return null;

  return ((latestMarket - historicalMarket) / historicalMarket) * 100;
}

// ---------- classifyListPrice ----------

/**
 * Compare a vendor's list price against the current market price.
 *
 * @param listPrice     Vendor's asking price (null → no opinion).
 * @param marketPrice   Current market price (null → no data).
 * @param thresholdPct  Gap percentage that triggers a flag (e.g. 15 for 15%).
 * @returns             'underpriced' | 'overpriced' | null
 */
export function classifyListPrice(
  listPrice: string | number | null | undefined,
  marketPrice: string | number | null | undefined,
  thresholdPct: number,
): ListFlag {
  const list = toNumber(listPrice);
  const market = toNumber(marketPrice);
  if (!list || !market) return null;

  const gapPct = ((list - market) / market) * 100;

  if (gapPct < -thresholdPct) return "underpriced"; // list below market
  if (gapPct > thresholdPct) return "overpriced";   // list above market
  return null;
}

// ---------- Helpers ----------

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
