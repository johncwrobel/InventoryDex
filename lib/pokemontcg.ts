/**
 * Thin wrapper around the pokemontcg.io REST API.
 *
 * Docs: https://docs.pokemontcg.io/
 *
 * We only use the bits we need for InventoryDex:
 *   - searchCards(opts)  — filtered card search for the add-card flow
 *   - getCard(id)        — refetch a single card (used by the price cron later)
 *   - getSets()          — list all sets (used by the set filter dropdown)
 *
 * The API works without an API key at a lower rate limit; if
 * POKEMONTCG_API_KEY is set we send it as the `X-Api-Key` header.
 */
import { env } from "./env";

const BASE_URL = "https://api.pokemontcg.io/v2";

// ---------- Upstream response shapes (subset) ----------
// We intentionally only model the fields we actually read. The API
// returns a much richer document; extra fields are tolerated.

export interface PokemonTcgCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  set: {
    id: string;
    name: string;
  };
  images?: {
    small?: string;
    large?: string;
  };
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Partial<Record<TcgPlayerFinishKey, TcgPlayerPriceBlock>>;
  };
}

// pokemontcg.io exposes TCGPlayer prices keyed by finish variant. Different
// cards expose different subsets — Base Set Charizard has "1stEditionHolofoil",
// modern holos have "holofoil", commons have "normal", etc.
export type TcgPlayerFinishKey =
  | "normal"
  | "holofoil"
  | "reverseHolofoil"
  | "1stEditionHolofoil"
  | "1stEditionNormal"
  | "unlimitedHolofoil";

export interface TcgPlayerPriceBlock {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
  directLow?: number | null;
}

export interface PokemonTcgSet {
  id: string;
  name: string;
  series: string;
  releaseDate: string; // "YYYY/MM/DD"
  total: number;
}

interface SearchResponse {
  data: PokemonTcgCard[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
}

interface SetsResponse {
  data: PokemonTcgSet[];
}

interface SingleResponse {
  data: PokemonTcgCard;
}

/**
 * Sort keys supported by the add-card UI. Mapped to pokemontcg.io's
 * `orderBy` string by `sortToOrderBy` below.
 */
export type CardSearchSort =
  | "releaseDate:desc"
  | "releaseDate:asc"
  | "name:asc";

export const CARD_SEARCH_SORTS: readonly CardSearchSort[] = [
  "releaseDate:desc",
  "releaseDate:asc",
  "name:asc",
] as const;

export interface SearchCardsOptions {
  query?: string;
  setId?: string;
  /** Collector number (e.g. "025"). Translates to `number:<n>` in the query. */
  cardNumber?: string;
  sort?: CardSearchSort;
  pageSize?: number;
}

// ---------- Public API ----------

/**
 * Search cards with optional name, set, and sort filters. Returns up to
 * `pageSize` matches. At least one of `query` (2+ chars) or `setId` must
 * be provided; otherwise returns an empty array.
 *
 * The pokemontcg.io query language is Lucene-ish. Clauses are
 * space-separated and AND'd together:
 *   name:"charizard*" set.id:sv1
 */
export async function searchCards(
  options: SearchCardsOptions,
): Promise<PokemonTcgCard[]> {
  const { query, setId, cardNumber, sort = "releaseDate:desc", pageSize = 24 } = options;
  const trimmed = query?.trim() ?? "";
  // Require at least one of: name query, set id, or card number.
  if (!trimmed && !setId && !cardNumber) return [];

  const clauses: string[] = [];
  if (trimmed) {
    // Escape characters that have meaning in the pokemontcg.io query DSL.
    const escaped = trimmed.replace(/["\\]/g, "\\$&");
    clauses.push(`name:"${escaped}*"`);
  }
  if (setId) {
    // pokemontcg.io set ids are alphanumerics + hyphens, safe to inline.
    clauses.push(`set.id:${setId}`);
  }
  if (cardNumber) {
    // Strip anything that isn't alphanumeric to prevent query injection.
    const safeNumber = cardNumber.replace(/[^a-zA-Z0-9]/g, "");
    if (safeNumber) clauses.push(`number:${safeNumber}`);
  }

  const params = new URLSearchParams({
    q: clauses.join(" "),
    pageSize: String(pageSize),
    orderBy: sortToOrderBy(sort),
  });

  const res = await fetch(`${BASE_URL}/cards?${params.toString()}`, {
    headers: apiHeaders(),
    // Search results are fine to cache briefly at the edge, but for now we
    // go uncached so users always see fresh pricing during the add flow.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `pokemontcg.io search failed: ${res.status} ${res.statusText}`,
    );
  }

  const payload = (await res.json()) as SearchResponse;
  return payload.data;
}

function sortToOrderBy(sort: CardSearchSort): string {
  switch (sort) {
    case "releaseDate:desc":
      return "-set.releaseDate,number";
    case "releaseDate:asc":
      return "set.releaseDate,number";
    case "name:asc":
      return "name,number";
  }
}

/**
 * Fetch every Pokémon TCG set, newest first. The result is cached for a
 * day at the Next.js fetch layer — sets change rarely (roughly once a
 * quarter) so refetching per request is wasteful.
 */
export async function getSets(): Promise<PokemonTcgSet[]> {
  const params = new URLSearchParams({
    pageSize: "500", // comfortably above the current set count
    orderBy: "-releaseDate",
  });
  const res = await fetch(`${BASE_URL}/sets?${params.toString()}`, {
    headers: apiHeaders(),
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(
      `pokemontcg.io getSets failed: ${res.status} ${res.statusText}`,
    );
  }
  const payload = (await res.json()) as SetsResponse;
  return payload.data;
}

/**
 * Fetch a single card by its pokemontcg.io id. Used by the price refresh cron.
 */
export async function getCard(id: string): Promise<PokemonTcgCard> {
  const res = await fetch(
    `${BASE_URL}/cards/${encodeURIComponent(id)}`,
    { headers: apiHeaders(), cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(
      `pokemontcg.io getCard(${id}) failed: ${res.status} ${res.statusText}`,
    );
  }
  const payload = (await res.json()) as SingleResponse;
  return payload.data;
}

// ---------- Mapping helpers ----------

import type { Finish } from "@prisma/client";

/**
 * Map our internal Finish enum to the pokemontcg.io price-block key.
 * Returns the best-effort primary key plus fallbacks so callers can pick
 * the first block that actually exists on a given card.
 */
export function finishPriceKeys(finish: Finish): TcgPlayerFinishKey[] {
  switch (finish) {
    case "NORMAL":
      return ["normal", "1stEditionNormal"];
    case "HOLO":
      return ["holofoil", "unlimitedHolofoil"];
    case "REVERSE_HOLO":
      return ["reverseHolofoil"];
    case "FIRST_ED_HOLO":
      return ["1stEditionHolofoil"];
  }
}

/** All known TCGPlayer finish keys, used for the fallback scan. */
const ALL_FINISH_KEYS: TcgPlayerFinishKey[] = [
  "holofoil",
  "normal",
  "reverseHolofoil",
  "1stEditionHolofoil",
  "1stEditionNormal",
  "unlimitedHolofoil",
];

/**
 * Pick the first available TCGPlayer price block for a given finish on a
 * card.
 *
 * When `allowFallback` is true (used by the price-refresh cron and the
 * add-card action), if the finish-specific keys return nothing we scan all
 * known keys and return the first block that has at least one non-null price
 * value. This handles cards where TCGPlayer uses a different finish label than
 * the one we stored (e.g. a card added as NORMAL that pokemontcg.io only
 * prices under "holofoil").
 *
 * Returns `null` if pokemontcg.io has no pricing for this card at all.
 */
export function pricesForFinish(
  card: PokemonTcgCard,
  finish: Finish,
  { allowFallback = false }: { allowFallback?: boolean } = {},
): TcgPlayerPriceBlock | null {
  const blocks = card.tcgplayer?.prices;
  if (!blocks) return null;

  // Primary: try the finish-specific keys first.
  for (const key of finishPriceKeys(finish)) {
    const block = blocks[key];
    if (block) return block;
  }

  // Fallback: return the first block that has at least one real price value.
  if (allowFallback) {
    for (const key of ALL_FINISH_KEYS) {
      const block = blocks[key];
      if (
        block &&
        (block.market != null || block.mid != null || block.low != null)
      ) {
        return block;
      }
    }
  }

  return null;
}

function apiHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.POKEMONTCG_API_KEY) {
    headers["X-Api-Key"] = env.POKEMONTCG_API_KEY;
  }
  return headers;
}
