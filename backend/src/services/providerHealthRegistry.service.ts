import { getDatabase } from "../database/connection.js";
import { ExternalDependencyMonitorService } from "./externalDependencyMonitor.service.js";

export interface ProviderHealthSnapshot {
  providerKey: string;
  displayName: string;
  category: string;
  status: string;
  uptimeRatio24h: number;
  avgLatencyMs24h: number | null;
  p95LatencyMs24h: number | null;
  failureCount24h: number;
  manualOverride: {
    enabled: boolean;
    note: string | null;
  };
  alertState: "none" | "firing" | "suppressed";
  lastCheckedAt: string | null;
}

export class ProviderHealthRegistryService {
  private readonly db = getDatabase();
  private readonly dependencies = new ExternalDependencyMonitorService();

  async listRegistry(): Promise<{ providers: ProviderHealthSnapshot[]; totalProviders: number }> {
    const { dependencies } = await this.dependencies.listDependencies();
    const checks = await this.db("external_dependency_checks")
      .where("checked_at", ">=", this.db.raw("now() - interval '24 hours'"))
      .orderBy("checked_at", "desc");

    const checksByProvider = new Map<string, Record<string, unknown>[]>();
    for (const row of checks) {
      const key = String(row.provider_key);
      const entries = checksByProvider.get(key) ?? [];
      entries.push(row);
      checksByProvider.set(key, entries);
    }

    const providers = dependencies.map((provider) => {
      const providerChecks = checksByProvider.get(provider.providerKey) ?? [];
      const totalChecks = providerChecks.length;
      const healthyChecks = providerChecks.filter((row) => String(row.status) === "healthy").length;
      const failureCount = providerChecks.filter((row) => {
        const status = String(row.status);
        return status === "down" || status === "degraded";
      }).length;
      const latencySamples = providerChecks
        .map((row) => (row.latency_ms === null || row.latency_ms === undefined ? null : Number(row.latency_ms)))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b);

      const avgLatencyMs24h = latencySamples.length
        ? Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length)
        : null;
      const p95LatencyMs24h = latencySamples.length
        ? latencySamples[Math.min(latencySamples.length - 1, Math.ceil(latencySamples.length * 0.95) - 1)]
        : null;

      return {
        providerKey: provider.providerKey,
        displayName: provider.displayName,
        category: provider.category,
        status: provider.status,
        uptimeRatio24h: totalChecks === 0 ? 0 : Number((healthyChecks / totalChecks).toFixed(4)),
        avgLatencyMs24h,
        p95LatencyMs24h,
        failureCount24h: failureCount,
        manualOverride: {
          enabled: provider.maintenanceMode,
          note: provider.maintenanceNote,
        },
        alertState: provider.alertState,
        lastCheckedAt: provider.lastCheckedAt,
      } satisfies ProviderHealthSnapshot;
    });

    return {
      providers,
      totalProviders: providers.length,
    };
  }

  async setManualOverride(providerKey: string, enabled: boolean, note?: string | null): Promise<boolean> {
    const updated = await this.dependencies.setMaintenanceMode(providerKey, enabled, note ?? null);
    return Boolean(updated);
  }

  async flagAndSlashProvider(
    providerKey: string,
    deviationSigma: number,
    reason: string,
    slashedStake = 1.0,
    roundId?: string,
    assetCode = "UNKNOWN",
    reportedValue = 0,
    consensusValue = 0
  ): Promise<boolean> {
    const hasProviderTable = await this.db.schema.hasTable("bft_oracle_providers");
    if (hasProviderTable) {
      await this.db("bft_oracle_providers")
        .where({ provider_key: providerKey })
        .update({
          status: "slashed",
          slashed: true,
          slashed_at: this.db.fn.now(),
          slash_reason: reason,
          total_slashes: this.db.raw("total_slashes + 1"),
          updated_at: this.db.fn.now(),
        });
    }

    const hasSlashingTable = await this.db.schema.hasTable("bft_slashing_events");
    if (hasSlashingTable) {
      await this.db("bft_slashing_events").insert({
        provider_key: providerKey,
        round_id: roundId ?? null,
        asset_code: assetCode,
        reported_value: reportedValue,
        consensus_value: consensusValue,
        deviation_sigma: deviationSigma,
        slashed_stake: slashedStake,
        reason,
        created_at: this.db.fn.now(),
      });
    }

    try {
      await this.dependencies.setMaintenanceMode(
        providerKey,
        true,
        `Slashed: ${reason} (${deviationSigma.toFixed(2)} sigma)`
      );
    } catch {
      // Ignored if not in external dependencies
    }

    return true;
  }
}

export const providerHealthRegistryService = new ProviderHealthRegistryService();

