import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChangeApprovalService } from "../../src/services/changeApproval.service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cr-1",
    title: "Test change",
    description: "A test change request",
    change_type: "config_update",
    payload: "{}",
    status: "draft",
    submitted_by: "alice",
    submitted_at: null,
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    applied_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// DB mock factory — returns a fresh chain for each test
function makeDbChain(firstRow: unknown, updateRow?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(firstRow);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(
    updateRow ? [updateRow] : firstRow ? [firstRow] : []
  );
  chain.then = vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
    Promise.resolve(fn(Array.isArray(firstRow) ? firstRow : []))
  );
  return chain;
}

// Transaction mock
function makeTransactionMock(result: unknown) {
  return vi.fn().mockImplementation(
    async (fn: (trx: unknown) => Promise<unknown>) => {
      const trx: Record<string, unknown> = {};
      trx.where = vi.fn().mockReturnValue(trx);
      trx.update = vi.fn().mockReturnValue(trx);
      trx.returning = vi.fn().mockResolvedValue([result]);
      return fn(trx);
    }
  );
}

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

function freshService(): ChangeApprovalService {
  (ChangeApprovalService as unknown as { instance: unknown }).instance =
    undefined;
  return ChangeApprovalService.getInstance();
}

// ---------------------------------------------------------------------------
// Test 24: submitForApproval transitions draft → pending_approval
// ---------------------------------------------------------------------------

describe("ChangeApprovalService — submitForApproval", () => {
  it("transitions draft → pending_approval when called by the creator", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const draft = makeRow({ status: "draft" });
    const updated = makeRow({
      status: "pending_approval",
      submitted_at: new Date(),
    });
    const chain = makeDbChain(draft, updated);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const result = await service.submitForApproval("cr-1", "alice");
    expect(result.status).toBe("pending_approval");
  });

  // Test 25: submitForApproval rejects non-draft requests (state machine)
  it("throws when the request is not in draft status", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const pending = makeRow({ status: "pending_approval" });
    const chain = makeDbChain(pending);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(
      service.submitForApproval("cr-1", "alice")
    ).rejects.toThrow(/Cannot perform 'submitForApproval'/);
  });

  it("throws when a non-creator attempts to submit", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const draft = makeRow({ status: "draft", submitted_by: "alice" });
    const chain = makeDbChain(draft);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(
      service.submitForApproval("cr-1", "bob")
    ).rejects.toThrow(/creator/);
  });
});

// ---------------------------------------------------------------------------
// Test 26: approve enforces four-eyes — rejects when approver === submitter
// ---------------------------------------------------------------------------

describe("ChangeApprovalService — approve (four-eyes)", () => {
  it("throws a four-eyes violation when approver === submitter", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const pending = makeRow({
      status: "pending_approval",
      submitted_by: "alice",
    });
    const chain = makeDbChain(pending);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(service.approve("cr-1", "alice")).rejects.toThrow(
      /Four-eyes/
    );
  });

  it("approves successfully when approver differs from submitter", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const pending = makeRow({
      status: "pending_approval",
      submitted_by: "alice",
    });
    const approved = makeRow({
      status: "approved",
      submitted_by: "alice",
      reviewed_by: "bob",
    });
    const chain = makeDbChain(pending, approved);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const result = await service.approve("cr-1", "bob", "LGTM");
    expect(result.status).toBe("approved");
    expect(result.reviewedBy).toBe("bob");
  });
});

// ---------------------------------------------------------------------------
// Test 27: reject requires a non-empty comment
// ---------------------------------------------------------------------------

describe("ChangeApprovalService — reject", () => {
  it("throws when comment is empty", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const pending = makeRow({ status: "pending_approval" });
    const chain = makeDbChain(pending);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(service.reject("cr-1", "bob", "")).rejects.toThrow(
      /comment is required/
    );
  });

  it("throws when comment is whitespace-only", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const pending = makeRow({ status: "pending_approval" });
    const chain = makeDbChain(pending);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(service.reject("cr-1", "bob", "   ")).rejects.toThrow(
      /comment is required/
    );
  });

  it("rejects successfully with a non-empty comment", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const pending = makeRow({ status: "pending_approval" });
    const rejected = makeRow({
      status: "rejected",
      reviewed_by: "bob",
      review_comment: "Not ready",
    });
    const chain = makeDbChain(pending, rejected);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const result = await service.reject("cr-1", "bob", "Not ready");
    expect(result.status).toBe("rejected");
  });
});

// ---------------------------------------------------------------------------
// Test 28: applyChange transitions approved → applied
// ---------------------------------------------------------------------------

describe("ChangeApprovalService — applyChange", () => {
  it("transitions approved → applied and returns the updated request", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const approved = makeRow({ status: "approved" });
    const applied = makeRow({ status: "applied", applied_at: new Date() });

    // Build the chain
    const chain: Record<string, unknown> = {};
    chain.where = vi.fn().mockReturnValue(chain);
    chain.first = vi.fn().mockResolvedValue(approved);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.returning = vi.fn().mockResolvedValue([applied]);

    const dbFn = (_t: string) => chain;
    (dbFn as unknown as Record<string, unknown>).transaction =
      makeTransactionMock(applied);

    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(dbFn);

    const service = freshService();
    const result = await service.applyChange("cr-1", "admin");
    expect(result.status).toBe("applied");
  });

  it("throws when request is not in approved status", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const draft = makeRow({ status: "draft" });
    const chain = makeDbChain(draft);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(service.applyChange("cr-1", "admin")).rejects.toThrow(
      /Cannot perform 'applyChange'/
    );
  });
});

// ---------------------------------------------------------------------------
// Test 29: cancelRequest
// ---------------------------------------------------------------------------

describe("ChangeApprovalService — cancelRequest", () => {
  it("cancels successfully when called by the creator", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const draft = makeRow({ status: "draft", submitted_by: "alice" });
    const cancelled = makeRow({ status: "cancelled" });
    const chain = makeDbChain(draft, cancelled);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const result = await service.cancelRequest("cr-1", "alice");
    expect(result.status).toBe("cancelled");
  });

  it("fails for a non-creator without admin role", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const draft = makeRow({ status: "draft", submitted_by: "alice" });
    const chain = makeDbChain(draft);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(service.cancelRequest("cr-1", "charlie")).rejects.toThrow(
      /creator/
    );
  });

  it("throws when request is in applied status (not cancellable)", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const applied = makeRow({ status: "applied", submitted_by: "alice" });
    const chain = makeDbChain(applied);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(service.cancelRequest("cr-1", "alice")).rejects.toThrow(
      /Cannot perform 'cancel'/
    );
  });
});
