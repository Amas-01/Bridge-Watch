import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { useIncidentFeed } from "./useIncidentFeed";
import type { ReactNode } from "react";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockIncident = {
  id: "inc-1",
  bridgeId: "circle",
  assetCode: "USDC",
  severity: "critical" as const,
  status: "open" as const,
  title: "Supply mismatch detected",
  description: "USDC supply diverged from on-chain reserves",
  sourceUrl: null,
  sourceType: null,
  sourceExternalId: null,
  sourceRepository: null,
  sourceRepoAvatarUrl: null,
  sourceActor: null,
  sourceAttribution: {},
  requiresManualReview: true,
  ingestionAttemptCount: 1,
  lastIngestionError: null,
  normalizedFingerprint: null,
  followUpActions: [],
  occurredAt: "2026-01-01T00:00:00Z",
  resolvedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

let mockWebSocketInstance: {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

describe("useIncidentFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Mock WebSocket
    mockWebSocketInstance = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    };
    vi.stubGlobal(
      "WebSocket",
      vi.fn(() => mockWebSocketInstance),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts in a loading state", () => {
    server.use(
      http.get("/api/v1/incidents", () => new Promise(() => {})),
    );

    const { result } = renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.incidents).toEqual([]);
  });

  it("fetches incidents and returns them", async () => {
    server.use(
      http.get("/api/v1/incidents", () =>
        HttpResponse.json({ incidents: [mockIncident], total: 1 }),
      ),
    );

    const { result } = renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.incidents).toHaveLength(1);
    expect(result.current.incidents[0].id).toBe("inc-1");
    expect(result.current.total).toBe(1);
  });

  it("returns empty array when API returns no incidents", async () => {
    server.use(
      http.get("/api/v1/incidents", () =>
        HttpResponse.json({ incidents: [], total: 0 }),
      ),
    );

    const { result } = renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.incidents).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it("surfaces an error state on a failed request", async () => {
    server.use(
      http.get("/api/v1/incidents", () =>
        HttpResponse.json({ error: "unavailable" }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError ?? result.current.error).toBeDefined());
  });

  it("passes filter params to the API", async () => {
    let capturedUrl = "";
    server.use(
      http.get("/api/v1/incidents", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ incidents: [], total: 0 });
      }),
    );

    renderHook(
      () =>
        useIncidentFeed({
          bridgeId: "circle",
          severity: "critical",
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(capturedUrl).toContain("bridgeId=circle");
      expect(capturedUrl).toContain("severity=critical");
    });
  });

  it("tracks unread incidents", async () => {
    const incidents = [
      { ...mockIncident, id: "inc-1" },
      { ...mockIncident, id: "inc-2" },
      { ...mockIncident, id: "inc-3" },
    ];

    server.use(
      http.get("/api/v1/incidents", () =>
        HttpResponse.json({ incidents, total: 3 }),
      ),
    );

    const { result } = renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.unreadCount).toBe(3);
  });

  it("marks incidents as read", async () => {
    server.use(
      http.get("/api/v1/incidents", () =>
        HttpResponse.json({ incidents: [mockIncident], total: 1 }),
      ),
      http.post("/api/v1/incidents/:id/read", () =>
        HttpResponse.json({ success: true }),
      ),
    );

    const { result } = renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.unreadCount).toBe(1);

    await act(async () => {
      result.current.markRead("inc-1");
    });

    expect(result.current.unreadCount).toBe(0);
  });

  it("persists read state to localStorage", async () => {
    server.use(
      http.get("/api/v1/incidents", () =>
        HttpResponse.json({ incidents: [mockIncident], total: 1 }),
      ),
      http.post("/api/v1/incidents/:id/read", () =>
        HttpResponse.json({ success: true }),
      ),
    );

    const { result } = renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.markRead("inc-1");
    });

    const stored = JSON.parse(localStorage.getItem("bw_read_incidents") || "[]");
    expect(stored).toContain("inc-1");
  });

  it("initializes readIds from localStorage", async () => {
    localStorage.setItem("bw_read_incidents", JSON.stringify(["inc-1"]));

    server.use(
      http.get("/api/v1/incidents", () =>
        HttpResponse.json({ incidents: [mockIncident], total: 1 }),
      ),
    );

    const { result } = renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.readIds.has("inc-1")).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it("handles corrupted localStorage gracefully", async () => {
    localStorage.setItem("bw_read_incidents", "not-valid-json");

    server.use(
      http.get("/api/v1/incidents", () =>
        HttpResponse.json({ incidents: [mockIncident], total: 1 }),
      ),
    );

    const { result } = renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.unreadCount).toBe(1);
  });

  it("creates or retrieves a user session from localStorage", async () => {
    server.use(
      http.get("/api/v1/incidents", () =>
        HttpResponse.json({ incidents: [], total: 0 }),
      ),
    );

    const { unmount } = renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(localStorage.getItem("bw_user_session")).toBeDefined();
    });

    unmount();

    const session = localStorage.getItem("bw_user_session");
    expect(session).toBeTruthy();
    expect(session).toMatch(/^session_/);
  });

  it("subscribes to WebSocket on mount", async () => {
    server.use(
      http.get("/api/v1/incidents", () =>
        HttpResponse.json({ incidents: [], total: 0 }),
      ),
    );

    renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockWebSocketInstance.addEventListener).toHaveBeenCalled();
    });
  });

  it("refetches when WebSocket receives an incident-updates message", async () => {
    let fetchCount = 0;
    server.use(
      http.get("/api/v1/incidents", () => {
        fetchCount += 1;
        return HttpResponse.json({ incidents: [], total: 0 });
      }),
    );

    renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(fetchCount).toBe(1);
    });

    // Find the message handler and trigger it
    const messageCall = mockWebSocketInstance.addEventListener.mock.calls.find(
      ([event]: [string]) => event === "message",
    );
    const onMessage = messageCall?.[1];

    act(() => {
      onMessage({
        data: JSON.stringify({ channel: "incident-updates" }),
      });
    });

    await waitFor(() => {
      expect(fetchCount).toBeGreaterThan(1);
    });
  });

  it("ignores non-incident WebSocket messages", async () => {
    let fetchCount = 0;
    server.use(
      http.get("/api/v1/incidents", () => {
        fetchCount += 1;
        return HttpResponse.json({ incidents: [], total: 0 });
      }),
    );

    renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(fetchCount).toBe(1);
    });

    const messageCall = mockWebSocketInstance.addEventListener.mock.calls.find(
      ([event]: [string]) => event === "message",
    );
    const onMessage = messageCall?.[1];

    act(() => {
      onMessage({
        data: JSON.stringify({ channel: "price-updates" }),
      });
    });

    // Give time for any potential refetch
    await new Promise((r) => setTimeout(r, 100));

    expect(fetchCount).toBe(1);
  });

  it("cleans up WebSocket on unmount", async () => {
    server.use(
      http.get("/api/v1/incidents", () =>
        HttpResponse.json({ incidents: [], total: 0 }),
      ),
    );

    const { unmount } = renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockWebSocketInstance.addEventListener).toHaveBeenCalled();
    });

    unmount();

    expect(mockWebSocketInstance.removeEventListener).toHaveBeenCalled();
    expect(mockWebSocketInstance.close).toHaveBeenCalled();
  });

  it("ignores invalid WebSocket messages", async () => {
    let fetchCount = 0;
    server.use(
      http.get("/api/v1/incidents", () => {
        fetchCount += 1;
        return HttpResponse.json({ incidents: [], total: 0 });
      }),
    );

    renderHook(() => useIncidentFeed(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(fetchCount).toBe(1);
    });

    const messageCall = mockWebSocketInstance.addEventListener.mock.calls.find(
      ([event]: [string]) => event === "message",
    );
    const onMessage = messageCall?.[1];

    act(() => {
      onMessage({ data: "not-json" });
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(fetchCount).toBe(1);
  });
});
