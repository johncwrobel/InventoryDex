"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSealedItem } from "@/lib/sealed-actions";
import type { ActionResult } from "@/lib/actions";
import {
  SEALED_PRODUCT_TYPE_LABELS,
  SEALED_PRODUCT_TYPES,
  type EditableSealedItem,
} from "@/lib/sealed-types";

// Re-export so the page can import from a single place.
export type { EditableSealedItem };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(value: string | null | undefined): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `$${n.toFixed(2)}`;
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {error && (
        <span className="block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SealedItemDetails({ item }: { item: EditableSealedItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result: ActionResult = await updateSealedItem(fd);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error);
        if (!result.ok && result.fieldErrors) setFieldErrors(result.fieldErrors);
      }
    });
  }

  function handleCancel() {
    setEditing(false);
    setError(null);
    setFieldErrors({});
  }

  const typeLabel =
    SEALED_PRODUCT_TYPE_LABELS[item.productType] ?? item.productType;

  // ---- View mode ----
  if (!editing) {
    return (
      <>
        <DetailSection title="Product details">
          <DetailRow label="Type" value={typeLabel} />
          <DetailRow label="Set" value={item.setName ?? "—"} />
          <DetailRow label="Condition" value={item.isSealed ? "Sealed" : "Opened"} />
          <DetailRow label="Quantity" value={String(item.quantity)} />
        </DetailSection>

        <DetailSection title="Pricing">
          <DetailRow label="Purchase price" value={formatMoney(item.purchasePrice)} />
          <DetailRow label="Purchased" value={formatDate(item.purchasedAt)} />
          <DetailRow label="List price" value={formatMoney(item.listPrice)} />
        </DetailSection>

        {item.imageUrl && (
          <DetailSection title="Image">
            <a
              href={item.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all text-sm text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400"
            >
              {item.imageUrl}
            </a>
          </DetailSection>
        )}

        <DetailSection title="Notes">
          {item.notes ? (
            <p className="whitespace-pre-wrap text-sm">{item.notes}</p>
          ) : (
            <p className="text-sm text-neutral-500">No notes for this item.</p>
          )}
        </DetailSection>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          Edit details
        </button>
      </>
    );
  }

  // ---- Edit mode ----
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="itemId" value={item.id} />

      {/* Product details */}
      <fieldset className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Product details
        </legend>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Product type" error={fieldErrors.productType} required>
            <select
              name="productType"
              defaultValue={item.productType}
              className="input-base"
            >
              {SEALED_PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SEALED_PRODUCT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Set name" error={fieldErrors.setName}>
            <input
              name="setName"
              type="text"
              defaultValue={item.setName ?? ""}
              maxLength={100}
              className="input-base"
            />
          </Field>
        </div>

        <Field label="Product name" error={fieldErrors.name} required>
          <input
            name="name"
            type="text"
            defaultValue={item.name}
            maxLength={200}
            className="input-base"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" error={fieldErrors.quantity} required>
            <input
              name="quantity"
              type="number"
              min={1}
              max={9999}
              defaultValue={item.quantity}
              className="input-base"
            />
          </Field>

          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                name="isSealed"
                value="on"
                defaultChecked={item.isSealed}
                className="h-4 w-4 rounded accent-red-600"
              />
              <span className="text-sm font-medium">Still sealed</span>
            </label>
          </div>
        </div>
      </fieldset>

      {/* Pricing */}
      <fieldset className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Pricing
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase price ($)" error={fieldErrors.purchasePrice} required>
            <input
              name="purchasePrice"
              type="number"
              min={0}
              step="0.01"
              defaultValue={Number(item.purchasePrice).toFixed(2)}
              className="input-base"
            />
          </Field>
          <Field label="List price ($)" error={fieldErrors.listPrice}>
            <input
              name="listPrice"
              type="number"
              min={0}
              step="0.01"
              defaultValue={
                item.listPrice != null
                  ? Number(item.listPrice).toFixed(2)
                  : ""
              }
              placeholder="—"
              className="input-base"
            />
          </Field>
        </div>
        <Field label="Purchase date" error={fieldErrors.purchasedAt}>
          <input
            name="purchasedAt"
            type="date"
            defaultValue={toDateInputValue(item.purchasedAt)}
            className="input-base"
          />
        </Field>
      </fieldset>

      {/* Image URL */}
      <fieldset className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Image
        </legend>
        <Field label="Image URL (optional)" error={fieldErrors.imageUrl}>
          <input
            name="imageUrl"
            type="url"
            defaultValue={item.imageUrl ?? ""}
            maxLength={500}
            placeholder="https://…"
            className="input-base"
          />
        </Field>
      </fieldset>

      {/* Notes */}
      <fieldset className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Notes
        </legend>
        <textarea
          name="notes"
          rows={3}
          defaultValue={item.notes ?? ""}
          placeholder="Any notes about this item…"
          maxLength={500}
          className="input-base w-full resize-y"
        />
      </fieldset>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
