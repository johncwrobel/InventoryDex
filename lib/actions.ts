"use server";

/**
 * Server actions for InventoryDex inventory CRUD.
 *
 * Every action verifies the session and — for mutations on existing rows —
 * verifies ownership before touching the database. Input is validated with
 * zod so invalid requests fail before any DB call.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCard, pricesForFinish } from "@/lib/pokemontcg";
import { Condition, Finish, Prisma } from "@prisma/client";

// ---------- Schemas ----------

const conditionEnum = z.enum(
  Object.values(Condition) as [Condition, ...Condition[]],
);
const finishEnum = z.enum(Object.values(Finish) as [Finish, ...Finish[]]);

// Forms submit strings; coerce + validate here so the action is easy to
// call from a plain <form action={...}>.
const addInventorySchema = z
  .object({
    cardId: z.string().min(1, { error: "Pick a card" }),
    quantity: z.coerce.number().int().positive().max(9999),
    condition: conditionEnum,
    finish: finishEnum,
    purchasePrice: z.coerce.number().nonnegative().max(9_999_999),
    listPrice: z
      .union([z.literal(""), z.coerce.number().nonnegative().max(9_999_999)])
      .transform((v) => (v === "" ? null : v)),
    notes: z
      .string()
      .max(500)
      .transform((v) => v.trim() || null)
      .nullable()
      .optional(),
    // Graded card fields. isGraded comes from a checkbox ("on" when checked).
    isGraded: z
      .union([z.literal("on"), z.literal("")])
      .optional()
      .transform((v) => v === "on"),
    gradingCompany: z
      .string()
      .max(50)
      .optional()
      .transform((v) => v?.trim() || null),
    grade: z
      .string()
      .max(20)
      .optional()
      .transform((v) => v?.trim() || null),
  })
  .refine(
    (data) => !data.isGraded || (!!data.gradingCompany && !!data.grade),
    {
      message: "Grading company and grade are required for graded cards.",
      path: ["gradingCompany"],
    },
  );

const updateListPriceSchema = z.object({
  itemId: z.string().min(1),
  listPrice: z
    .union([z.literal(""), z.coerce.number().nonnegative().max(9_999_999)])
    .transform((v) => (v === "" ? null : v)),
});

const deleteItemSchema = z.object({
  itemId: z.string().min(1),
});

const updateInventorySchema = z
  .object({
    itemId: z.string().min(1),
    quantity: z.coerce.number().int().positive().max(9999),
    condition: conditionEnum,
    finish: finishEnum,
    language: z.string().max(10).default("EN"),
    purchasePrice: z.coerce.number().nonnegative().max(9_999_999),
    purchasedAt: z
      .union([z.literal(""), z.string()])
      .optional()
      .transform((v) => (v ? new Date(v) : null)),
    listPrice: z
      .union([z.literal(""), z.coerce.number().nonnegative().max(9_999_999)])
      .transform((v) => (v === "" ? null : v)),
    notes: z
      .string()
      .max(500)
      .transform((v) => v.trim() || null)
      .nullable()
      .optional(),
    isGraded: z
      .union([z.literal("on"), z.literal("")])
      .optional()
      .transform((v) => v === "on"),
    gradingCompany: z
      .string()
      .max(50)
      .optional()
      .transform((v) => v?.trim() || null),
    grade: z
      .string()
      .max(20)
      .optional()
      .transform((v) => v?.trim() || null),
  })
  .refine(
    (data) => !data.isGraded || (!!data.gradingCompany && !!data.grade),
    {
      message: "Grading company and grade are required for graded cards.",
      path: ["gradingCompany"],
    },
  );

// ---------- Action result helpers ----------

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function formatZodError(err: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
}

// ---------- Actions ----------

/**
 * Add a card to the current user's inventory.
 *
 * Flow:
 *  1. Parse + validate form input.
 *  2. Confirm the Card row exists locally (the search route should have
 *     cached it, but we re-fetch from pokemontcg.io as a safety net).
 *  3. Seed an initial PricePoint from upstream pricing if we don't already
 *     have one for this (card, finish).
 *  4. Insert the InventoryItem.
 *  5. Revalidate /inventory.
 */
export async function addInventoryItem(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }
  const userId = session.user.id;

  const parsed = addInventorySchema.safeParse({
    cardId: formData.get("cardId"),
    quantity: formData.get("quantity"),
    condition: formData.get("condition"),
    finish: formData.get("finish"),
    purchasePrice: formData.get("purchasePrice"),
    listPrice: formData.get("listPrice"),
    notes: formData.get("notes"),
    isGraded: formData.get("isGraded") ?? "",
    gradingCompany: formData.get("gradingCompany") ?? "",
    grade: formData.get("grade") ?? "",
  });
  if (!parsed.success) return formatZodError(parsed.error);
  const input = parsed.data;

  // Ensure the canonical Card row exists. If not in cache, fetch it fresh.
  let card = await prisma.card.findUnique({ where: { id: input.cardId } });
  let upstream: Awaited<ReturnType<typeof getCard>> | null = null;
  if (!card) {
    try {
      upstream = await getCard(input.cardId);
    } catch (err) {
      console.error("[addInventoryItem] getCard failed", err);
      return { ok: false, error: "Couldn't load that card. Try again." };
    }
    card = await prisma.card.upsert({
      where: { id: upstream.id },
      create: {
        id: upstream.id,
        name: upstream.name,
        setId: upstream.set.id,
        setName: upstream.set.name,
        number: upstream.number,
        rarity: upstream.rarity ?? null,
        imageSmall: upstream.images?.small ?? null,
        imageLarge: upstream.images?.large ?? null,
        tcgplayerUrl: upstream.tcgplayer?.url || null,
      },
      update: {},
    });
  }

  // Seed an initial PricePoint if we don't have one for this (card, finish).
  const existingPoint = await prisma.pricePoint.findFirst({
    where: { cardId: card.id, finish: input.finish },
    orderBy: { capturedAt: "desc" },
  });
  if (!existingPoint) {
    if (!upstream) {
      try {
        upstream = await getCard(card.id);
      } catch (err) {
        // Non-fatal — we can still add the item without initial pricing.
        console.warn("[addInventoryItem] upstream fetch for price seed failed", err);
      }
    }
    if (upstream) {
      const block = pricesForFinish(upstream, input.finish, { allowFallback: true });
      if (block) {
        await prisma.pricePoint.create({
          data: {
            cardId: card.id,
            finish: input.finish,
            market: block.market != null ? new Prisma.Decimal(block.market) : null,
            low: block.low != null ? new Prisma.Decimal(block.low) : null,
            mid: block.mid != null ? new Prisma.Decimal(block.mid) : null,
            high: block.high != null ? new Prisma.Decimal(block.high) : null,
          },
        });
      }
    }
  }

  await prisma.inventoryItem.create({
    data: {
      userId,
      cardId: card.id,
      quantity: input.quantity,
      condition: input.condition,
      finish: input.finish,
      purchasePrice: new Prisma.Decimal(input.purchasePrice),
      listPrice:
        input.listPrice != null ? new Prisma.Decimal(input.listPrice) : null,
      notes: input.notes ?? null,
      isGraded: input.isGraded,
      gradingCompany: input.gradingCompany ?? null,
      grade: input.grade ?? null,
    },
  });

  revalidatePath("/inventory");
  return { ok: true };
}

/**
 * Update the list price on an inventory row the current user owns.
 */
export async function updateListPrice(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = updateListPriceSchema.safeParse({
    itemId: formData.get("itemId"),
    listPrice: formData.get("listPrice"),
  });
  if (!parsed.success) return formatZodError(parsed.error);

  // Scope the update to (itemId, userId) so users can only touch their own rows.
  const result = await prisma.inventoryItem.updateMany({
    where: { id: parsed.data.itemId, userId: session.user.id },
    data: {
      listPrice:
        parsed.data.listPrice != null
          ? new Prisma.Decimal(parsed.data.listPrice)
          : null,
    },
  });
  if (result.count === 0) {
    return { ok: false, error: "Item not found." };
  }

  revalidatePath("/inventory");
  return { ok: true };
}

/**
 * Delete an inventory row the current user owns.
 */
export async function deleteInventoryItem(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = deleteItemSchema.safeParse({ itemId: formData.get("itemId") });
  if (!parsed.success) return formatZodError(parsed.error);

  const result = await prisma.inventoryItem.deleteMany({
    where: { id: parsed.data.itemId, userId: session.user.id },
  });
  if (result.count === 0) {
    return { ok: false, error: "Item not found." };
  }

  revalidatePath("/inventory");
  return { ok: true };
}

/**
 * Update all editable fields on an inventory item the current user owns.
 */
export async function updateInventoryItem(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = updateInventorySchema.safeParse({
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity"),
    condition: formData.get("condition"),
    finish: formData.get("finish"),
    language: formData.get("language") || "EN",
    purchasePrice: formData.get("purchasePrice"),
    purchasedAt: formData.get("purchasedAt") ?? "",
    listPrice: formData.get("listPrice"),
    notes: formData.get("notes"),
    isGraded: formData.get("isGraded") ?? "",
    gradingCompany: formData.get("gradingCompany") ?? "",
    grade: formData.get("grade") ?? "",
  });
  if (!parsed.success) return formatZodError(parsed.error);
  const { itemId, ...fields } = parsed.data;

  const result = await prisma.inventoryItem.updateMany({
    where: { id: itemId, userId: session.user.id },
    data: {
      quantity: fields.quantity,
      condition: fields.condition,
      finish: fields.finish,
      language: fields.language,
      purchasePrice: new Prisma.Decimal(fields.purchasePrice),
      purchasedAt: fields.purchasedAt ?? null,
      listPrice: fields.listPrice != null ? new Prisma.Decimal(fields.listPrice) : null,
      notes: fields.notes ?? null,
      isGraded: fields.isGraded,
      gradingCompany: fields.gradingCompany ?? null,
      grade: fields.grade ?? null,
    },
  });

  if (result.count === 0) {
    return { ok: false, error: "Item not found." };
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${itemId}`);
  return { ok: true };
}
