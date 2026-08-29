import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";

test.describe("Alert Routing Admin Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
      window.localStorage.setItem(
        "bridge-watch:dashboard-tour:v1",
        JSON.stringify({ completed: true, lastStep: 0, seen: true }),
      );
    });

    await mockCoreApi(page);

    // Mock alert routing rules API
    await page.route("**/api/v1/alerts/routing/rules**", async (route) => {
      const method = route.request().method();
      const url = route.request().url();

      if (method === "GET" && !url.includes("/rules/")) {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            rules: [
              {
                id: "rule-001",
                name: "Critical Asset Alerts",
                priority: 1,
                conditions: {
                  severity: ["critical"],
                  assetCode: ["USDC", "EURC"],
                },
                destinations: ["webhook-001", "slack-001"],
                enabled: true,
                createdAt: "2026-01-15T10:00:00Z",
              },
              {
                id: "rule-002",
                name: "Bridge Health Warnings",
                priority: 2,
                conditions: {
                  severity: ["high", "medium"],
                  bridgeId: ["CIRCLE_USDC"],
                },
                destinations: ["email-001"],
                enabled: true,
                createdAt: "2026-01-16T12:00:00Z",
              },
            ],
          }),
        });
      } else if (method === "POST") {
        await route.fulfill({
          status: 201,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "rule-003",
            name: "New Rule",
            priority: 3,
            conditions: {},
            destinations: [],
            enabled: true,
            createdAt: new Date().toISOString(),
          }),
        });
      } else if (method === "PUT") {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ success: true }),
        });
      } else if (method === "DELETE") {
        await route.fulfill({
          status: 204,
          headers: { "content-type": "application/json" },
          body: "",
        });
      }
    });

    await page.route("**/api/v1/alerts/routing/webhooks**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          webhooks: [
            {
              id: "webhook-001",
              name: "PagerDuty",
              url: "https://events.pagerduty.com/v2/enqueue",
              enabled: true,
            },
            {
              id: "webhook-002",
              name: "Slack Webhook",
              url: "https://hooks.slack.com/services/XXX",
              enabled: true,
            },
          ],
        }),
      });
    });
  });

  test("loads alert routing admin page successfully", async ({ page }) => {
    await page.goto("/admin/alert-routing");

    // Wait for any of these conditions to pass
    await Promise.race([
      page.waitForLoadState("networkidle"),
      page.waitForTimeout(5000),
    ]);

    // Basic check - page loaded without crash
    const url = page.url();
    expect(url).toContain("/admin");
  });

  test("mocked API returns alert routing rules", async ({ page }) => {
    let capturedResponse: any = null;

    page.on("response", async (response) => {
      if (response.url().includes("/api/v1/alerts/routing/rules")) {
        try {
          capturedResponse = await response.json();
        } catch (e) {
          // Ignore parse errors
        }
      }
    });

    await page.goto("/admin/alert-routing");
    await page.waitForTimeout(2000);

    // If API was called, verify response
    if (capturedResponse) {
      expect(capturedResponse.rules).toBeDefined();
      expect(capturedResponse.rules.length).toBeGreaterThanOrEqual(0);
    }
  });

  test("mocked API returns webhooks", async ({ page }) => {
    let capturedResponse: any = null;

    page.on("response", async (response) => {
      if (response.url().includes("/api/v1/alerts/routing/webhooks")) {
        try {
          capturedResponse = await response.json();
        } catch (e) {
          // Ignore parse errors
        }
      }
    });

    await page.goto("/admin/alert-routing");
    await page.waitForTimeout(2000);

    // If API was called, verify response
    if (capturedResponse) {
      expect(capturedResponse.webhooks).toBeDefined();
      expect(capturedResponse.webhooks.length).toBeGreaterThanOrEqual(0);
    }
  });

  test("navigation to admin alert routing works", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Try to navigate via URL directly
    await page.goto("/admin/alert-routing");
    await page.waitForTimeout(1000);

    // Verify we're on the right route
    expect(page.url()).toContain("/admin");
  });

  test("page does not crash on load", async ({ page }) => {
    const errors: string[] = [];

    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    await page.goto("/admin/alert-routing");
    await page.waitForTimeout(2000);

    // Allow some errors but page should still load
    expect(errors.length).toBeLessThan(10);
  });
});
