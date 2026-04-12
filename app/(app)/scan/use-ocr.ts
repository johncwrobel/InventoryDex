"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { Worker } from "tesseract.js";

export interface CardOcrResult {
  /** Best-effort card name from the top of the card. Empty string if unreadable. */
  name: string;
  /** Collector number (numerator only, e.g. "025") from the bottom of the card. Empty if unreadable. */
  number: string;
}

interface UseOcrReturn {
  recognizeCard: (blob: Blob) => Promise<CardOcrResult>;
  progress: number; // 0–1
  busy: boolean;
}

/**
 * Dual-pass OCR strategy for Pokémon cards:
 *
 * Pass 1 — Card number (bottom 18% of frame, PSM 7 single-line, digits-only whitelist)
 *   The collector number "025/165" uses plain numerals — a reliable OCR target.
 *   We extract only the numerator ("025") which is what pokemontcg.io searches by.
 *
 * Pass 2 — Card name (top 20% of frame, PSM 6 text block, no whitelist)
 *   The name uses a stylised font so results are best-effort. Even a partial
 *   match narrows the search considerably when combined with the number.
 *
 * Both crops are converted to grayscale and auto-inverted for dark-background
 * cards before being passed to Tesseract.
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

        setProgress(0.5);

        // ── Pass 2: card name from top ────────────────────────────────────────
        // No whitelist so accented chars, hyphens, colons etc. are preserved.
        // PSM 6 (uniform block) is more forgiving than PSM 7 for styled text.
        // @ts-expect-error tesseract.js types don't expose PSM constants
        await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
        const topCrop = await preprocessRegion(blob, "top");
        const { data: topData } = await worker.recognize(topCrop);
        const name = cleanNameText(topData.text);

        return { name, number };
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
 *   - "bottom" → bottom 18% of frame (collector number)
 * Steps: crop → scale 2× → grayscale → auto-invert if dark background → PNG
 */
async function preprocessRegion(blob: Blob, region: "top" | "bottom"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const fraction = region === "top" ? 0.20 : 0.18;
      const cropH = Math.floor(img.height * fraction);
      const srcY = region === "top" ? 0 : img.height - cropH;
      const scale = 2;

      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = cropH * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(blob); return; }

      ctx.drawImage(img, 0, srcY, img.width, cropH, 0, 0, canvas.width, canvas.height);

      // Grayscale + auto-invert
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      let total = 0;
      for (let i = 0; i < d.length; i += 4) {
        const g = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
        d[i] = d[i + 1] = d[i + 2] = g;
        total += g;
      }
      if (total / (canvas.width * canvas.height) < 110) {
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
 * e.g. "025/165" → "025", "  4/102 " → "4", "SWSH001" → "" (promo — skip)
 * Strips leading zeros to match pokemontcg.io's number field (which stores "25" not "025").
 */
function extractCardNumber(raw: string): string {
  const match = raw.replace(/\s/g, "").match(/^(\d{1,3})\/\d{1,3}$/);
  if (!match) return "";
  // pokemontcg.io stores numbers without leading zeros for most cards.
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
