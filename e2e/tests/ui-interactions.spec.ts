import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem("bridge-watch:dashboard-tour:v1", JSON.stringify({ completed: true, lastStep: 0, seen: true }));
  });
  await mockCoreApi(page);
});

test.describe("UI Interactions: Drawers and Dialogs", () => {
  test("Notifications drawer - open, focus management, and close via keyboard", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    // Click the notification trigger
    const trigger = page.locator('button[aria-controls="notifications-drawer"]');
    await trigger.waitFor({ state: "visible" });
    await trigger.click();

    const drawer = page.getByRole("dialog", { name: "Notifications" });
    await expect(drawer).toBeVisible();

    // Verify focus is moved inside the drawer
    const closeBtn = drawer.getByRole("button", { name: "Close notifications" });
    await expect(closeBtn).toBeVisible();

    // The close button or the first focusable element should be focused
    // Testing focus specifically can be flaky but we check if any element in the drawer is focused
    const focusedId = await page.evaluate(() => document.activeElement?.closest('#notifications-drawer') !== null);
    expect(focusedId).toBeTruthy();

    // Close using Escape key
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("Export dialog - open, interact, and close", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    // Click export button
    const exportBtn = page.getByRole("button", { name: "Export data" });
    await exportBtn.click();

    // Wait for the dialog to appear
    const dialogHeading = page.getByRole("heading", { name: "Export data" });
    await expect(dialogHeading).toBeVisible();

    // Close dialog
    const closeDialogBtn = page.getByRole("button", { name: "Close export dialog" });
    await closeDialogBtn.click();

    await expect(dialogHeading).toBeHidden();
  });
});

test.describe("UI Interactions: Filters and Responsive Layout", () => {
  test("Transaction filters - input, select, and reset", async ({ page }) => {
    await page.goto("/transactions", { waitUntil: "networkidle" });
    
    // Wait for the filters component to load
    const searchInput = page.getByPlaceholder("Search by tx hash or address…");
    await expect(searchInput).toBeVisible();
    
    // Interact with search input
    await searchInput.fill("0x1234");
    await expect(searchInput).toHaveValue("0x1234");

    // Interact with selects
    const bridgeSelect = page.getByLabel("Filter by bridge");
    await bridgeSelect.selectOption("Circle");
    await expect(bridgeSelect).toHaveValue("Circle");

    // Assert 'Clear all filters' button is visible since we have active filters
    const clearBtn = page.getByTestId("clear-all-filters-btn");
    await expect(clearBtn).toBeVisible();
    
    // Reset filters
    await clearBtn.click();

    // Assert inputs are reset
    await expect(searchInput).toHaveValue("");
    await expect(bridgeSelect).toHaveValue("");
    await expect(clearBtn).toBeHidden();
  });
});
