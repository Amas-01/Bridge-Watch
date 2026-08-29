/**
 * Tests for RecentActivityTimeline component
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import RecentActivityTimeline from "./RecentActivityTimeline";
import { useTimelineEvents } from "../../hooks/useTimelineEvents";
import type { TimelineEvent } from "../../types/timeline";

// Mock the useTimelineEvents hook
vi.mock("../../hooks/useTimelineEvents");

const mockUseTimelineEvents = vi.mocked(useTimelineEvents);

const mockEvents: TimelineEvent[] = [
  {
    id: "1",
    type: "bridge",
    timestamp: new Date().toISOString(),
    title: "Bridge Circle status update",
    description: "Status: healthy, TVL: $1,000,000",
    bridgeName: "Circle",
    bridgeStatus: "healthy",
    totalValueLocked: 1000000,
    severity: "info",
    status: "active",
  },
  {
    id: "2",
    type: "alert",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    title: "High price deviation detected",
    description: "USDC price deviation exceeds threshold",
    severity: "warning",
    assetSymbol: "USDC",
    status: "active",
  },
  {
    id: "3",
    type: "health",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    title: "Health score update for USDC",
    description: "Score: 85.50, Trend: improving",
    assetSymbol: "USDC",
    previousScore: 80,
    currentScore: 85.5,
    trend: "improving",
    severity: "info",
  },
];

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("RecentActivityTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTimelineEvents.mockReturnValue({
      events: mockEvents,
      totalEvents: mockEvents.length,
      filteredCount: mockEvents.length,
      isLoading: false,
      error: null,
      isConnected: true,
      addEvent: vi.fn(),
      clearEvents: vi.fn(),
      removeEvent: vi.fn(),
    });
  });

  it("renders timeline header", () => {
    renderWithRouter(<RecentActivityTimeline />);
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
  });

  it("displays connection status", () => {
    renderWithRouter(<RecentActivityTimeline />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("shows event count", () => {
    renderWithRouter(<RecentActivityTimeline />);
    expect(screen.getByText(`${mockEvents.length} of ${mockEvents.length} events`)).toBeInTheDocument();
  });

  it("renders all events", () => {
    renderWithRouter(<RecentActivityTimeline />);
    expect(screen.getByText("Bridge Circle status update")).toBeInTheDocument();
    expect(screen.getByText("High price deviation detected")).toBeInTheDocument();
    expect(screen.getByText("Health score update for USDC")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockUseTimelineEvents.mockReturnValue({
      events: [],
      totalEvents: 0,
      filteredCount: 0,
      isLoading: true,
      error: null,
      isConnected: false,
      addEvent: vi.fn(),
      clearEvents: vi.fn(),
      removeEvent: vi.fn(),
    });

    renderWithRouter(<RecentActivityTimeline />);
    const skeletons = screen.getAllByRole("article");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows error state", () => {
    mockUseTimelineEvents.mockReturnValue({
      events: [],
      totalEvents: 0,
      filteredCount: 0,
      isLoading: false,
      error: "Failed to load events",
      isConnected: false,
      addEvent: vi.fn(),
      clearEvents: vi.fn(),
      removeEvent: vi.fn(),
    });

    renderWithRouter(<RecentActivityTimeline />);
    expect(screen.getByText(/Failed to load timeline events/)).toBeInTheDocument();
  });

  it("shows empty state when no events", () => {
    mockUseTimelineEvents.mockReturnValue({
      events: [],
      totalEvents: 0,
      filteredCount: 0,
      isLoading: false,
      error: null,
      isConnected: true,
      addEvent: vi.fn(),
      clearEvents: vi.fn(),
      removeEvent: vi.fn(),
    });

    renderWithRouter(<RecentActivityTimeline />);
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  it("toggles display mode", async () => {
    const user = userEvent.setup();
    renderWithRouter(<RecentActivityTimeline />);

    const toggleButton = screen.getByLabelText(/Switch to expanded mode/);
    await user.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/Switch to compact mode/)).toBeInTheDocument();
    });
  });

  it("toggles sort order", async () => {
    const user = userEvent.setup();
    renderWithRouter(<RecentActivityTimeline />);

    const sortButton = screen.getByLabelText(/Sort by oldest first/);
    await user.click(sortButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/Sort by newest first/)).toBeInTheDocument();
    });
  });

  it("clears all events", async () => {
    const user = userEvent.setup();
    const clearEvents = vi.fn();
    mockUseTimelineEvents.mockReturnValue({
      events: mockEvents,
      totalEvents: mockEvents.length,
      filteredCount: mockEvents.length,
      isLoading: false,
      error: null,
      isConnected: true,
      addEvent: vi.fn(),
      clearEvents,
      removeEvent: vi.fn(),
    });

    renderWithRouter(<RecentActivityTimeline />);

    const clearButton = screen.getByLabelText("Clear all events");
    await user.click(clearButton);

    expect(clearEvents).toHaveBeenCalledTimes(1);
  });

  it("filters events by search query", async () => {
    const user = userEvent.setup();
    renderWithRouter(<RecentActivityTimeline />);

    const searchInput = screen.getByPlaceholderText("Search activity");
    await user.type(searchInput, "USDC");

    await waitFor(() => {
      expect(searchInput).toHaveValue("USDC");
    });
  });

  it("hides header when showHeader is false", () => {
    renderWithRouter(<RecentActivityTimeline showHeader={false} />);
    expect(screen.queryByText("Recent Activity")).not.toBeInTheDocument();
  });

  it("hides filters when showFilters is false", () => {
    renderWithRouter(<RecentActivityTimeline showFilters={false} />);
    expect(screen.queryByPlaceholderText("Search activity")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = renderWithRouter(
      <RecentActivityTimeline className="custom-class" />
    );
    expect(container.querySelector(".custom-class")).toBeInTheDocument();
  });

  it("shows disconnected status", () => {
    mockUseTimelineEvents.mockReturnValue({
      events: mockEvents,
      totalEvents: mockEvents.length,
      filteredCount: mockEvents.length,
      isLoading: false,
      error: null,
      isConnected: false,
      addEvent: vi.fn(),
      clearEvents: vi.fn(),
      removeEvent: vi.fn(),
    });

    renderWithRouter(<RecentActivityTimeline />);
    expect(screen.getByText("Connecting...")).toBeInTheDocument();
  });
});
