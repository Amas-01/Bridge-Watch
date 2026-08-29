import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AlertRoutingAdmin from "./AlertRoutingAdmin";
import * as api from "../services/api";

vi.mock("../services/api", () => {
  const mockRules = [
    {
      id: "rule-1",
      name: "High Priority Alert",
      ownerAddress: "G111",
      severityLevels: ["critical"],
      assetCodes: ["USDC"],
      sourceTypes: ["price_deviation"],
      channels: ["in_app"],
      fallbackChannels: [],
      suppressionWindowSeconds: 60,
      priorityOrder: 1,
      isActive: true,
      createdBy: "admin",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "rule-2",
      name: "Low Priority Alert",
      ownerAddress: "G222",
      severityLevels: ["low"],
      assetCodes: ["XLM"],
      sourceTypes: ["health_score_drop"],
      channels: ["email"],
      fallbackChannels: [],
      suppressionWindowSeconds: 0,
      priorityOrder: 2,
      isActive: false,
      createdBy: "admin",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  return {
    listAlertRoutingRules: vi.fn().mockResolvedValue({ rules: mockRules }),
    getAlertRoutingAudit: vi.fn().mockResolvedValue({ entries: [] }),
    createAlertRoutingRule: vi.fn(),
    updateAlertRoutingRule: vi.fn(),
    deleteAlertRoutingRule: vi.fn(),
    bulkUpdateAlertRoutingRules: vi.fn().mockResolvedValue({ rules: mockRules, count: 2 }),
    AlertService: {
      listRules: vi.fn().mockResolvedValue({ rules: mockRules }),
      createRule: vi.fn(),
      updateRule: vi.fn(),
      bulkUpdateRules: vi.fn().mockResolvedValue({ rules: mockRules, count: 2 }),
      deleteRule: vi.fn(),
      getAudit: vi.fn().mockResolvedValue({ entries: [] }),
    },
  };
});

describe("AlertRoutingAdmin bulk toggle UI", () => {
  it("renders rules table with bulk enable/disable actions", async () => {
    // Set localStorage token so loadData runs
    localStorage.setItem("bridge-watch:admin-api-key:v1", JSON.stringify("test-admin-key"));

    render(<AlertRoutingAdmin />);

    await waitFor(() => {
      expect(screen.getByText("High Priority Alert")).toBeInTheDocument();
      expect(screen.getByText("Low Priority Alert")).toBeInTheDocument();
    });

    // Check select all rules checkbox
    const selectAllCheckbox = screen.getByLabelText("Select all rules");
    expect(selectAllCheckbox).toBeInTheDocument();

    fireEvent.click(selectAllCheckbox);

    // Bulk buttons should appear
    expect(screen.getByRole("button", { name: "Bulk Enable" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bulk Disable" })).toBeInTheDocument();

    // Click Bulk Disable
    fireEvent.click(screen.getByRole("button", { name: "Bulk Disable" }));

    await waitFor(() => {
      expect(api.AlertService.bulkUpdateRules).toHaveBeenCalledWith(
        "test-admin-key",
        ["rule-1", "rule-2"],
        false
      );
    });
  });
});
