import { Knex } from "knex";
import {
  ChainConnectivityModel,
  ChainEndpoint,
  ConnectivityCheck,
} from "../database/models/ChainConnectivity.js";
import logger from "../utils/logger.js";

export class ChainConnectivityService {
  private model: ChainConnectivityModel;

  constructor(private db: Knex) {
    this.model = new ChainConnectivityModel(db);
  }

  async checkEndpoint(endpointId: string): Promise<ConnectivityCheck> {
    const endpoints = await this.model.getAllActiveEndpoints();
    const endpoint = endpoints.find((e) => e.id === endpointId);

    if (!endpoint) {
      throw new Error(`Endpoint ${endpointId} not found`);
    }

    const startTime = Date.now();
    let isReachable = false;
    let blockHeight: number | undefined;
    let errorMessage: string | undefined;

    try {
      const result = await this.performHealthCheck(endpoint);
      isReachable = result.success;
      blockHeight = result.blockHeight;
      errorMessage = result.error;
    } catch (error: any) {
      isReachable = false;
      errorMessage = error.message;
    }

    const responseTimeMs = Date.now() - startTime;

    const check = await this.model.recordCheck({
      endpoint_id: endpointId,
      check_timestamp: new Date(),
      is_reachable: isReachable,
      response_time_ms: responseTimeMs,
      block_height: blockHeight,
      error_message: errorMessage,
      metadata: {},
    });

    return check;
  }

  async checkAllEndpoints(): Promise<Map<string, ConnectivityCheck[]>> {
    const endpoints = await this.model.getAllActiveEndpoints();
    const results = new Map<string, ConnectivityCheck[]>();

    for (const endpoint of endpoints) {
      try {
        const check = await this.checkEndpoint(endpoint.id);
        const chainResults = results.get(endpoint.chain_id) || [];
        chainResults.push(check);
        results.set(endpoint.chain_id, chainResults);
      } catch (error: any) {
        logger.error(
          { endpointId: endpoint.id, error: error.message },
          "Failed to check endpoint",
        );
      }
    }

    return results;
  }

  async generateComparisonSnapshot(chainId: string): Promise<void> {
    const endpoints = await this.model.getEndpointsByChain(chainId);
    const checks = await Promise.all(
      endpoints.map((endpoint) => this.checkEndpoint(endpoint.id)),
    );

    const reachableCount = checks.filter((c) => c.is_reachable).length;
    const unreachableCount = checks.length - reachableCount;
    const healthScore =
      checks.length > 0 ? (reachableCount / checks.length) * 100 : 0;

    const endpointsStatus: Record<string, any> = {};
    endpoints.forEach((endpoint, index) => {
      endpointsStatus[endpoint.id] = {
        url: endpoint.endpoint_url,
        type: endpoint.endpoint_type,
        provider: endpoint.provider_name,
        isReachable: checks[index].is_reachable,
        responseTime: checks[index].response_time_ms,
        blockHeight: checks[index].block_height,
      };
    });

    await this.model.createSnapshot({
      chain_id: chainId,
      snapshot_timestamp: new Date(),
      endpoints_status: endpointsStatus,
      overall_health_score: healthScore,
      total_endpoints: endpoints.length,
      reachable_endpoints: reachableCount,
      unreachable_endpoints: unreachableCount,
    });
  }

  async getComparisonMap(chainId: string) {
    const snapshot = await this.model.getLatestSnapshot(chainId);
    return snapshot;
  }

  private async performHealthCheck(
    endpoint: ChainEndpoint,
  ): Promise<{ success: boolean; blockHeight?: number; error?: string }> {
    // Placeholder implementation - would actually call the endpoint
    return { success: true, blockHeight: 12345 };
  }
}
