import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { artifactProvenanceService } from "../../services/artifactProvenance.service.js";

interface RegisterArtifactBody {
  artifactId: string;
  artifactName: string;
  artifactType: "build" | "package" | "image" | "binary" | "config";
  artifactHash: string;
  sourceRepository: string;
  sourceCommit: string;
  creatorId: string;
}

interface ArtifactParams {
  artifactId: string;
}

interface VerifyArtifactBody {
  verificationType: "hash_verification" | "signature_verification" | "sbom_scan" | "vulnerability_scan" | "license_scan";
  status: "pending" | "passed" | "failed" | "warning" | "skipped";
  findings?: string[];
  riskLevel?: "low" | "medium" | "high" | "critical";
  verifiedBy?: string;
}

interface RecordActionBody {
  action: "created" | "verified" | "signed" | "deployed" | "revoked";
  actorId: string;
  signature?: string;
}

interface ListQuery {
  limit?: string;
  offset?: string;
}

export async function artifactProvenanceRoutes(server: FastifyInstance) {
  // Register artifact
  server.post<{ Body: RegisterArtifactBody }>(
    "/register",
    async (request: FastifyRequest<{ Body: RegisterArtifactBody }>, reply: FastifyReply) => {
      try {
        const { artifactId, artifactName, artifactType, artifactHash, sourceRepository, sourceCommit, creatorId } = request.body;

        if (!artifactId || !artifactName || !artifactType || !artifactHash || !creatorId) {
          return reply.code(400).send({ error: "All required fields must be provided" });
        }

        const artifact = await artifactProvenanceService.registerArtifact(
          artifactId,
          artifactName,
          artifactType,
          artifactHash,
          sourceRepository,
          sourceCommit,
          creatorId
        );

        return reply.code(201).send(artifact);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to register artifact";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Publish artifact
  server.post<{ Params: ArtifactParams }>(
    "/:artifactId/publish",
    async (request: FastifyRequest<{ Params: ArtifactParams }>, reply: FastifyReply) => {
      try {
        await artifactProvenanceService.publishArtifact(request.params.artifactId);
        return reply.send({ status: "published" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to publish artifact";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get artifact details
  server.get<{ Params: ArtifactParams }>(
    "/:artifactId",
    async (request: FastifyRequest<{ Params: ArtifactParams }>, reply: FastifyReply) => {
      try {
        const artifact = await artifactProvenanceService.getArtifactDetails(request.params.artifactId);

        if (!artifact) {
          return reply.code(404).send({ error: "Artifact not found" });
        }

        return reply.send(artifact);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch artifact";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Record artifact action
  server.post<{ Params: ArtifactParams; Body: RecordActionBody }>(
    "/:artifactId/actions",
    async (request: FastifyRequest<{ Params: ArtifactParams; Body: RecordActionBody }>, reply: FastifyReply) => {
      try {
        const { action, actorId, signature } = request.body;

        if (!action || !actorId) {
          return reply.code(400).send({ error: "action and actorId are required" });
        }

        const record = await artifactProvenanceService.recordArtifactAction(request.params.artifactId, action, actorId, signature);
        return reply.code(201).send(record);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to record action";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get artifact chain/audit trail
  server.get<{ Params: ArtifactParams; Querystring: ListQuery }>(
    "/:artifactId/chain",
    async (request: FastifyRequest<{ Params: ArtifactParams; Querystring: ListQuery }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

        const chain = await artifactProvenanceService.getArtifactChain(request.params.artifactId, limit, offset);
        return reply.send({ chain, limit, offset });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch artifact chain";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Verify artifact
  server.post<{ Params: ArtifactParams; Body: VerifyArtifactBody }>(
    "/:artifactId/verify",
    async (request: FastifyRequest<{ Params: ArtifactParams; Body: VerifyArtifactBody }>, reply: FastifyReply) => {
      try {
        const { verificationType, status, findings, riskLevel, verifiedBy } = request.body;

        if (!verificationType || !status) {
          return reply.code(400).send({ error: "verificationType and status are required" });
        }

        const result = await artifactProvenanceService.verifyArtifact(
          request.params.artifactId,
          verificationType,
          status,
          findings || [],
          riskLevel || "low",
          verifiedBy
        );

        return reply.code(201).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to verify artifact";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get artifact verifications
  server.get<{ Params: ArtifactParams; Querystring: ListQuery }>(
    "/:artifactId/verifications",
    async (request: FastifyRequest<{ Params: ArtifactParams; Querystring: ListQuery }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

        const verifications = await artifactProvenanceService.getArtifactVerifications(request.params.artifactId, limit, offset);
        return reply.send({ verifications, limit, offset });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch verifications";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Revoke artifact
  server.post<{ Params: ArtifactParams; Body: { revokedBy: string } }>(
    "/:artifactId/revoke",
    async (request: FastifyRequest<{ Params: ArtifactParams; Body: { revokedBy: string } }>, reply: FastifyReply) => {
      try {
        const { revokedBy } = request.body;

        if (!revokedBy) {
          return reply.code(400).send({ error: "revokedBy is required" });
        }

        await artifactProvenanceService.revokeArtifact(request.params.artifactId, revokedBy);
        return reply.send({ status: "revoked" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to revoke artifact";
        return reply.code(400).send({ error: message });
      }
    }
  );
}
