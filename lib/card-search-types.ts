/**
 * Shared shapes for /api/cards/search and /api/sets.
 *
 * Lives in lib/ (not in the route files) so client components can import
 * these without dragging server-only code (auth, prisma) into the client
 * bundle.
 */
export interface CardSearchResult {
  id: string;
  name: string;
  setId: string;
  setName: string;
  number: string;
  rarity: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  tcgplayerUrl: string | null;
}

export interface CardSetSummary {
  id: string;
  name: string;
  series: string;
  releaseDate: string; // "YYYY/MM/DD"
}
