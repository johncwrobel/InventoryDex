import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

/**
 * Layout for the authenticated app surface.
 *
 * Any request to a route under `(app)/` is gated here: if there's no active
 * session we redirect to the sign-in page. The sign-in flow sends users back
 * to `/inventory` on success.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/sign-in" });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-red-600 dark:bg-red-700">
        {/*
          Two-row on mobile, single row on sm+:
            Mobile row 1: brand (left) + sign out (right)
            Mobile row 2: nav links (full width)
            Desktop: brand → nav links → sign out, all inline
        */}
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-2 gap-y-0 px-4 py-2">
          {/* Brand — always first, pushes sign-out to the right on mobile */}
          <Link
            href="/inventory"
            className="mr-auto text-base font-bold tracking-tight text-white"
          >
            InventoryDex
          </Link>

          {/* Sign out — row 1 right on mobile (order-2), end of row on desktop (order-3) */}
          <form action={signOutAction} className="order-2 sm:order-3">
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/15 hover:text-white"
            >
              Sign out
            </button>
          </form>

          {/* Nav links — own row on mobile (w-full + order-3), inline on desktop (w-auto + order-2) */}
          <nav className="order-3 flex w-full items-center gap-1 border-t border-red-500/40 pt-1 text-sm sm:order-2 sm:w-auto sm:border-0 sm:pt-0">
            <Link
              href="/inventory"
              className="rounded-md px-3 py-1.5 text-white/90 hover:bg-white/15"
            >
              Inventory
            </Link>
            <Link
              href="/add"
              className="rounded-md px-3 py-1.5 text-white/90 hover:bg-white/15"
            >
              Add
            </Link>
            <Link
              href="/scan"
              className="rounded-md px-3 py-1.5 text-white/90 hover:bg-white/15"
            >
              Scan
            </Link>
            {session.user.role === "ADMIN" && (
              <Link
                href="/admin"
                className="rounded-md px-3 py-1.5 text-white/90 hover:bg-white/15"
              >
                Admin
              </Link>
            )}
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
    </div>
  );
}
