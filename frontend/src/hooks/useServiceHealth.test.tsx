import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { useServiceHealth } from "./useServiceHealth";
import type { ReactNode } from "react";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe("useServiceHealth", () => {
  it("fetches and aggregates service health data", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "horizon",
              displayName: "Horizon API",
              category: "blockchain",
              status: "healthy",
            },
            {
              providerKey: "circle",
              displayName: "Circle API",
              category: "price",
              status: "healthy",
            },
          ],
          summary: {
            healthy: 2,
            degraded: 0,
            down: 0,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    const { result } = renderHook(() => useServiceHealth({ refetchInterval: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      overallStatus: "healthy",
      totalServices: 2,
      healthyCount: 2,
      degradedCount: 0,
      downCount: 0,
      services: [
        { name: "Horizon API", status: "healthy", category: "blockchain" },
        { name: "Circle API", status: "healthy", category: "price" },
      ],
    });
  });

  it("aggregates overall status as degraded when any service is degraded", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "horizon",
              displayName: "Horizon API",
              category: "blockchain",
              status: "healthy",
            },
            {
              providerKey: "circle",
              displayName: "Circle API",
              category: "price",
              status: "degraded",
            },
          ],
          summary: {
            healthy: 1,
            degraded: 1,
            down: 0,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    const { result } = renderHook(() => useServiceHealth({ refetchInterval: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.overallStatus).toBe("degraded");
  });

  it("aggregates overall status as down when any service is down", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "horizon",
              displayName: "Horizon API",
              category: "blockchain",
              status: "healthy",
            },
            {
              providerKey: "circle",
              displayName: "Circle API",
              category: "price",
              status: "down",
            },
          ],
          summary: {
            healthy: 1,
            degraded: 0,
            down: 1,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    const { result } = renderHook(() => useServiceHealth({ refetchInterval: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.overallStatus).toBe("down");
  });

  it("aggregates overall status as maintenance when services are in maintenance", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "horizon",
              displayName: "Horizon API",
              category: "blockchain",
              status: "maintenance",
            },
          ],
          summary: {
            healthy: 0,
            degraded: 0,
            down: 0,
            maintenance: 1,
            unknown: 0,
          },
        });
      })
    );

    const { result } = renderHook(() => useServiceHealth({ refetchInterval: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.overallStatus).toBe("maintenance");
  });

  it("prioritizes down over degraded in aggregation", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [
            {
              providerKey: "horizon",
              displayName: "Horizon API",
              category: "blockchain",
              status: "degraded",
            },
            {
              providerKey: "circle",
              displayName: "Circle API",
              category: "price",
              status: "down",
            },
          ],
          summary: {
            healthy: 0,
            degraded: 1,
            down: 1,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    const { result } = renderHook(() => useServiceHealth({ refetchInterval: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.overallStatus).toBe("down");
  });

  it("handles empty service list", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json({
          dependencies: [],
          summary: {
            healthy: 0,
            degraded: 0,
            down: 0,
            maintenance: 0,
            unknown: 0,
          },
        });
      })
    );

    const { result } = renderHook(() => useServiceHealth({ refetchInterval: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      overallStatus: "healthy",
      totalServices: 0,
      services: [],
    });
  });

  it("handles API errors gracefully", async () => {
    server.use(
      http.get("/api/v1/external-dependencies", () => {
        return HttpResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      })
    );

    const { result } = renderHook(() => useServiceHealth({ refetchInterval: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeTruthy();
  });
});
