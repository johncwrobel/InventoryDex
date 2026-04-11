/**
 * Shared shape for /api/cards/search results.
 *
 * Lives in lib/ (not in the route file) so the add-card client component
 * can import it without dragging server-only code (auth, prisma) into the
 * client bundle.
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
