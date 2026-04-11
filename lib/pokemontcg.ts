/**
 * Thin wrapper around the pokemontcg.io REST API.
 *
 * Docs: https://docs.pokemontcg.io/
 *
 * We only use the bits we need for InventoryDex:
 *   - searchCards(query) — name-based search for the add-card flow
 *   - getCard(id)        — refetch a single card (used by the price cron later)
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

interface SearchResponse {
  data: PokemonTcgCard[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
}

interface SingleResponse {
  data: PokemonTcgCard;
}

// ---------- Public API ----------

/**
 * Search cards by name. Returns up to `pageSize` matches. The pokemontcg.io
 * query language supports Lucene-ish syntax; we quote user input and match
 * as a name prefix ("charizard*") so the add-card search behaves intuitively.
 */
export async function searchCards(
  query: string,
  pageSize = 20,
): Promise<PokemonTcgCard[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Escape characters that have meaning in the pokemontcg.io query DSL.
  const escaped = trimmed.replace(/["\\]/g, "\\$&");
  const params = new URLSearchParams({
    q: `name:"${escaped}*"`,
    pageSize: String(pageSize),
    orderBy: "-set.releaseDate,number",
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

/**
 * Pick the first available TCGPlayer price block for a given finish on a
 * card. Returns `null` if pokemontcg.io has no pricing for that variant.
 */
export function pricesForFinish(
  card: PokemonTcgCard,
  finish: Finish,
): TcgPlayerPriceBlock | null {
  const blocks = card.tcgplayer?.prices;
  if (!blocks) return null;
  for (const key of finishPriceKeys(finish)) {
    const block = blocks[key];
    if (block) return block;
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
