"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateInventoryItem, type ActionResult } from "@/lib/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditableItem {
  id: string;
  quantity: number;
  condition: string;
  finish: string;
  language: string;
  purchasePrice: string;   // serialized Decimal
  purchasedAt: string | null; // ISO date string or null
  listPrice: string | null;   // serialized Decimal or null
  notes: string | null;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  // ISO date string or full ISO timestamp → YYYY-MM-DD
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
// Sub-components (view mode)
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ItemDetails({ item }: { item: EditableItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isGraded, setIsGraded] = useState(item.isGraded);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result: ActionResult = await updateInventoryItem(fd);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error);
        if (!result.ok && result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      }
    });
  }

  function handleCancel() {
    setEditing(false);
    setIsGraded(item.isGraded);
    setError(null);
    setFieldErrors({});
  }

  // ---- View mode ----
  if (!editing) {
    return (
      <>
        <DetailSection title="This copy">
          {item.isGraded ? (
            <DetailRow label="Condition" value="Graded" />
          ) : (
            <DetailRow
              label="Condition"
              value={CONDITION_LABELS[item.condition] ?? item.condition}
            />
          )}
          <DetailRow
            label="Finish"
            value={FINISH_LABELS[item.finish] ?? item.finish}
          />
          <DetailRow label="Language" value={item.language} />
          <DetailRow label="Quantity" value={String(item.quantity)} />
        </DetailSection>

        {item.isGraded && (
          <DetailSection title="Grading">
            <DetailRow label="Company" value={item.gradingCompany ?? "—"} />
            <DetailRow label="Grade" value={item.grade ?? "—"} />
          </DetailSection>
        )}

        <DetailSection title="Pricing">
          <DetailRow
            label="Purchase price"
            value={formatMoney(item.purchasePrice)}
          />
          <DetailRow
            label="Purchased"
            value={formatDate(item.purchasedAt)}
          />
          <DetailRow
            label="List price"
            value={formatMoney(item.listPrice)}
          />
        </DetailSection>

        <DetailSection title="Notes">
          {item.notes ? (
            <p className="whitespace-pre-wrap text-sm">{item.notes}</p>
          ) : (
            <p className="text-sm text-neutral-500">No notes for this copy.</p>
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

      {/* Graded toggle */}
      <div className="flex items-center gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <input
          type="checkbox"
          id="isGraded"
          name="isGraded"
          value="on"
          defaultChecked={item.isGraded}
          onChange={(e) => setIsGraded(e.target.checked)}
          className="h-4 w-4 rounded accent-red-600"
        />
        <label htmlFor="isGraded" className="text-sm font-medium">
          Graded card
        </label>
      </div>

      {/* Copy details */}
      <fieldset className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          This copy
        </legend>

        {isGraded ? (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Grading company"
              error={fieldErrors["gradingCompany"]}
              required
            >
              <input
                name="gradingCompany"
                type="text"
                defaultValue={item.gradingCompany ?? ""}
                placeholder="PSA, BGS, CGC…"
                className="input-base"
              />
            </Field>
            <Field label="Grade" error={fieldErrors["grade"]} required>
              <input
                name="grade"
                type="text"
                defaultValue={item.grade ?? ""}
                placeholder="10, 9.5…"
                className="input-base"
              />
            </Field>
          </div>
        ) : (
          <Field label="Condition" error={fieldErrors["condition"]}>
            <select name="condition" defaultValue={item.condition} className="input-base">
              {Object.entries(CONDITION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
        )}

        {/* Hidden condition placeholder for graded — keeps DB constraint happy */}
        {isGraded && (
          <input type="hidden" name="condition" value="NEAR_MINT" />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Finish" error={fieldErrors["finish"]}>
            <select name="finish" defaultValue={item.finish} className="input-base">
              {Object.entries(FINISH_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Language" error={fieldErrors["language"]}>
            <input
              name="language"
              type="text"
              defaultValue={item.language}
              maxLength={10}
              className="input-base"
            />
          </Field>
        </div>

        <Field label="Quantity" error={fieldErrors["quantity"]}>
          <input
            name="quantity"
            type="number"
            min={1}
            max={9999}
            defaultValue={item.quantity}
            className="input-base"
          />
        </Field>
      </fieldset>

      {/* Pricing */}
      <fieldset className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Pricing
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase price ($)" error={fieldErrors["purchasePrice"]} required>
            <input
              name="purchasePrice"
              type="number"
              min={0}
              step="0.01"
              defaultValue={Number(item.purchasePrice).toFixed(2)}
              className="input-base"
            />
          </Field>
          <Field label="List price ($)" error={fieldErrors["listPrice"]}>
            <input
              name="listPrice"
              type="number"
              min={0}
              step="0.01"
              defaultValue={item.listPrice != null ? Number(item.listPrice).toFixed(2) : ""}
              placeholder="—"
              className="input-base"
            />
          </Field>
        </div>
        <Field label="Purchase date" error={fieldErrors["purchasedAt"]}>
          <input
            name="purchasedAt"
            type="date"
            defaultValue={toDateInputValue(item.purchasedAt)}
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
          placeholder="Any notes about this copy…"
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

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

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
