import { type Locator, type Page, expect } from "@playwright/test";

export class BridgesPage {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Bridges" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/bridges", { waitUntil: "networkidle" });
    await expect(this.heading).toBeVisible({ timeout: 15000 });
  }

  async assertBridgeVisible(bridgeName: string): Promise<void> {
    await expect(this.page.getByRole("link", { name: `View details for bridge ${bridgeName}` })).toBeVisible();
  }
}
