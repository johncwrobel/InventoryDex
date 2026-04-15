import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SealedItemDetails } from "./sealed-item-details";
import { SealedDeleteButton } from "./delete-button";
import {
  SEALED_PRODUCT_TYPE_LABELS,
  type EditableSealedItem,
} from "@/lib/sealed-types";

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function SealedDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user!.id;

  const item = await prisma.sealedInventoryItem.findFirst({
    where: { id, userId },
  });

  if (!item) notFound();

  const typeLabel =
    SEALED_PRODUCT_TYPE_LABELS[item.productType] ?? item.productType;

  // Serialise Decimal fields before passing to client.
  const editableItem: EditableSealedItem = {
    id: item.id,
    productType: item.productType,
    name: item.name,
    setName: item.setName,
    quantity: item.quantity,
    isSealed: item.isSealed,
    purchasePrice: item.purchasePrice.toString(),
    purchasedAt: item.purchasedAt?.toISOString() ?? null,
    listPrice: item.listPrice?.toString() ?? null,
    notes: item.notes,
    imageUrl: item.imageUrl,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/inventory"
          className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          ← Back to inventory
        </Link>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Product image */}
        <div className="md:w-64 md:shrink-0">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full max-w-xs rounded-xl border border-black/10 shadow-sm dark:border-white/10"
            />
          ) : (
            <div className="flex aspect-square w-full max-w-xs items-center justify-center rounded-xl border border-dashed border-black/15 text-6xl dark:border-white/15">
              📦
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* Identity */}
          <div>
            <div className="mb-1">
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                {typeLabel}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {item.name}
            </h1>
            {item.setName && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {item.setName}
              </p>
            )}
          </div>

          {/* Editable details */}
          <SealedItemDetails item={editableItem} />

          {/* Record metadata — server-only */}
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Record
            </h2>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
                <span className="text-neutral-500">Added</span>
                <span className="tabular-nums">{formatDate(item.createdAt)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
                <span className="text-neutral-500">Last updated</span>
                <span className="tabular-nums">{formatDate(item.updatedAt)}</span>
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <SealedDeleteButton itemId={item.id} itemName={item.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
