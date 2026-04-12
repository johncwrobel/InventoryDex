/**
 * Shared shapes for /api/cards/identify and the scan UI.
 *
 * Lives in lib/ (not in the route file) so client components can import
 * these without dragging server-only code (auth, prisma) into the client
 * bundle.
 */
import type { CardSearchResult } from "./card-search-types";

export interface ScanMatch {
  card: CardSearchResult;
  /** Best available TCGPlayer market price for this card, or null if unavailable. */
  marketPrice: number | null;
}
