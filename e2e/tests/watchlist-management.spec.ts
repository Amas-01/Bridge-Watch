import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem("bridge-watch:dashboard-tour:v1", JSON.stringify({ completed: true, lastStep: 0, seen: true }));
  });
  await mockCoreApi(page);
});

test("creates a custom watchlist, adds assets, toggles active watchlist, and deletes watchlists", async ({ page }) => {
  // Go to watchlists manager page
  await page.goto("/watchlist");
  
  // Wait for the page to load
  await expect(page.locator("h2").filter({ hasText: "Your Watchlists" })).toBeVisible();

  // Create custom watchlist
  const createInput = page.getByPlaceholder("New watchlist name...");
  await createInput.fill("My Custom Watchlist");
  await page.getByRole("button", { name: "Create" }).click();

  // Wait for the new watchlist to appear in the list (using h3 to target the manager specifically)
  await expect(page.locator("h3").filter({ hasText: "My Custom Watchlist" })).toBeVisible();
  
  // Navigate to the dashboard to add an asset to the watchlist
  await page.goto("/dashboard");
  
  // The active watchlist should be the new one by default, let's verify adding an asset
  const firstAssetWatchlistButton = page.locator('button[aria-label^="Add"]').first();
  await firstAssetWatchlistButton.click();
  
  // Go back to watchlists
  await page.goto("/watchlist");
  
  // Verify it's in the list or toggle active (target the specific manager row)
  const watchlistRow = page.locator("div.p-4").filter({ has: page.locator("h3", { hasText: "My Custom Watchlist" }) });
  await expect(watchlistRow).toBeVisible();
  
  // Click set active
  const setActiveBtn = watchlistRow.getByRole("button", { name: "Set Active" });
  if (await setActiveBtn.isVisible()) {
    await setActiveBtn.click();
  }
  
  // Verify it says "Active"
  await expect(watchlistRow.getByText("Active", { exact: true })).toBeVisible();

  // Delete the watchlist
  const deleteBtn = watchlistRow.getByRole("button", { name: "Delete" });
  await deleteBtn.click();
  
  // Verify it was deleted
  await expect(page.locator("h3").filter({ hasText: "My Custom Watchlist" })).not.toBeVisible();
});
