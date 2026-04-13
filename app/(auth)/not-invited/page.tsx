import Link from "next/link";

type SearchParams = Promise<{ reason?: string }>;

const messages: Record<string, { heading: string; body: string }> = {
  "no-invite": {
    heading: "No invite found",
    body: "The email you used isn't on the access list. Ask an admin to send you an invite, then try signing in again.",
  },
  invalid: {
    heading: "Something went wrong",
    body: "We couldn't verify your sign-in link. It may have expired — request a new one below.",
  },
};

const fallback = {
  heading: "Not invited yet",
  body: "This app is invite-only. If you should have access, ask an administrator to send you an invite.",
};

export default async function NotInvitedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { reason } = await searchParams;
  const { heading, body } = (reason && messages[reason]) ?? fallback;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-black/10 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{body}</p>
        <Link
          href="/sign-in"
          className="inline-block rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          Try a different email
        </Link>
      </div>
    </main>
  );
}
