/**
 * Tests for the bridge data-fetching hooks (useBridges, useBridgeStats) —
 * following the MSW v2 + renderHook convention used by the other hook tests.
 */
import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { useBridges, useBridgeStats } from "./useBridges";
import type { ReactNode } from "react";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useBridges", () => {
  it("starts in a loading state", () => {
    server.use(
      http.get("/api/v1/bridges", () => new Promise(() => {})) // never resolves
    );

    const { result } = renderHook(() => useBridges(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("fetches the list of bridges", async () => {
    const { result } = renderHook(() => useBridges(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.bridges).toHaveLength(2);
    expect(result.current.data?.bridges[0].name).toBe("Circle");
    expect(result.current.data?.bridges[1].status).toBe("degraded");
  });

  it("surfaces an error state on a failed request", async () => {
    server.use(
      http.get("/api/v1/bridges", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useBridges(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it("refetches when explicitly invalidated", async () => {
    let callCount = 0;
    server.use(
      http.get("/api/v1/bridges", () => {
        callCount += 1;
        return HttpResponse.json({ bridges: [] });
      })
    );

    const { result } = renderHook(() => useBridges(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const initial = callCount;

    await act(async () => {
      await result.current.refetch();
    });

    expect(callCount).toBeGreaterThan(initial);
  });
});

describe("useBridgeStats", () => {
  it("fetches stats for a named bridge", async () => {
    server.use(
      http.get("/api/v1/bridges/:bridge/stats", ({ params }) =>
        HttpResponse.json({
          name: params.bridge,
          volume24h: 50_000_000,
          volume7d: 300_000_000,
          volume30d: 1_000_000_000,
          totalTransactions: 15_000,
          averageTransferTime: 234.5,
          uptime30d: 99.5,
        })
      )
    );

    const { result } = renderHook(() => useBridgeStats("Circle"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.name).toBe("Circle");
    expect(result.current.data?.uptime30d).toBe(99.5);
  });

  it("is disabled when no bridge name is provided", () => {
    const { result } = renderHook(() => useBridgeStats(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("surfaces an error state when stats are unavailable", async () => {
    server.use(
      http.get("/api/v1/bridges/:bridge/stats", () =>
        HttpResponse.json({ error: "unavailable" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useBridgeStats("Circle"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });
});
