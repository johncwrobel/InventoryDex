import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Auth.js v5 configuration for InventoryDex.
 *
 * - Passwordless magic-link sign-in via Resend.
 * - Prisma adapter persists users, sessions, and verification tokens.
 * - Access is controlled in two ways:
 *     1. ALLOWED_EMAILS (env var) — admin accounts, always allowed. On first
 *        sign-in these users are automatically promoted to Role.ADMIN.
 *     2. Invite table — any other email that an admin has explicitly invited
 *        via the /admin UI. The invite row is stamped with `acceptedAt` when
 *        the invited user signs in for the first time.
 *   Any email outside both lists is rejected and redirected to /not-invited.
 */
// Lazy initialization: Auth.js v5 calls this function per request, which
// defers env-var access to runtime. Without this, `next build` would fail
// because env vars aren't present during static analysis.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  secret: env.AUTH_SECRET,
  providers: [
    Resend({
      apiKey: env.AUTH_RESEND_KEY,
      from: env.AUTH_EMAIL_FROM,
    }),
  ],
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in?check-email=1",
    error: "/not-invited",
  },
  callbacks: {
    /**
     * Enforce access control. Returning `false` aborts the sign-in and
     * redirects the user to the `error` page (/not-invited).
     *
     * Admin path: email is in ALLOWED_EMAILS → allow and promote to ADMIN.
     * Invite path: a pending Invite row exists → allow and consume the invite.
     * Otherwise: reject.
     */
    async signIn({ user, email: emailParams }) {
      const email = user.email?.toLowerCase();
      if (!email) return "/not-invited?reason=invalid";

      // Auth.js calls signIn twice for magic-link flows:
      //   1. verificationRequest=true  → user submitted their email, link not yet clicked
      //   2. verificationRequest falsy → user clicked the link, actual sign-in
      // We must allow both phases through for allowed users, but only consume
      // the invite (stamp acceptedAt) on the actual sign-in, not on step 1.
      // If we stamp on step 1, the step-2 lookup finds acceptedAt is set and
      // rejects the user as "no invite found".
      const isVerificationRequest = emailParams?.verificationRequest === true;

      // Admin path: ALLOWED_EMAILS are always permitted and auto-promoted.
      if (env.ALLOWED_EMAILS.includes(email)) {
        if (!isVerificationRequest) {
          await prisma.user.upsert({
            where: { email },
            create: { email, role: "ADMIN" },
            update: { role: "ADMIN" },
          });
        }
        return true;
      }

      // Invite path: verify a pending invite exists. Only consume it (stamp
      // acceptedAt) on the actual sign-in click, not on the request phase.
      const invite = await prisma.invite.findFirst({
        where: { email, acceptedAt: null },
      });
      if (!invite) return "/not-invited?reason=no-invite";

      if (!isVerificationRequest) {
        await prisma.invite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });
      }
      return true;
    },

    /**
     * Expose the user's id and role on the session object so server
     * components can scope queries and check permissions without extra
     * DB round-trips.
     */
    async session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
        // @auth/prisma-adapter only exposes standard AdapterUser fields (id,
        // email, emailVerified, name, image) — custom columns like `role` are
        // not included. Fetch role explicitly from the DB instead of casting.
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        session.user.role = dbUser?.role ?? "USER";
      }
      return session;
    },
  },
}));
