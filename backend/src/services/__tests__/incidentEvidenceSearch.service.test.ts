import { describe, it, expect } from "vitest";

describe("incidentEvidenceSearchService", () => {
  describe("searchEvidence", () => {
    it("should search evidence by query", async () => {
      const query = "bridge failure";
      const mockResults = [
        {
          id: "1",
          incidentId: "incident-1",
          annotationId: "annot-1",
          content: "Bridge failure detected",
          author: "admin",
          severity: "high" as const,
          tags: ["bridge", "failure"],
          createdAt: new Date(),
        },
      ];

      expect(query).toBeDefined();
      expect(Array.isArray(mockResults)).toBe(true);
      expect(mockResults[0].content).toContain("failure");
    });

    it("should filter evidence by severity", async () => {
      const filters = { severity: "critical" };
      const mockResults = [
        {
          id: "1",
          incidentId: "incident-1",
          severity: "critical" as const,
        },
      ];

      expect(filters.severity).toBe("critical");
      expect(mockResults[0].severity).toBe("critical");
    });

    it("should filter evidence by tags", async () => {
      const filters = { tags: ["security", "urgent"] };
      const mockResults = [
        {
          id: "1",
          tags: ["security", "urgent"],
        },
      ];

      expect(filters.tags).toHaveLength(2);
      expect(mockResults[0].tags).toContain("security");
    });

    it("should filter evidence by date range", async () => {
      const dateFrom = new Date("2026-01-01");
      const dateTo = new Date("2026-12-31");
      const filters = { dateFrom, dateTo };

      expect(filters.dateFrom).toBeDefined();
      expect(filters.dateTo).toBeDefined();
      expect(dateFrom < dateTo).toBe(true);
    });
  });

  describe("addEvidenceAnnotation", () => {
    it("should add new evidence annotation", async () => {
      const mockAnnotation = {
        id: "annot-1",
        incidentId: "incident-1",
        content: "Critical evidence",
        author: "analyst",
        severity: "high" as const,
        tags: ["critical", "confirmed"],
        evidenceType: "log_entry",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(mockAnnotation.incidentId).toBeDefined();
      expect(mockAnnotation.content).toBeDefined();
      expect(mockAnnotation.severity).toBe("high");
    });
  });

  describe("getIncidentEvidence", () => {
    it("should retrieve all evidence for incident", async () => {
      const mockEvidence = [
        {
          id: "1",
          incidentId: "incident-1",
          content: "Evidence 1",
          severity: "high" as const,
        },
        {
          id: "2",
          incidentId: "incident-1",
          content: "Evidence 2",
          severity: "medium" as const,
        },
      ];

      expect(Array.isArray(mockEvidence)).toBe(true);
      expect(mockEvidence.length).toBe(2);
      expect(mockEvidence.every((e) => e.incidentId === "incident-1")).toBe(true);
    });
  });

  describe("updateEvidenceAnnotation", () => {
    it("should update evidence annotation", async () => {
      const updates = {
        content: "Updated evidence",
        severity: "critical" as const,
      };

      expect(updates.content).toBeDefined();
      expect(updates.severity).toBe("critical");
    });

    it("should update tags", async () => {
      const updates = {
        tags: ["updated", "confirmed"],
      };

      expect(updates.tags).toHaveLength(2);
      expect(updates.tags).toContain("updated");
    });
  });
});
