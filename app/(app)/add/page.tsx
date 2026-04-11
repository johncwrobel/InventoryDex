import { AddCardClient } from "./add-card-client";

export default function AddPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Add a card</h1>
      <AddCardClient />
    </div>
  );
}
