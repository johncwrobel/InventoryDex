"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { Worker } from "tesseract.js";

export interface CardOcrResult {
  /** Best-effort card name from the top of the card. Empty string if unreadable. */
  name: string;
  /** Collector number (numerator only, e.g. "25") from the bottom of the card. Empty if unreadable. */
  number: string;
  /**
   * Distinctive words extracted from the card body text (attacks, abilities, flavor text).
   * These use regular fonts and OCR reliably. Used to re-rank candidates when the name is ambiguous.
   *
   * Approach inspired by prateekt/pokemon-card-recognizer (GPL-3.0, Prateek Tandon):
   * https://github.com/prateekt/pokemon-card-recognizer
   * Core insight: body text is in plain fonts → higher OCR accuracy → strong identification signal.
   */
  bodyWords: string[];
}

interface UseOcrReturn {
  recognizeCard: (blob: Blob) => Promise<CardOcrResult>;
  progress: number; // 0–1
  busy: boolean;
}

/**
 * Three-pass OCR strategy for Pokémon cards:
 *
 * Pass 1 — Card number (bottom 18%, PSM 7 single-line, digits-only whitelist)
 *   The collector number "025/165" uses plain numerals — the most reliable OCR target.
 *
 * Pass 2 — Body text (middle 55–87%, PSM 6 uniform block, no whitelist)
 *   Attack names, ability text, and flavor text appear in standard fonts well-suited to
 *   OCR. Extracting distinctive words here provides a strong secondary identification
 *   signal even when the stylised name is misread.
 *
 * Pass 3 — Card name (top 20%, PSM 6 text block, no whitelist)
 *   The name uses a decorative font so results are best-effort. Still useful as a
 *   tiebreaker when combined with number and body words.
 *
 * Body/name crops are converted to grayscale. The number and body crops do not
 * auto-invert (dark background is rare for those regions). The name region retains
 * auto-invert for dark-background cards.
 */
export function useOcr(): UseOcrReturn {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const getWorker = useCallback(async (): Promise<Worker> => {
    if (workerRef.current) return workerRef.current;
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") {
          setProgress(m.progress);
        }
      },
    });
    workerRef.current = worker;
    return worker;
  }, []);

  const recognizeCard = useCallback(
    async (blob: Blob): Promise<CardOcrResult> => {
      setBusy(true);
      setProgress(0);
      try {
        const worker = await getWorker();

        // ── Pass 1: card number from bottom ──────────────────────────────────
        // Digits-only whitelist + PSM 7 (single line) = high accuracy for numerals.
        // @ts-expect-error tesseract.js types don't expose PSM constants
        await worker.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789/" });
        const bottomCrop = await preprocessRegion(blob, "bottom");
        const { data: bottomData } = await worker.recognize(bottomCrop);
        const number = extractCardNumber(bottomData.text);

        setProgress(0.33);

        // ── Pass 2: body text from the middle region ──────────────────────────
        // Attack/ability/flavor text uses regular fonts → reliable OCR.
        // PSM 6 (uniform block) handles multi-line text well.
        // No whitelist preserves all characters including hyphens and apostrophes.
        // @ts-expect-error tesseract.js types don't expose PSM constants
        await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
        const bodyCrop = await preprocessRegion(blob, "body");
        const { data: bodyData } = await worker.recognize(bodyCrop);
        const bodyWords = extractBodyWords(bodyData.text);

        setProgress(0.66);

        // ── Pass 3: card name from top ────────────────────────────────────────
        // No whitelist so accented chars, hyphens, colons etc. are preserved.
        // @ts-expect-error tesseract.js types don't expose PSM constants
        await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
        const topCrop = await preprocessRegion(blob, "top");
        const { data: topData } = await worker.recognize(topCrop);
        const name = cleanNameText(topData.text);

        return { name, number, bodyWords };
      } finally {
        setBusy(false);
        setProgress(0);
      }
    },
    [getWorker],
  );

  useEffect(() => {
    return () => { workerRef.current?.terminate(); };
  }, []);

  return { recognizeCard, progress, busy };
}

// ---------- Image preprocessing ----------

/**
 * Crop + preprocess a region of a camera-frame Blob for OCR:
 *   - "top"    → top 20% of frame  (card name)
 *   - "body"   → 55–87% of frame   (attacks, abilities, flavor text)
 *   - "bottom" → bottom 18% of frame (collector number)
 * Steps: crop → scale 2× → grayscale → auto-invert if dark background (top/bottom only) → PNG
 */
async function preprocessRegion(blob: Blob, region: "top" | "body" | "bottom"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let cropH: number;
      let srcY: number;

      if (region === "top") {
        cropH = Math.floor(img.height * 0.20);
        srcY = 0;
      } else if (region === "body") {
        const startFraction = 0.55;
        const endFraction = 0.87;
        srcY = Math.floor(img.height * startFraction);
        cropH = Math.floor(img.height * (endFraction - startFraction));
      } else {
        cropH = Math.floor(img.height * 0.18);
        srcY = img.height - cropH;
      }

      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = cropH * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(blob); return; }

      ctx.drawImage(img, 0, srcY, img.width, cropH, 0, 0, canvas.width, canvas.height);

      // Grayscale
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      let total = 0;
      for (let i = 0; i < d.length; i += 4) {
        const g = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
        d[i] = d[i + 1] = d[i + 2] = g;
        total += g;
      }

      // Auto-invert only for top/bottom — body text is nearly always dark-on-light.
      if (region !== "body" && total / (canvas.width * canvas.height) < 110) {
        for (let i = 0; i < d.length; i += 4) {
          d[i] = 255 - d[i];
          d[i + 1] = 255 - d[i + 1];
          d[i + 2] = 255 - d[i + 2];
        }
      }
      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob((result) => resolve(result ?? blob), "image/png");
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ---------- Text cleaning ----------

/**
 * Extract the collector number numerator from raw OCR output.
 * e.g. "025/165" → "25", "  4/102 " → "4", "SWSH001" → "" (promo — skip)
 * Strips leading zeros to match pokemontcg.io's number field.
 */
function extractCardNumber(raw: string): string {
  const match = raw.replace(/\s/g, "").match(/^(\d{1,3})\/\d{1,3}$/);
  if (!match) return "";
  return String(parseInt(match[1], 10));
}

/**
 * Clean the name OCR output: first substantive line, strip HP suffix, collapse spaces.
 */
function cleanNameText(raw: string): string {
  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 1);
  if (!lines.length) return "";
  return lines[0]
    .replace(/\s+\d+\s*HP\s*$/i, "")
    .replace(/\s+\d+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Words that appear on nearly every Pokémon card and carry no identification value.
 * Filtering these out leaves only the distinctive words that differ card-to-card.
 *
 * Based on the vocabulary-rarity approach in prateekt/pokemon-card-recognizer:
 * https://github.com/prateekt/pokemon-card-recognizer
 */
const BODY_STOP_WORDS = new Set([
  // Common English
  "the", "and", "for", "you", "your", "this", "that", "with", "from", "then",
  "when", "have", "does", "more", "also", "than", "into", "once", "until",
  "after", "before", "between", "during",
  // Universal TCG mechanics
  "pokemon", "pokémon", "attack", "attacks", "energy", "damage", "discard",
  "deck", "hand", "card", "cards", "bench", "benched", "active", "prize",
  "player", "opponent", "each", "flip", "coin", "heads", "tails", "turn",
  "during", "next", "your", "their", "itself", "that", "this", "those",
  "cannot", "does", "dont", "put", "take", "move", "come", "even", "only",
  "instead", "both", "other", "must", "may", "time", "asleep", "confused",
  "paralyzed", "poisoned", "burned", "special", "basic", "stage", "evolve",
  "evolution", "evolved", "retreat", "cost", "type", "water", "fire", "grass",
  "lightning", "psychic", "fighting", "darkness", "metal", "fairy", "dragon",
  "colorless", "trainer", "supporter", "stadium", "item", "tool",
]);

/**
 * Extract distinctive words from card body text (attack/ability/flavor text).
 * Returns up to 10 lowercase tokens ≥ 4 chars that are not stop words.
 *
 * Inspiration: prateekt/pokemon-card-recognizer's shared-word scoring approach —
 * body text words are far more reliable OCR targets than the stylised card name.
 */
function extractBodyWords(raw: string): string[] {
  const tokens = raw
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 4 && !BODY_STOP_WORDS.has(w) && /^[a-z]/.test(w));

  // Deduplicate while preserving order.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t);
      unique.push(t);
    }
    if (unique.length >= 10) break;
  }
  return unique;
}
