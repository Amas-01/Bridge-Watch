import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import {
  SESSION_TOKEN_STORAGE_KEY,
  getStoredSessionToken,
  setStoredSessionToken,
  clearStoredSessionToken,
  validateSessionToken,
} from "./session";

describe("session token storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when no token is stored", () => {
    expect(getStoredSessionToken()).toBeNull();
  });

  it("stores and retrieves a token", () => {
    setStoredSessionToken("abc123");
    expect(getStoredSessionToken()).toBe("abc123");
    expect(window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)).toBe("abc123");
  });

  it("clears a stored token", () => {
    setStoredSessionToken("abc123");
    clearStoredSessionToken();
    expect(getStoredSessionToken()).toBeNull();
  });
});

describe("validateSessionToken", () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it("returns the session data when the backend confirms the token is valid", async () => {
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

    const result = await validateSessionToken("good-token");
    expect(result).toMatchObject({ id: "sess-1", userId: "user-1", status: "active" });
  });

  it("returns null when the backend responds 401 (invalid/expired/revoked)", async () => {
    server.use(
      http.post("/api/v1/sessions/validate", () =>
        HttpResponse.json({ success: false, error: "Invalid or expired session" }, { status: 401 }),
      ),
    );

    const result = await validateSessionToken("bad-token");
    expect(result).toBeNull();
  });

  it("returns null instead of throwing on a network error", async () => {
    server.use(
      http.post("/api/v1/sessions/validate", () => HttpResponse.error()),
    );

    const result = await validateSessionToken("any-token");
    expect(result).toBeNull();
  });
});
