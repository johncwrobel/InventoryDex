"use client";

/**
 * One inventory row, rendered in two layouts:
 *   - `variant="desktop"` — cells for a `<tr>` inside the desktop table
 *   - `variant="mobile"`  — a stacked card block for the mobile list
 *
 * Handles its own inline list-price edit state and delete confirmation so
 * the parent page can stay a server component.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateListPrice, deleteInventoryItem } from "@/lib/actions";
import { updateSealedListPrice, deleteSealedItem } from "@/lib/sealed-actions";
import {
  type SealedInventoryRowData,
  SEALED_PRODUCT_TYPE_LABELS,
} from "@/lib/sealed-types";

export interface CardInventoryRowData {
  itemType: "card";
  id: string;
  createdAt: string; // ISO string, used for sort
  quantity: number;
  condition: string;
  finish: string;
  purchasePrice: string;
  listPrice: string | null;
  notes: string | null;
  card: {
    id: string;
    name: string;
    setName: string;
    number: string;
    rarity: string | null;
    imageSmall: string | null;
    tcgplayerUrl: string | null;
  };
  marketPrice: string | null;
  /** % change in market price over the last 7 days. null = not enough history. */
  priceChangePct: number | null;
  /** Whether the list price is significantly above/below market. */
  listFlag: "underpriced" | "overpriced" | null;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
}

export type InventoryRowData = CardInventoryRowData | SealedInventoryRowData;

const CONDITION_LABELS: Record<string, string> = {
  MINT: "M",
  NEAR_MINT: "NM",
  LIGHTLY_PLAYED: "LP",
  MODERATELY_PLAYED: "MP",
  HEAVILY_PLAYED: "HP",
  DAMAGED: "DMG",
};

const FINISH_LABELS: Record<string, string> = {
  NORMAL: "Normal",
  HOLO: "Holo",
  REVERSE_HOLO: "Rev Holo",
  FIRST_ED_HOLO: "1st Ed Holo",
};

function gradedLabel(company: string | null, grade: string | null): string {
  if (company && grade) return `${company} ${grade}`;
  return grade ?? company ?? "Graded";
}

function formatMoney(value: string | null): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return `$${n.toFixed(2)}`;
}

export function InventoryRow({
  item,
  variant,
}: {
  item: InventoryRowData;
  variant: "desktop" | "mobile";
}) {
  if (item.itemType === "sealed") {
    return <SealedRow item={item} variant={variant} />;
  }
  return <CardRow item={item} variant={variant} />;
}

// ---------------------------------------------------------------------------
// Sealed product row
// ---------------------------------------------------------------------------

function SealedRow({
  item,
  variant,
}: {
  item: SealedInventoryRowData;
  variant: "desktop" | "mobile";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [listPriceDraft, setListPriceDraft] = useState(item.listPrice ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const typeLabel =
    SEALED_PRODUCT_TYPE_LABELS[item.productType] ?? item.productType;
  const detailHref = `/inventory/sealed/${item.id}`;

  function saveListPrice() {
    setError(null);
    const fd = new FormData();
    fd.set("itemId", item.id);
    fd.set("listPrice", listPriceDraft);
    startTransition(async () => {
      const result = await updateSealedListPrice(fd);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function cancelEdit() {
    setEditing(false);
    setListPriceDraft(item.listPrice ?? "");
    setError(null);
  }

  function handleDelete() {
    if (!confirm(`Remove ${item.name} from inventory?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("itemId", item.id);
    startTransition(async () => {
      const result = await deleteSealedItem(fd);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (variant === "desktop") {
    return (
      <tr className="border-t border-black/10 align-middle dark:border-white/10 hover:bg-red-50/60 dark:hover:bg-red-950/20">
        {/* Thumbnail placeholder */}
        <td className="px-3 py-2">
          <Link href={detailHref} className="inline-block" aria-label={`View ${item.name}`}>
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt="" className="h-14 w-auto rounded" />
            ) : (
              <div className="flex h-14 w-10 items-center justify-center rounded border border-dashed border-black/15 text-lg dark:border-white/15">
                📦
              </div>
            )}
          </Link>
        </td>
        {/* Name + type */}
        <td className="px-3 py-2">
          <Link href={detailHref} className="block">
            <div className="font-medium hover:underline">{item.name}</div>
            <div className="text-xs text-neutral-500">
              {item.setName ?? "Sealed product"}
            </div>
          </Link>
        </td>
        {/* Type badge in "Cond/Finish" column */}
        <td className="px-3 py-2 text-xs">
          <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
            {typeLabel}
          </span>
          <div className="mt-0.5 text-neutral-500">
            {item.isSealed ? "Sealed" : "Opened"}
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatMoney(item.purchasePrice)}
        </td>
        {/* Market price from SealedPricePoint history */}
        <td className="px-3 py-2 text-right tabular-nums">
          {item.tcgplayerUrl ? (
            <a
              href={item.tcgplayerUrl}
              target="_blank"
              rel="noreferrer"
              className="tabular-nums hover:underline"
              title="View on TCGPlayer"
            >
              {formatMoney(item.marketPrice)}
            </a>
          ) : (
            <span className={item.marketPrice ? "" : "text-neutral-400"}>
              {formatMoney(item.marketPrice)}
            </span>
          )}
          <PriceChangeBadge pct={item.priceChangePct} />
        </td>
        {/* Inline list price edit */}
        <td className="px-3 py-2 text-right">
          <ListFlagPill flag={item.listFlag} />
          {editing ? (
            <div className="flex items-center justify-end gap-1">
              <input
                type="number"
                min={0}
                step="0.01"
                value={listPriceDraft}
                onChange={(e) => setListPriceDraft(e.target.value)}
                className="input-base h-8 w-24 px-2 py-1 text-right"
                autoFocus
              />
              <button
                type="button"
                onClick={saveListPrice}
                disabled={pending}
                className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-950"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className="rounded px-2 py-1 text-xs text-neutral-600 hover:bg-black/5 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded px-2 py-1 tabular-nums hover:bg-black/5 dark:hover:bg-white/10"
              title="Click to edit list price"
            >
              {formatMoney(item.listPrice)}
            </button>
          )}
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete
          </button>
        </td>
      </tr>
    );
  }

  // Mobile
  return (
    <li className="flex gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <Link href={detailHref} className="shrink-0" aria-label={`View ${item.name}`}>
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-24 w-auto self-start rounded" />
        ) : (
          <div className="flex h-24 w-16 items-center justify-center self-start rounded border border-dashed border-black/15 text-3xl dark:border-white/15">
            📦
          </div>
        )}
      </Link>
      <div className="flex-1 space-y-1 text-sm">
        <Link href={detailHref} className="block">
          <div className="font-medium hover:underline">{item.name}</div>
          <div className="text-xs text-neutral-500">
            {item.setName ?? "Sealed product"}
          </div>
        </Link>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
            {typeLabel}
          </span>{" "}
          · {item.isSealed ? "Sealed" : "Opened"} · qty {item.quantity}
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 text-xs tabular-nums">
          <div className="text-neutral-500">Paid</div>
          <div className="text-right">{formatMoney(item.purchasePrice)}</div>
          <div className="text-neutral-500">List</div>
          <div className="text-right">
            {editing ? (
              <input
                type="number"
                min={0}
                step="0.01"
                value={listPriceDraft}
                onChange={(e) => setListPriceDraft(e.target.value)}
                className="input-base h-7 w-20 px-1.5 py-0.5 text-right text-xs"
                autoFocus
              />
            ) : (
              formatMoney(item.listPrice)
            )}
          </div>
        </div>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex gap-2 pt-1">
          {editing ? (
            <>
              <button
                type="button"
                onClick={saveListPrice}
                disabled={pending}
                className="rounded border border-green-600/40 px-2 py-1 text-xs font-medium text-green-700 disabled:opacity-50 dark:text-green-400"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className="rounded border border-black/15 px-2 py-1 text-xs disabled:opacity-50 dark:border-white/15"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-black/15 px-2 py-1 text-xs dark:border-white/15"
            >
              Edit list price
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="ml-auto rounded border border-red-600/30 px-2 py-1 text-xs text-red-600 disabled:opacity-50 dark:text-red-400"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Card row (existing logic, extracted into named function)
// ---------------------------------------------------------------------------

function CardRow({
  item,
  variant,
}: {
  item: CardInventoryRowData;
  variant: "desktop" | "mobile";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [listPriceDraft, setListPriceDraft] = useState(item.listPrice ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function saveListPrice() {
    setError(null);
    const fd = new FormData();
    fd.set("itemId", item.id);
    fd.set("listPrice", listPriceDraft);
    startTransition(async () => {
      const result = await updateListPrice(fd);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function cancelEdit() {
    setEditing(false);
    setListPriceDraft(item.listPrice ?? "");
    setError(null);
  }

  function handleDelete() {
    if (!confirm(`Remove ${item.card.name} from inventory?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("itemId", item.id);
    startTransition(async () => {
      const result = await deleteInventoryItem(fd);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const detailHref = `/inventory/${item.id}`;

  // ---------- Desktop row ----------
  if (variant === "desktop") {
    return (
      <tr className="border-t border-black/10 align-middle dark:border-white/10 hover:bg-red-50/60 dark:hover:bg-red-950/20">
        <td className="px-3 py-2">
          <Link href={detailHref} className="inline-block" aria-label={`View ${item.card.name}`}>
            {item.card.imageSmall ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.card.imageSmall}
                alt=""
                className="h-14 w-auto rounded"
              />
            ) : (
              <div className="h-14 w-10 rounded border border-dashed border-black/15 dark:border-white/15" />
            )}
          </Link>
        </td>
        <td className="px-3 py-2">
          <Link href={detailHref} className="block">
            <div className="font-medium hover:underline">{item.card.name}</div>
            <div className="text-xs text-neutral-500">
              {item.card.setName} · #{item.card.number}
            </div>
          </Link>
        </td>
        <td className="px-3 py-2 text-xs">
          {item.isGraded ? (
            <div>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                {gradedLabel(item.gradingCompany, item.grade)}
              </span>
            </div>
          ) : (
            <div>{CONDITION_LABELS[item.condition] ?? item.condition}</div>
          )}
          <div className="mt-0.5 text-neutral-500">
            {FINISH_LABELS[item.finish] ?? item.finish}
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatMoney(item.purchasePrice)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {item.card.tcgplayerUrl ? (
            <a
              href={item.card.tcgplayerUrl}
              target="_blank"
              rel="noreferrer"
              className="tabular-nums hover:underline"
              title="View on TCGPlayer"
            >
              {formatMoney(item.marketPrice)}
            </a>
          ) : (
            <span>{formatMoney(item.marketPrice)}</span>
          )}
          <PriceChangeBadge pct={item.priceChangePct} />
        </td>
        <td className="px-3 py-2 text-right">
          <ListFlagPill flag={item.listFlag} />
          {editing ? (
            <div className="flex items-center justify-end gap-1">
              <input
                type="number"
                min={0}
                step="0.01"
                value={listPriceDraft}
                onChange={(e) => setListPriceDraft(e.target.value)}
                className="input-base h-8 w-24 px-2 py-1 text-right"
                autoFocus
              />
              <button
                type="button"
                onClick={saveListPrice}
                disabled={pending}
                className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-950"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className="rounded px-2 py-1 text-xs text-neutral-600 hover:bg-black/5 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded px-2 py-1 tabular-nums hover:bg-black/5 dark:hover:bg-white/10"
              title="Click to edit list price"
            >
              {formatMoney(item.listPrice)}
            </button>
          )}
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete
          </button>
        </td>
      </tr>
    );
  }

  // ---------- Mobile card ----------
  return (
    <li className="flex gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <Link
        href={detailHref}
        className="shrink-0"
        aria-label={`View ${item.card.name}`}
      >
        {item.card.imageSmall ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.card.imageSmall}
            alt=""
            className="h-24 w-auto self-start rounded"
          />
        ) : (
          <div className="h-24 w-16 self-start rounded border border-dashed border-black/15 dark:border-white/15" />
        )}
      </Link>
      <div className="flex-1 space-y-1 text-sm">
        <Link href={detailHref} className="block">
          <div className="font-medium hover:underline">{item.card.name}</div>
          <div className="text-xs text-neutral-500">
            {item.card.setName} · #{item.card.number}
          </div>
        </Link>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          {item.isGraded ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              {gradedLabel(item.gradingCompany, item.grade)}
            </span>
          ) : (
            CONDITION_LABELS[item.condition] ?? item.condition
          )}{" "}
          · {FINISH_LABELS[item.finish] ?? item.finish} · qty {item.quantity}
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 text-xs tabular-nums">
          <div className="text-neutral-500">Paid</div>
          <div className="text-right">{formatMoney(item.purchasePrice)}</div>
          <div className="text-neutral-500">Market</div>
          <div className="text-right">
            {item.card.tcgplayerUrl ? (
              <a
                href={item.card.tcgplayerUrl}
                target="_blank"
                rel="noreferrer"
                className="tabular-nums hover:underline"
                title="View on TCGPlayer"
              >
                {formatMoney(item.marketPrice)}
              </a>
            ) : (
              <span>{formatMoney(item.marketPrice)}</span>
            )}
            <PriceChangeBadge pct={item.priceChangePct} />
          </div>
          <div className="text-neutral-500">List</div>
          <div className="text-right">
            {editing ? (
              <input
                type="number"
                min={0}
                step="0.01"
                value={listPriceDraft}
                onChange={(e) => setListPriceDraft(e.target.value)}
                className="input-base h-7 w-20 px-1.5 py-0.5 text-right text-xs"
                autoFocus
              />
            ) : (
              formatMoney(item.listPrice)
            )}
            <ListFlagPill flag={item.listFlag} />
          </div>
        </div>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex gap-2 pt-1">
          {editing ? (
            <>
              <button
                type="button"
                onClick={saveListPrice}
                disabled={pending}
                className="rounded border border-green-600/40 px-2 py-1 text-xs font-medium text-green-700 disabled:opacity-50 dark:text-green-400"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className="rounded border border-black/15 px-2 py-1 text-xs disabled:opacity-50 dark:border-white/15"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-black/15 px-2 py-1 text-xs dark:border-white/15"
            >
              Edit list price
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="ml-auto rounded border border-red-600/30 px-2 py-1 text-xs text-red-600 disabled:opacity-50 dark:text-red-400"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

// ---------- Badge sub-components ----------

function PriceChangeBadge({ pct }: { pct: number | null }) {
  if (pct == null || Math.abs(pct) < 0.1) return null;
  const up = pct > 0;
  return (
    <span
      className={`mt-0.5 block text-xs font-medium tabular-nums ${
        up
          ? "text-green-700 dark:text-green-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function ListFlagPill({ flag }: { flag: "underpriced" | "overpriced" | null }) {
  if (!flag) return null;
  const isUnder = flag === "underpriced";
  return (
    <span
      className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
        isUnder
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          : "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
      }`}
    >
      {isUnder ? "⬇ Low" : "⬆ High"}
    </span>
  );
}
