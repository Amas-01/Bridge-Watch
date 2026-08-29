import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { useSessionValidation } from "./useSessionValidation";
import { setStoredSessionToken } from "../services/session";

describe("useSessionValidation", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it("stays in the loading state while a stored token's validation request is in flight", () => {
    setStoredSessionToken("some-token");
    // Never-resolving handler keeps the hook in "loading".
    server.use(http.post("/api/v1/sessions/validate", () => new Promise(() => {})));

    const { result } = renderHook(() => useSessionValidation());
    expect(result.current.status).toBe("loading");
  });

  it("resolves synchronously to unauthenticated when there is no stored token to validate", () => {
    const { result } = renderHook(() => useSessionValidation());
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.session).toBeNull();
  });

  it("resolves to authenticated when the stored token validates successfully", async () => {
    setStoredSessionToken("good-token");
    server.use(
      http.post("/api/v1/sessions/validate", () =>
        HttpResponse.json({
          success: true,
          data: {
            id: "sess-1",
            userId: "user-1",
            status: "active",
            expiresAt: "2026-08-01T00:00:00.000Z",
            lastActiveAt: "2026-07-27T00:00:00.000Z",
          },
        }),
      ),
    );

    const { result } = renderHook(() => useSessionValidation());

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.session).toMatchObject({ id: "sess-1", userId: "user-1" });
  });

  it("resolves to unauthenticated when the stored token is rejected", async () => {
    setStoredSessionToken("stale-token");
    server.use(
      http.post("/api/v1/sessions/validate", () =>
        HttpResponse.json({ success: false, error: "Invalid or expired session" }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useSessionValidation());

    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(result.current.session).toBeNull();
  });
});
