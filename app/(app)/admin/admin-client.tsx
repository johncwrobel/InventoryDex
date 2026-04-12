"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteUser, revokeUser } from "@/lib/admin-actions";
import type { AdminUserView, AdminInviteView } from "@/lib/admin-actions";

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------- Invite form ----------

function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const fd = new FormData();
    fd.set("email", email);
    startTransition(async () => {
      const result = await inviteUser(fd);
      if (result.ok) {
        setSuccess(true);
        setEmail("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2">
      <div className="flex-1">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          required
          className="input-base w-full"
          disabled={pending}
        />
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        {success && (
          <p className="mt-1 text-xs text-green-700 dark:text-green-400">
            Invite sent — they can now sign in and will receive an email.
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending || !email}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
      >
        Invite
      </button>
    </form>
  );
}

// ---------- Revoke button ----------

function RevokeButton({
  userId,
  inviteId,
  label,
}: {
  userId?: string;
  inviteId?: string;
  label: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRevoke() {
    if (!confirm(`Remove ${label}? This cannot be undone.`)) return;
    setError(null);
    const fd = new FormData();
    if (userId) fd.set("userId", userId);
    if (inviteId) fd.set("inviteId", inviteId);
    startTransition(async () => {
      const result = await revokeUser(fd);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <span>
      <button
        type="button"
        onClick={handleRevoke}
        disabled={pending}
        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
      >
        Revoke
      </button>
      {error && <span className="ml-1 text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}

// ---------- Main admin client component ----------

export function AdminClient({
  users,
  invites,
  totalSlots,
  usedSlots,
}: {
  users: AdminUserView[];
  invites: AdminInviteView[];
  totalSlots: number;
  usedSlots: number;
}) {
  const remaining = totalSlots - usedSlots;

  return (
    <div className="space-y-8">
      {/* Invite new user */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Invite a user
        </h2>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          {remaining > 0 ? (
            <InviteForm />
          ) : (
            <p className="text-sm text-neutral-500">
              Beta cap reached ({totalSlots} / {totalSlots}). Remove a user to free a slot.
            </p>
          )}
        </div>
      </section>

      {/* Active users */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Active users ({users.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-red-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-red-950/20">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-black/10 dark:border-white/10"
                >
                  <td className="px-4 py-2 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-2 text-neutral-500">{u.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    {u.role === "ADMIN" ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
                        Admin
                      </span>
                    ) : (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-white/10 dark:text-neutral-400">
                        User
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-500">
                    {formatDate(u.joinedAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {u.role !== "ADMIN" && (
                      <RevokeButton userId={u.id} label={u.email} />
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-neutral-500">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pending invites */}
      {invites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Pending invites ({invites.length})
          </h2>
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-red-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-red-950/20">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Invited by</th>
                  <th className="px-4 py-2 font-medium">Invited</th>
                  <th className="px-4 py-2 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-t border-black/10 dark:border-white/10"
                  >
                    <td className="px-4 py-2 font-mono text-xs">{inv.email}</td>
                    <td className="px-4 py-2 text-xs text-neutral-500">
                      {inv.inviterEmail ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-neutral-500">
                      {formatDate(inv.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <RevokeButton inviteId={inv.id} label={inv.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
