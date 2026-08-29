import { describe, it, expect, beforeEach, vi } from "vitest";
import { releaseCompatibilityService } from "../releaseCompatibility.service.js";

describe("releaseCompatibilityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCompatibilityRecord", () => {
    it("should create a compatibility record", async () => {
      const record = await releaseCompatibilityService.createCompatibilityRecord(
        "1.0.0",
        "1.1.0",
        "compatible",
        true,
        "https://guide.example.com/1.0-to-1.1",
        [],
        [],
        85.5
      );

      expect(record).toBeDefined();
      expect(record.sourceVersion).toBe("1.0.0");
      expect(record.targetVersion).toBe("1.1.0");
      expect(record.compatibilityStatus).toBe("compatible");
      expect(record.testCoverage).toBe(85.5);
    });

    it("should handle incompatible versions", async () => {
      const record = await releaseCompatibilityService.createCompatibilityRecord(
        "1.0.0",
        "2.0.0",
        "incompatible",
        false,
        undefined,
        ["Changed API structure", "Removed legacy endpoints"],
        ["Old format field"],
        0
      );

      expect(record.compatibilityStatus).toBe("incompatible");
      expect(record.breakingChanges.length).toBe(2);
      expect(record.migrationPathAvailable).toBe(false);
    });

    it("should handle partial compatibility", async () => {
      const record = await releaseCompatibilityService.createCompatibilityRecord(
        "1.5.0",
        "1.6.0",
        "partial",
        true,
        "https://migration.example.com",
        ["Deprecated field D"],
        ["Field C is deprecated"],
        60
      );

      expect(record.compatibilityStatus).toBe("partial");
      expect(record.deprecations.length).toBe(1);
    });
  });

  describe("verifyCompatibility", () => {
    it("should verify a compatibility record", async () => {
      await releaseCompatibilityService.createCompatibilityRecord(
        "2.0.0",
        "2.1.0",
        "compatible",
        true,
        undefined,
        [],
        [],
        90
      );

      const verified = await releaseCompatibilityService.verifyCompatibility("2.0.0", "2.1.0", "verifier-user");

      expect(verified.verifiedBy).toBe("verifier-user");
      expect(verified.verifiedAt).toBeDefined();
    });
  });

  describe("recordTestResult", () => {
    it("should record test results", async () => {
      const result = await releaseCompatibilityService.recordTestResult(
        "1.0.0",
        "1.1.0",
        "test-001",
        "API Endpoint Test",
        "api",
        "passed",
        150
      );

      expect(result).toBeDefined();
      expect(result.sourceVersion).toBe("1.0.0");
      expect(result.testCategory).toBe("api");
      expect(result.status).toBe("passed");
      expect(result.executionTimeMs).toBe(150);
    });

    it("should record failed test with error message", async () => {
      const result = await releaseCompatibilityService.recordTestResult(
        "1.5.0",
        "1.6.0",
        "test-002",
        "Migration Test",
        "migration",
        "failed",
        500,
        "Migration script failed at step 3"
      );

      expect(result.status).toBe("failed");
      expect(result.errorMessage).toBe("Migration script failed at step 3");
    });

    it("should record different test categories", async () => {
      const categories: Array<"migration" | "api" | "performance" | "security" | "functionality"> = [
        "migration",
        "api",
        "performance",
        "security",
        "functionality",
      ];

      for (const category of categories) {
        const result = await releaseCompatibilityService.recordTestResult(
          "1.0.0",
          "1.1.0",
          `test-${category}`,
          `${category} Test`,
          category,
          "passed"
        );

        expect(result.testCategory).toBe(category);
      }
    });
  });

  describe("getCompatibilityMatrix", () => {
    it("should generate compatibility matrix for a release", async () => {
      await releaseCompatibilityService.createCompatibilityRecord("1.0.0", "1.1.0", "compatible");
      await releaseCompatibilityService.createCompatibilityRecord("1.0.0", "2.0.0", "incompatible");
      await releaseCompatibilityService.createCompatibilityRecord("1.0.0", "1.0.1", "compatible");

      const matrix = await releaseCompatibilityService.getCompatibilityMatrix("1.0.0");

      expect(matrix).toBeDefined();
      expect(matrix.releaseVersion).toBe("1.0.0");
      expect(matrix.compatibleVersions.length).toBeGreaterThan(0);
      expect(matrix.incompatibleVersions.length).toBeGreaterThan(0);
      expect(matrix.overallScore).toBeLessThanOrEqual(100);
    });

    it("should calculate overall compatibility score", async () => {
      await releaseCompatibilityService.createCompatibilityRecord("2.0.0", "2.1.0", "compatible");
      await releaseCompatibilityService.createCompatibilityRecord("2.0.0", "2.2.0", "compatible");
      await releaseCompatibilityService.createCompatibilityRecord("2.0.0", "3.0.0", "incompatible");

      const matrix = await releaseCompatibilityService.getCompatibilityMatrix("2.0.0");

      const expectedScore = (2 / 3) * 100; // 2 compatible out of 3 total
      expect(Math.round(matrix.overallScore)).toBeCloseTo(Math.round(expectedScore), 0);
    });
  });

  describe("getTestResultsForVersions", () => {
    it("should fetch test results for version pair", async () => {
      await releaseCompatibilityService.recordTestResult(
        "1.0.0",
        "1.1.0",
        "test-1",
        "Test 1",
        "api",
        "passed"
      );

      await releaseCompatibilityService.recordTestResult(
        "1.0.0",
        "1.1.0",
        "test-2",
        "Test 2",
        "performance",
        "passed",
        200
      );

      const results = await releaseCompatibilityService.getTestResultsForVersions("1.0.0", "1.1.0");

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].sourceVersion).toBe("1.0.0");
      expect(results[0].targetVersion).toBe("1.1.0");
    });

    it("should handle pagination", async () => {
      const results = await releaseCompatibilityService.getTestResultsForVersions("1.0.0", "1.1.0", 5, 0);

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe("getCompatibilityRecord", () => {
    it("should fetch a specific compatibility record", async () => {
      const created = await releaseCompatibilityService.createCompatibilityRecord(
        "3.0.0",
        "3.1.0",
        "compatible",
        true,
        "https://guide.example.com"
      );

      const fetched = await releaseCompatibilityService.getCompatibilityRecord("3.0.0", "3.1.0");

      expect(fetched).toBeDefined();
      expect(fetched?.sourceVersion).toBe("3.0.0");
      expect(fetched?.targetVersion).toBe("3.1.0");
      expect(fetched?.compatibilityStatus).toBe("compatible");
    });

    it("should return null for non-existent record", async () => {
      const fetched = await releaseCompatibilityService.getCompatibilityRecord("99.0.0", "99.1.0");
      expect(fetched).toBeNull();
    });
  });
});
