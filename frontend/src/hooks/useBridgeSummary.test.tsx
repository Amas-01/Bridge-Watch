import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBridgeSummaries, useBridgeSummary } from "./useBridgeSummary";
import * as api from "../services/api";
import type { Bridge, BridgeStats } from "../types";

// Mock the API functions
vi.mock("../services/api");

const mockBridges: Bridge[] = [
  {
    name: "Circle",
    status: "healthy",
    totalValueLocked: 500_000_000,
    supplyOnStellar: 400_000_000,
    supplyOnSource: 400_000_000,
    mismatchPercentage: 0,
  },
  {
    name: "Wormhole",
    status: "degraded",
    totalValueLocked: 200_000_000,
    supplyOnStellar: 180_000_000,
    supplyOnSource: 190_000_000,
    mismatchPercentage: 5.26,
  },
];

const mockStats: Record<string, BridgeStats> = {
  Circle: {
    name: "Circle",
    volume24h: 50_000_000,
    volume7d: 300_000_000,
    volume30d: 1_000_000_000,
    totalTransactions: 15000,
    averageTransferTime: 234.5,
    uptime30d: 99.5,
  },
  Wormhole: {
    name: "Wormhole",
    volume24h: 25_000_000,
    volume7d: 150_000_000,
    volume30d: 500_000_000,
    totalTransactions: 8000,
    averageTransferTime: 450.8,
    uptime30d: 95.2,
  },
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useBridgeSummaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getBridges).mockResolvedValue({ bridges: mockBridges });
    vi.mocked(api.getBridgeStats).mockImplementation((name: string) =>
      Promise.resolve(mockStats[name])
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches and combines bridge data with stats", async () => {
    const { result } = renderHook(() => useBridgeSummaries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const summaries = result.current.data;
    expect(summaries).toHaveLength(2);
    expect(summaries?.[0].name).toBe("Circle");
    expect(summaries?.[0].coverage).toBe(99.5);
    expect(summaries?.[0].performance).toBe(234.5);
  });

  it("returns loading state initially", () => {
    const { result } = renderHook(() => useBridgeSummaries(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it("handles fetch errors gracefully", async () => {
    vi.mocked(api.getBridges).mockRejectedValue(new Error("API error"));

    const { result } = renderHook(() => useBridgeSummaries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });

  it("handles individual bridge stats fetch failures", async () => {
    vi.mocked(api.getBridgeStats).mockImplementation((name: string) => {
      if (name === "Wormhole") {
        return Promise.reject(new Error("Stats fetch failed"));
      }
      return Promise.resolve(mockStats[name]);
    });

    const { result } = renderHook(() => useBridgeSummaries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const summaries = result.current.data;
    // Should still return data with fallback values for failed fetches
    expect(summaries).toHaveLength(2);
    expect(summaries?.[1].coverage).toBe(0); // Fallback value
  });

  it("creates unique IDs for summaries", async () => {
    const { result } = renderHook(() => useBridgeSummaries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const summaries = result.current.data;
    expect(summaries?.[0].id).toBe("circle");
    expect(summaries?.[1].id).toBe("wormhole");
  });

  it("respects refetchInterval option", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(
      () => useBridgeSummaries({ refetchInterval: 5000 }),
      {
        wrapper: createWrapper(),
      }
    );

    await vi.advanceTimersByTimeAsync(0);

    expect(result.current.isSuccess).toBe(true);
    expect(vi.mocked(api.getBridges)).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);

    expect(vi.mocked(api.getBridges)).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("respects refetchOnWindowFocus option", async () => {
    const { result } = renderHook(
      () => useBridgeSummaries({ refetchOnWindowFocus: false }),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const initialCallCount = vi.mocked(api.getBridges).mock.calls.length;

    // Simulate window focus event
    window.dispatchEvent(new Event("focus"));

    // Should not refetch due to refetchOnWindowFocus: false
    expect(vi.mocked(api.getBridges).mock.calls.length).toBe(initialCallCount);
  });
});

describe("useBridgeSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getBridges).mockResolvedValue({ bridges: mockBridges });
    vi.mocked(api.getBridgeStats).mockImplementation((name: string) =>
      Promise.resolve(mockStats[name])
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches a single bridge summary by name", async () => {
    const { result } = renderHook(() => useBridgeSummary("Circle"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const summary = result.current.data;
    expect(summary?.name).toBe("Circle");
    expect(summary?.coverage).toBe(99.5);
  });

  it("returns loading state initially", () => {
    const { result } = renderHook(() => useBridgeSummary("Circle"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it("handles bridge not found error", async () => {
    const { result } = renderHook(() => useBridgeSummary("NonExistent"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toContain("Bridge not found");
  });

  it("is disabled when bridgeName is empty", () => {
    const { result } = renderHook(() => useBridgeSummary(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("respects refetchInterval option", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(
      () => useBridgeSummary("Circle", { refetchInterval: 3000 }),
      {
        wrapper: createWrapper(),
      }
    );

    await vi.advanceTimersByTimeAsync(0);

    expect(result.current.isSuccess).toBe(true);
    expect(vi.mocked(api.getBridges)).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);

    expect(vi.mocked(api.getBridges)).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("handles stats fetch failure gracefully", async () => {
    vi.mocked(api.getBridgeStats).mockRejectedValue(
      new Error("Stats unavailable")
    );

    const { result } = renderHook(() => useBridgeSummary("Circle"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const summary = result.current.data;
    // Should still return bridge summary with fallback stats values
    expect(summary?.name).toBe("Circle");
    expect(summary?.coverage).toBe(0); // Fallback
    expect(summary?.performance).toBe(0); // Fallback
  });

  it("updates when bridgeName prop changes", async () => {
    const { result, rerender } = renderHook(
      ({ name }) => useBridgeSummary(name),
      {
        initialProps: { name: "Circle" },
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current.data?.name).toBe("Circle");
    });

    rerender({ name: "Wormhole" });

    await waitFor(() => {
      expect(result.current.data?.name).toBe("Wormhole");
    });
  });

  it("includes all required summary fields", async () => {
    const { result } = renderHook(() => useBridgeSummary("Circle"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const summary = result.current.data;
    expect(summary).toHaveProperty("id");
    expect(summary).toHaveProperty("name");
    expect(summary).toHaveProperty("status");
    expect(summary).toHaveProperty("coverage");
    expect(summary).toHaveProperty("performance");
    expect(summary).toHaveProperty("totalValueLocked");
    expect(summary).toHaveProperty("supplyOnStellar");
    expect(summary).toHaveProperty("supplyOnSource");
    expect(summary).toHaveProperty("mismatchPercentage");
    expect(summary).toHaveProperty("lastUpdated");
  });
});
