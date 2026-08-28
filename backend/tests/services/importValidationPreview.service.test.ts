import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { ImportValidationPreviewService } from "../../src/services/importValidationPreview.service.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

let currentChain: Record<string, unknown> = {};
let insertedRow: Record<string, unknown> = {};

function makeChain(rows: unknown[] = [], inserted?: unknown) {
  insertedRow = {
    id: "p1",
    data_type: "asset",
    row_count: 1,
    valid_count: 1,
    invalid_count: 0,
    warning_count: 0,
    data_quality_score: 100,
    errors: "[]",
    warnings: "[]",
    summary: JSON.stringify({ status: "passed" }),
    created_by: "admin",
    applied: false,
    created_at: new Date().toISOString(),
  };
  const chain: Record<string, unknown> = {};
  chain.where = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(rows[0]);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.modify = vi.fn().mockImplementation((mod: (qb: unknown) => void) => {
    mod(chain);
    return chain;
  });
  chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    insertedRow = {
      id: "p1",
      data_type: "asset",
      row_count: 1,
      valid_count: 1,
      invalid_count: 0,
      warning_count: 0,
      data_quality_score: 100,
      errors: "[]",
      warnings: "[]",
      summary: JSON.stringify({ status: "passed" }),
      created_by: "admin",
      applied: false,
      created_at: new Date().toISOString(),
      ...payload,
    };
    return chain;
  });
  chain.returning = vi.fn().mockResolvedValue([inserted ?? insertedRow]);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.raw = (v: string) => ({ sql: v });
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn().mockImplementation((resolve) => { resolve(rows); return Promise.resolve(); });
  currentChain = chain;
  return chain;
}

function dbMock() {
  const dbFn = vi.fn().mockImplementation((_table: string) => currentChain);
  (dbFn as unknown as Record<string, unknown>).raw = (v: string) => ({ sql: v });
  return dbFn as never;
}

describe("ImportValidationPreviewService", () => {
  let service: ImportValidationPreviewService;

  beforeEach(() => {
    service = new ImportValidationPreviewService();
    makeChain();
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("creates a preview for valid rows", async () => {
    const preview = await service.createPreview({
      dataType: "asset",
      rows: [
        {
          symbol: "USDC",
          name: "USD Coin",
          asset_type: "credit_alphanum4",
          issuer: null,
          is_active: true,
        },
      ],
      createdBy: "admin",
    });
    expect(preview.dataType).toBe("asset");
    expect(preview.validCount).toBe(1);
    expect(preview.invalidCount).toBe(0);
    expect(preview.dataQualityScore).toBeGreaterThanOrEqual(0);
  });

  it("flags invalid rows in the preview without persisting them", async () => {
    const preview = await service.createPreview({
      dataType: "asset",
      rows: [{ symbol: "", name: "", asset_type: "bad" }],
      createdBy: "admin",
    });
    expect(preview.invalidCount).toBeGreaterThan(0);
    expect(preview.summary.status).toBe("failed");
    expect(Array.isArray(preview.errors)).toBe(true);
  });

  it("rejects empty rows", async () => {
    await expect(
      service.createPreview({ dataType: "asset", rows: [] })
    ).rejects.toThrow("non-empty");
  });

  it("rejects rows over the maximum size", async () => {
    const rows = Array.from({ length: 20_001 }, () => ({ symbol: "X" }));
    await expect(
      service.createPreview({ dataType: "asset", rows })
    ).rejects.toThrow("maximum");
  });

  it("gets a single preview by id", async () => {
    makeChain([{ id: "p1", data_type: "asset", row_count: 1, valid_count: 1, invalid_count: 0, warning_count: 0, data_quality_score: 100, errors: "[]", warnings: "[]", summary: "{}", created_by: "admin", applied: false, created_at: new Date().toISOString() }]);
    const preview = await service.getPreview("p1");
    expect(preview?.id).toBe("p1");
  });

  it("returns null for a missing preview", async () => {
    makeChain([]);
    const preview = await service.getPreview("missing");
    expect(preview).toBeNull();
  });
});
