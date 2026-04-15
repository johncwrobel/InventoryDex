"use client";

/**
 * Add-sealed-product form.
 * No search step — sealed products are entered manually.
 * Calls addSealedItem server action on submit.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSealedItem } from "@/lib/sealed-actions";
import {
  SEALED_PRODUCT_TYPE_LABELS,
  SEALED_PRODUCT_TYPES,
} from "@/lib/sealed-types";

export function AddSealedForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(formData: FormData) {
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await addSealedItem(formData);
      if (result.ok) {
        router.push("/inventory");
        router.refresh();
      } else {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Product type" error={fieldErrors.productType} required>
          <select
            name="productType"
            defaultValue="BOOSTER_BOX"
            className="input-base"
          >
            {SEALED_PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {SEALED_PRODUCT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Set name (optional)" error={fieldErrors.setName}>
          <input
            type="text"
            name="setName"
            placeholder="e.g. Surging Sparks"
            maxLength={100}
            className="input-base"
          />
        </Field>
      </div>

      <Field label="Product name" error={fieldErrors.name} required>
        <input
          type="text"
          name="name"
          placeholder="e.g. Surging Sparks Booster Box"
          maxLength={200}
          className="input-base"
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Quantity" error={fieldErrors.quantity} required>
          <input
            type="number"
            name="quantity"
            min={1}
            max={9999}
            defaultValue={1}
            className="input-base"
          />
        </Field>

        <Field label="Purchase price (USD)" error={fieldErrors.purchasePrice} required>
          <input
            type="number"
            name="purchasePrice"
            min={0}
            step="0.01"
            defaultValue="0.00"
            className="input-base"
          />
        </Field>

        <Field label="List price (USD, optional)" error={fieldErrors.listPrice}>
          <input
            type="number"
            name="listPrice"
            min={0}
            step="0.01"
            placeholder="e.g. 160.00"
            className="input-base"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Purchase date (optional)" error={fieldErrors.purchasedAt}>
          <input type="date" name="purchasedAt" className="input-base" />
        </Field>

        <Field label="Image URL (optional)" error={fieldErrors.imageUrl}>
          <input
            type="url"
            name="imageUrl"
            placeholder="https://…"
            maxLength={500}
            className="input-base"
          />
        </Field>
      </div>

      {/* Sealed toggle */}
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-black/10 px-3 py-2.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
        <input
          type="checkbox"
          name="isSealed"
          value="on"
          defaultChecked
          className="h-4 w-4 rounded accent-red-600"
        />
        <span className="text-sm font-medium">Still factory sealed</span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          Uncheck if opened or damaged packaging
        </span>
      </label>

      <Field label="Notes (optional)" error={fieldErrors.notes}>
        <textarea
          name="notes"
          rows={2}
          maxLength={500}
          placeholder="Lot, condition details, anything worth remembering"
          className="input-base"
        />
      </Field>

      {formError && (
        <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add to inventory"}
      </button>
    </form>
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
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
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
