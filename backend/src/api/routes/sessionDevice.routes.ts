import type { FastifyInstance } from "fastify";
import {
  sessionDeviceService,
  type DeviceType,
} from "../../services/sessionDevice.service.js";
import { sendApiError } from "../utils/response.js";
import { authMiddleware } from "../middleware/auth.js";

interface RegisterDeviceBody {
  userId?: string;
  deviceFingerprint: string;
  deviceName: string;
  deviceType?: DeviceType;
  ipAddress?: string;
  location?: string;
  userAgent?: string;
}

interface SetTrustBody {
  isTrusted: boolean;
}

export async function sessionDeviceRoutes(server: FastifyInstance) {
  const requireAuth = authMiddleware();

  // Register or update active session device
  server.post<{ Body: RegisterDeviceBody }>(
    "/register",
    { preHandler: requireAuth },
    async (request, reply) => {
      const {
        userId,
        deviceFingerprint,
        deviceName,
        deviceType,
        ipAddress,
        location,
        userAgent,
      } = request.body;

      const targetUserId = userId ?? request.apiKeyAuth?.name ?? "default_user";
      const resolvedIp = ipAddress ?? request.ip ?? "127.0.0.1";

      if (!deviceFingerprint?.trim() || !deviceName?.trim()) {
        return sendApiError(
          reply,
          400,
          "deviceFingerprint and deviceName are required"
        );
      }

      try {
        const device = await sessionDeviceService.registerOrUpdateDevice({
          userId: targetUserId,
          deviceFingerprint,
          deviceName,
          deviceType,
          ipAddress: resolvedIp,
          location,
          userAgent: userAgent ?? request.headers["user-agent"],
        });
        return reply.code(201).send({ device });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Device registration failed";
        return sendApiError(reply, 400, message);
      }
    }
  );

  // List session devices for user
  server.get<{ Querystring: { userId?: string } }>(
    "/",
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.query.userId ?? request.apiKeyAuth?.name ?? "default_user";
      const devices = await sessionDeviceService.getUserDevices(userId);
      return { devices };
    }
  );

  // Revoke single device session
  server.delete<{ Params: { deviceId: string }; Querystring: { userId?: string } }>(
    "/:deviceId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.query.userId ?? request.apiKeyAuth?.name ?? "default_user";
      const device = await sessionDeviceService.revokeDevice(
        userId,
        request.params.deviceId
      );

      if (!device) {
        return sendApiError(reply, 404, "Device session not found");
      }

      return { device };
    }
  );

  // Revoke all other active device sessions
  server.post<{ Body: { currentDeviceId: string; userId?: string } }>(
    "/revoke-others",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { currentDeviceId, userId } = request.body;
      const targetUserId = userId ?? request.apiKeyAuth?.name ?? "default_user";

      if (!currentDeviceId?.trim()) {
        return sendApiError(reply, 400, "currentDeviceId is required");
      }

      const revokedCount = await sessionDeviceService.revokeOtherDevices(
        targetUserId,
        currentDeviceId
      );

      return { revokedCount };
    }
  );

  // Toggle device trust status
  server.patch<{ Params: { deviceId: string }; Body: SetTrustBody }>(
    "/:deviceId/trust",
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.apiKeyAuth?.name ?? "default_user";
      const device = await sessionDeviceService.setTrustStatus(
        userId,
        request.params.deviceId,
        request.body.isTrusted
      );

      if (!device) {
        return sendApiError(reply, 404, "Device session not found");
      }

      return { device };
    }
  );
}
