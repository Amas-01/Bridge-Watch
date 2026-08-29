import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAlertSimulation, type SimulationInput } from "./useAlertSimulation";

const mockInput: SimulationInput = {
  severity: "high",
  assetCode: "USDC",
  sourceType: "stellar",
  ownerAddress: "GA...",
  label: "test-alert",
  triggeredValue: 1500,
  threshold: 1000,
  metric: "tx_volume",
};

const mockResult = {
  simulationId: "sim-1",
  timestamp: "2026-07-29T12:00:00.000Z",
  input: { ...mockInput, ownerAddress: null, label: null, triggeredValue: null, threshold: null, metric: null },
  results: [
    {
      ruleId: "r1",
      ruleName: "High Volume Alert",
      priorityOrder: 1,
      ownerAddress: null,
      matched: true,
      reasons: ["Volume exceeds threshold"],
      channels: ["email"],
      fallbackChannels: ["sms"],
      suppressionWindowSeconds: 3600,
    },
  ],
  skippedInactive: [],
  summary: {
    totalActiveRules: 1,
    totalMatched: 1,
    firstMatchingRule: { ruleId: "r1", ruleName: "High Volume Alert" },
    wouldDispatch: true,
    effectiveChannels: ["email"],
    effectiveFallbackChannels: ["sms"],
    suppressionWindowSeconds: 3600,
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("useAlertSimulation", () => {
  it("initialises with empty history and no current result", () => {
    const { result } = renderHook(() => useAlertSimulation("test-token"));

    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.currentResult).toBeNull();
    expect(result.current.history).toEqual([]);
  });

  it("runs simulation and updates state on success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResult),
    } as Response);

    const { result } = renderHook(() => useAlertSimulation("test-token"));

    await act(async () => {
      await result.current.runSimulation(mockInput);
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.currentResult).toEqual(mockResult);
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]).toEqual(mockResult);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/alert-routing/simulate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-API-Key": "test-token",
        }),
        body: expect.stringContaining("high"),
      }),
    );
  });

  it("sets error when simulation request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Server error" }),
    } as Response);

    const { result } = renderHook(() => useAlertSimulation("test-token"));

    await act(async () => {
      await result.current.runSimulation(mockInput);
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBe("Server error");
    expect(result.current.currentResult).toBeNull();
  });

  it("restores a result from history", () => {
    const { result } = renderHook(() => useAlertSimulation("test-token"));

    act(() => {
      result.current.restoreFromHistory(mockResult);
    });

    expect(result.current.currentResult).toEqual(mockResult);
  });

  it("clears history", () => {
    const { result } = renderHook(() => useAlertSimulation("test-token"));

    act(() => {
      result.current.restoreFromHistory(mockResult);
    });

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.history).toEqual([]);
  });

  it("persists history to localStorage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResult),
    } as Response);

    const { result } = renderHook(() => useAlertSimulation("test-token"));

    await act(async () => {
      await result.current.runSimulation(mockInput);
    });

    const stored = JSON.parse(localStorage.getItem("bw_sim_history") || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].simulationId).toBe("sim-1");
  });

  it("loads persisted history on initialisation", () => {
    localStorage.setItem("bw_sim_history", JSON.stringify([mockResult]));

    const { result } = renderHook(() => useAlertSimulation("test-token"));

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].simulationId).toBe("sim-1");
  });

  it("caps history at 20 entries", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResult),
    } as Response);

    const { result } = renderHook(() => useAlertSimulation("test-token"));

    for (let i = 0; i < 25; i++) {
      await act(async () => {
        await result.current.runSimulation(mockInput);
      });
    }

    expect(result.current.history).toHaveLength(20);
  });
});
