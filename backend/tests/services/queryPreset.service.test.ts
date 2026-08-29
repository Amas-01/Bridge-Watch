import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryPresetService } from "../../src/services/queryPreset.service.js";

interface PresetRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  query_definition: string;
  is_shared: boolean;
  created_by: string;
  version: string;
  access_rules: string;
  metadata: string | null;
  created_at: Date;
  updated_at: Date;
  last_used_at: Date | null;
}

let mockPresets: PresetRow[] = [];
const presetInserted: PresetRow[] = [];
let mockVersions: unknown[] = [];

function buildQB(rows: unknown[]) {
  const thenable = (resolve: (v: unknown) => void) => resolve(rows);
  const qb: Record<string, unknown> = {
    then: vi.fn((resolve: (v: unknown) => void) => {
      resolve(rows);
      return Promise.resolve(rows);
    }),
    catch: vi.fn(),
    where: vi.fn((_col: unknown, _val?: unknown) => {
      if (typeof _col === "object" && _col !== null && !_val) {
        const obj = _col as Record<string, unknown>;
        const key = Object.keys(obj)[0];
        return buildQB(rows.filter((r: any) => r[key] === obj[key]));
      }
      if (typeof _col === "string" && _val !== undefined) {
        return buildQB(rows.filter((r: any) => r[_col as string] === _val));
      }
      return buildQB(rows);
    }),
    whereNot: vi.fn().mockReturnThis(),
    orWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn((_col: string, _dir?: string) => buildQB(rows)),
    first: vi.fn(() => Promise.resolve(rows[0] ?? null)),
    limit: vi.fn((n: number) => buildQB(rows.slice(0, n))),
    insert: vi.fn((data: Record<string, unknown>) => {
      const now = new Date();
      const newRow: PresetRow = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: data.name as string,
        description: (data.description as string) ?? null,
        category: data.category as string,
        query_definition: data.query_definition as string,
        is_shared: (data.is_shared as boolean) ?? false,
        created_by: data.created_by as string,
        version: (data.version as string) ?? "1.0.0",
        access_rules: (data.access_rules as string) ?? "{}",
        metadata: (data.metadata as string) ?? null,
        created_at: now,
        updated_at: now,
        last_used_at: null,
      };
      presetInserted.push(newRow);
      return { returning: vi.fn(() => Promise.resolve([newRow])) };
    }),
    update: vi.fn((_data: Record<string, unknown>) =>
      Promise.resolve(1),
    ),
    delete: vi.fn(() => Promise.resolve(1)),
    returning: vi.fn(() => Promise.resolve(rows)),
    clone: vi.fn(() => buildQB(rows)),
    count: vi.fn(() => Promise.resolve([{ count: String(rows.length) }])),
    select: vi.fn(() => Promise.resolve(rows)),
  };
  return qb;
}

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => {
    const fn = (_table: string) => buildQB(mockPresets);
    fn.raw = vi.fn((v: string) => v);
    fn.fn = { now: () => new Date() };
    return fn;
  }),
}));

vi.mock("../../src/utils/redis.js", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    REDIS_PASSWORD: undefined,
  },
}));

function makePresetRow(overrides: Partial<PresetRow> = {}): PresetRow {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Test Preset",
    description: "A test preset",
    category: "reports",
    query_definition: JSON.stringify({ filters: ["asset"], fields: ["price"] }),
    is_shared: false,
    created_by: "user-1",
    version: "1.0.0",
    access_rules: JSON.stringify({}),
    metadata: JSON.stringify({ tags: ["test"] }),
    created_at: new Date(),
    updated_at: new Date(),
    last_used_at: null,
    ...overrides,
  };
}

describe("QueryPresetService", () => {
  let service: QueryPresetService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPresets = [];
    presetInserted.length = 0;
    mockVersions = [];
    service = new QueryPresetService();
  });

  describe("createPreset", () => {
    it("creates a preset with initial version", async () => {
      const result = await service.createPreset({
        name: "Test Preset",
        description: "A test preset",
        category: "reports",
        query_definition: { filters: ["asset"], fields: ["price"] },
        created_by: "user-1",
      });

      expect(result.name).toBe("Test Preset");
      expect(result.version).toBe("1.0.0");
    });

    it("defaults is_shared to false", async () => {
      const result = await service.createPreset({
        name: "Private Preset",
        category: "analytics",
        query_definition: { filters: [], fields: [] },
        created_by: "user-1",
      });

      expect(result.is_shared).toBe(false);
    });
  });

  describe("getPresetById", () => {
    it("returns null for non-existent preset", async () => {
      const result = await service.getPresetById("nonexistent", "user-1");
      expect(result).toBeNull();
    });

    it("returns preset when found and user has access", async () => {
      mockPresets = [makePresetRow({ created_by: "user-1" })];

      const result = await service.getPresetById(
        "123e4567-e89b-12d3-a456-426614174000",
        "user-1",
      );

      expect(result).not.toBeNull();
      expect(result?.name).toBe("Test Preset");
    });

    it("returns cached data on cache hit", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      const cached = makePresetRow();
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cached));

      const result = await service.getPresetById("some-id", "user-1");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("Test Preset");
    });

    it("writes to cache on successful fetch", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockResolvedValue(null);
      mockPresets = [makePresetRow({ created_by: "user-1" })];

      await service.getPresetById(
        "123e4567-e89b-12d3-a456-426614174000",
        "user-1",
      );

      expect(redis.setex).toHaveBeenCalled();
    });
  });

  describe("listPresets", () => {
    it("returns presets for the user", async () => {
      mockPresets = [
        makePresetRow({ name: "Mine", created_by: "user-1" }),
        makePresetRow({ name: "Shared", created_by: "other", is_shared: true }),
      ];

      const result = await service.listPresets("user-1");

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("updatePreset", () => {
    it("returns null when preset not found", async () => {
      const result = await service.updatePreset("nonexistent", "user-1", {
        name: "Updated",
        updated_by: "user-1",
      });

      expect(result).toBeNull();
    });

    it("returns null when user cannot modify", async () => {
      mockPresets = [makePresetRow({ created_by: "other-user" })];

      const result = await service.updatePreset(
        "123e4567-e89b-12d3-a456-426614174000",
        "user-1",
        { name: "Updated", updated_by: "user-1" },
      );

      expect(result).toBeNull();
    });
  });

  describe("deletePreset", () => {
    it("returns false when preset not found", async () => {
      const result = await service.deletePreset("nonexistent", "user-1");
      expect(result).toBe(false);
    });

    it("returns false when user cannot modify", async () => {
      mockPresets = [makePresetRow({ created_by: "other-user" })];

      const result = await service.deletePreset(
        "123e4567-e89b-12d3-a456-426614174000",
        "user-1",
      );

      expect(result).toBe(false);
    });

    it("returns true on successful deletion", async () => {
      mockPresets = [makePresetRow({ created_by: "user-1" })];

      const result = await service.deletePreset(
        "123e4567-e89b-12d3-a456-426614174000",
        "user-1",
      );

      expect(result).toBe(true);
    });
  });

  describe("getPresetVersions", () => {
    it("returns empty array when preset not found", async () => {
      const result = await service.getPresetVersions("nonexistent", "user-1");
      expect(result).toEqual([]);
    });
  });

  describe("validateQueryDefinition", () => {
    it("returns true for valid definition", async () => {
      const result = await service.validateQueryDefinition({
        filters: ["asset"],
        fields: ["price"],
      });
      expect(result).toBe(true);
    });

    it("returns false for invalid definition", async () => {
      const result = await service.validateQueryDefinition({ foo: "bar" });
      expect(result).toBe(false);
    });

    it("returns false for null", async () => {
      const result = await service.validateQueryDefinition(
        null as unknown as Record<string, unknown>,
      );
      expect(result).toBe(false);
    });
  });

  describe("recordUsage", () => {
    it("does not throw", async () => {
      await expect(
        service.recordUsage("123e4567-e89b-12d3-a456-426614174000"),
      ).resolves.not.toThrow();
    });
  });

  describe("incrementVersion", () => {
    it("increments the patch version", () => {
      const result = (service as any).incrementVersion("1.0.0");
      expect(result).toBe("1.0.1");
    });

    it("handles multi-digit versions", () => {
      const result = (service as any).incrementVersion("2.15.99");
      expect(result).toBe("2.15.100");
    });
  });
});
