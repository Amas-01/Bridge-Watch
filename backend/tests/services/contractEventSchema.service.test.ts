import { describe, it, expect, vi, beforeEach } from "vitest";
import { contractEventSchemaService } from "../../src/services/contractEventSchema.service.js";

const mockQuery = vi.fn();

vi.mock("../../src/database/db.js", () => ({
  db: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

describe("contractEventSchemaService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("registerSchema", () => {
    it("rejects invalid Soroban contract ID length/format", async () => {
      await expect(
        contractEventSchemaService.registerSchema("invalid-contract", "transfer", {})
      ).rejects.toThrow("Invalid Soroban contract ID format");
    });

    it("registers schema and returns the record", async () => {
      const mockResult = {
        rows: [
          {
            id: "schema-1",
            contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            eventType: "transfer",
            schemaJson: { to: "string", amount: "i128" },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      const schema = await contractEventSchemaService.registerSchema(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "transfer",
        { to: "string", amount: "i128" }
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO contract_event_schemas"),
        ["CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "transfer", '{"to":"string","amount":"i128"}']
      );
      expect(schema).toBeDefined();
      expect(schema.id).toBe("schema-1");
    });
  });

  describe("recordMatchedEvent", () => {
    it("fails if the schema does not exist", async () => {
      // Mock getSchemaById returning null
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        contractEventSchemaService.recordMatchedEvent(
          "schema-invalid",
          "tx_hash_123",
          100,
          { to: "alice", amount: 500 }
        )
      ).rejects.toThrow("Schema does not exist");
    });

    it("inserts event and returns the record", async () => {
      // Mock getSchemaById check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "schema-1", contractId: "CAAA", eventType: "transfer" }],
      });

      // Mock INSERT matched event
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "event-1",
            schemaId: "schema-1",
            txHash: "tx_hash_123",
            ledgerSeq: 100,
            eventData: { to: "alice", amount: 500 },
            matchedAt: new Date(),
          },
        ],
      });

      const event = await contractEventSchemaService.recordMatchedEvent(
        "schema-1",
        "tx_hash_123",
        100,
        { to: "alice", amount: 500 }
      );

      expect(event).toBeDefined();
      expect(event.txHash).toBe("tx_hash_123");
      expect(event.ledgerSeq).toBe(100);
    });
  });
});
