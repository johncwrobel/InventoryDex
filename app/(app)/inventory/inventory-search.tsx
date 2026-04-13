"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

export function InventorySearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setValue(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) {
        params.set("q", q);
      } else {
        params.delete("q");
      }
      // Reset to page 1 on new search; preserve sort/filter/dir
      router.replace(`/inventory?${params.toString()}`);
    }, 300);
  }

  function handleClear() {
    setValue("");
    if (timer.current) clearTimeout(timer.current);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    router.replace(`/inventory?${params.toString()}`);
  }

  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={handleChange}
        placeholder="Search cards or sets…"
        className="input-base w-full pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}
