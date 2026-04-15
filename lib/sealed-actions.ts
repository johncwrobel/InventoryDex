"use server";

/**
 * Server actions for sealed product inventory.
 *
 * Sealed products (booster boxes, ETBs, packs, etc.) have a two-layer model:
 *  - SealedProduct: shared catalog entry (one per distinct product)
 *  - SealedInventoryItem: per-user lot linked to a SealedProduct
 *
 * Pattern matches lib/actions.ts: session check → Zod validate → scoped DB
 * query → revalidate → return ActionResult.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/actions";
import { SEALED_PRODUCT_TYPES } from "@/lib/sealed-types";
import type { SealedProductResult } from "@/lib/sealed-types";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const addSealedSchema = z.object({
  sealedProductId: z.string().min(1, "Product selection required."),
  quantity: z.coerce
    .number({ error: "Quantity must be a number." })
    .int()
    .positive("Quantity must be at least 1.")
    .max(9999),
  isSealed: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((v) => v === "on"),
  purchasePrice: z.coerce
    .number({ error: "Purchase price must be a number." })
    .nonnegative("Purchase price cannot be negative.")
    .max(9_999_999),
  listPrice: z
    .union([z.literal(""), z.coerce.number().nonnegative().max(9_999_999)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  purchasedAt: z
    .union([z.literal(""), z.string()])
    .optional()
    .transform((v) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }),
  notes: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v?.trim() || null)),
});

// Update schema — only inventory lot fields (product FK is immutable after creation).
const updateSealedSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce
    .number({ error: "Quantity must be a number." })
    .int()
    .positive("Quantity must be at least 1.")
    .max(9999),
  isSealed: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((v) => v === "on"),
  purchasePrice: z.coerce
    .number({ error: "Purchase price must be a number." })
    .nonnegative("Purchase price cannot be negative.")
    .max(9_999_999),
  listPrice: z
    .union([z.literal(""), z.coerce.number().nonnegative().max(9_999_999)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  purchasedAt: z
    .union([z.literal(""), z.string()])
    .optional()
    .transform((v) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }),
  notes: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v?.trim() || null)),
});

const listPriceSchema = z.object({
  itemId: z.string().min(1),
  listPrice: z
    .union([z.literal(""), z.coerce.number().nonnegative().max(9_999_999)])
    .transform((v) => (v === "" ? null : v)),
});

const deleteSchema = z.object({
  itemId: z.string().min(1),
});

const createProductSchema = z.object({
  productType: z.enum(SEALED_PRODUCT_TYPES as [string, ...string[]]),
  name: z.string().min(1, "Name is required.").max(200),
  setId: z
    .string()
    .max(50)
    .optional()
    .transform((v) => (v?.trim() || null)),
  setName: z
    .string()
    .max(100)
    .optional()
    .transform((v) => (v?.trim() || null)),
  tcgplayerUrl: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v?.trim() || null)),
  imageUrl: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v?.trim() || null)),
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function addSealedItem(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not authenticated." };

  const parsed = addSealedSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const d = parsed.data;

  // Verify the product exists.
  const product = await prisma.sealedProduct.findUnique({
    where: { id: d.sealedProductId },
  });
  if (!product) return { ok: false, error: "Product not found in catalog." };

  await prisma.sealedInventoryItem.create({
    data: {
      userId,
      sealedProductId: d.sealedProductId,
      quantity: d.quantity,
      isSealed: d.isSealed,
      purchasePrice: new Prisma.Decimal(d.purchasePrice),
      listPrice: d.listPrice != null ? new Prisma.Decimal(d.listPrice) : null,
      purchasedAt: d.purchasedAt,
      notes: d.notes,
    },
  });

  revalidatePath("/inventory");
  return { ok: true };
}

export async function updateSealedItem(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not authenticated." };

  const parsed = updateSealedSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const { itemId, ...d } = parsed.data;
  const result = await prisma.sealedInventoryItem.updateMany({
    where: { id: itemId, userId },
    data: {
      quantity: d.quantity,
      isSealed: d.isSealed,
      purchasePrice: new Prisma.Decimal(d.purchasePrice),
      listPrice: d.listPrice != null ? new Prisma.Decimal(d.listPrice) : null,
      purchasedAt: d.purchasedAt,
      notes: d.notes,
    },
  });

  if (result.count === 0) return { ok: false, error: "Item not found." };

  revalidatePath("/inventory");
  revalidatePath(`/inventory/sealed/${itemId}`);
  return { ok: true };
}

export async function deleteSealedItem(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not authenticated." };

  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };

  const result = await prisma.sealedInventoryItem.deleteMany({
    where: { id: parsed.data.itemId, userId },
  });

  if (result.count === 0) return { ok: false, error: "Item not found." };

  revalidatePath("/inventory");
  return { ok: true };
}

export async function updateSealedListPrice(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not authenticated." };

  const parsed = listPriceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };

  const result = await prisma.sealedInventoryItem.updateMany({
    where: { id: parsed.data.itemId, userId },
    data: {
      listPrice:
        parsed.data.listPrice != null
          ? new Prisma.Decimal(parsed.data.listPrice)
          : null,
    },
  });

  if (result.count === 0) return { ok: false, error: "Item not found." };

  revalidatePath("/inventory");
  return { ok: true };
}

/**
 * Create a new SealedProduct catalog entry.
 * Returns { ok: true, id } on success (including when a matching product already exists).
 */
export async function createSealedProduct(
  formData: FormData,
): Promise<
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated." };

  const parsed = createProductSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString();
      if (key) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const d = parsed.data;

  // Return existing product if name + type + setId matches.
  const existing = await prisma.sealedProduct.findFirst({
    where: {
      productType: d.productType as never,
      name: { equals: d.name, mode: "insensitive" },
      setId: d.setId ?? null,
    },
  });
  if (existing) return { ok: true, id: existing.id };

  const product = await prisma.sealedProduct.create({
    data: {
      productType: d.productType as never,
      name: d.name,
      setId: d.setId,
      setName: d.setName,
      tcgplayerUrl: d.tcgplayerUrl,
      imageUrl: d.imageUrl,
    },
  });

  return { ok: true, id: product.id };
}

/**
 * Search the shared SealedProduct catalog. Returns up to 20 matches.
 * Not a mutation — safe to call from client components via server action import.
 */
export async function searchSealedProducts(
  formData: FormData,
): Promise<SealedProductResult[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const q = ((formData.get("q") as string | null) ?? "").trim();
  const productType = (formData.get("productType") as string | null) ?? "";

  const results = await prisma.sealedProduct.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(productType && SEALED_PRODUCT_TYPES.includes(productType)
        ? { productType: productType as never }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 20,
  });

  return results.map((p) => ({
    id: p.id,
    setId: p.setId,
    setName: p.setName,
    productType: p.productType,
    name: p.name,
    tcgplayerUrl: p.tcgplayerUrl,
    imageUrl: p.imageUrl,
  }));
}
