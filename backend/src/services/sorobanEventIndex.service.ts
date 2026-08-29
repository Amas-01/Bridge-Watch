import { sorobanEventModel, type SorobanEventRecord } from "../database/models/sorobanEvent.model.js";
import { SorobanRpcClient } from "./stellar/soroban.client.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

export class SorobanEventIndexService {
  private rpcClient: SorobanRpcClient;

  constructor() {
    this.rpcClient = new SorobanRpcClient({
      rpcUrls: [config.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org"],
    });
  }

  async getPaginatedEvents(
    contractId?: string,
    limit = 100,
    cursor?: string
  ): Promise<{ data: SorobanEventRecord[]; nextCursor?: string }> {
    return sorobanEventModel.getPaginatedEvents(contractId, limit, cursor);
  }

  // Called periodically via a worker to index events
  async syncEvents(contractId: string, limit = 1000): Promise<number> {
    const cursor = await sorobanEventModel.getLatestCursor(contractId) ?? "0";
    try {
      const response = await this.rpcClient.getEvents({
        cursor,
        limit,
        filters: [{ type: "contract", contractIds: [contractId] }],
      }) as { events?: any[] };

      const events = response.events || [];
      if (events.length === 0) return 0;

      const records: SorobanEventRecord[] = events.map((e: any) => ({
        cursor: e.pagingToken,
        ledger: e.ledger,
        ledger_closed_at: new Date(e.ledgerClosedAt),
        contract_id: e.contractId,
        topic: JSON.stringify(e.topic || []),
        value: e.value,
      }));

      await sorobanEventModel.insert(records);
      logger.info({ contractId, count: records.length }, "Indexed new Soroban events");
      return records.length;
    } catch (error) {
      logger.error({ contractId, error }, "Failed to sync Soroban events");
      return 0;
    }
  }
}

export const sorobanEventIndexService = new SorobanEventIndexService();
