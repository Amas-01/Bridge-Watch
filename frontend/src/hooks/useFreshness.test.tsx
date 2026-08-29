/**
 * Tests for the composite `useFreshness` hook — following the MSW v2 +
 * renderHook convention used by the other hook tests.
 *
 * The central guarantee is referential stability: the object returned by
 * `useFreshness` must keep the same identity across re-renders unless the
 * underlying query data actually changes. That is what prevents the infinite
 * re-render loops described in the bug report.
 */
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { useFreshness } from "./useFreshness";
import type { ReactNode } from "react";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function createWrapper(client?: QueryClient) {
  const queryClient = client ?? makeClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const snapshotPayload = {
  sources: [
    {
      key: "stellar-horizon",
      label: "Stellar Horizon",
      status: "fresh",
      lastUpdated: new Date().toISOString(),
      expectedIntervalMs: 30000,
      trend: "stable",
    },
    {
      key: "circle-usdc",
      label: "Circle USDC",
      status: "stale",
      lastUpdated: new Date().toISOString(),
      expectedIntervalMs: 60000,
      trend: "degrading",
    },
  ],
  staleSources: 1,
  freshSources: 1,
  timestamp: new Date().toISOString(),
};

const alertsPayload = {
  alerts: [
    {
      source: "circle-usdc",
      label: "Circle USDC",
      severity: "critical",
      message: "No update in 10 minutes",
      since: new Date().toISOString(),
    },
  ],
  timestamp: new Date().toISOString(),
};

function stubFreshnessEndpoints() {
  server.use(
    http.get("/api/v1/freshness", () => HttpResponse.json(snapshotPayload)),
    http.get("/api/v1/freshness/alerts", () => HttpResponse.json(alertsPayload))
  );
}

describe("useFreshness", () => {
  it("combines the snapshot and alerts queries into one view", async () => {
    stubFreshnessEndpoints();

    const { result } = renderHook(() => useFreshness(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.sources).toHaveLength(2));

    expect(result.current.staleSources).toBe(1);
    expect(result.current.freshSources).toBe(1);
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
  });

  it("derives critical source keys from critical alerts only", async () => {
    stubFreshnessEndpoints();

    const { result } = renderHook(() => useFreshness(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    expect(result.current.criticalSourceKeys.has("circle-usdc")).toBe(true);
    expect(result.current.criticalSourceKeys.has("stellar-horizon")).toBe(false);
  });

  it("returns a referentially stable object across re-renders (no infinite loop)", async () => {
    stubFreshnessEndpoints();

    const { result, rerender } = renderHook(() => useFreshness(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.sources).toHaveLength(2));

    const first = result.current;

    // Re-render without any change to the underlying query data.
    rerender();
    rerender();

    // The whole result object, its derived collections and the refetch
    // callback must keep the same identity — this is the anti-regression guard.
    expect(result.current).toBe(first);
    expect(result.current.sources).toBe(first.sources);
    expect(result.current.criticalSourceKeys).toBe(first.criticalSourceKeys);
    expect(result.current.refetch).toBe(first.refetch);
  });

  it("exposes stable empty collections while loading", () => {
    server.use(
      http.get("/api/v1/freshness", () => new Promise(() => {})),
      http.get("/api/v1/freshness/alerts", () => new Promise(() => {}))
    );

    const { result, rerender } = renderHook(() => useFreshness(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.sources).toEqual([]);
    expect(result.current.alerts).toEqual([]);

    const firstSources = result.current.sources;
    rerender();
    // Empty collections keep their identity too, so consumers can safely place
    // them in dependency arrays even before data arrives.
    expect(result.current.sources).toBe(firstSources);
  });
});
