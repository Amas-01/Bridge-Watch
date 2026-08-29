import { getDatabase } from "../../database/connection.js";
import { logger } from "../../utils/logger.js";
import { getEthereumRpcClient } from "./client.js";
import type { ChainId } from "./types.js";

export interface EvmLockContractRow {
  id: string;
  bridge_name: string;
  chain_id: ChainId;
  contract_address: string;
  token_address: string;
  asset_symbol: string;
  is_active: boolean;
}

export interface EvmLockDetail {
  chain: ChainId;
  contractAddress: string;
  tokenAddress: string;
  assetSymbol: string;
  lockedAmount: string;
  isPaused: boolean;
  blockNumber: number;
  timestamp: number;
  error: string | null;
}

export interface LockContractFilters {
  bridgeName?: string;
  assetSymbol?: string;
}

/**
 * Watches EVM lock/custody contracts (e.g. Wormhole Token Bridge) across
 * multiple chains and reports how much of a given asset is currently locked.
 */
export class WormholeBridgeWatcher {
  private readonly db = getDatabase();

  async getLockContracts(filters: LockContractFilters = {}): Promise<EvmLockContractRow[]> {
    const query = this.db<EvmLockContractRow>("evm_lock_contracts").where({ is_active: true });
    if (filters.bridgeName) query.andWhere({ bridge_name: filters.bridgeName });
    if (filters.assetSymbol) query.andWhere({ asset_symbol: filters.assetSymbol });
    return query;
  }

  /** Fetch live lock balances for every registered contract matching the filters. */
  async fetchLockBalances(filters: LockContractFilters = {}): Promise<EvmLockDetail[]> {
    const contracts = await this.getLockContracts(filters);
    if (!contracts.length) return [];

    const client = getEthereumRpcClient();
    const supportedChains = new Set(client.getSupportedChains());

    return Promise.all(
      contracts.map(async (row): Promise<EvmLockDetail> => {
        if (!supportedChains.has(row.chain_id)) {
          return {
            chain: row.chain_id,
            contractAddress: row.contract_address,
            tokenAddress: row.token_address,
            assetSymbol: row.asset_symbol,
            lockedAmount: "0",
            isPaused: false,
            blockNumber: 0,
            timestamp: 0,
            error: `Chain ${row.chain_id} not configured (missing RPC URL)`,
          };
        }

        try {
          const reserves = await client.getBridgeReserves(row.chain_id, row.contract_address, row.token_address);
          return {
            chain: reserves.chain,
            contractAddress: reserves.contractAddress,
            tokenAddress: reserves.tokenAddress,
            assetSymbol: row.asset_symbol,
            lockedAmount: reserves.formattedAmount,
            isPaused: reserves.isPaused,
            blockNumber: reserves.blockNumber,
            timestamp: reserves.timestamp,
            error: null,
          };
        } catch (error: any) {
          logger.error(
            { error, chain: row.chain_id, contractAddress: row.contract_address },
            "Failed to fetch EVM lock balance"
          );
          return {
            chain: row.chain_id,
            contractAddress: row.contract_address,
            tokenAddress: row.token_address,
            assetSymbol: row.asset_symbol,
            lockedAmount: "0",
            isPaused: false,
            blockNumber: 0,
            timestamp: 0,
            error: error?.message ?? String(error),
          };
        }
      })
    );
  }

  /** Sum locked balances for an asset across all registered chains. */
  async getTotalLocked(assetSymbol: string): Promise<number> {
    const details = await this.fetchLockBalances({ assetSymbol });
    return details.reduce((sum, detail) => sum + (detail.error ? 0 : parseFloat(detail.lockedAmount)), 0);
  }
}

let _watcher: WormholeBridgeWatcher | null = null;

export function getWormholeBridgeWatcher(): WormholeBridgeWatcher {
  if (!_watcher) _watcher = new WormholeBridgeWatcher();
  return _watcher;
}
