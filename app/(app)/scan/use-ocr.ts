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
 * OCR strategy:
 *   - Crop to the top 30% of the frame (the guide overlay marks this region).
 *   - Convert to grayscale and auto-invert dark-background cards so Tesseract
 *     always receives dark-text-on-light regardless of card type.
 *   - Scale the crop up 2× before OCR — Tesseract accuracy improves
 *     significantly with larger text.
 *   - PSM 6 (uniform block of text) — more robust than PSM 7 (single line)
 *     when the crop might contain the name line plus a subtitle/type line.
 *   - No character whitelist — Pokemon card names include accented chars (é),
 *     colons (Type: Null), hyphens, numbers, etc. A whitelist causes misses.
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
      // PSM 6 = assume a uniform block of text. More forgiving than PSM 7
      // (single line) when the crop includes a type/subtype line below the name.
      // @ts-expect-error — tesseract.js types don't expose PSM constants
      tessedit_pageseg_mode: "6",
      // No whitelist — card names include characters not in plain ASCII:
      // é, -, :, (, ), numbers, etc. Trust Tesseract's own filtering.
    });
    workerRef.current = worker;
    return worker;
  }, []);

  const recognize = useCallback(
    async (blob: Blob): Promise<string> => {
      setBusy(true);
      setProgress(0);
      try {
        const preprocessed = await preprocessImage(blob);
        const worker = await getWorker();
        const { data } = await worker.recognize(preprocessed);
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

/**
 * Preprocess a camera frame for OCR:
 *   1. Crop to the top 30% (matches the guide zone in the UI).
 *   2. Scale up 2× so Tesseract has larger text to work with.
 *   3. Convert to grayscale.
 *   4. Auto-invert if the background is dark (dark-type, psychic cards, etc.)
 *      so Tesseract always sees dark text on a light background.
 */
async function preprocessImage(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const cropHeight = Math.floor(img.height * 0.30);
      const scale = 2;

      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = cropHeight * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(blob);
        return;
      }

      // Draw the top 30% of the image scaled up 2×.
      ctx.drawImage(
        img,
        0, 0, img.width, cropHeight,   // source rect
        0, 0, canvas.width, canvas.height, // dest rect
      );

      // Convert to grayscale via pixel manipulation.
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      let totalLuminance = 0;

      for (let i = 0; i < data.length; i += 4) {
        // Standard luminance weights (Rec. 709)
        const gray = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
        totalLuminance += gray;
      }

      // If the average luminance is below 110 the background is dark — invert
      // so Tesseract sees dark text on a light background in all cases.
      const avgLuminance = totalLuminance / (canvas.width * canvas.height);
      if (avgLuminance < 110) {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i];
          data[i + 1] = 255 - data[i + 1];
          data[i + 2] = 255 - data[i + 2];
        }
      }

      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else resolve(blob);
        },
        "image/png", // PNG avoids JPEG compression artifacts on text edges
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for preprocessing"));
    };

    img.src = url;
  });
}

/**
 * Clean raw OCR output into a usable card-name search string.
 *
 * - Take the first non-empty line (the card name is always the topmost text)
 * - Strip trailing HP numbers like "120" or "120 HP"
 * - Collapse multiple spaces, trim
 * - Remove stray single characters that are OCR noise
 */
function cleanOcrText(raw: string): string {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 1); // discard single-char lines (OCR noise)

  if (lines.length === 0) return "";

  // The card name is the first substantive line. Subsequent lines are the
  // stage/type line ("Stage 1", "Basic Pokémon", etc.) — discard them.
  const firstLine = lines[0];

  return firstLine
    .replace(/\s+\d+\s*HP\s*$/i, "") // strip "120 HP" suffix
    .replace(/\s+\d+$/, "")           // strip trailing lone numbers
    .replace(/\s{2,}/g, " ")
    .trim();
}
