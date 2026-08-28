import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { ethers } from "ethers";
import { config } from "../config/index.js";

// =============================================================================
// TYPES
// =============================================================================

export interface TokenDecimalSnapshot {
  id: string;
  tokenAddress: string;
  decimals: number;
  snapshottedAt: Date;
  chainId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenDecimalChangeAlert {
  id: string;
  tokenAddress: string;
  previousDecimals: number;
  newDecimals: number;
  detectedAt: Date;
  alertStatus: "open" | "acknowledged" | "resolved";
  acknowledgedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ERC20 ABI for decimals() function
const ERC20_DECIMALS_ABI = [
  "function decimals() view returns (uint8)",
];

// =============================================================================
// TOKEN DECIMAL DETECTION SERVICE
// =============================================================================

export class TokenDecimalDetectionService {
  private static instance: TokenDecimalDetectionService;
  private providers: Map<string, ethers.JsonRpcProvider>;

  private constructor() {
    this.providers = new Map();
    this.initializeProviders();
  }

  public static getInstance(): TokenDecimalDetectionService {
    if (!TokenDecimalDetectionService.instance) {
      TokenDecimalDetectionService.instance = new TokenDecimalDetectionService();
    }
    return TokenDecimalDetectionService.instance;
  }

  /**
   * Initialize RPC providers for different chains
   */
  private initializeProviders(): void {
    // Ethereum mainnet
    if (config.ETHEREUM_RPC_URL) {
      this.providers.set("1", new ethers.JsonRpcProvider(config.ETHEREUM_RPC_URL));
    }

    // Polygon
    if (config.POLYGON_RPC_URL) {
      this.providers.set("137", new ethers.JsonRpcProvider(config.POLYGON_RPC_URL));
    }

    // Base
    if (config.BASE_RPC_URL) {
      this.providers.set("8453", new ethers.JsonRpcProvider(config.BASE_RPC_URL));
    }
  }

  /**
   * Get provider for a specific chain
   */
  private getProvider(chainId: string): ethers.JsonRpcProvider {
    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new Error(`No RPC provider configured for chain ID: ${chainId}`);
    }
    return provider;
  }

  /**
   * Snapshot token decimals for a list of token addresses
   */
  async snapshotTokenDecimals(
    tokenAddresses: Array<{ address: string; chainId: string }>
  ): Promise<void> {
    logger.info({ count: tokenAddresses.length }, "Starting token decimal snapshot");

    const db = getDatabase();
    const now = new Date();

    for (const { address, chainId } of tokenAddresses) {
      try {
        // Query current decimals from blockchain
        const currentDecimals = await this.queryTokenDecimals(address, chainId);

        // Get previous snapshot
        const previousSnapshot = await db("token_decimal_snapshots")
          .where({ token_address: address.toLowerCase(), chain_id: chainId })
          .orderBy("snapshotted_at", "desc")
          .first();

        // Insert new snapshot
        await db("token_decimal_snapshots").insert({
          token_address: address.toLowerCase(),
          decimals: currentDecimals,
          snapshotted_at: now,
          chain_id: chainId,
        });

        // Check for decimal change
        if (previousSnapshot && previousSnapshot.decimals !== currentDecimals) {
          logger.warn(
            {
              tokenAddress: address,
              chainId,
              previousDecimals: previousSnapshot.decimals,
              newDecimals: currentDecimals,
            },
            "Token decimal change detected!"
          );

          // Create alert
          await db("token_decimal_change_alerts").insert({
            token_address: address.toLowerCase(),
            previous_decimals: previousSnapshot.decimals,
            new_decimals: currentDecimals,
            detected_at: now,
            alert_status: "open",
          });

          logger.info(
            { tokenAddress: address, chainId },
            "Decimal change alert created"
          );
        }

        logger.debug(
          { tokenAddress: address, chainId, decimals: currentDecimals },
          "Token decimal snapshot recorded"
        );
      } catch (error) {
        logger.error(
          { error, tokenAddress: address, chainId },
          "Failed to snapshot token decimals"
        );
      }
    }

    logger.info({}, "Token decimal snapshot completed");
  }

  /**
   * Query token decimals from blockchain
   */
  private async queryTokenDecimals(
    tokenAddress: string,
    chainId: string
  ): Promise<number> {
    const provider = this.getProvider(chainId);
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_DECIMALS_ABI,
      provider
    );

    const decimals = await tokenContract.decimals();
    return Number(decimals);
  }

  /**
   * Get active alerts (open status)
   */
  async getActiveAlerts(): Promise<TokenDecimalChangeAlert[]> {
    logger.info({}, "Fetching active decimal change alerts");

    const db = getDatabase();
    const rows = await db("token_decimal_change_alerts")
      .where({ alert_status: "open" })
      .orderBy("detected_at", "desc");

    return rows.map(this.mapAlertRow);
  }

  /**
   * Get all alerts by status
   */
  async getAlertsByStatus(
    status: "open" | "acknowledged" | "resolved"
  ): Promise<TokenDecimalChangeAlert[]> {
    logger.info({ status }, "Fetching decimal change alerts by status");

    const db = getDatabase();
    const rows = await db("token_decimal_change_alerts")
      .where({ alert_status: status })
      .orderBy("detected_at", "desc");

    return rows.map(this.mapAlertRow);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(id: string, acknowledgedBy: string): Promise<TokenDecimalChangeAlert> {
    logger.info({ id, acknowledgedBy }, "Acknowledging decimal change alert");

    const db = getDatabase();

    const alert = await db("token_decimal_change_alerts").where({ id }).first();

    if (!alert) {
      throw new Error("Alert not found");
    }

    if (alert.alert_status !== "open") {
      throw new Error(`Cannot acknowledge alert with status: ${alert.alert_status}`);
    }

    const [updated] = await db("token_decimal_change_alerts")
      .where({ id })
      .update({
        alert_status: "acknowledged",
        acknowledged_by: acknowledgedBy,
        updated_at: new Date(),
      })
      .returning("*");

    logger.info({ id, acknowledgedBy }, "Alert acknowledged");

    return this.mapAlertRow(updated);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(id: string, resolvedBy: string): Promise<TokenDecimalChangeAlert> {
    logger.info({ id, resolvedBy }, "Resolving decimal change alert");

    const db = getDatabase();

    const alert = await db("token_decimal_change_alerts").where({ id }).first();

    if (!alert) {
      throw new Error("Alert not found");
    }

    const now = new Date();

    const [updated] = await db("token_decimal_change_alerts")
      .where({ id })
      .update({
        alert_status: "resolved",
        resolved_at: now,
        updated_at: now,
      })
      .returning("*");

    logger.info({ id, resolvedBy }, "Alert resolved");

    return this.mapAlertRow(updated);
  }

  /**
   * Get snapshot history for a token
   */
  async getSnapshotHistory(
    tokenAddress: string,
    chainId?: string
  ): Promise<TokenDecimalSnapshot[]> {
    logger.info({ tokenAddress, chainId }, "Fetching token decimal snapshot history");

    const db = getDatabase();
    let query = db("token_decimal_snapshots")
      .where({ token_address: tokenAddress.toLowerCase() })
      .orderBy("snapshotted_at", "desc");

    if (chainId) {
      query = query.where({ chain_id: chainId });
    }

    const rows = await query;
    return rows.map(this.mapSnapshotRow);
  }

  /**
   * Map database row to TokenDecimalSnapshot type
   */
  private mapSnapshotRow(row: Record<string, unknown>): TokenDecimalSnapshot {
    return {
      id: row.id as string,
      tokenAddress: row.token_address as string,
      decimals: row.decimals as number,
      snapshottedAt: row.snapshotted_at as Date,
      chainId: row.chain_id as string,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  /**
   * Map database row to TokenDecimalChangeAlert type
   */
  private mapAlertRow(row: Record<string, unknown>): TokenDecimalChangeAlert {
    return {
      id: row.id as string,
      tokenAddress: row.token_address as string,
      previousDecimals: row.previous_decimals as number,
      newDecimals: row.new_decimals as number,
      detectedAt: row.detected_at as Date,
      alertStatus: row.alert_status as "open" | "acknowledged" | "resolved",
      acknowledgedBy: (row.acknowledged_by as string) || null,
      resolvedAt: (row.resolved_at as Date) || null,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}

export const tokenDecimalDetectionService = TokenDecimalDetectionService.getInstance();
