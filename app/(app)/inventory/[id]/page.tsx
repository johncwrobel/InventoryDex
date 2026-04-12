import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DetailDeleteButton } from "./delete-button";
import { PriceChart, type PriceChartPoint } from "./price-chart";

const CONDITION_LABELS: Record<string, string> = {
  MINT: "Mint",
  NEAR_MINT: "Near Mint",
  LIGHTLY_PLAYED: "Lightly Played",
  MODERATELY_PLAYED: "Moderately Played",
  HEAVILY_PLAYED: "Heavily Played",
  DAMAGED: "Damaged",
};

const FINISH_LABELS: Record<string, string> = {
  NORMAL: "Normal",
  HOLO: "Holo",
  REVERSE_HOLO: "Reverse Holo",
  FIRST_ED_HOLO: "1st Edition Holo",
};

function formatMoney(value: string | null | undefined): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `$${n.toFixed(2)}`;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user!.id; // guaranteed by the (app) layout

  const item = await prisma.inventoryItem.findFirst({
    where: { id, userId },
    include: {
      card: {
        include: {
          prices: {
            orderBy: { capturedAt: "desc" },
            take: 90,
          },
        },
      },
    },
  });

  if (!item) notFound();

  // Filter price history to this item's finish, reverse to chronological order.
  const finishPrices = item.card.prices
    .filter((p) => p.finish === item.finish)
    .slice()
    .reverse();

  const latestPrice = finishPrices.length > 0 ? finishPrices[finishPrices.length - 1] : undefined;

  const chartData: PriceChartPoint[] = finishPrices.map((p) => ({
    date: p.capturedAt.toISOString(),
    market: p.market != null ? Number(p.market) : null,
  }));

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
        {/* Card image */}
        <div className="md:w-64 md:shrink-0">
          {item.card.imageLarge || item.card.imageSmall ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.card.imageLarge ?? item.card.imageSmall ?? ""}
              alt={item.card.name}
              className="w-full max-w-xs rounded-xl border border-black/10 shadow-sm dark:border-white/10"
            />
          ) : (
            <div className="aspect-[5/7] w-full max-w-xs rounded-xl border border-dashed border-black/15 dark:border-white/15" />
          )}
        </div>

        {/* Metadata */}
        <div className="min-w-0 flex-1 space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {item.card.name}
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {item.card.setName} · #{item.card.number}
              {item.card.rarity ? ` · ${item.card.rarity}` : ""}
            </p>
          </div>

          {/* Copy details */}
          <DetailSection title="This copy">
            {item.isGraded ? (
              <DetailRow label="Condition" value="Graded" />
            ) : (
              <DetailRow label="Condition" value={CONDITION_LABELS[item.condition] ?? item.condition} />
            )}
            <DetailRow label="Finish" value={FINISH_LABELS[item.finish] ?? item.finish} />
            <DetailRow label="Language" value={item.language} />
            <DetailRow label="Quantity" value={String(item.quantity)} />
          </DetailSection>

          {/* Grading details (graded cards only) */}
          {item.isGraded && (
            <DetailSection title="Grading">
              <DetailRow label="Company" value={item.gradingCompany ?? "—"} />
              <DetailRow label="Grade" value={item.grade ?? "—"} />
            </DetailSection>
          )}

          {/* Pricing */}
          <DetailSection title="Pricing">
            <DetailRow
              label="Purchase price"
              value={formatMoney(item.purchasePrice.toString())}
            />
            <DetailRow label="Purchased" value={formatDate(item.purchasedAt)} />
            <DetailRow
              label="List price"
              value={formatMoney(item.listPrice?.toString() ?? null)}
            />
            <DetailRow
              label="Latest market"
              value={formatMoney(latestPrice?.market?.toString() ?? null)}
            />
            {latestPrice && (
              <DetailRow
                label="Market captured"
                value={formatDate(latestPrice.capturedAt)}
              />
            )}
          </DetailSection>

          {/* Notes */}
          <DetailSection title="Notes">
            {item.notes ? (
              <p className="whitespace-pre-wrap text-sm">{item.notes}</p>
            ) : (
              <p className="text-sm text-neutral-500">No notes for this copy.</p>
            )}
          </DetailSection>

          {/* Record metadata */}
          <DetailSection title="Record">
            <DetailRow label="Added" value={formatDate(item.createdAt)} />
            <DetailRow label="Last updated" value={formatDate(item.updatedAt)} />
            <DetailRow label="Card ID" value={item.card.id} mono />
          </DetailSection>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {item.card.tcgplayerUrl ? (
              <a
                href={item.card.tcgplayerUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                View on TCGPlayer →
              </a>
            ) : (
              <span className="text-xs text-neutral-500">
                No TCGPlayer link available for this card.
              </span>
            )}
            <DetailDeleteButton itemId={item.id} cardName={item.card.name} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
        {children}
      </div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span
        className={
          mono
            ? "truncate font-mono text-xs text-neutral-700 dark:text-neutral-300"
            : "text-right tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
