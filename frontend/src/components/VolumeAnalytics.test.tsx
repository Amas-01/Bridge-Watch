import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../test/utils";
import VolumeAnalytics from "./VolumeAnalytics";

describe("VolumeAnalytics", () => {
  it("renders volume data correctly", () => {
    render(
      <VolumeAnalytics
        data={{ volume24h: 1000, volume7d: 5000, volume30d: 25000 }}
        isLoading={false}
      />
    );

    expect(screen.getByText("24H Volume")).toBeInTheDocument();
    expect(screen.getByText("$1,000")).toBeInTheDocument();
    expect(screen.getByText("7D Volume")).toBeInTheDocument();
    expect(screen.getByText("$5,000")).toBeInTheDocument();
    expect(screen.getByText("30D Volume")).toBeInTheDocument();
    expect(screen.getByText("$25,000")).toBeInTheDocument();
  });

  it("handles custom start and end date selection", () => {
    const handleDateRangeChange = vi.fn();
    render(
      <VolumeAnalytics
        data={{ volume24h: 1000, volume7d: 5000, volume30d: 25000 }}
        isLoading={false}
        onDateRangeChange={handleDateRangeChange}
      />
    );

    const startInput = screen.getByLabelText("Custom start date");
    const endInput = screen.getByLabelText("Custom end date");
    const applyBtn = screen.getByRole("button", { name: /apply custom date range/i });

    fireEvent.change(startInput, { target: { value: "2026-07-01" } });
    fireEvent.change(endInput, { target: { value: "2026-07-15" } });
    fireEvent.click(applyBtn);

    expect(handleDateRangeChange).toHaveBeenCalledWith("2026-07-01", "2026-07-15");
  });

  it("renders custom range volume when provided", () => {
    render(
      <VolumeAnalytics
        data={{ volume24h: 1000, volume7d: 5000, volume30d: 25000, customVolume: 12500, startDate: "2026-07-01", endDate: "2026-07-15" }}
        isLoading={false}
      />
    );

    expect(screen.getByText("Custom Range Volume")).toBeInTheDocument();
    expect(screen.getByText("$12,500")).toBeInTheDocument();
  });
});
