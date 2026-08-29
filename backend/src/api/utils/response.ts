import type { FastifyReply } from "fastify";

const HTTP_STATUS_TEXTS: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

function statusText(code: number): string {
  return HTTP_STATUS_TEXTS[code] ?? "Error";
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Send a standardized JSON error response across all Fastify routes.
 *
 * Replaces the mix of `{ error: string }` and `{ message, statusCode }`
 * shapes that existed in various route handlers. All error responses now
 * follow the same envelope so API consumers can handle errors uniformly.
 *
 * @example
 * sendApiError(reply, 404, "Metric not found");
 * sendApiError(reply, 400, "Invalid payload", { field: "name" });
 */
export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  message: string,
  details?: Record<string, unknown>
): ReturnType<FastifyReply["send"]> {
  const body: ApiErrorBody = {
    statusCode,
    error: statusText(statusCode),
    message,
    ...(details !== undefined && { details }),
  };
  return reply.status(statusCode).send(body);
}
