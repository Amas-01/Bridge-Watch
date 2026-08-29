import type { FastifyRequest, FastifyReply } from "fastify";
import { RequestSamplingService } from "../../services/requestSampling.service.js";

/**
 * Fastify preHandler middleware for request sampling.
 * Issue: #1058
 *
 * Evaluates all enabled sampling rules against the incoming request and
 * attaches the sampling decision to `request.samplingDecision`. Route handlers
 * and logging pipelines can read this flag to gate expensive operations.
 *
 * The middleware never rejects a request — it is purely informational. A
 * decision of `false` means "exclude from sample" and should be used by
 * downstream consumers to skip telemetry, analytics, or debug logging.
 *
 * Usage (per-route):
 *   server.get('/endpoint', { preHandler: requestSamplingMiddleware }, handler)
 *
 * Usage (global on a plugin):
 *   server.addHook('preHandler', requestSamplingMiddleware)
 */
export async function requestSamplingMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const service = RequestSamplingService.getInstance();

  const decision = await service.shouldSampleRequest({
    id: request.id,
    url: request.url,
    clientId: request.apiKeyAuth?.id ?? request.ip,
  });

  // Attach the decision to the request object for downstream consumers
  request.samplingDecision = decision;
}
