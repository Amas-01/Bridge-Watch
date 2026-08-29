import { test, expect } from "@playwright/test";
import { LandingPage } from "../pages/LandingPage";
import { DashboardPage } from "../pages/DashboardPage";
import { BridgesPage } from "../pages/BridgesPage";
import { mockCoreApi } from "../utils/mockApi";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem("bridge-watch:dashboard-tour:v1", JSON.stringify({ completed: true, lastStep: 0, seen: true }));
  });
  await mockCoreApi(page);
});

test("navigates landing to dashboard and renders core widgets", async ({ page }) => {
  const landingPage = new LandingPage(page);
  const dashboardPage = new DashboardPage(page);

  await landingPage.goto();
  await landingPage.openDashboard();
  await page.waitForLoadState("networkidle");
  await dashboardPage.assertLoaded();
});

test("opens export dialog and interacts with dashboard toolbar", async ({ page }) => {
  const dashboardPage = new DashboardPage(page);

  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await dashboardPage.assertLoaded();
  await dashboardPage.openExportDialog();

  await page.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Export data" })).toBeVisible();
});

test("loads bridges page and bridge cards from mocked data", async ({ page }) => {
  const bridgesPage = new BridgesPage(page);
  await bridgesPage.goto();
  await bridgesPage.assertBridgeVisible("Allbridge");
  await bridgesPage.assertBridgeVisible("Wormhole");
});
