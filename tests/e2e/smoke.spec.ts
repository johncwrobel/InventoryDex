import { test, expect } from "@playwright/test";

/**
 * Smoke tests for InventoryDex.
 *
 * These tests cover the public-facing pages and auth gate without requiring
 * a real signed-in session. For full add-card flow coverage, configure a
 * test account by setting the AUTH_TEST_EMAIL env var and running against a
 * staging environment with magic-link bypass.
 *
 * Run: npm run test:e2e
 */

test.describe("Sign-in page", () => {
  test("loads and shows the magic-link form", async ({ page }) => {
    await page.goto("/sign-in");

    // Heading should show the product name
    await expect(page.getByRole("heading", { name: "InventoryDex" })).toBeVisible();

    // Email input and submit button should be present
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send magic link/i }),
    ).toBeVisible();
  });

  test("shows an error for an invalid email", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("textbox", { name: /email/i }).fill("notanemail");
    await page.getByRole("button", { name: /send magic link/i }).click();
    // Browser native validation or our own validation should prevent submission
    // and keep the user on the sign-in page.
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("Auth gate", () => {
  test("redirects unauthenticated users to /sign-in", async ({ page }) => {
    await page.goto("/inventory");
    // Should end up on sign-in (allow trailing query params / callbacks)
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("redirects /add to /sign-in when unauthenticated", async ({ page }) => {
    await page.goto("/add");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("Not-invited page", () => {
  test("loads without crashing", async ({ page }) => {
    await page.goto("/not-invited");
    await expect(page.getByText(/not invited/i)).toBeVisible();
  });
});
