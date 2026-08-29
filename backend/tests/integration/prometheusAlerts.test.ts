import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

describe("Prometheus Alerts Configuration Validation", () => {
  const alertsFilePath = path.resolve(process.cwd(), "../monitoring/prometheus-alerts.yml");
  const fallbackAlertsFilePath = path.resolve(process.cwd(), "../monitoring/alerts.yml");

  it("prometheus-alerts.yml file exists in monitoring directory", () => {
    const exists = fs.existsSync(alertsFilePath) || fs.existsSync(fallbackAlertsFilePath);
    expect(exists).toBe(true);
  });

  it("contains valid rule groups and required alert fields", () => {
    const targetPath = fs.existsSync(alertsFilePath) ? alertsFilePath : fallbackAlertsFilePath;
    const content = fs.readFileSync(targetPath, "utf8");

    expect(content).toContain("groups:");
    expect(content).toContain("rules:");

    // Basic structure check for rules
    const alertMatches = content.match(/- alert:\s+\w+/g);
    expect(alertMatches).not.toBeNull();
    expect(alertMatches!.length).toBeGreaterThan(0);

    const exprMatches = content.match(/expr:\s+.+/g);
    expect(exprMatches).not.toBeNull();
    expect(exprMatches!.length).toBeGreaterThan(0);

    const severityMatches = content.match(/severity:\s+\w+/g);
    expect(severityMatches).not.toBeNull();
    expect(severityMatches!.length).toBeGreaterThan(0);
  });

  it("passes promtool validation if promtool CLI is installed", () => {
    const targetPath = fs.existsSync(alertsFilePath) ? alertsFilePath : fallbackAlertsFilePath;

    let promtoolAvailable = false;
    try {
      execSync("promtool --version", { stdio: "ignore" });
      promtoolAvailable = true;
    } catch {
      promtoolAvailable = false;
    }

    if (promtoolAvailable) {
      const output = execSync(`promtool check rules "${targetPath}"`, { encoding: "utf8" });
      expect(output).toContain("SUCCESS");
    } else {
      console.log("promtool CLI not available locally; skipped binary validation execution.");
      expect(true).toBe(true);
    }
  });
});
