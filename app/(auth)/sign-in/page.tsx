import { signIn } from "@/lib/auth";

type SearchParams = Promise<{ "check-email"?: string }>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const checkEmail = params["check-email"] === "1";

  async function signInAction(formData: FormData) {
    "use server";
    await signIn("resend", {
      email: formData.get("email"),
      redirectTo: "/inventory",
    });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-red-600">
            InventoryDex
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Sign in with a magic link.
          </p>
        </div>

        {checkEmail ? (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            Check your inbox — we sent you a sign-in link.
          </div>
        ) : (
          <form action={signInAction} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="block w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-base shadow-sm outline-none transition focus:border-red-400/50 focus:ring-2 focus:ring-red-500/20 dark:border-white/15 dark:bg-neutral-800"
                placeholder="you@example.com"
              />
            </label>
            <button
              type="submit"
              className="block w-full rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 active:scale-[0.98]"
            >
              Send magic link
            </button>
          </form>
        )}

        <p className="text-center text-xs text-neutral-500">
          Invite-only. If you haven&apos;t been added to the allowlist, you
          won&apos;t be able to sign in.
        </p>
      </div>
    </main>
  );
}
