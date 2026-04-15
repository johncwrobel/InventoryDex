"use server";

/**
 * Server actions for sealed product inventory.
 *
 * Sealed products (booster boxes, ETBs, packs, etc.) are tracked separately
 * from individual cards: no cardId, no condition/finish/grading, no upstream
 * price feed. All data is entered manually by the user.
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

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const addSealedSchema = z.object({
  productType: z.enum(SEALED_PRODUCT_TYPES as [string, ...string[]]),
  name: z.string().min(1, "Name is required.").max(200),
  setName: z
    .string()
    .max(100)
    .optional()
    .transform((v) => (v?.trim() || null)),
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
  imageUrl: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v?.trim() || null)),
});

const updateSealedSchema = addSealedSchema.extend({
  itemId: z.string().min(1),
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
  await prisma.sealedInventoryItem.create({
    data: {
      userId,
      productType: d.productType as never, // enum cast; Zod already validated
      name: d.name,
      setName: d.setName,
      quantity: d.quantity,
      isSealed: d.isSealed,
      purchasePrice: new Prisma.Decimal(d.purchasePrice),
      listPrice: d.listPrice != null ? new Prisma.Decimal(d.listPrice) : null,
      purchasedAt: d.purchasedAt,
      notes: d.notes,
      imageUrl: d.imageUrl,
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
      productType: d.productType as never,
      name: d.name,
      setName: d.setName,
      quantity: d.quantity,
      isSealed: d.isSealed,
      purchasePrice: new Prisma.Decimal(d.purchasePrice),
      listPrice: d.listPrice != null ? new Prisma.Decimal(d.listPrice) : null,
      purchasedAt: d.purchasedAt,
      notes: d.notes,
      imageUrl: d.imageUrl,
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

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
