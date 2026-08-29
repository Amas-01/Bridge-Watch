import { describe, it, expect, beforeEach, vi } from "vitest";
import { CircuitBreakerActionEngine } from "../../src/services/circuitBreakerActionEngine.service.js";

const createQueryBuilder = (rows: any[] = []) => {
  const builder: any = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockImplementation((fn) => {
      if (typeof fn === "function") {
        const b: any = {
          where: vi.fn().mockReturnThis(),
          orWhere: vi.fn().mockReturnThis(),
        };
        fn(b);
      }
      return builder;
    }),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue([1]),
    delete: vi.fn().mockResolvedValue(1),
    update: vi.fn().mockResolvedValue(1),
    first: vi.fn().mockResolvedValue(rows[0]),
    clone: () => builder,
    count: vi.fn().mockReturnThis(),
    then: (resolve: (value: any) => any) => resolve(rows),
  };
  return builder;
};

const mockKnex = vi.hoisted(() => {
  const knex: any = vi.fn(() => createQueryBuilder([]));
  knex.raw = vi.fn((sql: string) => sql);
  return knex;
});

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockKnex,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/services/circuitBreaker.service.js", () => ({
  getCircuitBreakerService: () => ({
    isPaused: vi.fn().mockResolvedValue(false),
    triggerPause: vi.fn().mockResolvedValue(undefined),
  }),
  PauseScope: { Global: 0, Bridge: 1, Asset: 2 },
}));

vi.mock("node-fetch", () => ({
  default: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: vi.fn().mockResolvedValue(JSON.stringify({ success: true })),
  }),
}));

describe("CircuitBreakerActionEngine Service", () => {
  let engine: CircuitBreakerActionEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new CircuitBreakerActionEngine();
  });

  describe("executeSingleAction", () => {
    it("executes script action successfully", async () => {
      const config: any = {
        id: "config-1",
        name: "Test Script",
        alert_type: "price_deviation",
        action_type: "script",
        config: JSON.stringify({ command: "echo", args: ["hello"] }),
        enabled: true,
        timeout_ms: 5000,
      };

      const triggerData = {
        alertType: "price_deviation",
        assetCode: "USDC",
        severity: "high",
        value: 10,
        threshold: 5,
      };

      const log = await engine.executeSingleAction(config, triggerData);

      expect(log.status).toBe("success");
      expect(log.action_type).toBe("script");
      expect(log.output).toBeDefined();
    });

    it("executes webhook action successfully", async () => {
      const config: any = {
        id: "config-2",
        name: "Test Webhook",
        alert_type: "supply_mismatch",
        action_type: "webhook",
        config: JSON.stringify({ url: "https://example.com/webhook", method: "POST" }),
        enabled: true,
        timeout_ms: 5000,
      };

      const triggerData = {
        alertType: "supply_mismatch",
        bridgeId: "bridge-1",
        value: 15,
      };

      const log = await engine.executeSingleAction(config, triggerData);

      expect(log.status).toBe("success");
      expect(log.action_type).toBe("webhook");
      expect(log.output).toContain("200");
    });

    it("executes contract_pause action successfully", async () => {
      const config: any = {
        id: "config-3",
        name: "Contract Pause",
        alert_type: "bridge_downtime",
        action_type: "contract_pause",
        config: JSON.stringify({ scope: "bridge" }),
        enabled: true,
      };

      const triggerData = {
        alertType: "bridge_downtime",
        bridgeId: "bridge-stellar-eth",
      };

      const log = await engine.executeSingleAction(config, triggerData);

      expect(log.status).toBe("success");
      expect(log.action_type).toBe("contract_pause");
      expect(log.output).toContain("soroban_contract_pause");
    });

    it("handles failure when script fails", async () => {
      const config: any = {
        id: "config-4",
        name: "Failing Script",
        alert_type: "all",
        action_type: "script",
        config: JSON.stringify({ command: "non_existent_command_xyz" }),
        enabled: true,
      };

      const log = await engine.executeSingleAction(config);

      expect(log.status).toBe("failed");
      expect(log.error_message).toBeDefined();
    });
  });

  describe("CRUD operations", () => {
    it("creates an action config", async () => {
      const created = await engine.createActionConfig({
        name: "Webhook Action",
        alert_type: "price_deviation",
        action_type: "webhook",
        config: { url: "https://example.com/alert" },
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe("Webhook Action");
    });

    it("deletes an action config", async () => {
      mockKnex.mockImplementation(() => {
        const builder = createQueryBuilder([]);
        builder.delete = vi.fn().mockResolvedValue(1);
        return builder;
      });

      const deleted = await engine.deleteActionConfig("act-1");
      expect(deleted).toBe(true);
    });
  });
});
