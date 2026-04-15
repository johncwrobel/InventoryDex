import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SealedItemDetails } from "./sealed-item-details";
import { SealedDeleteButton } from "./delete-button";
import { PriceChart, type PriceChartPoint } from "@/app/(app)/inventory/[id]/price-chart";
import {
  SEALED_PRODUCT_TYPE_LABELS,
  type EditableSealedItem,
  type SealedProductInfo,
} from "@/lib/sealed-types";

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMoney(value: string | null | undefined): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `$${n.toFixed(2)}`;
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
    include: {
      product: {
        include: {
          prices: { orderBy: { capturedAt: "desc" }, take: 90 },
        },
      },
    },
  });

  if (!item || !item.product) notFound();

  const product = item.product;
  const typeLabel = SEALED_PRODUCT_TYPE_LABELS[product.productType] ?? product.productType;

  // Price chart — reverse to chronological order.
  const priceHistory = [...product.prices].reverse();
  const latestPrice = product.prices[0];

  const chartData: PriceChartPoint[] = priceHistory.map((p) => ({
    date: p.capturedAt.toISOString(),
    market: p.market != null ? Number(p.market) : null,
  }));

  // Serialise inventory lot fields for the client component.
  const editableItem: EditableSealedItem = {
    id: item.id,
    sealedProductId: product.id,
    quantity: item.quantity,
    isSealed: item.isSealed,
    purchasePrice: item.purchasePrice.toString(),
    purchasedAt: item.purchasedAt?.toISOString() ?? null,
    listPrice: item.listPrice?.toString() ?? null,
    notes: item.notes,
  };

  // Product catalog info (read-only in the UI).
  const productInfo: SealedProductInfo = {
    id: product.id,
    name: product.name,
    productType: product.productType,
    setName: product.setName,
    imageUrl: product.imageUrl,
    tcgplayerUrl: product.tcgplayerUrl,
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

      {/* Price history chart */}
      {chartData.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Market price history
          </h2>
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <PriceChart data={chartData} />
          </div>
        </section>
      )}

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Product image */}
        <div className="md:w-64 md:shrink-0">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
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
              {product.name}
            </h1>
            {product.setName && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {product.setName}
              </p>
            )}
          </div>

          {/* Editable inventory lot fields */}
          <SealedItemDetails item={editableItem} product={productInfo} />

          {/* Market data — server-only */}
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Market data
            </h2>
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
                <span className="text-neutral-500">Latest market</span>
                <span className="tabular-nums">
                  {formatMoney(latestPrice?.market?.toString() ?? null)}
                </span>
              </div>
              {latestPrice && (
                <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
                  <span className="text-neutral-500">Captured</span>
                  <span className="tabular-nums">
                    {formatDate(latestPrice.capturedAt)}
                  </span>
                </div>
              )}
              {!latestPrice && (
                <p className="py-1 text-sm text-neutral-500">
                  No market data yet. Prices are fetched automatically when a
                  TCGPlayer URL is set on the product.
                </p>
              )}
            </div>
          </section>

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
            {product.tcgplayerUrl && (
              <a
                href={product.tcgplayerUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                View on TCGPlayer →
              </a>
            )}
            <SealedDeleteButton itemId={item.id} itemName={product.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
