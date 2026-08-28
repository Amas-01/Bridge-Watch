import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import crypto from "crypto";

export type ContractChangeType = "field_removed" | "field_added" | "type_changed" | "status_changed" | "endpoint_removed" | "endpoint_added";
export type ContractSeverity = "breaking" | "non-breaking" | "informational";

export interface ApiContractEndpoint {
  id: string;
  providerKey: string;
  endpointUrl: string;
  displayName: string;
  schemaPath: string | null;
  expectedFields: string[];
  enabled: boolean;
  lastCheckedAt: string | null;
  lastSchemaHash: string | null;
  consecutiveFailures: number;
}

export interface ContractDrift {
  id: string;
  endpointId: string;
  providerKey: string;
  endpointUrl: string;
  changeType: ContractChangeType;
  severity: ContractSeverity;
  fieldPath: string | null;
  previousValue: string | null;
  currentValue: string | null;
  detectedAt: string;
  acknowledged: boolean;
}

export interface ContractCheckResult {
  endpointId: string;
  providerKey: string;
  endpointUrl: string;
  success: boolean;
  schemaHash: string | null;
  drifts: ContractDrift[];
  error: string | null;
  checkedAt: string;
}

export interface MonitorRunResult {
  checkedAt: string;
  totalEndpoints: number;
  checked: number;
  driftsDetected: number;
  breakingChanges: number;
  results: ContractCheckResult[];
}

const CHECK_TIMEOUT_MS = 8_000;

export class ApiContractMonitorService {
  private readonly db = getDatabase();

  async listEndpoints(): Promise<ApiContractEndpoint[]> {
    const rows = await this.db("api_contract_endpoints")
      .select("*")
      .where({ enabled: true })
      .orderBy("provider_key", "asc");

    return rows.map(this.mapEndpointRow);
  }

  async runAllChecks(): Promise<MonitorRunResult> {
    const checkedAt = new Date().toISOString();
    const endpoints = await this.listEndpoints();
    const results: ContractCheckResult[] = [];

    logger.info({ checkedAt, totalEndpoints: endpoints.length }, "API contract monitor starting checks");

    for (const endpoint of endpoints) {
      const result = await this.checkEndpoint(endpoint);
      results.push(result);
    }

    const driftsDetected = results.reduce((sum, r) => sum + r.drifts.length, 0);
    const breakingChanges = results.reduce(
      (sum, r) => sum + r.drifts.filter((d) => d.severity === "breaking").length,
      0
    );

    if (breakingChanges > 0) {
      logger.error({ breakingChanges, driftsDetected }, "Breaking API contract changes detected");
    } else if (driftsDetected > 0) {
      logger.warn({ driftsDetected }, "Non-breaking API contract drifts detected");
    } else {
      logger.info({ checkedAt, checked: results.length }, "API contract monitor: no drift detected");
    }

    return {
      checkedAt,
      totalEndpoints: endpoints.length,
      checked: results.length,
      driftsDetected,
      breakingChanges,
      results,
    };
  }

  private async checkEndpoint(endpoint: ApiContractEndpoint): Promise<ContractCheckResult> {
    const checkedAt = new Date().toISOString();
    const drifts: ContractDrift[] = [];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

      let responseBody: unknown;
      try {
        const res = await fetch(endpoint.endpointUrl, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        responseBody = await res.json();
      } finally {
        clearTimeout(timeout);
      }

      const currentSchema = this.extractSchema(responseBody);
      const schemaHash = this.hashSchema(currentSchema);

      if (endpoint.lastSchemaHash && endpoint.lastSchemaHash !== schemaHash) {
        const storedSchema = await this.loadStoredSchema(endpoint.id);
        const newDrifts = this.diffSchemas(endpoint, storedSchema, currentSchema, checkedAt);
        drifts.push(...newDrifts);

        if (newDrifts.length > 0) {
          await this.persistDrifts(newDrifts);
        }
      }

      await this.updateEndpointStatus(endpoint.id, { schemaHash, success: true, currentSchema });

      return { endpointId: endpoint.id, providerKey: endpoint.providerKey, endpointUrl: endpoint.endpointUrl, success: true, schemaHash, drifts, error: null, checkedAt };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ endpointId: endpoint.id, providerKey: endpoint.providerKey, error: msg }, "API contract check failed");

      await this.updateEndpointStatus(endpoint.id, { success: false });

      return { endpointId: endpoint.id, providerKey: endpoint.providerKey, endpointUrl: endpoint.endpointUrl, success: false, schemaHash: null, drifts: [], error: msg, checkedAt };
    }
  }

  private extractSchema(body: unknown): Record<string, string> {
    if (body === null || typeof body !== "object") return {};
    const schema: Record<string, string> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      schema[key] = Array.isArray(value) ? "array" : typeof value;
    }
    return schema;
  }

  private hashSchema(schema: Record<string, string>): string {
    const normalized = JSON.stringify(Object.fromEntries(Object.entries(schema).sort()));
    return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  }

  private diffSchemas(
    endpoint: ApiContractEndpoint,
    previous: Record<string, string>,
    current: Record<string, string>,
    detectedAt: string
  ): ContractDrift[] {
    const drifts: ContractDrift[] = [];

    for (const field of Object.keys(previous)) {
      if (!(field in current)) {
        drifts.push(this.buildDrift(endpoint, "field_removed", "breaking", field, previous[field], null, detectedAt));
      } else if (previous[field] !== current[field]) {
        drifts.push(this.buildDrift(endpoint, "type_changed", "breaking", field, previous[field], current[field], detectedAt));
      }
    }

    for (const field of Object.keys(current)) {
      if (!(field in previous)) {
        drifts.push(this.buildDrift(endpoint, "field_added", "non-breaking", field, null, current[field], detectedAt));
      }
    }

    return drifts;
  }

  private buildDrift(
    endpoint: ApiContractEndpoint,
    changeType: ContractChangeType,
    severity: ContractSeverity,
    fieldPath: string | null,
    previousValue: string | null,
    currentValue: string | null,
    detectedAt: string
  ): ContractDrift {
    return {
      id: crypto.randomUUID(),
      endpointId: endpoint.id,
      providerKey: endpoint.providerKey,
      endpointUrl: endpoint.endpointUrl,
      changeType,
      severity,
      fieldPath,
      previousValue,
      currentValue,
      detectedAt,
      acknowledged: false,
    };
  }

  private async loadStoredSchema(endpointId: string): Promise<Record<string, string>> {
    const row = await this.db("api_contract_schemas")
      .select("schema")
      .where({ endpoint_id: endpointId })
      .orderBy("captured_at", "desc")
      .first();

    if (!row?.schema) return {};
    return typeof row.schema === "string" ? JSON.parse(row.schema) : (row.schema as Record<string, string>);
  }

  private async persistDrifts(drifts: ContractDrift[]): Promise<void> {
    if (drifts.length === 0) return;
    await this.db("api_contract_drifts").insert(
      drifts.map((d) => ({
        id: d.id,
        endpoint_id: d.endpointId,
        provider_key: d.providerKey,
        endpoint_url: d.endpointUrl,
        change_type: d.changeType,
        severity: d.severity,
        field_path: d.fieldPath,
        previous_value: d.previousValue,
        current_value: d.currentValue,
        detected_at: new Date(d.detectedAt),
        acknowledged: false,
      }))
    ).onConflict("id").ignore();
  }

  private async updateEndpointStatus(
    endpointId: string,
    opts: { schemaHash?: string; success: boolean; currentSchema?: Record<string, string> }
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      last_checked_at: new Date(),
      updated_at: new Date(),
    };

    if (opts.success) {
      patch.consecutive_failures = 0;
      if (opts.schemaHash) patch.last_schema_hash = opts.schemaHash;
    } else {
      await this.db("api_contract_endpoints")
        .where({ id: endpointId })
        .increment("consecutive_failures", 1)
        .update({ last_checked_at: new Date(), updated_at: new Date() });
      return;
    }

    await this.db("api_contract_endpoints").where({ id: endpointId }).update(patch);

    if (opts.currentSchema) {
      await this.db("api_contract_schemas")
        .insert({ endpoint_id: endpointId, schema: JSON.stringify(opts.currentSchema), captured_at: new Date() })
        .onConflict(["endpoint_id"])
        .merge(["schema", "captured_at"]);
    }
  }

  private mapEndpointRow(row: Record<string, unknown>): ApiContractEndpoint {
    return {
      id: String(row.id),
      providerKey: String(row.provider_key),
      endpointUrl: String(row.endpoint_url),
      displayName: String(row.display_name ?? row.provider_key),
      schemaPath: row.schema_path ? String(row.schema_path) : null,
      expectedFields: Array.isArray(row.expected_fields) ? (row.expected_fields as string[]) : [],
      enabled: Boolean(row.enabled ?? true),
      lastCheckedAt: row.last_checked_at ? new Date(String(row.last_checked_at)).toISOString() : null,
      lastSchemaHash: row.last_schema_hash ? String(row.last_schema_hash) : null,
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
    };
  }
}

export const apiContractMonitorService = new ApiContractMonitorService();
