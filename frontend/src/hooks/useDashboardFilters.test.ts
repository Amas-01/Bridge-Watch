import { describe, it, expect } from "vitest";
import {
  DEFAULT_DASHBOARD_FILTERS,
  buildDashboardSearchParams,
  isDashboardFilterActive,
  isTimestampInRange,
  parseDashboardFilters,
} from "./useDashboardFilters";

describe("useDashboardFilters helpers", () => {
  it("parses valid URL filter params", () => {
    const params = new URLSearchParams(
      "assets=USDC,EURC&bridges=Circle,Wormhole&status=warning&range=7d",
    );

    const result = parseDashboardFilters(params);

    expect(result).toEqual({
      assets: ["EURC", "USDC"],
      bridges: ["Circle", "Wormhole"],
      status: "warning",
      timeRange: "7d",
    });
  });

  it("falls back to defaults for invalid status and range", () => {
    const params = new URLSearchParams("status=invalid&range=100d");

    const result = parseDashboardFilters(params);

    expect(result).toEqual(DEFAULT_DASHBOARD_FILTERS);
  });

  it("serializes only active filters into URL params", () => {
    const params = buildDashboardSearchParams({
      assets: ["EURC", "USDC", "EURC"],
      bridges: ["Circle"],
      status: "healthy",
      timeRange: "24h",
    });

    expect(params.toString()).toBe("assets=EURC%2CUSDC&bridges=Circle&status=healthy&range=24h");
  });

  it("evaluates time range and active filter state correctly", () => {
    const now = new Date("2026-04-24T12:00:00.000Z");

    expect(isTimestampInRange("2026-04-24T11:30:00.000Z", "24h", now)).toBe(true);
    expect(isTimestampInRange("2026-04-22T11:30:00.000Z", "24h", now)).toBe(false);
    expect(isTimestampInRange(undefined, "7d", now)).toBe(false);

    expect(
      isDashboardFilterActive({
        assets: [],
        bridges: [],
        status: "all",
        timeRange: "all",
      }),
    ).toBe(false);

    expect(
      isDashboardFilterActive({
        assets: ["USDC"],
        bridges: [],
        status: "all",
        timeRange: "all",
      }),
    ).toBe(true);
  });
});
