import { type Locator, type Page, expect } from "@playwright/test";

export class LandingPage {
  readonly page: Page;
  readonly launchAppButton: Locator;
  readonly heroHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.launchAppButton = page.getByRole("link", { name: "Launch App" });
    this.heroHeading = page.getByRole("heading", { name: "Real-Time Bridge Monitoring" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/", { waitUntil: "networkidle" });
    await expect(this.heroHeading).toBeVisible({ timeout: 15000 });
  }

  async openDashboard(): Promise<void> {
    await this.launchAppButton.click();
    await expect(this.page).toHaveURL(/\/dashboard/);
  }
}
