import { Knex } from "knex";

export interface ChainEndpoint {
  id: string;
  chain_id: string;
  endpoint_url: string;
  endpoint_type: "rpc" | "api" | "websocket";
  provider_name?: string;
  is_active: boolean;
  priority: number;
  config: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ConnectivityCheck {
  id: string;
  endpoint_id: string;
  check_timestamp: Date;
  is_reachable: boolean;
  response_time_ms?: number;
  block_height?: number;
  error_message?: string;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface ConnectivitySnapshot {
  id: string;
  chain_id: string;
  snapshot_timestamp: Date;
  endpoints_status: Record<string, any>;
  overall_health_score: number;
  total_endpoints: number;
  reachable_endpoints: number;
  unreachable_endpoints: number;
  created_at: Date;
}

export class ChainConnectivityModel {
  constructor(private db: Knex) {}

  async createEndpoint(
    endpoint: Omit<ChainEndpoint, "id" | "created_at" | "updated_at">,
  ): Promise<ChainEndpoint> {
    const [created] = await this.db("chain_endpoints")
      .insert(endpoint)
      .returning("*");
    return created;
  }

  async getEndpointsByChain(chainId: string): Promise<ChainEndpoint[]> {
    return await this.db("chain_endpoints")
      .where({ chain_id: chainId, is_active: true })
      .orderBy("priority", "desc");
  }

  async getAllActiveEndpoints(): Promise<ChainEndpoint[]> {
    return await this.db("chain_endpoints").where({ is_active: true });
  }

  async recordCheck(
    check: Omit<ConnectivityCheck, "id" | "created_at">,
  ): Promise<ConnectivityCheck> {
    const [created] = await this.db("connectivity_checks")
      .insert(check)
      .returning("*");
    return created;
  }

  async getRecentChecks(
    endpointId: string,
    limit: number = 100,
  ): Promise<ConnectivityCheck[]> {
    return await this.db("connectivity_checks")
      .where({ endpoint_id: endpointId })
      .orderBy("check_timestamp", "desc")
      .limit(limit);
  }

  async createSnapshot(
    snapshot: Omit<ConnectivitySnapshot, "id" | "created_at">,
  ): Promise<ConnectivitySnapshot> {
    const [created] = await this.db("connectivity_comparison_snapshots")
      .insert(snapshot)
      .returning("*");
    return created;
  }

  async getLatestSnapshot(
    chainId: string,
  ): Promise<ConnectivitySnapshot | undefined> {
    return await this.db("connectivity_comparison_snapshots")
      .where({ chain_id: chainId })
      .orderBy("snapshot_timestamp", "desc")
      .first();
  }

  async getSnapshotHistory(
    chainId: string,
    hours: number = 24,
  ): Promise<ConnectivitySnapshot[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await this.db("connectivity_comparison_snapshots")
      .where({ chain_id: chainId })
      .where("snapshot_timestamp", ">=", since)
      .orderBy("snapshot_timestamp", "desc");
  }
}
