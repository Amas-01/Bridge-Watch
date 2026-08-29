import { type Locator, type Page, expect } from "@playwright/test";
import type { IncidentStatus, IncidentSeverity } from "../../frontend/src/hooks/useIncidentFeed";

export class AlertsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly severityFilter: Locator;
  readonly statusFilter: Locator;
  readonly alertRows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Alerts", level: 1 });
    this.searchInput = page.getByRole("searchbox", { name: "Search alerts" });
    this.severityFilter = page.getByLabel("Filter by severity");
    this.statusFilter = page.getByLabel("Filter by status");
    this.alertRows = page.getByRole("table", { name: "Alert rows" }).getByRole("row");
  }

  async goto(): Promise<void> {
    await this.page.goto("/alerts", { waitUntil: "networkidle" });
    await expect(this.heading).toBeVisible({ timeout: 15000 });
  }

  row(title: string): Locator {
    return this.page.getByRole("row").filter({ hasText: title });
  }

  async assertAlertVisible(title: string): Promise<void> {
    await expect(this.row(title)).toBeVisible();
  }

  async assertAlertHidden(title: string): Promise<void> {
    await expect(this.row(title)).toBeHidden();
  }

  async filterBySeverity(severity: IncidentSeverity | ""): Promise<void> {
    await this.severityFilter.selectOption(severity);
  }

  async filterByStatus(status: IncidentStatus | ""): Promise<void> {
    await this.statusFilter.selectOption(status);
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  async selectAlert(title: string): Promise<void> {
    await this.page.getByLabel(`Select alert: ${title}`).check();
  }

  async markSelectedRead(): Promise<void> {
    await this.page.getByRole("button", { name: "Mark read" }).click();
  }

  async dismissSelected(): Promise<void> {
    await this.page.getByRole("button", { name: "Dismiss" }).click();
  }
}
