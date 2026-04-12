"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ScanMatch } from "@/lib/scan-types";
import { addInventoryItem } from "@/lib/actions";
import { useCamera } from "./use-camera";
import { useOcr, type CardOcrResult } from "./use-ocr";

// ---------- Constants (mirrors add-card-client.tsx) ----------

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

// ---------- State machine ----------

type ScanState =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "processing"; progress: number }
  | { kind: "result"; matches: ScanMatch[]; ocr: CardOcrResult }
  | { kind: "add-form"; match: ScanMatch }
  | { kind: "added"; cardName: string }
  | { kind: "error"; message: string };

// ---------- Main component ----------

export function ScanClient() {
  const router = useRouter();
  const camera = useCamera();
  const ocr = useOcr();

  const [state, setState] = useState<ScanState>({ kind: "idle" });
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [showAlternatives, setShowAlternatives] = useState(false);

  // When the camera reports an interruption error, surface it in the UI.
  useEffect(() => {
    if (camera.error === "interrupted" && state.kind === "scanning") {
      setState({ kind: "error", message: "Camera was interrupted. Tap to resume." });
    }
  }, [camera.error, state.kind]);

  // ---------- Handlers ----------

  async function handleStart() {
    setState({ kind: "scanning" });
    setShowAlternatives(false);
    await camera.start();
    if (camera.error) {
      handleCameraError(camera.error);
    }
  }

  function handleCameraError(err: typeof camera.error) {
    if (err === "not-supported") {
      setState({
        kind: "error",
        message:
          "Your browser doesn't support camera access. Try a modern mobile browser, or search manually.",
      });
    } else if (err === "permission-denied") {
      setState({
        kind: "error",
        message:
          "Camera access was denied. Allow camera access in your browser settings to use scanning.",
      });
    } else if (err === "not-found") {
      setState({
        kind: "error",
        message: "No camera found on this device.",
      });
    } else if (err === "interrupted") {
      setState({
        kind: "error",
        message: "Camera was interrupted. Tap 'Try again' to resume.",
      });
    } else {
      setState({
        kind: "error",
        message: "Could not start the camera. Try again.",
      });
    }
  }

  async function handleCapture() {
    const blob = await camera.capture();
    if (!blob) return;

    setState({ kind: "processing", progress: 0 });

    // Run dual-pass OCR: number from the bottom (reliable), name from the top (best-effort).
    let ocrResult: CardOcrResult = { name: "", number: "" };
    try {
      ocrResult = await ocr.recognizeCard(blob);
    } catch {
      setState({ kind: "error", message: "OCR failed. Make sure the card is clearly visible and try again." });
      return;
    }

    const { name, number } = ocrResult;

    // Need at least a card number or a 2+ char name to search.
    if (!number && name.length < 2) {
      setState({
        kind: "error",
        message: "Couldn't read the card. Make sure the full card is visible — especially the number at the bottom — and try again.",
      });
      return;
    }

    // Build the search URL. Number is the primary signal; name is a secondary filter.
    const params = new URLSearchParams();
    if (name.length >= 2) params.set("q", name);
    if (number) params.set("number", number);

    let matches: ScanMatch[] = [];
    try {
      const res = await fetch(`/api/cards/identify?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Search failed (${res.status})`);
      }
      const body = (await res.json()) as { results: ScanMatch[] };
      matches = body.results;
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message ?? "Search failed. Check your connection." });
      return;
    }

    if (matches.length === 0) {
      setState({
        kind: "error",
        message: number
          ? `No cards found for number ${number}${name ? ` / "${name}"` : ""}. Reposition and try again, or search manually.`
          : `No cards found for "${name}". Reposition and try again, or search manually.`,
      });
      return;
    }

    camera.stop();
    setState({ kind: "result", matches, ocr: ocrResult });
    setShowAlternatives(false);
  }

  function handleSelectAlternative(match: ScanMatch) {
    setState({
      kind: "result",
      matches: [match, ...((state as { matches: ScanMatch[] }).matches.filter(
        (m) => m.card.id !== match.card.id,
      ))],
      ocr: (state as { ocr: CardOcrResult }).ocr,
    });
    setShowAlternatives(false);
  }

  function handleAddToInventory(match: ScanMatch) {
    setFormError(null);
    setFieldErrors({});
    setState({ kind: "add-form", match });
  }

  function handleDismissResult() {
    setState({ kind: "scanning" });
    setShowAlternatives(false);
    camera.start();
  }

  function handleCancelForm() {
    if (state.kind === "add-form") {
      setState({ kind: "result", matches: [state.match], ocr: { name: "", number: "" } });
    }
  }

  function handleSubmitForm(formData: FormData) {
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await addInventoryItem(formData);
      if (result.ok) {
        const cardName =
          state.kind === "add-form" ? state.match.card.name : "Card";
        setState({ kind: "added", cardName });
        router.refresh();
        // After a brief "Added!" confirmation, resume scanning.
        setTimeout(() => {
          setState({ kind: "scanning" });
          setShowAlternatives(false);
          camera.start();
        }, 1500);
      } else {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  // ---------- Render ----------

  return (
    <div className="space-y-4">
      {state.kind === "idle" && (
        <IdleView onStart={handleStart} />
      )}

      {state.kind === "scanning" && (
        <ScanningView
          videoRef={camera.videoRef}
          cameraReady={camera.ready}
          cameraError={camera.error}
          onCapture={handleCapture}
          onCameraError={handleCameraError}
        />
      )}

      {state.kind === "processing" && (
        <ProcessingView progress={ocr.progress} />
      )}

      {state.kind === "result" && (
        <ResultView
          matches={state.matches}
          ocr={state.ocr}
          showAlternatives={showAlternatives}
          onToggleAlternatives={() => setShowAlternatives((v) => !v)}
          onSelectAlternative={handleSelectAlternative}
          onAddToInventory={handleAddToInventory}
          onDismiss={handleDismissResult}
        />
      )}

      {state.kind === "add-form" && (
        <AddFormView
          match={state.match}
          formError={formError}
          fieldErrors={fieldErrors}
          pending={pending}
          onSubmit={handleSubmitForm}
          onCancel={handleCancelForm}
        />
      )}

      {state.kind === "added" && (
        <AddedView cardName={state.cardName} />
      )}

      {state.kind === "error" && (
        <ErrorView
          message={state.message}
          onRetry={handleStart}
        />
      )}
    </div>
  );
}

// ---------- Sub-views ----------

function IdleView({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Point your camera at a Pokémon card. The app will read the card name and
        look up the current market price.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700"
      >
        Start scanning
      </button>
    </div>
  );
}

function ScanningView({
  videoRef,
  cameraReady,
  cameraError,
  onCapture,
  onCameraError,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraReady: boolean;
  cameraError: ReturnType<typeof useCamera>["error"];
  onCapture: () => void;
  onCameraError: (err: ReturnType<typeof useCamera>["error"]) => void;
}) {
  useEffect(() => {
    if (cameraError) {
      onCameraError(cameraError);
    }
  }, [cameraError, onCameraError]);

  return (
    // Fill the viewport below the header + page title so no scrolling is needed.
    // 9rem ≈ header (44px) + page py-6 top (24px) + h1 (32px) + gap (16px) + buffer
    <div
      className="relative overflow-hidden rounded-xl bg-black"
      style={{ height: "calc(100dvh - 11rem)" }}
    >
      {/* Live camera viewfinder — fills the container, cropped to fit */}
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {/* Guide overlay — two highlighted zones matching the OCR crop regions */}
      {cameraReady && (
        <div className="pointer-events-none absolute inset-0">
          {/* Name zone: top 20% */}
          <div
            className="absolute inset-x-4 rounded-lg border-2 border-yellow-300/80"
            style={{ top: "3%", height: "17%" }}
          >
            <span className="absolute -top-5 left-0 right-0 text-center text-[11px] font-semibold text-yellow-300 drop-shadow">
              Card name
            </span>
          </div>
          {/* Number zone: bottom 18%, above the capture button */}
          <div
            className="absolute inset-x-4 rounded-lg border-2 border-blue-300/80"
            style={{ bottom: "22%", height: "15%" }}
          >
            <span className="absolute -bottom-5 left-0 right-0 text-center text-[11px] font-semibold text-blue-300 drop-shadow">
              Card number
            </span>
          </div>
        </div>
      )}

      {/* Capture button — overlaid at bottom of viewfinder */}
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onCapture}
          disabled={!cameraReady}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg ring-2 ring-red-600 transition active:scale-95 disabled:opacity-40"
          aria-label="Capture"
        >
          <span className="h-10 w-10 rounded-full bg-red-600" />
        </button>
        {cameraReady && (
          <p className="text-xs text-white/70 drop-shadow">
            Tap to identify card
          </p>
        )}
      </div>

      {/* Loading indicator while camera warms up */}
      {!cameraReady && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-white/60">Starting camera…</span>
        </div>
      )}
    </div>
  );
}

function ProcessingView({ progress }: { progress: number }) {
  const pct = Math.round(progress * 100);
  return (
    <div className="space-y-4 py-8 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-red-600" />
      <p className="text-sm font-medium">Identifying card…</p>
      {pct > 0 && (
        <div className="mx-auto max-w-xs">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className="h-full rounded-full bg-red-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ResultView({
  matches,
  ocr,
  showAlternatives,
  onToggleAlternatives,
  onSelectAlternative,
  onAddToInventory,
  onDismiss,
}: {
  matches: ScanMatch[];
  ocr: CardOcrResult;
  showAlternatives: boolean;
  onToggleAlternatives: () => void;
  onSelectAlternative: (m: ScanMatch) => void;
  onAddToInventory: (m: ScanMatch) => void;
  onDismiss: () => void;
}) {
  const primary = matches[0];
  const alternatives = matches.slice(1);

  return (
    <div className="space-y-4">
      {/* Primary result */}
      <div className="flex gap-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
        {primary.card.imageSmall ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primary.card.imageSmall}
            alt={primary.card.name}
            className="h-32 w-auto self-start rounded-lg border border-black/10 dark:border-white/10"
          />
        ) : (
          <div className="h-32 w-24 self-start rounded-lg border border-dashed border-black/20 dark:border-white/20" />
        )}

        <div className="flex flex-1 flex-col gap-2">
          <div>
            <p className="font-semibold">{primary.card.name}</p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {primary.card.setName} · #{primary.card.number}
              {primary.card.rarity ? ` · ${primary.card.rarity}` : ""}
            </p>
          </div>

          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Market price
            </p>
            <p className="text-lg font-semibold">
              {primary.marketPrice != null
                ? `$${primary.marketPrice.toFixed(2)}`
                : "—"}
            </p>
          </div>

          {primary.card.tcgplayerUrl && (
            <a
              href={primary.card.tcgplayerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400"
            >
              View on TCGPlayer →
            </a>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onAddToInventory(primary)}
          className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700"
        >
          Add to inventory
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-black/10 px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          aria-label="Dismiss and scan again"
        >
          ✕
        </button>
      </div>

      {/* Alternatives */}
      {alternatives.length > 0 && (
        <div>
          <button
            type="button"
            onClick={onToggleAlternatives}
            className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            {showAlternatives ? "Hide alternatives" : `Not this card? See ${alternatives.length} other match${alternatives.length > 1 ? "es" : ""}`}
          </button>

          {showAlternatives && (
            <ul className="mt-2 space-y-2">
              {alternatives.map((m) => (
                <li key={m.card.id}>
                  <button
                    type="button"
                    onClick={() => onSelectAlternative(m)}
                    className="flex w-full items-center gap-3 rounded-lg border border-black/10 p-3 text-left transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                  >
                    {m.card.imageSmall && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.card.imageSmall}
                        alt={m.card.name}
                        className="h-12 w-auto rounded"
                      />
                    )}
                    <div className="flex-1 text-sm">
                      <p className="font-medium">{m.card.name}</p>
                      <p className="text-neutral-500 dark:text-neutral-400">
                        {m.card.setName} · #{m.card.number}
                      </p>
                    </div>
                    {m.marketPrice != null && (
                      <span className="text-sm font-medium">
                        ${m.marketPrice.toFixed(2)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(ocr.name || ocr.number) && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          Read:{ocr.name ? ` name &ldquo;${ocr.name}&rdquo;` : ""}{ocr.number ? ` · #${ocr.number}` : ""}
        </p>
      )}
    </div>
  );
}

function AddFormView({
  match,
  formError,
  fieldErrors,
  pending,
  onSubmit,
  onCancel,
}: {
  match: ScanMatch;
  formError: string | null;
  fieldErrors: Record<string, string>;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        ← Back to result
      </button>

      {/* Card preview */}
      <div className="flex items-center gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
        {match.card.imageSmall ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={match.card.imageSmall}
            alt={match.card.name}
            className="h-16 w-auto rounded"
          />
        ) : null}
        <div>
          <p className="font-semibold">{match.card.name}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {match.card.setName} · #{match.card.number}
          </p>
          {match.marketPrice != null && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Market: <span className="font-medium">${match.marketPrice.toFixed(2)}</span>
            </p>
          )}
        </div>
      </div>

      <form action={onSubmit} className="space-y-4">
        <input type="hidden" name="cardId" value={match.card.id} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <Field label="Finish" error={fieldErrors.finish}>
            <select name="finish" defaultValue="NORMAL" className="input-base">
              {FINISHES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>

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
            onClick={onCancel}
            className="rounded-lg border border-black/10 px-4 py-2.5 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function AddedView({ cardName }: { cardName: string }) {
  return (
    <div className="py-10 text-center space-y-2">
      <p className="text-3xl">✓</p>
      <p className="font-semibold">{cardName} added!</p>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Resuming scanner…
      </p>
    </div>
  );
}

function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-dashed border-black/15 p-6 dark:border-white/15">
      <p className="text-sm text-neutral-700 dark:text-neutral-300">{message}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
        >
          Try again
        </button>
        <a
          href="/add"
          className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
        >
          Search manually
        </a>
      </div>
    </div>
  );
}

// ---------- Shared Field wrapper (mirrors add-card-client.tsx) ----------

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
