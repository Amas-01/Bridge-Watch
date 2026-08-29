import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { deploymentDriftService } from "../../services/deploymentDrift.service.js";

interface CreateSnapshotBody {
  environmentName: string;
  environmentType: "production" | "staging" | "development" | "testing";
  snapshotVersion: string;
  configJson: Record<string, unknown>;
  deployedBy: string;
  deploymentTimestamp: string;
}

interface DetectDriftBody {
  fromEnvironment: string;
  toEnvironment: string;
}

interface ListQuery {
  limit?: string;
  offset?: string;
}

interface DriftParams {
  driftId: string;
  environmentName: string;
}

export async function deploymentDriftRoutes(server: FastifyInstance) {
  // Create environment snapshot
  server.post<{ Body: CreateSnapshotBody }>(
    "/snapshots",
    async (request: FastifyRequest<{ Body: CreateSnapshotBody }>, reply: FastifyReply) => {
      try {
        const { environmentName, environmentType, snapshotVersion, configJson, deployedBy, deploymentTimestamp } = request.body;

        if (!environmentName || !environmentType || !snapshotVersion || !configJson || !deployedBy) {
          return reply.code(400).send({ error: "All required fields must be provided" });
        }

        const snapshot = await deploymentDriftService.createEnvironmentSnapshot(
          environmentName,
          environmentType,
          snapshotVersion,
          configJson,
          deployedBy,
          new Date(deploymentTimestamp)
        );

        return reply.code(201).send(snapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create snapshot";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Detect drift between environments
  server.post<{ Body: DetectDriftBody }>(
    "/detect",
    async (request: FastifyRequest<{ Body: DetectDriftBody }>, reply: FastifyReply) => {
      try {
        const { fromEnvironment, toEnvironment } = request.body;

        if (!fromEnvironment || !toEnvironment) {
          return reply.code(400).send({ error: "fromEnvironment and toEnvironment are required" });
        }

        const drift = await deploymentDriftService.detectDrift(fromEnvironment, toEnvironment);
        return reply.code(201).send(drift);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to detect drift";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get drifts for a specific environment
  server.get<{ Params: DriftParams; Querystring: ListQuery }>(
    "/environments/:environmentName/drifts",
    async (request: FastifyRequest<{ Params: DriftParams; Querystring: ListQuery }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

        const drifts = await deploymentDriftService.getDriftsByEnvironment(request.params.environmentName, limit, offset);
        return reply.send({ drifts, limit, offset });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch drifts";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Get unapproved drifts
  server.get<{ Querystring: ListQuery }>(
    "/unapproved",
    async (request: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

        const drifts = await deploymentDriftService.getUnapprovedDrifts(limit, offset);
        return reply.send({ drifts, limit, offset });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch unapproved drifts";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Approve drift
  server.post<{ Params: DriftParams; Body: { approvedBy: string } }>(
    "/:driftId/approve",
    async (request: FastifyRequest<{ Params: DriftParams; Body: { approvedBy: string } }>, reply: FastifyReply) => {
      try {
        const { approvedBy } = request.body;

        if (!approvedBy) {
          return reply.code(400).send({ error: "approvedBy is required" });
        }

        await deploymentDriftService.approveDrift(request.params.driftId, approvedBy);
        return reply.send({ status: "approved" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to approve drift";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Create drift alert
  server.post<{
    Params: DriftParams;
    Body: {
      alertType: string;
      description: string;
      remediationSteps: string[];
    };
  }>(
    "/:driftId/alerts",
    async (
      request: FastifyRequest<{
        Params: DriftParams;
        Body: {
          alertType: string;
          description: string;
          remediationSteps: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { alertType, description, remediationSteps } = request.body;

        if (!alertType || !description) {
          return reply.code(400).send({ error: "alertType and description are required" });
        }

        const alert = await deploymentDriftService.createDriftAlert(
          request.params.driftId,
          alertType,
          description,
          remediationSteps || []
        );

        return reply.code(201).send(alert);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create drift alert";
        return reply.code(400).send({ error: message });
      }
    }
  );
}
