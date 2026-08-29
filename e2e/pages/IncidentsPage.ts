import { type Locator, type Page, expect } from "@playwright/test";

export class IncidentsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly heatmap: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Incident Heatmap", level: 1 });
    this.heatmap = page.getByRole("region", { name: "Incident heatmap" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/incidents", { waitUntil: "networkidle" });
    await expect(this.heading).toBeVisible({ timeout: 15000 });
    await expect(this.heatmap).toBeVisible();
  }

  async assertIncidentCell(date: string, asset: string, count: number): Promise<void> {
    await expect(
      this.page.getByLabel(`${date} – ${asset}: ${count} incident${count === 1 ? "" : "s"}`)
    ).toBeVisible();
  }

  async openReplay(incidentId: string): Promise<void> {
    await this.page.goto(`/incidents/replay/${incidentId}`, { waitUntil: "networkidle" });
    await expect(this.page.getByRole("heading", { name: "Incident Replay" })).toBeVisible({ timeout: 15000 });
  }
}
