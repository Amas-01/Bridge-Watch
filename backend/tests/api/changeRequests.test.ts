import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
});

const mockRequest = {
  id: "cr-1",
  title: "Increase threshold",
  description: "Test change",
  changeType: "config_update",
  payload: {},
  status: "draft",
  submittedBy: "alice",
  submittedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewComment: null,
  appliedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

vi.mock("../../src/services/changeApproval.service.js", () => {
  class MockChangeApprovalService {
    private static _instance: MockChangeApprovalService;
    static getInstance() {
      if (!this._instance) this._instance = new MockChangeApprovalService();
      return this._instance;
    }
    createDraft = vi.fn().mockResolvedValue(mockRequest);
    getById = vi.fn().mockResolvedValue(mockRequest);
    listRequests = vi.fn().mockResolvedValue([mockRequest]);
    submitForApproval = vi
      .fn()
      .mockResolvedValue({ ...mockRequest, status: "pending_approval" });
    approve = vi
      .fn()
      .mockResolvedValue({ ...mockRequest, status: "approved" });
    reject = vi
      .fn()
      .mockResolvedValue({ ...mockRequest, status: "rejected" });
    applyChange = vi
      .fn()
      .mockResolvedValue({ ...mockRequest, status: "applied" });
    cancelRequest = vi
      .fn()
      .mockResolvedValue({ ...mockRequest, status: "cancelled" });
  }
  return { ChangeApprovalService: MockChangeApprovalService };
});

vi.mock("../../src/services/apiKey.service.js", () => {
  class MockApiKeyService {
    validateKey = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        id: "key-1",
        name: "admin",
        scopes: ["admin:change-requests"],
        rateLimitPerMinute: 120,
        source: "api-key",
      },
    });
    listKeys = vi.fn().mockResolvedValue([]);
  }
  return { ApiKeyService: MockApiKeyService };
});

vi.mock("../../src/services/oauth2.service.js", () => {
  class MockOAuth2Service {
    verifyToken = vi.fn().mockReturnValue({ valid: false });
    extractScopesFromToken = vi.fn().mockReturnValue([]);
  }
  return { OAuth2Service: MockOAuth2Service };
});

import { changeRequestsRoutes } from "../../src/api/routes/changeRequests.js";

describe("Change request routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    await server.register(changeRequestsRoutes, {
      prefix: "/api/v1/admin/change-requests",
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // Test 30: POST /:id/approve returns 403 when approver === submitter
  it("POST /:id/approve returns 403 for same-user four-eyes violation", async () => {
    const { ChangeApprovalService } = vi.mocked(
      await import("../../src/services/changeApproval.service.js")
    );
    const instance = (ChangeApprovalService as unknown as {
      _instance: { approve: ReturnType<typeof vi.fn> };
    })._instance;
    instance.approve.mockRejectedValueOnce(
      new Error("Four-eyes principle violation: approver must not be the submitter")
    );

    const res = await server.inject({
      method: "POST",
      url: "/api/v1/admin/change-requests/cr-1/approve",
      headers: {
        "x-api-key": "bootstrap-secret",
        "content-type": "application/json",
      },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(403);
  });

  // Test 31: POST /:id/reject returns 400 when comment is absent
  it("POST /:id/reject returns 400 when comment is missing", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/admin/change-requests/cr-1/reject",
      headers: {
        "x-api-key": "bootstrap-secret",
        "content-type": "application/json",
      },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/comment/i);
  });

  // Test 32: status transitions in incorrect order return appropriate error
  it("POST /:id/apply returns 422 when request is not approved", async () => {
    const { ChangeApprovalService } = vi.mocked(
      await import("../../src/services/changeApproval.service.js")
    );
    const instance = (ChangeApprovalService as unknown as {
      _instance: { applyChange: ReturnType<typeof vi.fn> };
    })._instance;
    instance.applyChange.mockRejectedValueOnce(
      new Error("Cannot perform 'applyChange' on a change request with status 'draft'")
    );

    const res = await server.inject({
      method: "POST",
      url: "/api/v1/admin/change-requests/cr-1/apply",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(422);
  });

  it("POST / creates a draft", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/admin/change-requests",
      headers: {
        "x-api-key": "bootstrap-secret",
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        title: "Increase threshold",
        description: "For testing purposes",
      }),
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).request.status).toBe("draft");
  });

  it("GET / lists change requests", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/change-requests",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.requests)).toBe(true);
  });

  it("POST / returns 400 when title is missing", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/admin/change-requests",
      headers: {
        "x-api-key": "bootstrap-secret",
        "content-type": "application/json",
      },
      payload: JSON.stringify({ description: "No title" }),
    });
    expect(res.statusCode).toBe(400);
  });
});
