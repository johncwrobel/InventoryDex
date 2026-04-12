import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAdminData } from "@/lib/admin-actions";
import { AdminClient } from "./admin-client";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") notFound();

  const data = await getAdminData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-xs text-neutral-500">
          {data.usedSlots} / {data.totalSlots} beta slots used
        </p>
      </div>
      <AdminClient {...data} />
    </div>
  );
}
