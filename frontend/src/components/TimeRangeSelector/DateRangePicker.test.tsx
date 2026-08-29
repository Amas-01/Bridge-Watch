import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateRangePicker from "./DateRangePicker";
import type { TimeRangeSelection } from "../../utils/timeRange";

describe("DateRangePicker", () => {
  const mockOnApply = vi.fn();
  const mockOnClear = vi.fn();

  beforeEach(() => {
    mockOnApply.mockClear();
    mockOnClear.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Rendering", () => {
    it("renders with no initial value", () => {
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      expect(screen.getByLabelText("Start")).toHaveValue("");
      expect(screen.getByLabelText("End")).toHaveValue("");
    });

    it("renders with initial range value", () => {
      const value: TimeRangeSelection = {
        start: "2026-04-01T00:00:00.000Z",
        end: "2026-04-20T00:00:00.000Z",
      };

      render(
        <DateRangePicker value={value} onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start") as HTMLInputElement;
      const endInput = screen.getByLabelText("End") as HTMLInputElement;

      expect(startInput.value).toBeTruthy();
      expect(endInput.value).toBeTruthy();
    });

    it("renders all preset buttons", () => {
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      expect(screen.getByRole("button", { name: "1H" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "24H" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "7D" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "30D" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "1Y" })).toBeInTheDocument();
    });

    it("renders action buttons", () => {
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      expect(screen.getByRole("button", { name: "Apply custom range" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    });
  });

  describe("Preset Selection", () => {
    it("applies 24H preset", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const button = screen.getByRole("button", { name: "24H" });
      await user.click(button);

      expect(mockOnApply).toHaveBeenCalledWith(
        expect.objectContaining({
          preset: "24H",
          start: expect.any(String),
          end: expect.any(String),
        })
      );
    });

    it("applies 7D preset", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const button = screen.getByRole("button", { name: "7D" });
      await user.click(button);

      expect(mockOnApply).toHaveBeenCalledWith(
        expect.objectContaining({
          preset: "7D",
          start: expect.any(String),
          end: expect.any(String),
        })
      );
    });

    it("applies 30D preset", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const button = screen.getByRole("button", { name: "30D" });
      await user.click(button);

      expect(mockOnApply).toHaveBeenCalledWith(
        expect.objectContaining({
          preset: "30D",
          start: expect.any(String),
          end: expect.any(String),
        })
      );
    });

    it("indicates active preset", () => {
      const value: TimeRangeSelection = {
        preset: "24H",
      };

      render(
        <DateRangePicker value={value} onApply={mockOnApply} onClear={mockOnClear} />
      );

      const button = screen.getByRole("button", { name: "24H" });
      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(button).toHaveClass("bg-stellar-blue");
    });

    it("indicates inactive presets", () => {
      const value: TimeRangeSelection = {
        preset: "24H",
      };

      render(
        <DateRangePicker value={value} onApply={mockOnApply} onClear={mockOnClear} />
      );

      const button = screen.getByRole("button", { name: "7D" });
      expect(button).toHaveAttribute("aria-pressed", "false");
      expect(button).not.toHaveClass("bg-stellar-blue");
    });
  });

  describe("Custom Range Validation", () => {
    it("disables apply button when no dates entered", () => {
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const applyButton = screen.getByRole("button", { name: "Apply custom range" });
      expect(applyButton).toBeDisabled();
    });

    it("disables apply button when end date is before start date", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      const endInput = screen.getByLabelText("End");

      await user.type(startInput, "2026-04-20T12:00");
      await user.type(endInput, "2026-04-01T12:00");

      const applyButton = screen.getByRole("button", { name: "Apply custom range" });
      expect(applyButton).toBeDisabled();
    });

    it("displays validation error when end date is before start date", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      const endInput = screen.getByLabelText("End");

      await user.type(startInput, "2026-04-20T12:00");
      await user.type(endInput, "2026-04-01T12:00");

      expect(screen.getByText("Start date must be before end date.")).toBeInTheDocument();
    });

    it("enables apply button with valid custom range", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      const endInput = screen.getByLabelText("End");

      await user.type(startInput, "2026-04-01T12:00");
      await user.type(endInput, "2026-04-20T12:00");

      const applyButton = screen.getByRole("button", { name: "Apply custom range" });
      expect(applyButton).not.toBeDisabled();
    });

    it("applies valid custom range", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      const endInput = screen.getByLabelText("End");

      await user.type(startInput, "2026-04-01T12:00");
      await user.type(endInput, "2026-04-20T12:00");

      const applyButton = screen.getByRole("button", { name: "Apply custom range" });
      await user.click(applyButton);

      expect(mockOnApply).toHaveBeenCalledWith(
        expect.objectContaining({
          start: expect.stringContaining("2026-04-01"),
          end: expect.stringContaining("2026-04-20"),
        })
      );
    });
  });

  describe("Recent Ranges", () => {
    it("displays recent ranges after applying custom range", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      const endInput = screen.getByLabelText("End");

      await user.type(startInput, "2026-04-01T12:00");
      await user.type(endInput, "2026-04-20T12:00");

      const applyButton = screen.getByRole("button", { name: "Apply custom range" });
      await user.click(applyButton);

      // Rerender to show recent ranges
      rerender(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      expect(screen.getByText("Recent")).toBeInTheDocument();
    });

    it("stores up to 5 recent ranges", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      // Add 6 ranges
      for (let i = 0; i < 6; i++) {
        const startInput = screen.getByLabelText("Start");
        const endInput = screen.getByLabelText("End");

        await user.clear(startInput);
        await user.clear(endInput);

        const startDate = new Date(2026, 3, 1 + i);
        const endDate = new Date(2026, 3, 2 + i);

        await user.type(startInput, startDate.toISOString().slice(0, 16));
        await user.type(endInput, endDate.toISOString().slice(0, 16));

        const applyButton = screen.getByRole("button", { name: "Apply custom range" });
        await user.click(applyButton);

        rerender(
          <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
        );
      }

      const stored = JSON.parse(localStorage.getItem("bridgewatch.recentRanges.v1") || "[]");
      expect(stored).toHaveLength(5);
    }, 20_000);

    it("applies recent range when clicked", async () => {
      const user = userEvent.setup();
      const recentRange: TimeRangeSelection = {
        start: "2026-04-01T00:00:00.000Z",
        end: "2026-04-20T00:00:00.000Z",
      };

      localStorage.setItem("bridgewatch.recentRanges.v1", JSON.stringify([recentRange]));

      const { rerender } = render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      rerender(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const recentButton = screen.getByRole("button", { name: /0?4\/0?1\/2026 → 0?4\/20\/2026/ });
      await user.click(recentButton);

      expect(mockOnApply).toHaveBeenCalledWith(recentRange);
    });

    it("does not store presets as recent ranges", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const button = screen.getByRole("button", { name: "24H" });
      await user.click(button);

      const stored = localStorage.getItem("bridgewatch.recentRanges.v1");
      expect(stored).toBeNull();
    });
  });

  describe("Clear Action", () => {
    it("clears inputs and calls onClear", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      const endInput = screen.getByLabelText("End");

      await user.type(startInput, "2026-04-01T12:00");
      await user.type(endInput, "2026-04-20T12:00");

      const clearButton = screen.getByRole("button", { name: "Clear" });
      await user.click(clearButton);

      expect(mockOnClear).toHaveBeenCalled();
    });
  });

  describe("Keyboard Navigation", () => {
    it("traps focus with Tab key", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      startInput.focus();

      // Tab through all elements
      await user.tab();
      expect(document.activeElement).not.toBe(startInput);

      // Continue tabbing until we wrap back
      let tabCount = 0;
      while (document.activeElement !== startInput && tabCount < 20) {
        await user.tab();
        tabCount++;
      }

      expect(document.activeElement).toBe(startInput);
    });

    it("closes picker on Escape key", async () => {
      const button = document.createElement("button");
      document.body.appendChild(button);
      const triggerRef = { current: button };

      render(
        <DateRangePicker
          onApply={mockOnApply}
          onClear={mockOnClear}
          triggerRef={triggerRef}
        />
      );

      const container = screen.getByRole("region", { name: "Date range picker" });
      container.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );

      expect(triggerRef.current).toBe(document.activeElement);
      document.body.removeChild(button);
    });

    it("applies preset with Enter key", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const button = screen.getByRole("button", { name: "24H" });
      button.focus();

      await user.keyboard("{Enter}");

      expect(mockOnApply).toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA attributes on inputs", () => {
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      const endInput = screen.getByLabelText("End");

      expect(startInput).toHaveAttribute("aria-invalid", "false");
      expect(endInput).toHaveAttribute("aria-invalid", "false");
    });

    it("marks inputs as invalid when validation fails", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      const endInput = screen.getByLabelText("End");

      await user.type(startInput, "2026-04-20T12:00");
      await user.type(endInput, "2026-04-01T12:00");

      expect(startInput).toHaveAttribute("aria-invalid", "true");
      expect(endInput).toHaveAttribute("aria-invalid", "true");
    });

    it("associates error message with inputs", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      const endInput = screen.getByLabelText("End");

      await user.type(startInput, "2026-04-20T12:00");
      await user.type(endInput, "2026-04-01T12:00");

      const errorId = startInput.getAttribute("aria-describedby");
      expect(errorId).toBeTruthy();
      expect(screen.getByText("Start date must be before end date.")).toHaveAttribute("id", errorId);
    });

    it("has preset buttons with aria-pressed", () => {
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const buttons = screen.getAllByRole("button");
      const presetButtons = buttons.filter((btn) =>
        ["1H", "24H", "7D", "30D", "1Y"].includes(btn.textContent || "")
      );

      presetButtons.forEach((btn) => {
        expect(btn).toHaveAttribute("aria-pressed");
      });
    });

    it("has region role for picker container", () => {
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      expect(screen.getByRole("region", { name: "Date range picker" })).toBeInTheDocument();
    });
  });

  describe("Time Zone Handling", () => {
    it("serializes dates to ISO format", async () => {
      const user = userEvent.setup();
      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      const endInput = screen.getByLabelText("End");

      await user.type(startInput, "2026-04-01T12:00");
      await user.type(endInput, "2026-04-20T12:00");

      const applyButton = screen.getByRole("button", { name: "Apply custom range" });
      await user.click(applyButton);

      const call = mockOnApply.mock.calls[0][0];
      expect(call.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(call.end).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe("Storage Error Handling", () => {
    it("handles localStorage unavailability gracefully", async () => {
      const user = userEvent.setup();
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn(() => {
        throw new Error("QuotaExceededError");
      });

      render(
        <DateRangePicker onApply={mockOnApply} onClear={mockOnClear} />
      );

      const startInput = screen.getByLabelText("Start");
      const endInput = screen.getByLabelText("End");

      await user.type(startInput, "2026-04-01T12:00");
      await user.type(endInput, "2026-04-20T12:00");

      const applyButton = screen.getByRole("button", { name: "Apply custom range" });
      await user.click(applyButton);

      // Should still apply the range despite storage error
      expect(mockOnApply).toHaveBeenCalled();

      Storage.prototype.setItem = originalSetItem;
    });
  });
});
