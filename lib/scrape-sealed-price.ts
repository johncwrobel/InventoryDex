/**
 * Best-effort TCGPlayer price scraper for sealed products.
 *
 * Two-pass approach:
 *  1. JSON-LD: look for <script type="application/ld+json"> with "@type": "Product"
 *     containing an `offers` block with lowPrice / highPrice / price.
 *  2. __NEXT_DATA__: fall back to parsing TCGPlayer's embedded Next.js state,
 *     searching for marketPrice / lowestListing fields.
 *
 * Never throws — returns all-null on any failure so the cron job continues.
 */

export interface SealedPriceSnapshot {
  market: number | null;
  low: number | null;
  high: number | null;
}

const NULL_RESULT: SealedPriceSnapshot = { market: null, low: null, high: null };

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Extract prices from JSON-LD Product schema. */
function fromJsonLd(html: string): SealedPriceSnapshot | null {
  // Find all application/ld+json script tags.
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      const items: unknown[] = Array.isArray(obj)
        ? obj
        : obj["@graph"]
          ? obj["@graph"]
          : [obj];

      for (const item of items) {
        if (
          typeof item !== "object" ||
          item === null ||
          (item as Record<string, unknown>)["@type"] !== "Product"
        )
          continue;

        const offers = (item as Record<string, unknown>)["offers"];
        if (!offers || typeof offers !== "object") continue;

        const o = offers as Record<string, unknown>;
        const low = toNum(o["lowPrice"]);
        const high = toNum(o["highPrice"]);
        // TCGPlayer's JSON-LD puts the "current" price in `price` on AggregateOffer
        // or in the first offer. Use it as a market proxy if available.
        const market = toNum(o["price"]) ?? toNum((o as Record<string, unknown>)["priceValidUntil"] ? null : o["price"]);

        if (low != null || high != null) {
          return { market: market ?? null, low, high };
        }
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return null;
}

/** Extract prices from TCGPlayer's embedded __NEXT_DATA__ JSON. */
function fromNextData(html: string): SealedPriceSnapshot | null {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;

  try {
    const root = JSON.parse(m[1]);
    // Walk the entire structure looking for marketPrice / lowestListing keys.
    let market: number | null = null;
    let low: number | null = null;
    let high: number | null = null;

    function walk(node: unknown, depth: number): void {
      if (depth > 20 || typeof node !== "object" || node === null) return;
      const obj = node as Record<string, unknown>;

      for (const [key, val] of Object.entries(obj)) {
        if (key === "marketPrice" && market == null) market = toNum(val);
        if (key === "lowestListing" && low == null) low = toNum(val);
        if (key === "highestListing" && high == null) high = toNum(val);
        if (key === "lowPrice" && low == null) low = toNum(val);
        if (key === "highPrice" && high == null) high = toNum(val);
        if (typeof val === "object") walk(val, depth + 1);
      }
    }

    walk(root, 0);
    if (market != null || low != null || high != null) {
      return { market, low, high };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function scrapeTcgplayerSealedPrice(
  url: string,
): Promise<SealedPriceSnapshot> {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; InventoryDex/1.0; price-bot)",
        Accept: "text/html,application/xhtml+xml",
      },
      // 10 second timeout
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[scrape-sealed] HTTP ${res.status} for ${url}`);
      return NULL_RESULT;
    }
    html = await res.text();
  } catch (err) {
    console.warn(`[scrape-sealed] fetch failed for ${url}:`, err);
    return NULL_RESULT;
  }

  // Pass 1: JSON-LD
  const fromLd = fromJsonLd(html);
  if (fromLd && (fromLd.market != null || fromLd.low != null)) {
    return fromLd;
  }

  // Pass 2: __NEXT_DATA__
  const fromNext = fromNextData(html);
  if (fromNext) return fromNext;

  // Both passes failed — return null result (best-effort, don't throw).
  console.warn(`[scrape-sealed] no prices found at ${url}`);
  return NULL_RESULT;
}
