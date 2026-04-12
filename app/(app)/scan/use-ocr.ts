"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { Worker } from "tesseract.js";

interface UseOcrReturn {
  recognize: (blob: Blob) => Promise<string>;
  progress: number; // 0–1
  busy: boolean;
}

/**
 * Wraps Tesseract.js with lazy worker initialization.
 *
 * The worker is created on the first recognize() call so the heavy WASM load
 * doesn't happen until the user actually tries to scan a card.
 *
 * OCR strategy:
 *   - Crop the image to the top 25% before running OCR. Pokemon card names
 *     are printed at the top of every card in large text. Cropping reduces
 *     noise from artwork and dramatically improves speed and accuracy.
 *   - Use PSM 7 (single text line) — the name is one line.
 *   - Clean the result: take the first non-empty line, strip trailing numbers
 *     (HP values like "120 HP" can appear in the crop) and trim whitespace.
 */
export function useOcr(): UseOcrReturn {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const getWorker = useCallback(async (): Promise<Worker> => {
    if (workerRef.current) return workerRef.current;

    // Dynamic import keeps Tesseract.js out of the initial bundle.
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") {
          setProgress(m.progress);
        }
      },
    });
    await worker.setParameters({
      // PSM 7 = treat image as a single text line.
      // @ts-expect-error — tesseract.js types don't expose PSM constants
      tessedit_pageseg_mode: "7",
      // Limit character set to printable ASCII to reduce noise.
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '-.",
    });
    workerRef.current = worker;
    return worker;
  }, []);

  const recognize = useCallback(
    async (blob: Blob): Promise<string> => {
      setBusy(true);
      setProgress(0);
      try {
        // Crop to the top 25% of the image using an offscreen canvas.
        const croppedBlob = await cropTopQuarter(blob);
        const worker = await getWorker();
        const { data } = await worker.recognize(croppedBlob);
        return cleanOcrText(data.text);
      } finally {
        setBusy(false);
        setProgress(0);
      }
    },
    [getWorker],
  );

  // Terminate the worker on unmount to free WASM memory.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  return { recognize, progress, busy };
}

/** Crop a Blob image to its top 25% using an offscreen canvas. */
async function cropTopQuarter(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const cropHeight = Math.floor(img.height * 0.25);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = cropHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(blob); // fall back to full image if canvas unavailable
        return;
      }
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width, cropHeight);
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else resolve(blob);
      }, "image/jpeg", 0.9);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for cropping"));
    };

    img.src = url;
  });
}

/**
 * Clean raw OCR output into a usable card-name search string.
 *
 * - Take the first non-empty line (the card name is always on one line)
 * - Strip trailing HP numbers like " 120" or "120 HP"
 * - Collapse multiple spaces, trim
 */
function cleanOcrText(raw: string): string {
  const firstLine = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);

  if (!firstLine) return "";

  return firstLine
    .replace(/\s+\d+\s*HP\s*$/i, "") // strip "120 HP" suffix
    .replace(/\s+\d+$/, "")           // strip trailing lone numbers
    .replace(/\s{2,}/g, " ")
    .trim();
}
