import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";
import { DashboardPage } from "../pages/DashboardPage";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem("bridge-watch:dashboard-tour:v1", JSON.stringify({ completed: true, lastStep: 0, seen: true }));
  });
  await mockCoreApi(page);
});

test("mobile menu opens and can navigate to bridges page", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile-only test");
  const dashboardPage = new DashboardPage(page);

  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await dashboardPage.dismissOnboardingIfPresent();
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const mobileNavDialog = page.getByRole("dialog", { name: "Mobile navigation" });
  await mobileNavDialog.getByRole("link", { name: /Bridges Bridge performance/i }).click();

  await expect(page).toHaveURL(/\/bridges(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Bridges" })).toBeVisible({ timeout: 15000 });
});
