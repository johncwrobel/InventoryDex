import { AddCardClient } from "./add-card-client";

type SearchParams = Promise<{ type?: string }>;

export default async function AddPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { type } = await searchParams;
  const defaultTab = type === "sealed" ? "sealed" : "card";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Add to inventory</h1>
      <AddCardClient defaultTab={defaultTab} />
    </div>
  );
}
