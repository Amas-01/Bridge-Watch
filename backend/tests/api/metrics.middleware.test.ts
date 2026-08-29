import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { metricRoute } from "../../src/api/middleware/metrics.js";

describe("metricRoute", () => {
  it("uses the registered route pattern for stable labels", () => {
    const request = {
      routeOptions: { url: "/api/bridges/:bridgeId" },
      url: "/api/bridges/abc?verbose=true",
    } as unknown as FastifyRequest;
    expect(metricRoute(request)).toBe("/api/bridges/:bridgeId");
  });

  it("removes query strings when no route pattern is available", () => {
    const request = {
      routeOptions: {},
      url: "/health?source=probe",
    } as unknown as FastifyRequest;
    expect(metricRoute(request)).toBe("/health");
  });
});
