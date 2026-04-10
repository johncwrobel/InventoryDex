import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Auth.js v5 configuration for TCG Inventory Tool.
 *
 * - Passwordless magic-link sign-in via Resend.
 * - Prisma adapter persists users, sessions, and verification tokens.
 * - Access is gated by an explicit allowlist (`ALLOWED_EMAILS`); any email
 *   outside the allowlist is rejected at the `signIn` callback, which
 *   redirects the user to `/not-invited`.
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
     * Enforce the allowlist. Returning `false` here aborts the sign-in
     * and redirects the user to the `error` page (`/not-invited`).
     */
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      return env.ALLOWED_EMAILS.includes(email);
    },
    /**
     * Expose the user's id on the session object so server components
     * can scope queries without an extra DB round-trip.
     */
    async session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
}));
