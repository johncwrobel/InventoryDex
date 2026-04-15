"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSealedItem } from "@/lib/sealed-actions";

export function SealedDeleteButton({
  itemId,
  itemName,
}: {
  itemId: string;
  itemName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Remove "${itemName}" from inventory?`)) return;
    setError(null);
    const fd = new FormData();
    fd.set("itemId", itemId);
    startTransition(async () => {
      const result = await deleteSealedItem(fd);
      if (result.ok) {
        router.push("/inventory");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="rounded-lg border border-red-600/40 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
      >
        {pending ? "Removing…" : "Remove from inventory"}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
