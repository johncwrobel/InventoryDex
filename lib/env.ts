import { z } from "zod";

/**
 * Centralized, validated environment variable access.
 *
 * Import `env` from this module instead of reading `process.env` directly.
 * Any missing/malformed value fails fast at startup with a readable error.
 *
 * When adding a new variable: add it to the schema below AND document it
 * in `.env.example`.
 */
const serverSchema = z.object({
  // --- Database ---
  DATABASE_URL: z.string().url({ error: "DATABASE_URL must be a valid connection string" }),

  // --- Auth.js ---
  // Secret used to sign session JWTs. Generate with: openssl rand -base64 32
  AUTH_SECRET: z.string().min(1, { error: "AUTH_SECRET is required" }),
  // Resend API key for sending magic-link emails.
  AUTH_RESEND_KEY: z.string().min(1, { error: "AUTH_RESEND_KEY is required" }),
  // Verified sender address for magic-link emails (e.g. "Inventory <noreply@yourdomain.com>").
  AUTH_EMAIL_FROM: z.string().min(1, { error: "AUTH_EMAIL_FROM is required" }),

  // --- Access control ---
  // Comma-separated allowlist of emails permitted to sign in.
  ALLOWED_EMAILS: z
    .string()
    .min(1, { error: "ALLOWED_EMAILS must contain at least one address" })
    .transform((raw) =>
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),

  // --- Cron ---
  // Shared secret that protects the price-refresh cron endpoint.
  CRON_SECRET: z.string().min(16, { error: "CRON_SECRET should be at least 16 characters" }),

  // --- Pokémon TCG API ---
  // Optional API key — pokemontcg.io works without one but with stricter rate limits.
  POKEMONTCG_API_KEY: z.string().optional(),

  // --- Pricing thresholds ---
  // Minimum absolute % change in market price (over 7 days) that triggers a
  // recent-change badge on the inventory list. Default: 5 (= ±5%).
  PRICE_CHANGE_THRESHOLD_PCT: z.coerce.number().min(0).max(100).default(5),
  // Minimum % gap between list price and market price that flags a row as
  // underpriced or overpriced. Default: 15 (= 15%).
  LIST_PRICE_THRESHOLD_PCT: z.coerce.number().min(0).max(100).default(15),

  // --- Runtime ---
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

function loadEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

// Lazy-loaded so that importing this module in a client component doesn't
// crash the build. Auth.js and Prisma both read env during server-only work.
let cached: ServerEnv | undefined;
export const env = new Proxy({} as ServerEnv, {
  get(_target, key: string) {
    if (!cached) cached = loadEnv();
    return cached[key as keyof ServerEnv];
  },
});
