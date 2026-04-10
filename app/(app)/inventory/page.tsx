import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function InventoryPage() {
  const session = await auth();
  // The (app) layout already guarantees a session; the `!` is safe here.
  const userId = session!.user!.id;

  const items = await prisma.inventoryItem.findMany({
    where: { userId },
    include: { card: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (items.length === 0) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">No cards yet</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Your inventory is empty. Add your first card to get started.
          </p>
        </div>
        <Link
          href="/add"
          className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
        >
          Add a card
        </Link>
      </div>
    );
  }

  // Milestone 2 will replace this with the real inventory table /
  // mobile card layout. This is just a placeholder row dump so the
  // page renders something meaningful once a card has been added.
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <Link
          href="/add"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Add
        </Link>
      </div>
      <ul className="divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
        {items.map((item) => (
          <li key={item.id} className="p-3 text-sm">
            <div className="font-medium">{item.card.name}</div>
            <div className="text-neutral-500">
              {item.card.setName} · {item.condition} · qty {item.quantity}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
