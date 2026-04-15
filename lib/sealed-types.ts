/**
 * Shared types for sealed product inventory rows.
 * Kept in lib/ so server components and client components can import
 * the type without pulling in server-only imports (prisma, auth, etc.).
 */

export const SEALED_PRODUCT_TYPE_LABELS: Record<string, string> = {
  BOOSTER_PACK: "Booster Pack",
  BOOSTER_BUNDLE: "Booster Bundle",
  BOOSTER_BOX: "Booster Box",
  ELITE_TRAINER_BOX: "Elite Trainer Box",
  SUPER_PREMIUM_COLLECTION: "Super Premium Collection",
  SPECIAL_COLLECTION: "Special Collection",
  THEME_DECK: "Theme Deck",
  TIN: "Tin",
  OTHER: "Other",
};

export const SEALED_PRODUCT_TYPES = Object.keys(SEALED_PRODUCT_TYPE_LABELS);

/** A catalog entry returned by searchSealedProducts. */
export interface SealedProductResult {
  id: string;
  setId: string | null;
  setName: string | null;
  productType: string;
  name: string;
  tcgplayerUrl: string | null;
  imageUrl: string | null;
}

/** Read-only product catalog metadata shown on the detail page. */
export interface SealedProductInfo {
  id: string;
  name: string;
  productType: string;
  setName: string | null;
  imageUrl: string | null;
  tcgplayerUrl: string | null;
}

export interface SealedInventoryRowData {
  itemType: "sealed";
  id: string;
  createdAt: string; // ISO string, used for sort
  // Product catalog fields (denormalized from SealedProduct for display)
  sealedProductId: string;
  productType: string;
  name: string;
  setName: string | null;
  imageUrl: string | null;
  tcgplayerUrl: string | null;
  // Inventory lot fields
  quantity: number;
  isSealed: boolean;
  purchasePrice: string; // serialized Decimal
  listPrice: string | null; // serialized Decimal or null
  notes: string | null;
  // Price signals (computed server-side from SealedPricePoint history)
  marketPrice: string | null;
  priceChangePct: number | null;
  listFlag: "underpriced" | "overpriced" | null;
}

/** Inventory lot fields passed to the sealed detail page client component. */
export interface EditableSealedItem {
  id: string;
  sealedProductId: string;
  quantity: number;
  isSealed: boolean;
  purchasePrice: string;
  purchasedAt: string | null;
  listPrice: string | null;
  notes: string | null;
}
