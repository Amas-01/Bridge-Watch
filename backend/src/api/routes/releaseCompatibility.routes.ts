import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { releaseCompatibilityService } from "../../services/releaseCompatibility.service.js";

interface CreateCompatibilityRecordBody {
  sourceVersion: string;
  targetVersion: string;
  compatibilityStatus: "compatible" | "incompatible" | "partial" | "untested" | "deprecated";
  migrationPathAvailable?: boolean;
  migrationGuideUrl?: string;
  breakingChanges?: string[];
  deprecations?: string[];
  testCoverage?: number;
}

interface RecordTestResultBody {
  sourceVersion: string;
  targetVersion: string;
  testId: string;
  testName: string;
  testCategory: "migration" | "api" | "performance" | "security" | "functionality";
  status: "passed" | "failed" | "skipped" | "error";
  executionTimeMs?: number;
  errorMessage?: string;
}

interface VersionParams {
  sourceVersion?: string;
  targetVersion?: string;
  releaseVersion?: string;
}

interface ListQuery {
  limit?: string;
  offset?: string;
}

export async function releaseCompatibilityRoutes(server: FastifyInstance) {
  // Create compatibility record
  server.post<{ Body: CreateCompatibilityRecordBody }>(
    "/",
    async (request: FastifyRequest<{ Body: CreateCompatibilityRecordBody }>, reply: FastifyReply) => {
      try {
        const {
          sourceVersion,
          targetVersion,
          compatibilityStatus,
          migrationPathAvailable,
          migrationGuideUrl,
          breakingChanges,
          deprecations,
          testCoverage,
        } = request.body;

        if (!sourceVersion || !targetVersion || !compatibilityStatus) {
          return reply.code(400).send({ error: "sourceVersion, targetVersion, and compatibilityStatus are required" });
        }

        const record = await releaseCompatibilityService.createCompatibilityRecord(
          sourceVersion,
          targetVersion,
          compatibilityStatus,
          migrationPathAvailable || false,
          migrationGuideUrl,
          breakingChanges || [],
          deprecations || [],
          testCoverage || 0
        );

        return reply.code(201).send(record);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create compatibility record";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get compatibility record between two versions
  server.get<{ Params: VersionParams }>(
    "/:sourceVersion/:targetVersion",
    async (request: FastifyRequest<{ Params: VersionParams }>, reply: FastifyReply) => {
      try {
        const record = await releaseCompatibilityService.getCompatibilityRecord(
          request.params.sourceVersion!,
          request.params.targetVersion!
        );

        if (!record) {
          return reply.code(404).send({ error: "Compatibility record not found" });
        }

        return reply.send(record);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch compatibility record";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get compatibility matrix for a release
  server.get<{ Params: VersionParams }>(
    "/matrix/:releaseVersion",
    async (request: FastifyRequest<{ Params: VersionParams }>, reply: FastifyReply) => {
      try {
        const matrix = await releaseCompatibilityService.getCompatibilityMatrix(request.params.releaseVersion!);
        return reply.send(matrix);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch compatibility matrix";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Record test result
  server.post<{ Body: RecordTestResultBody }>(
    "/tests",
    async (request: FastifyRequest<{ Body: RecordTestResultBody }>, reply: FastifyReply) => {
      try {
        const { sourceVersion, targetVersion, testId, testName, testCategory, status, executionTimeMs, errorMessage } = request.body;

        if (!sourceVersion || !targetVersion || !testId || !testName || !testCategory || !status) {
          return reply.code(400).send({ error: "All required fields must be provided" });
        }

        const result = await releaseCompatibilityService.recordTestResult(
          sourceVersion,
          targetVersion,
          testId,
          testName,
          testCategory,
          status,
          executionTimeMs || 0,
          errorMessage
        );

        return reply.code(201).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to record test result";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get test results for version pair
  server.get<{ Params: VersionParams; Querystring: ListQuery }>(
    "/tests/:sourceVersion/:targetVersion",
    async (request: FastifyRequest<{ Params: VersionParams; Querystring: ListQuery }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

        const results = await releaseCompatibilityService.getTestResultsForVersions(
          request.params.sourceVersion!,
          request.params.targetVersion!,
          limit,
          offset
        );

        return reply.send({ results, limit, offset });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch test results";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Verify compatibility
  server.post<{ Params: VersionParams; Body: { verifiedBy: string } }>(
    "/:sourceVersion/:targetVersion/verify",
    async (request: FastifyRequest<{ Params: VersionParams; Body: { verifiedBy: string } }>, reply: FastifyReply) => {
      try {
        const { verifiedBy } = request.body;

        if (!verifiedBy) {
          return reply.code(400).send({ error: "verifiedBy is required" });
        }

        const record = await releaseCompatibilityService.verifyCompatibility(
          request.params.sourceVersion!,
          request.params.targetVersion!,
          verifiedBy
        );

        return reply.send(record);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to verify compatibility";
        return reply.code(400).send({ error: message });
      }
    }
  );
}
