import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssetMetadataService } from "../../src/services/assetMetadata.service";

vi.mock("../../src/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

const state = vi.hoisted(() => ({
  metadataByAssetId: new Map<string, any>(),
  batches: [] as any[],
}));

vi.mock("../../src/database/connection", () => {
  const mockDb: any = vi.fn().mockImplementation((table: string) => {
    if (table === "asset_metadata") {
      const builder: any = {
        where: vi.fn().mockImplementation((clause: Record<string, string>) => {
          builder.__assetId = clause.asset_id;
          return builder;
        }),
        first: vi.fn().mockImplementation(() =>
          Promise.resolve(state.metadataByAssetId.get(builder.__assetId) ?? null)
        ),
        insert: vi.fn().mockImplementation((data: any) => {
          state.metadataByAssetId.set(data.asset_id, { ...data, version: 1 });
          return Promise.resolve([data]);
        }),
        update: vi.fn().mockImplementation((data: any) => {
          const existing = state.metadataByAssetId.get(builder.__assetId);
          state.metadataByAssetId.set(builder.__assetId, { ...existing, ...data });
          return Promise.resolve(1);
        }),
      };
      return builder;
    }

    if (table === "asset_metadata_versions") {
      return { insert: vi.fn().mockResolvedValue([{}]) };
    }

    if (table === "bulk_metadata_edit_batches") {
      return {
        insert: vi.fn().mockImplementation((data: any) => {
          state.batches.push(data);
          return Promise.resolve([data]);
        }),
        where: vi.fn().mockImplementation((clause: Record<string, string>) => ({
          first: vi.fn().mockResolvedValue(
            state.batches.find((b) => b.id === clause.id) ?? null
          ),
        })),
      };
    }

    throw new Error(`Unexpected table access in mock: ${table}`);
  });

  return { getDatabase: () => mockDb };
});

describe("AssetMetadataService - bulkUpsertMetadata", () => {
  let service: AssetMetadataService;

  beforeEach(() => {
    vi.clearAllMocks();
    state.metadataByAssetId = new Map();
    state.batches = [];
    service = new AssetMetadataService();
  });

  it("applies metadata edits to all assets in the batch", async () => {
    const result = await service.bulkUpsertMetadata(
      [
        { assetId: "asset-1", symbol: "USDC", metadata: { category: "stablecoin" } },
        { assetId: "asset-2", symbol: "XLM", metadata: { category: "native" } },
      ],
      "ops-user",
    );

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results.every((r) => r.success)).toBe(true);
  });

  it("reports per-item validation failures without failing the whole batch", async () => {
    const result = await service.bulkUpsertMetadata(
      [
        { assetId: "asset-1", symbol: "USDC", metadata: { category: "stablecoin" } },
        { assetId: "asset-2", symbol: "XLM", metadata: { website_url: "not-a-url" } },
      ],
      "ops-user",
    );

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);

    const failedItem = result.results.find((r) => r.assetId === "asset-2");
    expect(failedItem?.success).toBe(false);
    expect(failedItem?.error).toContain("Invalid website URL");
  });

  it("persists and allows retrieval of the batch outcome", async () => {
    const result = await service.bulkUpsertMetadata(
      [{ assetId: "asset-1", symbol: "USDC", metadata: { category: "stablecoin" } }],
      "ops-user",
    );

    const batch = await service.getBulkEditBatch(result.batchId);
    expect(batch).not.toBeNull();
    expect(batch?.total).toBe(1);
    expect(batch?.succeeded).toBe(1);
  });
});
