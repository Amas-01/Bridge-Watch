import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetMetadataSyncService } from "../../src/services/assetMetadataSync.service.js";
import type { MetadataSourceAdapter } from "../../src/services/sources/assetMetadataSync.types.js";

const {
  insertMock,
  updateMock,
  orderByMock,
  firstMock,
  upsertMetadataMock,
  getMetadataMock,
  validateMetadataMock,
  setManualOverrideMock,
  dbMock,
} = vi.hoisted(() => {
  const insertMock = vi.fn().mockResolvedValue(undefined);
  const updateMock = vi.fn().mockResolvedValue(1);
  const orderByMock = vi.fn();
  const firstMock = vi.fn();
  const upsertMetadataMock = vi.fn();
  const getMetadataMock = vi.fn();
  const validateMetadataMock = vi.fn();
  const setManualOverrideMock = vi.fn();

  const dbMock = vi.fn((table: string) => {
    if (table === "assets") {
      return {
        select: vi.fn().mockReturnThis(),
        modify: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { id: "asset-1", symbol: "USDC" },
        ]),
      };
    }

    if (table === "asset_metadata_sync_runs") {
      return {
        insert: insertMock,
        where: vi.fn().mockReturnThis(),
        orderBy: orderByMock.mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
    }

    if (table === "asset_metadata") {
      return {
        where: vi.fn().mockReturnThis(),
        update: updateMock,
        first: firstMock,
      };
    }

    return {
      where: vi.fn().mockReturnThis(),
      update: updateMock,
      insert: insertMock,
      first: firstMock,
    };
  });

  return {
    insertMock,
    updateMock,
    orderByMock,
    firstMock,
    upsertMetadataMock,
    getMetadataMock,
    validateMetadataMock,
    setManualOverrideMock,
    dbMock,
  };
});

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => dbMock,
}));

vi.mock("../../src/services/assetMetadata.service.js", () => ({
  assetMetadataService: {
    getMetadata: getMetadataMock,
    upsertMetadata: upsertMetadataMock,
    validateMetadata: validateMetadataMock,
    setManualOverride: setManualOverrideMock,
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("AssetMetadataSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateMetadataMock.mockReturnValue({ valid: true, errors: [] });
    getMetadataMock.mockResolvedValue({
      id: "meta-1",
      asset_id: "asset-1",
      symbol: "USDC",
      version: 2,
      social_links: {},
      token_specifications: {},
      tags: [],
      manual_override: false,
    });
    upsertMetadataMock.mockResolvedValue({ version: 3 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: () => "image/png",
      },
    }));
  });

  it("skips sync when manual override is enabled and force=false", async () => {
    getMetadataMock.mockResolvedValueOnce({
      id: "meta-1",
      asset_id: "asset-1",
      symbol: "USDC",
      version: 2,
      social_links: {},
      token_specifications: {},
      tags: [],
      manual_override: true,
    });

    const adapter: MetadataSourceAdapter = {
      source: "test-source",
      supports: () => true,
      fetch: async () => ({
        source: "test-source",
        confidence: 1,
        data: { description: "new" },
      }),
    };

    const service = new AssetMetadataSyncService([adapter]);
    const result = await service.syncSingleAsset({
      assetId: "asset-1",
      symbol: "USDC",
      force: false,
    });

    expect(result.status).toBe("skipped");
    expect(upsertMetadataMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalled();
  });

  it("applies selective refresh fields from source data", async () => {
    const adapter: MetadataSourceAdapter = {
      source: "test-source",
      supports: () => true,
      fetch: async () => ({
        source: "test-source",
        confidence: 0.8,
        data: {
          description: "updated description",
          website_url: "https://issuer.example",
          category: "Stablecoin",
        },
      }),
    };

    const service = new AssetMetadataSyncService([adapter]);

    const result = await service.syncSingleAsset({
      assetId: "asset-1",
      symbol: "USDC",
      fields: ["description", "website_url"],
      force: true,
      triggeredBy: "test-suite",
    });

    expect(result.status).toBe("success");
    expect(upsertMetadataMock).toHaveBeenCalledWith(
      "asset-1",
      "USDC",
      expect.objectContaining({
        description: "updated description",
        website_url: "https://issuer.example",
      }),
      "test-suite",
    );
    expect(upsertMetadataMock).not.toHaveBeenCalledWith(
      "asset-1",
      "USDC",
      expect.objectContaining({ category: "Stablecoin" }),
      "test-suite",
    );
  });

  it("tracks conflicts when two sources disagree", async () => {
    const first: MetadataSourceAdapter = {
      source: "source-a",
      supports: () => true,
      fetch: async () => ({
        source: "source-a",
        confidence: 0.9,
        data: { website_url: "https://a.example" },
      }),
    };

    const second: MetadataSourceAdapter = {
      source: "source-b",
      supports: () => true,
      fetch: async () => ({
        source: "source-b",
        confidence: 0.7,
        data: { website_url: "https://b.example" },
      }),
    };

    const service = new AssetMetadataSyncService([first, second]);
    const result = await service.syncSingleAsset({
      assetId: "asset-1",
      symbol: "USDC",
      force: true,
      fields: ["website_url"],
    });

    expect(result.status).toBe("success");
    expect(result.conflicts).toContain("website_url");
    expect(upsertMetadataMock).toHaveBeenCalledWith(
      "asset-1",
      "USDC",
      expect.objectContaining({ website_url: "https://a.example" }),
      "system",
    );
  });

  it("continues and succeeds when one adapter throws but another returns data", async () => {
    const failing: MetadataSourceAdapter = {
      source: "flaky-source",
      supports: () => true,
      fetch: async () => {
        throw new Error("upstream timeout");
      },
    };

    const healthy: MetadataSourceAdapter = {
      source: "healthy-source",
      supports: () => true,
      fetch: async () => ({
        source: "healthy-source",
        confidence: 0.6,
        data: { description: "from healthy source" },
      }),
    };

    const service = new AssetMetadataSyncService([failing, healthy]);
    const result = await service.syncSingleAsset({
      assetId: "asset-1",
      symbol: "USDC",
      force: true,
      fields: ["description"],
    });

    expect(result.status).toBe("success");
    expect(result.source).toBe("healthy-source");
    expect(upsertMetadataMock).toHaveBeenCalledWith(
      "asset-1",
      "USDC",
      expect.objectContaining({ description: "from healthy source" }),
      "system",
    );
  });

  it("fails the sync and records the error when every adapter throws", async () => {
    const failing: MetadataSourceAdapter = {
      source: "source-a",
      supports: () => true,
      fetch: async () => {
        throw new Error("connection refused");
      },
    };

    const service = new AssetMetadataSyncService([failing]);
    const result = await service.syncSingleAsset({
      assetId: "asset-1",
      symbol: "USDC",
      force: true,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("connection refused");
    expect(upsertMetadataMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        last_sync_status: "failed",
        last_sync_error: expect.stringContaining("connection refused"),
      }),
    );
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", asset_id: "asset-1" }),
    );
  });

  it("fails the sync when metadata validation rejects the resolved fields", async () => {
    validateMetadataMock.mockReturnValue({
      valid: false,
      errors: ["description exceeds max length"],
    });

    const adapter: MetadataSourceAdapter = {
      source: "test-source",
      supports: () => true,
      fetch: async () => ({
        source: "test-source",
        confidence: 1,
        data: { description: "x".repeat(10_000) },
      }),
    };

    const service = new AssetMetadataSyncService([adapter]);
    const result = await service.syncSingleAsset({
      assetId: "asset-1",
      symbol: "USDC",
      force: true,
      fields: ["description"],
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("description exceeds max length");
    expect(upsertMetadataMock).not.toHaveBeenCalled();
  });

  it("drops logo_url but still succeeds when the image URL fails validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: () => "text/html" },
      }),
    );

    const adapter: MetadataSourceAdapter = {
      source: "test-source",
      supports: () => true,
      fetch: async () => ({
        source: "test-source",
        confidence: 1,
        data: {
          logo_url: "https://example.com/not-an-image",
          description: "valid description",
        },
      }),
    };

    const service = new AssetMetadataSyncService([adapter]);
    const result = await service.syncSingleAsset({
      assetId: "asset-1",
      symbol: "USDC",
      force: true,
      fields: ["logo_url", "description"],
    });

    expect(result.status).toBe("success");
    expect(upsertMetadataMock).toHaveBeenCalledWith(
      "asset-1",
      "USDC",
      expect.objectContaining({ description: "valid description" }),
      "system",
    );
    const upsertedPayload = upsertMetadataMock.mock.calls[0][2];
    expect(upsertedPayload).not.toHaveProperty("logo_url");
  });

  it("skips adapters that do not support the asset's symbol", async () => {
    const unsupported: MetadataSourceAdapter = {
      source: "unsupported-source",
      supports: () => false,
      fetch: vi.fn(),
    };

    const supported: MetadataSourceAdapter = {
      source: "supported-source",
      supports: () => true,
      fetch: async () => ({
        source: "supported-source",
        confidence: 1,
        data: { description: "from supported source" },
      }),
    };

    const service = new AssetMetadataSyncService([unsupported, supported]);
    const result = await service.syncSingleAsset({
      assetId: "asset-1",
      symbol: "USDC",
      force: true,
      fields: ["description"],
    });

    expect(result.status).toBe("success");
    expect(unsupported.fetch).not.toHaveBeenCalled();
  });

  describe("syncAll", () => {
    it("syncs every asset returned by the assets query and reports totals", async () => {
      const adapter: MetadataSourceAdapter = {
        source: "test-source",
        supports: () => true,
        fetch: async () => ({
          source: "test-source",
          confidence: 1,
          data: { description: "batch sync" },
        }),
      };

      const service = new AssetMetadataSyncService([adapter]);
      const { results, total } = await service.syncAll({ force: true, fields: ["description"] });

      expect(total).toBe(1);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ symbol: "USDC", status: "success" });
    });

    it("uppercases requested symbols before querying assets", async () => {
      const adapter: MetadataSourceAdapter = {
        source: "test-source",
        supports: () => true,
        fetch: async () => ({
          source: "test-source",
          confidence: 1,
          data: { description: "scoped sync" },
        }),
      };

      const service = new AssetMetadataSyncService([adapter]);
      const modifyCallback = vi.fn();
      dbMock.mockImplementationOnce((table: string) => {
        if (table === "assets") {
          return {
            select: vi.fn().mockReturnThis(),
            modify: vi.fn((cb: (qb: any) => void) => {
              modifyCallback(cb);
              return { orderBy: vi.fn().mockResolvedValue([{ id: "asset-1", symbol: "USDC" }]) };
            }),
          };
        }
        return dbMock.getMockImplementation()!(table);
      });

      await service.syncAll({ symbols: ["usdc"], force: true });

      const qb = { whereIn: vi.fn() };
      modifyCallback.mock.calls[0][0](qb);
      expect(qb.whereIn).toHaveBeenCalledWith("symbol", ["USDC"]);
    });
  });

  describe("getSyncHistory", () => {
    it("queries sync runs for the given symbol, uppercased, ordered by most recent", async () => {
      const service = new AssetMetadataSyncService([]);
      await service.getSyncHistory("usdc");

      expect(orderByMock).toHaveBeenCalledWith("started_at", "desc");
    });

    it("caps the requested limit at 200", async () => {
      const limitMock = vi.fn().mockResolvedValue([]);
      dbMock.mockImplementationOnce((table: string) => {
        if (table === "asset_metadata_sync_runs") {
          return {
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: limitMock,
          };
        }
        return dbMock.getMockImplementation()!(table);
      });

      const service = new AssetMetadataSyncService([]);
      await service.getSyncHistory("usdc", 10_000);

      expect(limitMock).toHaveBeenCalledWith(200);
    });
  });

  describe("setManualOverride", () => {
    it("delegates to assetMetadataService.setManualOverride with the given arguments", async () => {
      const service = new AssetMetadataSyncService([]);
      await service.setManualOverride("asset-1", true, "manually curated", "admin-1");

      expect(setManualOverrideMock).toHaveBeenCalledWith(
        "asset-1",
        true,
        "manually curated",
        "admin-1",
      );
    });
  });
});
