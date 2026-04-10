import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /**
   * Augments the default Auth.js session so `session.user.id` is always
   * typed as a string on the server. The id is attached in the
   * `session` callback in `lib/auth.ts`.
   */
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
