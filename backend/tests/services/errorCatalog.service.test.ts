import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCatalogService } from "../../src/services/errorCatalog.service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeDbChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(result);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(
    Array.isArray(result) ? result : result ? [result] : []
  );
  chain.then = vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
    Promise.resolve(fn(Array.isArray(result) ? result : []))
  );
  return chain;
}

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

function freshService(): ErrorCatalogService {
  (ErrorCatalogService as unknown as { instance: unknown }).instance = undefined;
  return ErrorCatalogService.getInstance();
}

// ---------------------------------------------------------------------------
// Test 14: createEntry validates error_code uniqueness
// ---------------------------------------------------------------------------

describe("ErrorCatalogService — createEntry uniqueness", () => {
  it("throws a conflict error when error_code already exists", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const existing = {
      id: "e1",
      error_code: "BRIDGE_TIMEOUT",
      title: "old",
      message_template: "t",
      http_status: 504,
      severity: "error",
      category: "network",
      retry_guidance: null,
      documentation_url: null,
      is_active: true,
      created_by: "admin",
      updated_by: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const chain = makeDbChain(existing);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(
      service.createEntry({
        errorCode: "BRIDGE_TIMEOUT",
        title: "Bridge Timeout",
        messageTemplate: "Connection timed out",
        httpStatus: 504,
        createdBy: "admin",
      })
    ).rejects.toThrow("already exists");
  });
});

// ---------------------------------------------------------------------------
// Test 15: getCatalogEntry returns null for unknown code
// ---------------------------------------------------------------------------

describe("ErrorCatalogService — getCatalogEntry", () => {
  it("returns null for an unknown error code", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const chain = makeDbChain(null);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const result = await service.getCatalogEntry("NONEXISTENT_CODE");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 16: enrichError applies template parameters correctly
// ---------------------------------------------------------------------------

describe("ErrorCatalogService — enrichError", () => {
  it("substitutes {param} placeholders in message_template", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const entry = {
      id: "e1",
      error_code: "RETRY_EXCEEDED",
      title: "Too many retries",
      message_template: "Failed after {retries} retries on {bridge}",
      http_status: 503,
      severity: "error",
      category: "bridge",
      retry_guidance: null,
      documentation_url: null,
      is_active: true,
      created_by: "admin",
      updated_by: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const chain = makeDbChain(entry);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const enriched = await service.enrichError("RETRY_EXCEEDED", {
      retries: 3,
      bridge: "Circle USDC",
    });

    expect(enriched).not.toBeNull();
    expect(enriched!.message).toBe("Failed after 3 retries on Circle USDC");
    expect(enriched!.errorCode).toBe("RETRY_EXCEEDED");
    expect(enriched!.httpStatus).toBe(503);
  });

  it("leaves unmatched placeholders unchanged", () => {
    const service = freshService();
    const result = service.applyTemplate(
      "Error on {bridge} at {timestamp}",
      { bridge: "USDC" }
    );
    expect(result).toBe("Error on USDC at {timestamp}");
  });

  it("returns null when no active entry exists for the code", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const chain = makeDbChain(null);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const result = await service.enrichError("UNKNOWN_CODE", {});
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 17: deactivateEntry sets is_active=false without deleting
// ---------------------------------------------------------------------------

describe("ErrorCatalogService — deactivateEntry", () => {
  it("sets is_active=false on the record rather than deleting it", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const updatedRow = { id: "e1" };
    const chain = makeDbChain(updatedRow);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    // Should not throw
    await expect(
      service.deactivateEntry("e1", "admin")
    ).resolves.toBeUndefined();

    // Verify update was called (not delete)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false })
    );
  });

  it("throws when entry is not found", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const chain = makeDbChain(null);
    chain.returning = vi.fn().mockResolvedValue([]);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(
      service.deactivateEntry("nonexistent", "admin")
    ).rejects.toThrow("not found");
  });
});

// ---------------------------------------------------------------------------
// Singleton test
// ---------------------------------------------------------------------------

describe("ErrorCatalogService — singleton", () => {
  it("getInstance returns the same instance", () => {
    (ErrorCatalogService as unknown as { instance: unknown }).instance =
      undefined;
    const a = ErrorCatalogService.getInstance();
    const b = ErrorCatalogService.getInstance();
    expect(a).toBe(b);
  });
});
