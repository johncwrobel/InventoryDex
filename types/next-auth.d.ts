import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Extend Auth.js's built-in Session type to include the fields we add in
 * the session callback (id and role come from the Prisma User row).
 *
 * We intentionally do NOT augment `interface User` here — doing so causes
 * a type conflict between the two `@auth/core` versions bundled by
 * `next-auth` and `@auth/prisma-adapter`, because `AdapterUser` would then
 * require `role` but the adapter's `createUser` return type doesn't include
 * it. The role is read via a cast in the session callback instead.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}
