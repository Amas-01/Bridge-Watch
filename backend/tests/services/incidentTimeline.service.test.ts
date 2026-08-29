import { describe, it, expect, beforeEach } from "vitest";
import { IncidentTimelineService } from "../../src/services/incidentTimeline.service.js";

describe("IncidentTimelineService", () => {
  let service: IncidentTimelineService;

  beforeEach(() => {
    service = new IncidentTimelineService();
  });

  describe("addEvent", () => {
    it("adds an event and returns it with id and incidentId", async () => {
      const event = await service.addEvent("incident-1", {
        type: "created",
        actor: "user-1",
        occurredAt: new Date().toISOString(),
      });

      expect(event.id).toBeDefined();
      expect(event.incidentId).toBe("incident-1");
      expect(event.type).toBe("created");
      expect(event.actor).toBe("user-1");
    });

    it("generates a unique id for each event", async () => {
      const event1 = await service.addEvent("incident-1", { type: "created" });
      const event2 = await service.addEvent("incident-1", { type: "updated" });

      expect(event1.id).not.toBe(event2.id);
    });

    it("defaults actor to null when not provided", async () => {
      const event = await service.addEvent("incident-1", {
        type: "system_action",
      });

      expect(event.actor).toBeNull();
    });

    it("defaults metadata to null when not provided", async () => {
      const event = await service.addEvent("incident-1", { type: "test" });

      expect(event.metadata).toBeNull();
    });

    it("stores metadata when provided", async () => {
      const event = await service.addEvent("incident-1", {
        type: "escalated",
        actor: "user-1",
        metadata: { severity: "critical", from: "monitor" },
      });

      expect(event.metadata).toEqual({ severity: "critical", from: "monitor" });
    });

    it("defaults occurredAt to current time when not provided", async () => {
      const before = new Date();
      const event = await service.addEvent("incident-1", { type: "created" });
      const after = new Date();

      const eventTime = new Date(event.occurredAt);
      expect(eventTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(eventTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("getTimeline", () => {
    it("returns empty array for unknown incident", async () => {
      const timeline = await service.getTimeline("incident-unknown");

      expect(timeline).toEqual([]);
    });

    it("returns events sorted by occurredAt ascending", async () => {
      await service.addEvent("incident-1", {
        type: "first",
        occurredAt: "2025-01-02T00:00:00Z",
      });
      await service.addEvent("incident-1", {
        type: "second",
        occurredAt: "2025-01-03T00:00:00Z",
      });
      await service.addEvent("incident-1", {
        type: "third",
        occurredAt: "2025-01-01T00:00:00Z",
      });

      const timeline = await service.getTimeline("incident-1");

      expect(timeline).toHaveLength(3);
      expect(timeline[0].type).toBe("third");
      expect(timeline[1].type).toBe("first");
      expect(timeline[2].type).toBe("second");
    });

    it("returns events in chronological order even when added out of order", async () => {
      await service.addEvent("incident-1", {
        type: "middle",
        occurredAt: "2025-06-15T00:00:00Z",
      });
      await service.addEvent("incident-1", {
        type: "earliest",
        occurredAt: "2025-01-01T00:00:00Z",
      });
      await service.addEvent("incident-1", {
        type: "latest",
        occurredAt: "2025-12-31T00:00:00Z",
      });

      const timeline = await service.getTimeline("incident-1");

      expect(timeline[0].type).toBe("earliest");
      expect(timeline[1].type).toBe("middle");
      expect(timeline[2].type).toBe("latest");
    });

    it("preserves all event data in the timeline", async () => {
      await service.addEvent("incident-1", {
        type: "created",
        actor: "user-1",
        metadata: { note: "initial" },
        occurredAt: "2025-01-01T00:00:00Z",
      });

      const timeline = await service.getTimeline("incident-1");

      expect(timeline[0].type).toBe("created");
      expect(timeline[0].actor).toBe("user-1");
      expect(timeline[0].metadata).toEqual({ note: "initial" });
      expect(timeline[0].incidentId).toBe("incident-1");
    });
  });

  describe("listAll", () => {
    it("returns empty object when no events exist", async () => {
      const all = await service.listAll();

      expect(all).toEqual({});
    });

    it("groups events by incident id", async () => {
      await service.addEvent("incident-1", { type: "created" });
      await service.addEvent("incident-1", { type: "updated" });
      await service.addEvent("incident-2", { type: "created" });

      const all = await service.listAll();

      expect(Object.keys(all)).toHaveLength(2);
      expect(all["incident-1"]).toHaveLength(2);
      expect(all["incident-2"]).toHaveLength(1);
    });
  });

  describe("event isolation", () => {
    it("does not mix events between different incidents", async () => {
      await service.addEvent("incident-a", { type: "alpha" });
      await service.addEvent("incident-b", { type: "beta" });

      const timelineA = await service.getTimeline("incident-a");
      const timelineB = await service.getTimeline("incident-b");

      expect(timelineA).toHaveLength(1);
      expect(timelineA[0].type).toBe("alpha");
      expect(timelineB).toHaveLength(1);
      expect(timelineB[0].type).toBe("beta");
    });
  });

  describe("edge cases", () => {
    it("handles adding many events without performance degradation", async () => {
      const count = 100;
      for (let i = 0; i < count; i++) {
        await service.addEvent("incident-1", {
          type: `event-${i}`,
          occurredAt: new Date(2025, 0, 1, 0, 0, i).toISOString(),
        });
      }

      const timeline = await service.getTimeline("incident-1");

      expect(timeline).toHaveLength(count);
      expect(timeline[0].type).toBe("event-0");
      expect(timeline[count - 1].type).toBe(`event-${count - 1}`);
    });

    it("handles special characters in event type", async () => {
      const event = await service.addEvent("incident-1", {
        type: "alert:triggered@bridge[0]",
      });

      expect(event.type).toBe("alert:triggered@bridge[0]");
    });
  });
});
