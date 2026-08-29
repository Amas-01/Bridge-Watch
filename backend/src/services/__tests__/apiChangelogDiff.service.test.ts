import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { apiChangelogDiffService } from "../apiChangelogDiff.service.js";

describe("apiChangelogDiffService", () => {
  describe("getDiff", () => {
    it("should compute diff between two versions", async () => {
      const diff = await apiChangelogDiffService.getDiff("1.0.0", "1.1.0");
      expect(diff).toHaveProperty("fromVersion");
      expect(diff).toHaveProperty("toVersion");
      expect(diff).toHaveProperty("addedFeatures");
      expect(diff).toHaveProperty("breakingChanges");
    });

    it("should throw error if version not found", async () => {
      await expect(apiChangelogDiffService.getDiff("99.0.0", "100.0.0")).rejects.toThrow();
    });
  });

  describe("getAllVersions", () => {
    it("should return list of all versions", async () => {
      const versions = await apiChangelogDiffService.getAllVersions();
      expect(Array.isArray(versions)).toBe(true);
      if (versions.length > 0) {
        expect(versions[0]).toHaveProperty("version");
        expect(versions[0]).toHaveProperty("releaseDate");
      }
    });
  });

  describe("getVersionDetails", () => {
    it("should return details for a specific version", async () => {
      const versions = await apiChangelogDiffService.getAllVersions();
      if (versions.length > 0) {
        const details = await apiChangelogDiffService.getVersionDetails(versions[0].version);
        expect(details).toHaveProperty("version");
        expect(details.version).toBe(versions[0].version);
      }
    });

    it("should throw error if version not found", async () => {
      await expect(apiChangelogDiffService.getVersionDetails("999.0.0")).rejects.toThrow();
    });
  });
});
