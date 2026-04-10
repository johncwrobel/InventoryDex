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
      <header className="sticky top-0 z-10 border-b border-black/10 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-neutral-950/80">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/inventory" className="text-base font-semibold tracking-tight">
            TCG Inventory
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/inventory"
              className="rounded-md px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Inventory
            </Link>
            <Link
              href="/add"
              className="rounded-md px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Add
            </Link>
            <Link
              href="/scan"
              className="rounded-md px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Scan
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="ml-2 rounded-md px-3 py-1.5 text-neutral-600 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
    </div>
  );
}
