import { describe, it, expect, vi, beforeEach } from "vitest";
import { issuerAuthService } from "../../src/services/issuerAuth.service.js";

const mockQuery = vi.fn();

vi.mock("../../src/database/db.js", () => ({
  db: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

describe("issuerAuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordAuthState", () => {
    it("inserts first state without triggering any alerts", async () => {
      // Mock getLatestAuthState checking (no previous state)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock INSERT state
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "state-1",
            issuerAddress: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
            assetCode: "FOBXX",
            authRequired: false,
            authRevocable: false,
            authClawbackEnabled: false,
            authImmutable: false,
            lastCheckedAt: new Date(),
            createdAt: new Date(),
          },
        ],
      });

      const result = await issuerAuthService.recordAuthState(
        "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
        "FOBXX",
        false,
        false,
        false,
        false
      );

      expect(result.state).toBeDefined();
      expect(result.alertsTriggered).toHaveLength(0);
    });

    it("triggers alerts when auth settings transition compared to last state", async () => {
      // Mock getLatestAuthState (previous state)
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "state-1",
            issuerAddress: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
            assetCode: "FOBXX",
            authRequired: false,
            authRevocable: false,
            authClawbackEnabled: false,
            authImmutable: false,
            lastCheckedAt: new Date(),
            createdAt: new Date(),
          },
        ],
      });

      // Mock INSERT new state
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "state-2",
            issuerAddress: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
            assetCode: "FOBXX",
            authRequired: false,
            authRevocable: false,
            authClawbackEnabled: true, // Clawback enabled!
            authImmutable: false,
            lastCheckedAt: new Date(),
            createdAt: new Date(),
          },
        ],
      });

      // Mock alert INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "alert-1",
            issuerAddress: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
            assetCode: "FOBXX",
            alertType: "clawback_state_changed",
            severity: "critical",
            description: "Asset clawback enabled flag changed from false to true",
            resolved: false,
            resolvedAt: null,
            createdAt: new Date(),
          },
        ],
      });

      const result = await issuerAuthService.recordAuthState(
        "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
        "FOBXX",
        false,
        false,
        true, // Enabled clawback
        false
      );

      expect(result.state.authClawbackEnabled).toBe(true);
      expect(result.alertsTriggered).toHaveLength(1);
      expect(result.alertsTriggered[0].alertType).toBe("clawback_state_changed");
    });
  });

  describe("resolveAlert", () => {
    it("resolves an active alert and returns it", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "alert-1",
            issuerAddress: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
            assetCode: "FOBXX",
            alertType: "clawback_state_changed",
            severity: "critical",
            description: "Asset clawback enabled flag changed from false to true",
            resolved: true,
            resolvedAt: new Date(),
            createdAt: new Date(),
          },
        ],
      });

      const alert = await issuerAuthService.resolveAlert("alert-1");

      expect(alert).not.toBeNull();
      expect(alert?.resolved).toBe(true);
      expect(alert?.resolvedAt).toBeInstanceOf(Date);
    });
  });
});
