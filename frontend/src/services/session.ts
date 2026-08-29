/**
 * Frontend session-token storage and validation.
 *
 * Talks to the backend's real session service (backend/src/services/session.service.ts,
 * mounted at /api/v1/sessions). POST /api/v1/sessions/validate is intentionally
 * unauthenticated on the backend -- it's the endpoint a browser calls with
 * whatever token it's holding to find out whether that token is still good.
 *
 * There is currently no login UI that calls POST /api/v1/sessions to obtain a
 * token in the first place (see issue #931 discussion) -- this module only
 * covers reading whatever token may already be stored and validating it.
 */

const API_BASE_URL = "/api/v1";

export const SESSION_TOKEN_STORAGE_KEY = "bridge_watch_session_token";

export interface ValidatedSession {
  id: string;
  userId: string;
  status: "active" | "expired" | "revoked";
  expiresAt: string;
  lastActiveAt: string;
}

export function getStoredSessionToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    // localStorage can throw in privacy modes / disabled-storage environments.
    return null;
  }
}

export function setStoredSessionToken(token: string): void {
  try {
    window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore write failures (e.g. storage disabled); session simply won't persist.
  }
}

export function clearStoredSessionToken(): void {
  try {
    window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

/**
 * Calls POST /api/v1/sessions/validate with the given token.
 * Returns the session if the token is valid, or null if it's missing,
 * invalid, expired, or revoked (i.e. any 401), or on any other request error.
 */
export async function validateSessionToken(token: string): Promise<ValidatedSession | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return null;
    }

    const body = await response.json();
    return body?.data ?? null;
  } catch {
    return null;
  }
}
