"use client";

/**
 * Add-sealed-product form — search-then-select-or-create flow.
 *
 * States:
 *   searching  → user types to search existing catalog or clicks "Create new"
 *   creating   → inline form to add a new SealedProduct catalog entry
 *   selected   → product chosen; fill inventory lot details
 */

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { addSealedItem, createSealedProduct, searchSealedProducts } from "@/lib/sealed-actions";
import {
  SEALED_PRODUCT_TYPE_LABELS,
  SEALED_PRODUCT_TYPES,
  type SealedProductResult,
} from "@/lib/sealed-types";

type FlowState = "searching" | "creating" | "selected";

// ---------------------------------------------------------------------------
// Field helper
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

// ---------------------------------------------------------------------------
// Search / select view
// ---------------------------------------------------------------------------

function SearchView({
  onSelect,
  onCreate,
}: {
  onSelect: (product: SealedProductResult) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [productType, setProductType] = useState("");
  const [results, setResults] = useState<SealedProductResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("q", query);
    fd.set("productType", productType);
    startTransition(async () => {
      const hits = await searchSealedProducts(fd);
      setResults(hits);
      setSearched(true);
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Product type (optional)">
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              className="input-base"
            >
              <option value="">All types</option>
              {SEALED_PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SEALED_PRODUCT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Search by name">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Surging Sparks Booster Box"
              className="input-base"
              autoFocus
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Searching…" : "Search catalog"}
        </button>
      </form>

      {searched && results.length === 0 && (
        <p className="text-sm text-neutral-500">
          No products found.{" "}
          <button
            type="button"
            onClick={onCreate}
            className="text-red-600 underline underline-offset-2 hover:text-red-800 dark:text-red-400"
          >
            Create a new product
          </button>{" "}
          to add it to the catalog.
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500">{results.length} result{results.length !== 1 ? "s" : ""} — click to select</p>
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  className="w-full rounded-xl border border-black/10 p-3 text-left transition hover:border-red-400 hover:bg-red-50/60 dark:border-white/10 dark:hover:border-red-600 dark:hover:bg-red-950/20"
                >
                  <div className="flex items-start gap-3">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt="" className="h-12 w-auto rounded" />
                    ) : (
                      <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded border border-dashed border-black/15 text-lg dark:border-white/15">
                        📦
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-sm">{r.name}</div>
                      <div className="text-xs text-neutral-500 space-x-1">
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          {SEALED_PRODUCT_TYPE_LABELS[r.productType] ?? r.productType}
                        </span>
                        {r.setName && <span>· {r.setName}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onCreate}
            className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            Not listed? Create a new product
          </button>
        </div>
      )}

      {!searched && (
        <button
          type="button"
          onClick={onCreate}
          className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Skip search — create a new product
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create product view
// ---------------------------------------------------------------------------

function CreateProductView({
  onCreated,
  onBack,
}: {
  onCreated: (product: SealedProductResult) => void;
  onBack: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createSealedProduct(fd);
      if (result.ok) {
        // Build a SealedProductResult from the form values + returned id.
        const productType = fd.get("productType") as string;
        const name = fd.get("name") as string;
        const setName = (fd.get("setName") as string | null) ?? null;
        const tcgplayerUrl = (fd.get("tcgplayerUrl") as string | null) ?? null;
        const imageUrl = (fd.get("imageUrl") as string | null) ?? null;
        onCreated({
          id: result.id,
          setId: null,
          setName: setName || null,
          productType,
          name,
          tcgplayerUrl: tcgplayerUrl || null,
          imageUrl: imageUrl || null,
        });
      } else {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">New product</h3>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← Back to search
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Product type" error={fieldErrors.productType} required>
          <select name="productType" defaultValue="BOOSTER_BOX" className="input-base">
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="TCGPlayer URL (optional)" error={fieldErrors.tcgplayerUrl}>
          <input
            type="url"
            name="tcgplayerUrl"
            placeholder="https://www.tcgplayer.com/…"
            maxLength={500}
            className="input-base"
          />
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

      {formError && (
        <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create product"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Inventory lot form (after product is selected/created)
// ---------------------------------------------------------------------------

function InventoryForm({
  product,
  onBack,
}: {
  product: SealedProductResult;
  onBack: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const typeLabel = SEALED_PRODUCT_TYPE_LABELS[product.productType] ?? product.productType;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addSealedItem(fd);
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="sealedProductId" value={product.id} />

      {/* Product preview */}
      <div className="flex items-start gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt="" className="h-16 w-auto rounded" />
        ) : (
          <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded border border-dashed border-black/15 text-2xl dark:border-white/15">
            📦
          </div>
        )}
        <div className="flex-1">
          <div className="font-medium">{product.name}</div>
          <div className="mt-0.5 text-xs text-neutral-500 space-x-1">
            <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
              {typeLabel}
            </span>
            {product.setName && <span>· {product.setName}</span>}
          </div>
          {product.tcgplayerUrl && (
            <a
              href={product.tcgplayerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 block text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              View on TCGPlayer →
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Change
        </button>
      </div>

      {/* Lot details */}
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

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function AddSealedForm() {
  const [flowState, setFlowState] = useState<FlowState>("searching");
  const [selectedProduct, setSelectedProduct] = useState<SealedProductResult | null>(null);

  function handleSelect(product: SealedProductResult) {
    setSelectedProduct(product);
    setFlowState("selected");
  }

  function handleCreated(product: SealedProductResult) {
    setSelectedProduct(product);
    setFlowState("selected");
  }

  if (flowState === "searching") {
    return (
      <SearchView
        onSelect={handleSelect}
        onCreate={() => setFlowState("creating")}
      />
    );
  }

  if (flowState === "creating") {
    return (
      <CreateProductView
        onCreated={handleCreated}
        onBack={() => setFlowState("searching")}
      />
    );
  }

  // selected
  return (
    <InventoryForm
      product={selectedProduct!}
      onBack={() => setFlowState("searching")}
    />
  );
}
