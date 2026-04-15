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

export interface SealedInventoryRowData {
  itemType: "sealed";
  id: string;
  createdAt: string; // ISO string, used for sort
  productType: string;
  name: string;
  setName: string | null;
  quantity: number;
  isSealed: boolean;
  purchasePrice: string; // serialized Decimal
  listPrice: string | null; // serialized Decimal or null
  notes: string | null;
  imageUrl: string | null;
}

/** Shape passed to the sealed detail page's client component. */
export interface EditableSealedItem {
  id: string;
  productType: string;
  name: string;
  setName: string | null;
  quantity: number;
  isSealed: boolean;
  purchasePrice: string;
  purchasedAt: string | null;
  listPrice: string | null;
  notes: string | null;
  imageUrl: string | null;
}
