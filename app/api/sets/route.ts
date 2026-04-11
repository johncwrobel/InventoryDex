/**
 * GET /api/sets
 *
 * Authenticated proxy that returns every Pokémon TCG set, newest first,
 * in a compact shape suitable for the add-card set-filter dropdown.
 *
 * Upstream fetch is cached for ~1 day (see `getSets` in lib/pokemontcg.ts).
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { CardSetSummary } from "@/lib/card-search-types";
import { getSets } from "@/lib/pokemontcg";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sets = await getSets();
    const summary: CardSetSummary[] = sets.map((s) => ({
      id: s.id,
      name: s.name,
      series: s.series,
      releaseDate: s.releaseDate,
    }));
    return NextResponse.json({ sets: summary });
  } catch (err) {
    console.error("[api/sets] upstream error", err);
    return NextResponse.json(
      { error: "Failed to load sets." },
      { status: 502 },
    );
  }
}
