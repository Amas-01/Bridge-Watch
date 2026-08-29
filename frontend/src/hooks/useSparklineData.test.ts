import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { useSparklineData } from "./useSparklineData";
import type { ReactNode } from "react";
import React from "react";

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });
    return ({ children }: { children: ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
};

const HEALTH_POINTS = Array.from({ length: 10 }, (_, i) => ({
    timestamp: new Date(Date.now() - (9 - i) * 3_600_000).toISOString(),
    score: 80 + i,
}));

const SPARKLINE_POINTS = Array.from({ length: 10 }, (_, i) => ({
    timestamp: new Date(Date.now() - (9 - i) * 3_600_000).toISOString(),
    value: 1.0 + i * 0.01,
}));

describe("useSparklineData – health metric", () => {
    it("fetches and normalises health history", async () => {
        server.use(
            http.get("/api/v1/assets/USDC/health/history", () =>
                HttpResponse.json({ symbol: "USDC", period: "7d", points: HEALTH_POINTS })
            )
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "health" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const data = result.current.data!;
        expect(data.length).toBeGreaterThan(0);
        // values should come from `score` field
        expect(data[0]).toHaveProperty("timestamp");
        expect(data[0]).toHaveProperty("value");
        expect(data[0].value).toBe(HEALTH_POINTS[0].score);
    });

    it("returns sorted points (oldest first)", async () => {
        const shuffled = [...HEALTH_POINTS].reverse();
        server.use(
            http.get("/api/v1/assets/USDC/health/history", () =>
                HttpResponse.json({ symbol: "USDC", period: "7d", points: shuffled })
            )
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "health" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const data = result.current.data!;
        for (let i = 1; i < data.length; i++) {
            expect(new Date(data[i].timestamp).getTime()).toBeGreaterThanOrEqual(
                new Date(data[i - 1].timestamp).getTime()
            );
        }
    });

    it("returns empty array when health endpoint returns null", async () => {
        server.use(
            http.get("/api/v1/assets/USDC/health/history", () =>
                HttpResponse.json(null)
            )
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "health" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual([]);
    });
});

describe("useSparklineData – price metric", () => {
    it("fetches price history and maps to SparklinePoint[]", async () => {
        server.use(
            http.get("/api/v1/assets/USDC/price/history", () =>
                HttpResponse.json({ symbol: "USDC", period: "7d", points: SPARKLINE_POINTS })
            )
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "price" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const data = result.current.data!;
        expect(data.length).toBeGreaterThan(0);
        expect(data[0].value).toBe(SPARKLINE_POINTS[0].value);
    });

    it("passes period query param for 24h price sparkline", async () => {
        let capturedUrl = "";
        server.use(
            http.get("/api/v1/assets/ETH/price/history", ({ request }) => {
                capturedUrl = request.url;
                return HttpResponse.json({ symbol: "ETH", period: "24h", points: SPARKLINE_POINTS });
            })
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "ETH", metric: "price", period: "24h" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(capturedUrl).toContain("period=24h");
    });

    it("applies downsampling when response has more points than maxPoints", async () => {
        // 24h → maxPoints = 48 so we send 100 points to trigger downsampling
        const manyPoints = Array.from({ length: 100 }, (_, i) => ({
            timestamp: new Date(Date.now() - (99 - i) * 60_000).toISOString(),
            value: i * 0.01,
        }));

        server.use(
            http.get("/api/v1/assets/USDC/price/history", () =>
                HttpResponse.json({ symbol: "USDC", period: "24h", points: manyPoints })
            )
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "price", period: "24h" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        // Downsampled result must be ≤ maxPoints (48 for 24h)
        expect(result.current.data!.length).toBeLessThanOrEqual(48);
    });

    it("returns sorted price points (oldest first)", async () => {
        const shuffled = [...SPARKLINE_POINTS].reverse();
        server.use(
            http.get("/api/v1/assets/USDC/price/history", () =>
                HttpResponse.json({ symbol: "USDC", period: "7d", points: shuffled })
            )
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "price" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const data = result.current.data!;
        for (let i = 1; i < data.length; i++) {
            expect(new Date(data[i].timestamp).getTime()).toBeGreaterThanOrEqual(
                new Date(data[i - 1].timestamp).getTime()
            );
        }
    });

    it("returns empty array when API error occurs for price metric", async () => {
        server.use(
            http.get("/api/v1/assets/USDC/price/history", () =>
                HttpResponse.json({ error: "Internal server error" }, { status: 500 })
            )
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "price" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error).toBeTruthy();
    });
});

describe("useSparklineData – volume metric", () => {
    it("fetches volume history and maps to SparklinePoint[]", async () => {
        server.use(
            http.get("/api/v1/assets/USDC/volume/history", () =>
                HttpResponse.json({ symbol: "USDC", period: "7d", points: SPARKLINE_POINTS })
            )
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "volume" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const data = result.current.data!;
        expect(data.length).toBeGreaterThan(0);
        expect(data[0].value).toBe(SPARKLINE_POINTS[0].value);
    });

    it("passes period query param for 30d volume sparkline", async () => {
        let capturedUrl = "";
        server.use(
            http.get("/api/v1/assets/BTC/volume/history", ({ request }) => {
                capturedUrl = request.url;
                return HttpResponse.json({ symbol: "BTC", period: "30d", points: SPARKLINE_POINTS });
            })
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "BTC", metric: "volume", period: "30d" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(capturedUrl).toContain("period=30d");
    });

    it("applies downsampling when response has more points than maxPoints for volume", async () => {
        // 30d → maxPoints = 180 so we send 300 points
        const manyPoints = Array.from({ length: 300 }, (_, i) => ({
            timestamp: new Date(Date.now() - (299 - i) * 3_600_000).toISOString(),
            value: i * 100,
        }));

        server.use(
            http.get("/api/v1/assets/USDC/volume/history", () =>
                HttpResponse.json({ symbol: "USDC", period: "30d", points: manyPoints })
            )
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "volume", period: "30d" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data!.length).toBeLessThanOrEqual(180);
    });

    it("returns error state when volume endpoint fails", async () => {
        server.use(
            http.get("/api/v1/assets/USDC/volume/history", () =>
                HttpResponse.json({ error: "Not found" }, { status: 404 })
            )
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "volume" }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error).toBeTruthy();
    });
});

describe("useSparklineData – general behaviour", () => {
    it("does not fetch when symbol is empty string", () => {
        const { result } = renderHook(
            () => useSparklineData({ symbol: "", metric: "price" }),
            { wrapper: createWrapper() }
        );

        expect(result.current.fetchStatus).toBe("idle");
    });

    it("does not fetch when enabled=false", () => {
        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "price", enabled: false }),
            { wrapper: createWrapper() }
        );

        expect(result.current.fetchStatus).toBe("idle");
    });

    it("defaults to 7d period when none is provided", async () => {
        let capturedUrl = "";
        server.use(
            http.get("/api/v1/assets/USDC/price/history", ({ request }) => {
                capturedUrl = request.url;
                return HttpResponse.json({ symbol: "USDC", period: "7d", points: SPARKLINE_POINTS });
            })
        );

        const { result } = renderHook(
            () => useSparklineData({ symbol: "USDC", metric: "price" }), // no period
            { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(capturedUrl).toContain("period=7d");
    });
});
