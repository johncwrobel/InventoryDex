import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Root: bounce authenticated users into their inventory, everyone else
 * into the sign-in flow. The protected `(app)/` routes do their own
 * session check, so the redirect here is just a quality-of-life entry
 * point.
 */
export default async function Home() {
  const session = await auth();
  redirect(session?.user ? "/inventory" : "/sign-in");
}
