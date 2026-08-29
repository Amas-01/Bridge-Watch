import { useEffect, useState } from "react";
import {
  getStoredSessionToken,
  validateSessionToken,
  type ValidatedSession,
} from "../services/session";

export type SessionValidationStatus = "loading" | "authenticated" | "unauthenticated";

export interface SessionValidationResult {
  status: SessionValidationStatus;
  session: ValidatedSession | null;
}

/**
 * Runs the initial session-token verification exactly once per mount and
 * exposes the current status. Starts as "loading" so callers (e.g.
 * ProtectedRoute) can withhold rendering protected content until this
 * resolves, instead of briefly rendering an unauthenticated state first.
 */
export function useSessionValidation(): SessionValidationResult {
  const [status, setStatus] = useState<SessionValidationStatus>("loading");
  const [session, setSession] = useState<ValidatedSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const token = getStoredSessionToken();

      if (!token) {
        if (!cancelled) {
          setStatus("unauthenticated");
          setSession(null);
        }
        return;
      }

      const validated = await validateSessionToken(token);

      if (cancelled) return;

      if (validated && validated.status === "active") {
        setSession(validated);
        setStatus("authenticated");
      } else {
        setSession(null);
        setStatus("unauthenticated");
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return { status, session };
}
