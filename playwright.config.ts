import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for InventoryDex smoke tests.
 *
 * Runs against the production build (`next start`) so tests exercise the same
 * code that ships to Vercel. Start the server manually before running, or let
 * Playwright's webServer block handle it automatically.
 *
 * Run:
 *   npx playwright install chromium   # first time only
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "iPhone 14",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Automatically build + start the app if no server is already running.
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
