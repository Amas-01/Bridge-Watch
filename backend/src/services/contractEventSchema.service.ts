import { db } from "../database/db.js";
import type { PoolClient } from "pg";
import { logger } from "../utils/logger.js";

export interface ContractEventSchema {
  id: string;
  contractId: string;
  eventType: string;
  schemaJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchedContractEvent {
  id: string;
  schemaId: string;
  txHash: string;
  ledgerSeq: number;
  eventData: Record<string, unknown>;
  matchedAt: Date;
}

export const contractEventSchemaService = {
  async registerSchema(
    contractId: string,
    eventType: string,
    schemaJson: Record<string, unknown>,
    client?: PoolClient
  ): Promise<ContractEventSchema> {
    const query = client || db;
    try {
      if (contractId.length !== 56 || !contractId.startsWith("C")) {
        throw new Error("Invalid Soroban contract ID format");
      }

      const res = await query.query(
        `INSERT INTO contract_event_schemas (contract_id, event_type, schema_json)
         VALUES ($1, $2, $3)
         ON CONFLICT (contract_id, event_type) DO UPDATE SET
           schema_json = EXCLUDED.schema_json,
           updated_at = NOW()
         RETURNING id, contract_id as "contractId", event_type as "eventType", schema_json as "schemaJson", created_at as "createdAt", updated_at as "updatedAt"`,
        [contractId, eventType, JSON.stringify(schemaJson)]
      );
      const schema = res.rows[0];
      logger.info({ contractId, eventType }, "Registered smart contract event schema");
      return schema;
    } catch (err) {
      throw new Error(`Failed to register schema: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async getSchemasByContract(contractId: string, client?: PoolClient): Promise<ContractEventSchema[]> {
    const query = client || db;
    try {
      const res = await query.query(
        `SELECT id, contract_id as "contractId", event_type as "eventType", schema_json as "schemaJson", created_at as "createdAt", updated_at as "updatedAt"
         FROM contract_event_schemas
         WHERE contract_id = $1`,
        [contractId]
      );
      return res.rows;
    } catch (err) {
      throw new Error(`Failed to fetch schemas: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async getSchemaById(id: string, client?: PoolClient): Promise<ContractEventSchema | null> {
    const query = client || db;
    try {
      const res = await query.query(
        `SELECT id, contract_id as "contractId", event_type as "eventType", schema_json as "schemaJson", created_at as "createdAt", updated_at as "updatedAt"
         FROM contract_event_schemas
         WHERE id = $1`,
        [id]
      );
      return res.rows[0] || null;
    } catch (err) {
      throw new Error(`Failed to fetch schema: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async recordMatchedEvent(
    schemaId: string,
    txHash: string,
    ledgerSeq: number,
    eventData: Record<string, unknown>,
    client?: PoolClient
  ): Promise<MatchedContractEvent> {
    const query = client || db;
    try {
      const schema = await this.getSchemaById(schemaId, query as any);
      if (!schema) {
        throw new Error("Schema does not exist");
      }

      const res = await query.query(
        `INSERT INTO matched_contract_events (schema_id, tx_hash, ledger_seq, event_data)
         VALUES ($1, $2, $3, $4)
         RETURNING id, schema_id as "schemaId", tx_hash as "txHash", ledger_seq as "ledgerSeq", event_data as "eventData", matched_at as "matchedAt"`,
        [schemaId, txHash, ledgerSeq, JSON.stringify(eventData)]
      );
      const event = res.rows[0];
      logger.info({ schemaId, txHash }, "Indexed matched contract event");
      return event;
    } catch (err) {
      throw new Error(`Failed to record matched event: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async getMatchedEvents(
    schemaId: string,
    limit = 50,
    offset = 0,
    client?: PoolClient
  ): Promise<MatchedContractEvent[]> {
    const query = client || db;
    try {
      const res = await query.query(
        `SELECT id, schema_id as "schemaId", tx_hash as "txHash", ledger_seq as "ledgerSeq", event_data as "eventData", matched_at as "matchedAt"
         FROM matched_contract_events
         WHERE schema_id = $1
         ORDER BY matched_at DESC
         LIMIT $2 OFFSET $3`,
        [schemaId, limit, offset]
      );
      return res.rows;
    } catch (err) {
      throw new Error(`Failed to fetch matched events: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
};
