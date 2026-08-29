import { describe, it, expect, beforeEach, vi } from "vitest";
import { artifactProvenanceService } from "../artifactProvenance.service.js";

describe("artifactProvenanceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("registerArtifact", () => {
    it("should register a new artifact", async () => {
      const artifact = await artifactProvenanceService.registerArtifact(
        "artifact-001",
        "Bridge Watch v1.0.0",
        "image",
        "sha256:abc123def456",
        "https://github.com/bridge-watch/app",
        "abc123def456",
        "user-123"
      );

      expect(artifact).toBeDefined();
      expect(artifact.artifactId).toBe("artifact-001");
      expect(artifact.artifactName).toBe("Bridge Watch v1.0.0");
      expect(artifact.artifactType).toBe("image");
    });

    it("should register different artifact types", async () => {
      const types: Array<"build" | "package" | "image" | "binary" | "config"> = [
        "build",
        "package",
        "image",
        "binary",
        "config",
      ];

      for (const type of types) {
        const artifact = await artifactProvenanceService.registerArtifact(
          `artifact-${type}`,
          `Artifact ${type}`,
          type,
          `hash-${type}`,
          "repo",
          "commit",
          "user"
        );

        expect(artifact.artifactType).toBe(type);
      }
    });
  });

  describe("publishArtifact", () => {
    it("should publish an artifact", async () => {
      const artifact = await artifactProvenanceService.registerArtifact(
        "publish-test",
        "Test Artifact",
        "package",
        "hash123",
        "repo",
        "commit",
        "user"
      );

      await artifactProvenanceService.publishArtifact(artifact.artifactId);

      const fetched = await artifactProvenanceService.getArtifactDetails(artifact.artifactId);
      expect(fetched).toBeDefined();
    });
  });

  describe("recordArtifactAction", () => {
    it("should record artifact actions in the chain", async () => {
      const artifact = await artifactProvenanceService.registerArtifact(
        "action-test",
        "Action Test",
        "image",
        "hash",
        "repo",
        "commit",
        "creator"
      );

      const action1 = await artifactProvenanceService.recordArtifactAction(
        artifact.artifactId,
        "verified",
        "verifier-user"
      );

      expect(action1).toBeDefined();
      expect(action1.action).toBe("verified");

      const action2 = await artifactProvenanceService.recordArtifactAction(
        artifact.artifactId,
        "signed",
        "signer-user",
        "signature123"
      );

      expect(action2.action).toBe("signed");
    });
  });

  describe("verifyArtifact", () => {
    it("should verify artifact with different verification types", async () => {
      const artifact = await artifactProvenanceService.registerArtifact(
        "verify-test",
        "Verification Test",
        "image",
        "hash",
        "repo",
        "commit",
        "user"
      );

      const result = await artifactProvenanceService.verifyArtifact(
        artifact.artifactId,
        "hash_verification",
        "passed",
        ["Hash matches"],
        "low",
        "verifier"
      );

      expect(result).toBeDefined();
      expect(result.verificationType).toBe("hash_verification");
      expect(result.status).toBe("passed");
    });

    it("should record vulnerability scan results", async () => {
      const artifact = await artifactProvenanceService.registerArtifact(
        "vuln-test",
        "Vuln Test",
        "image",
        "hash",
        "repo",
        "commit",
        "user"
      );

      const result = await artifactProvenanceService.verifyArtifact(
        artifact.artifactId,
        "vulnerability_scan",
        "warning",
        ["CVE-2024-001"],
        "medium",
        "security-scanner"
      );

      expect(result.status).toBe("warning");
      expect(result.riskLevel).toBe("medium");
    });
  });

  describe("getArtifactChain", () => {
    it("should fetch artifact audit trail", async () => {
      const artifact = await artifactProvenanceService.registerArtifact(
        "chain-test",
        "Chain Test",
        "package",
        "hash",
        "repo",
        "commit",
        "user"
      );

      await artifactProvenanceService.recordArtifactAction(artifact.artifactId, "verified", "user1");
      await artifactProvenanceService.recordArtifactAction(artifact.artifactId, "signed", "user2");

      const chain = await artifactProvenanceService.getArtifactChain(artifact.artifactId);

      expect(Array.isArray(chain)).toBe(true);
      expect(chain.length).toBeGreaterThan(0);
    });
  });

  describe("getArtifactDetails", () => {
    it("should fetch artifact details", async () => {
      const artifact = await artifactProvenanceService.registerArtifact(
        "details-test",
        "Details Test",
        "binary",
        "hash",
        "repo",
        "commit",
        "creator"
      );

      const fetched = await artifactProvenanceService.getArtifactDetails(artifact.artifactId);

      expect(fetched).toBeDefined();
      expect(fetched?.artifactId).toBe(artifact.artifactId);
      expect(fetched?.creatorId).toBe("creator");
    });

    it("should return null for non-existent artifact", async () => {
      const fetched = await artifactProvenanceService.getArtifactDetails("non-existent");
      expect(fetched).toBeNull();
    });
  });

  describe("revokeArtifact", () => {
    it("should revoke an artifact", async () => {
      const artifact = await artifactProvenanceService.registerArtifact(
        "revoke-test",
        "Revoke Test",
        "image",
        "hash",
        "repo",
        "commit",
        "user"
      );

      await artifactProvenanceService.revokeArtifact(artifact.artifactId, "admin-user");

      const chain = await artifactProvenanceService.getArtifactChain(artifact.artifactId);
      const revokeAction = chain.find((a) => a.action === "revoked");

      expect(revokeAction).toBeDefined();
    });
  });
});
