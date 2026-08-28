import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import axios, { AxiosError } from "axios";

// =============================================================================
// TYPES
// =============================================================================

export interface MethodCapability {
  id: string;
  rpcEndpointUrl: string;
  methodName: string;
  isSupported: boolean;
  discoveredAt: Date;
  lastCheckedAt: Date;
  responseSchema: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// Known RPC methods to probe
const KNOWN_RPC_METHODS = [
  "eth_blockNumber",
  "eth_getBalance",
  "eth_call",
  "eth_sendRawTransaction",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getLogs",
  "eth_gasPrice",
  "eth_estimateGas",
  "net_version",
  "web3_clientVersion",
  "eth_chainId",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getTransactionCount",
  "eth_syncing",
  "eth_accounts",
];

// =============================================================================
// RPC CAPABILITY DISCOVERY SERVICE
// =============================================================================

export class RpcCapabilityDiscoveryService {
  private static instance: RpcCapabilityDiscoveryService;

  private constructor() {}

  public static getInstance(): RpcCapabilityDiscoveryService {
    if (!RpcCapabilityDiscoveryService.instance) {
      RpcCapabilityDiscoveryService.instance = new RpcCapabilityDiscoveryService();
    }
    return RpcCapabilityDiscoveryService.instance;
  }

  /**
   * Discover capabilities for an RPC endpoint by probing known methods
   */
  async discoverCapabilities(endpointUrl: string): Promise<MethodCapability[]> {
    logger.info({ endpointUrl }, "Starting RPC capability discovery");

    const db = getDatabase();
    const now = new Date();
    const capabilities: MethodCapability[] = [];

    for (const methodName of KNOWN_RPC_METHODS) {
      try {
        const { isSupported, responseSchema } = await this.probeMethod(
          endpointUrl,
          methodName
        );

        // Upsert capability record
        const existing = await db("rpc_method_capabilities")
          .where({ rpc_endpoint_url: endpointUrl, method_name: methodName })
          .first();

        if (existing) {
          // Update existing record
          await db("rpc_method_capabilities")
            .where({ id: existing.id })
            .update({
              is_supported: isSupported,
              last_checked_at: now,
              response_schema: responseSchema ? JSON.stringify(responseSchema) : null,
              updated_at: now,
            });

          capabilities.push(this.mapRow({ ...existing, is_supported: isSupported }));
        } else {
          // Insert new record
          const [inserted] = await db("rpc_method_capabilities")
            .insert({
              rpc_endpoint_url: endpointUrl,
              method_name: methodName,
              is_supported: isSupported,
              discovered_at: now,
              last_checked_at: now,
              response_schema: responseSchema ? JSON.stringify(responseSchema) : null,
            })
            .returning("*");

          capabilities.push(this.mapRow(inserted));
        }

        logger.debug(
          { endpointUrl, methodName, isSupported },
          "Method capability recorded"
        );
      } catch (error) {
        logger.error(
          { error, endpointUrl, methodName },
          "Failed to probe RPC method"
        );
      }
    }

    logger.info(
      { endpointUrl, totalMethods: capabilities.length },
      "RPC capability discovery completed"
    );

    return capabilities;
  }

  /**
   * Get all capabilities for an RPC endpoint
   */
  async getCapabilities(endpointUrl: string): Promise<MethodCapability[]> {
    logger.info({ endpointUrl }, "Fetching RPC capabilities");

    const db = getDatabase();
    const rows = await db("rpc_method_capabilities")
      .where({ rpc_endpoint_url: endpointUrl })
      .orderBy("method_name", "asc");

    return rows.map(this.mapRow);
  }

  /**
   * Get all unique RPC endpoints that have been discovered
   */
  async getAllEndpoints(): Promise<string[]> {
    const db = getDatabase();
    const rows = await db("rpc_method_capabilities")
      .distinct("rpc_endpoint_url")
      .orderBy("rpc_endpoint_url", "asc");

    return rows.map((row) => row.rpc_endpoint_url);
  }

  /**
   * Refresh capabilities for an endpoint by re-probing
   */
  async refreshCapabilities(endpointUrl: string): Promise<void> {
    logger.info({ endpointUrl }, "Refreshing RPC capabilities");
    await this.discoverCapabilities(endpointUrl);
  }

  /**
   * Probe a single RPC method to check if it's supported
   */
  private async probeMethod(
    endpointUrl: string,
    methodName: string
  ): Promise<{ isSupported: boolean; responseSchema: Record<string, unknown> | null }> {
    try {
      // Build a minimal valid request for each method type
      const params = this.getMethodParams(methodName);

      const response = await axios.post(
        endpointUrl,
        {
          jsonrpc: "2.0",
          method: methodName,
          params,
          id: 1,
        },
        {
          timeout: 5000,
          headers: { "Content-Type": "application/json" },
        }
      );

      // Check if method is supported (no error response)
      if (response.data.error) {
        // Method not supported or invalid params
        const errorCode = response.data.error.code;
        // -32601 = method not found, -32600 = invalid request
        if (errorCode === -32601) {
          return { isSupported: false, responseSchema: null };
        }
        // Other errors (like invalid params) mean method exists but params were wrong
        return { isSupported: true, responseSchema: null };
      }

      // Method is supported
      const responseSchema = response.data.result
        ? this.extractSchema(response.data.result)
        : null;

      return { isSupported: true, responseSchema };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        // Network error or timeout - assume method might be supported but endpoint unreachable
        if (axiosError.code === "ECONNABORTED" || axiosError.code === "ECONNREFUSED") {
          logger.warn({ endpointUrl, methodName }, "Endpoint unreachable during probe");
          return { isSupported: false, responseSchema: null };
        }
      }
      // Unknown error
      return { isSupported: false, responseSchema: null };
    }
  }

  /**
   * Get minimal valid params for common RPC methods
   */
  private getMethodParams(methodName: string): unknown[] {
    const paramMap: Record<string, unknown[]> = {
      eth_blockNumber: [],
      eth_gasPrice: [],
      eth_chainId: [],
      eth_syncing: [],
      eth_accounts: [],
      net_version: [],
      web3_clientVersion: [],
      eth_getBalance: ["0x0000000000000000000000000000000000000000", "latest"],
      eth_getCode: ["0x0000000000000000000000000000000000000000", "latest"],
      eth_getStorageAt: [
        "0x0000000000000000000000000000000000000000",
        "0x0",
        "latest",
      ],
      eth_getTransactionCount: ["0x0000000000000000000000000000000000000000", "latest"],
      eth_call: [
        {
          to: "0x0000000000000000000000000000000000000000",
          data: "0x",
        },
        "latest",
      ],
      eth_estimateGas: [
        {
          to: "0x0000000000000000000000000000000000000000",
          data: "0x",
        },
      ],
      eth_getBlockByNumber: ["latest", false],
      eth_getBlockByHash: [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        false,
      ],
      eth_getTransactionByHash: [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      ],
      eth_getTransactionReceipt: [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      ],
      eth_getLogs: [{ fromBlock: "latest", toBlock: "latest" }],
      eth_sendRawTransaction: ["0x"], // Will fail but tells us if method exists
    };

    return paramMap[methodName] ?? [];
  }

  /**
   * Extract a simple schema representation from a response
   */
  private extractSchema(result: unknown): Record<string, unknown> | null {
    if (result === null || result === undefined) {
      return null;
    }

    if (typeof result === "object" && !Array.isArray(result)) {
      // Return type information for each key
      const schema: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(result)) {
        schema[key] = typeof value;
      }
      return schema;
    }

    // Primitive or array - just return type
    return { type: Array.isArray(result) ? "array" : typeof result };
  }

  /**
   * Map database row to MethodCapability type
   */
  private mapRow(row: Record<string, unknown>): MethodCapability {
    return {
      id: row.id as string,
      rpcEndpointUrl: row.rpc_endpoint_url as string,
      methodName: row.method_name as string,
      isSupported: row.is_supported as boolean,
      discoveredAt: row.discovered_at as Date,
      lastCheckedAt: row.last_checked_at as Date,
      responseSchema:
        typeof row.response_schema === "string"
          ? JSON.parse(row.response_schema)
          : (row.response_schema as Record<string, unknown> | null),
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}

export const rpcCapabilityDiscoveryService = RpcCapabilityDiscoveryService.getInstance();
