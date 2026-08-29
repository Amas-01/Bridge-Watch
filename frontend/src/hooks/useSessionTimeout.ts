import { useState, useCallback, useEffect } from "react";

/**
 * Hook to manage session timeout
 */
export function useSessionTimeout(
  sessionDurationMs: number = 30 * 60 * 1000, // 30 minutes
  warningBeforeMs: number = 2 * 60 * 1000, // 2 minutes warning
) {
  const [showModal, setShowModal] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());

  const extendSession = useCallback(() => {
    setLastActivity(Date.now());
    setShowModal(false);
  }, []);

  const logout = useCallback(() => {
    setShowModal(false);
    // Implement actual logout logic
    console.log("User logged out due to inactivity");
    // window.location.href = "/logout";
  }, []);

  useEffect(() => {
    const handleActivity = () => {
      setLastActivity(Date.now());
      setShowModal(false);
    };

    // Track user activity
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, []);

  useEffect(() => {
    const checkTimeout = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivity;
      const timeUntilTimeout = sessionDurationMs - timeSinceActivity;

      if (timeUntilTimeout <= 0) {
        logout();
      } else if (timeUntilTimeout <= warningBeforeMs && !showModal) {
        setShowModal(true);
      }
    }, 1000);

    return () => clearInterval(checkTimeout);
  }, [lastActivity, sessionDurationMs, warningBeforeMs, showModal, logout]);

  return {
    showModal,
    timeoutSeconds: Math.floor(warningBeforeMs / 1000),
    extendSession,
    logout,
  };
}
