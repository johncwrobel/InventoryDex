"use client";

/**
 * Add-card flow:
 *   1. Debounced search against /api/cards/search.
 *   2. Pick a result — the form slides in with the card preview.
 *   3. Submit calls the `addInventoryItem` server action; on success we
 *      navigate back to /inventory (which will now show the new row).
 *
 * Kept as a single client component so search state, selection, and form
 * state all live together — the page is small enough that splitting would
 * add more indirection than it saves.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CardSearchResult,
  CardSetSummary,
} from "@/lib/card-search-types";
import { addInventoryItem } from "@/lib/actions";

type SortValue = "releaseDate:desc" | "releaseDate:asc" | "name:asc";

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "releaseDate:desc", label: "Newest sets first" },
  { value: "releaseDate:asc", label: "Oldest sets first" },
  { value: "name:asc", label: "Name A → Z" },
];

const CONDITIONS = [
  { value: "MINT", label: "Mint" },
  { value: "NEAR_MINT", label: "Near Mint" },
  { value: "LIGHTLY_PLAYED", label: "Lightly Played" },
  { value: "MODERATELY_PLAYED", label: "Moderately Played" },
  { value: "HEAVILY_PLAYED", label: "Heavily Played" },
  { value: "DAMAGED", label: "Damaged" },
] as const;

const FINISHES = [
  { value: "NORMAL", label: "Normal" },
  { value: "HOLO", label: "Holo" },
  { value: "REVERSE_HOLO", label: "Reverse Holo" },
  { value: "FIRST_ED_HOLO", label: "1st Edition Holo" },
] as const;

export function AddCardClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [setId, setSetId] = useState<string>("");
  const [sort, setSort] = useState<SortValue>("releaseDate:desc");
  const [sets, setSets] = useState<CardSetSummary[]>([]);
  const [setsError, setSetsError] = useState<string | null>(null);
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CardSearchResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isGraded, setIsGraded] = useState(false);
  const [pending, startTransition] = useTransition();

  // Load the set list once on mount. The server caches the upstream
  // response, so re-mounting the page is cheap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sets");
        if (!res.ok) throw new Error(`Failed to load sets (${res.status})`);
        const body = (await res.json()) as { sets: CardSetSummary[] };
        if (!cancelled) setSets(body.sets);
      } catch (err) {
        if (!cancelled) setSetsError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Group sets by series for the <optgroup> layout.
  const setsBySeries = useMemo(() => {
    const groups = new Map<string, CardSetSummary[]>();
    for (const s of sets) {
      const bucket = groups.get(s.series) ?? [];
      bucket.push(s);
      groups.set(s.series, bucket);
    }
    return groups;
  }, [sets]);

  // Debounced search. Re-runs whenever any filter changes. Text input is
  // debounced (300ms); set + sort changes still pass through the same
  // timer but feel immediate since clicks don't fire in quick succession.
  useEffect(() => {
    const trimmed = query.trim();
    const hasQuery = trimmed.length >= 2;
    const hasSet = setId.length > 0;

    if (!hasQuery && !hasSet) {
      setResults([]);
      setSearchError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams();
        if (hasQuery) params.set("q", trimmed);
        if (hasSet) params.set("setId", setId);
        params.set("sort", sort);

        const res = await fetch(`/api/cards/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? `Search failed (${res.status})`);
        }
        const body = (await res.json()) as { results: CardSearchResult[] };
        setResults(body.results);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setSearchError((err as Error).message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, setId, sort]);

  function handleSubmit(formData: FormData) {
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await addInventoryItem(formData);
      if (result.ok) {
        router.push("/inventory");
        router.refresh();
      } else {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  // ----- Form view -----
  if (selected) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setFormError(null);
            setFieldErrors({});
            setIsGraded(false);
          }}
          className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          ← Back to search
        </button>

        <div className="flex flex-col gap-4 sm:flex-row">
          {selected.imageSmall ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.imageSmall}
              alt={selected.name}
              className="h-48 w-auto self-start rounded-lg border border-black/10 dark:border-white/10"
            />
          ) : (
            <div className="h-48 w-32 self-start rounded-lg border border-dashed border-black/20 dark:border-white/20" />
          )}
          <div className="flex-1 space-y-1">
            <h2 className="text-lg font-semibold">{selected.name}</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {selected.setName} · #{selected.number}
              {selected.rarity ? ` · ${selected.rarity}` : ""}
            </p>
            {selected.tcgplayerUrl && (
              <a
                href={selected.tcgplayerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400"
              >
                View on TCGPlayer →
              </a>
            )}
          </div>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="cardId" value={selected.id} />

          {/* Graded card toggle */}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-black/10 px-3 py-2.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <input
              type="checkbox"
              name="isGraded"
              value="on"
              checked={isGraded}
              onChange={(e) => setIsGraded(e.target.checked)}
              className="h-4 w-4 rounded accent-red-600"
            />
            <span className="text-sm font-medium">Graded card</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">PSA, BGS, CGC, etc.</span>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Condition — hidden when graded (NEAR_MINT saved as placeholder) */}
            {isGraded ? (
              <input type="hidden" name="condition" value="NEAR_MINT" />
            ) : (
              <Field label="Condition" error={fieldErrors.condition}>
                <select
                  name="condition"
                  defaultValue="NEAR_MINT"
                  className="input-base"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Finish" error={fieldErrors.finish}>
              <select name="finish" defaultValue="NORMAL" className="input-base">
                {FINISHES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>

            {/* Grading company + grade — visible only when isGraded */}
            {isGraded && (
              <>
                <Field label="Grading company" error={fieldErrors.gradingCompany}>
                  <input
                    type="text"
                    name="gradingCompany"
                    list="grading-companies"
                    placeholder="e.g. PSA, BGS, CGC"
                    className="input-base"
                    autoComplete="off"
                  />
                  <datalist id="grading-companies">
                    <option value="PSA" />
                    <option value="BGS" />
                    <option value="CGC" />
                    <option value="SGC" />
                    <option value="HGA" />
                    <option value="ACE" />
                  </datalist>
                </Field>

                <Field label="Grade" error={fieldErrors.grade}>
                  <input
                    type="text"
                    name="grade"
                    placeholder="e.g. 10, 9.5, Pristine"
                    className="input-base"
                  />
                </Field>
              </>
            )}

            <Field label="Quantity" error={fieldErrors.quantity}>
              <input
                type="number"
                name="quantity"
                min={1}
                defaultValue={1}
                required
                className="input-base"
              />
            </Field>

            <Field
              label="Purchase price (USD)"
              error={fieldErrors.purchasePrice}
            >
              <input
                type="number"
                name="purchasePrice"
                min={0}
                step="0.01"
                defaultValue="0.00"
                required
                className="input-base"
              />
            </Field>

            <Field
              label="List price (USD, optional)"
              error={fieldErrors.listPrice}
            >
              <input
                type="number"
                name="listPrice"
                min={0}
                step="0.01"
                placeholder="e.g. 12.00"
                className="input-base"
              />
            </Field>
          </div>

          <Field label="Notes (optional)" error={fieldErrors.notes}>
            <textarea
              name="notes"
              rows={2}
              className="input-base"
              placeholder="Lot, grade, anything worth remembering"
            />
          </Field>

          {formError && (
            <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add to inventory"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg border border-black/10 px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ----- Search view -----
  const hasQuery = query.trim().length >= 2;
  const hasSet = setId.length > 0;
  const anyFilter = hasQuery || hasSet;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label htmlFor="card-search" className="sr-only">
            Search for a card
          </label>
          <input
            id="card-search"
            type="search"
            autoFocus
            placeholder="Search Pokémon cards (e.g. Charizard)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-base h-12 text-base"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
          <div>
            <label
              htmlFor="card-set"
              className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300"
            >
              Set
            </label>
            <select
              id="card-set"
              value={setId}
              onChange={(e) => setSetId(e.target.value)}
              className="input-base"
              disabled={sets.length === 0 && !setsError}
            >
              <option value="">All sets</option>
              {Array.from(setsBySeries.entries()).map(([series, list]) => (
                <optgroup key={series} label={series}>
                  {list.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.releaseDate.slice(0, 4)})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {setsError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {setsError}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="card-sort"
              className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300"
            >
              Sort
            </label>
            <select
              id="card-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortValue)}
              className="input-base"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasSet && (
          <button
            type="button"
            onClick={() => setSetId("")}
            className="text-xs text-neutral-600 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Clear set filter
          </button>
        )}
      </div>

      {loading && (
        <p className="text-sm text-neutral-500">Searching…</p>
      )}
      {searchError && (
        <p className="text-sm text-red-600 dark:text-red-400">{searchError}</p>
      )}

      {!loading && anyFilter && results.length === 0 && !searchError && (
        <p className="text-sm text-neutral-500">
          No cards match your filters.
        </p>
      )}

      {results.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {results.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => setSelected(card)}
                className="group flex w-full flex-col items-center gap-2 rounded-lg border border-black/10 p-2 text-left transition hover:border-red-300 hover:shadow-sm dark:border-white/10 dark:hover:border-red-700"
              >
                {card.imageSmall ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.imageSmall}
                    alt={card.name}
                    className="h-36 w-auto rounded"
                  />
                ) : (
                  <div className="h-36 w-24 rounded border border-dashed border-black/20 dark:border-white/20" />
                )}
                <div className="w-full text-center">
                  <div className="truncate text-sm font-medium">{card.name}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {card.setName} · #{card.number}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
        {label}
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

