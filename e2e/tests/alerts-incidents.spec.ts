import { test, expect } from "@playwright/test";
import { AlertsPage } from "../pages/AlertsPage";
import { IncidentsPage } from "../pages/IncidentsPage";
import { mockCoreApi } from "../utils/mockApi";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem("bridge-watch:dashboard-tour:v1", JSON.stringify({ completed: true, lastStep: 0, seen: true }));
    window.localStorage.removeItem("bw_read_incidents");
  });
  await mockCoreApi(page);
});

test("lists alerts and supports severity, status, and search filtering", async ({ page }) => {
  const alertsPage = new AlertsPage(page);

  await alertsPage.goto();
  await alertsPage.assertAlertVisible("USDC reserve attestation delayed");
  await alertsPage.assertAlertVisible("Allbridge transfer latency elevated");
  await alertsPage.assertAlertVisible("Wormhole EURC heartbeat recovered");

  await alertsPage.filterBySeverity("critical");
  await alertsPage.assertAlertVisible("USDC reserve attestation delayed");
  await alertsPage.assertAlertHidden("Allbridge transfer latency elevated");

  await alertsPage.filterBySeverity("");
  await alertsPage.filterByStatus("investigating");
  await alertsPage.assertAlertVisible("Allbridge transfer latency elevated");
  await alertsPage.assertAlertHidden("USDC reserve attestation delayed");

  await alertsPage.filterByStatus("");
  await alertsPage.search("heartbeat");
  await alertsPage.assertAlertVisible("Wormhole EURC heartbeat recovered");
  await alertsPage.assertAlertHidden("USDC reserve attestation delayed");
});

test("triages alert rows with bulk mark-read and dismiss actions", async ({ page }) => {
  const alertsPage = new AlertsPage(page);

  await alertsPage.goto();
  await expect(page.getByText("3 new")).toBeVisible();

  await alertsPage.selectAlert("USDC reserve attestation delayed");
  await alertsPage.markSelectedRead();
  await expect(page.getByText("2 new")).toBeVisible();

  await alertsPage.selectAlert("Allbridge transfer latency elevated");
  await alertsPage.dismissSelected();
  await alertsPage.assertAlertHidden("Allbridge transfer latency elevated");
  await expect(page.getByText("2 alerts · 1 dismissed")).toBeVisible();
});

test("renders incident heatmap cells for open, investigating, and resolved lifecycle states", async ({ page }) => {
  const incidentsPage = new IncidentsPage(page);

  await incidentsPage.goto();
  await incidentsPage.assertIncidentCell("2026-06-25", "EURC", 1);
  await incidentsPage.assertIncidentCell("2026-06-26", "USDC", 1);
  await incidentsPage.assertIncidentCell("2026-06-26", "XLM", 1);
});
