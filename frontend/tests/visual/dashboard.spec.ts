import { test, expect } from "@playwright/test";

test.describe("visual regression suite", () => {
  test("dashboard loading state", async ({ page }) => {
    await page.route("**/api/v1/assets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ assets: [], total: 0 }),
      });
    });

    await page.route("**/api/v1/bridges", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bridges: [] }),
      });
    });

    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Dashboard");
    await expect(page).toHaveScreenshot("dashboard-empty.png");
  });

  test("bridge list empty state", async ({ page }) => {
    await page.route("**/api/v1/assets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ assets: [{ symbol: "USDC" }], total: 1 }),
      });
    });

    await page.route("**/api/v1/bridges", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bridges: [] }),
      });
    });

    await page.goto("/bridges");
    await expect(page.locator("h1")).toHaveText("Bridges");
    await expect(page).toHaveScreenshot("bridges-empty.png");
  });

  test("asset detail visual baseline", async ({ page }) => {
    await page.route("**/api/v1/assets/USDC/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/health")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            symbol: "USDC",
            score: 92,
            trend: "stable",
            factors: [],
            updatedAt: new Date("2026-05-29T12:00:00.000Z").toISOString(),
          }),
        });
        return;
      }

      if (url.pathname.endsWith("/price")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            symbol: "USDC",
            vwap: 1,
            sources: [],
            deviation: 0,
            lastUpdated: new Date("2026-05-29T12:00:00.000Z").toISOString(),
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ symbol: "USDC", details: {} }),
      });
    });

    await page.goto("/assets/USDC");
    await expect(page.locator("main")).toHaveScreenshot("asset-usdc.png");
  });
});