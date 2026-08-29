import { type Locator, type Page, expect } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly assetHealthHeading: Locator;
  readonly bridgeStatusHeading: Locator;
  readonly exportDataButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Dashboard" });
    this.assetHealthHeading = page.getByRole("heading", { name: "Asset Health" });
    this.bridgeStatusHeading = page.getByRole("heading", { name: "Bridge Status" });
    this.exportDataButton = page.getByRole("button", { name: "Export data" });
  }

  async dismissOnboardingIfPresent(): Promise<void> {
    const dialog = this.page.getByRole("dialog", { name: "Welcome to Bridge Watch" });
    if (await dialog.isVisible()) {
      const skipButton = this.page.getByRole("button", { name: "Skip" });
      if (await skipButton.isVisible()) {
        await skipButton.click({ force: true });
      } else {
        await this.page.getByRole("button", { name: "Close onboarding" }).click({ force: true });
      }
      await expect(dialog).toBeHidden();
    }
  }

  async assertLoaded(): Promise<void> {
    await this.dismissOnboardingIfPresent();
    await this.page.waitForLoadState("networkidle");
    await expect(this.heading).toBeVisible({ timeout: 15000 });
    await expect(this.assetHealthHeading).toBeVisible({ timeout: 10000 });
    await expect(this.bridgeStatusHeading).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRole("link", { name: "View details for bridge Allbridge" })).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRole("button", { name: "Inspect bridge details" }).first()).toBeVisible({ timeout: 10000 });
  }

  async openExportDialog(): Promise<void> {
    await this.exportDataButton.click();
    await expect(this.page.getByRole("heading", { name: "Export data" })).toBeVisible();
  }
}
