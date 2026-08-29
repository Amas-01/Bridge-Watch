import type { Knex } from "knex";
import { getDatabase } from "../database/connection.js";
import { auditService } from "./audit.service.js";

export interface Gap { from: number; to: number }
export interface SourceWatermark { source: string; coveredThrough: number; finalizedThrough: number; gaps: Gap[]; version: number; observedAt: string }
export interface BoundedWindow { consumer: string; through: number | null; sources: Record<string, SourceWatermark>; blocked: Array<{ source: string; reason: string }>; explain: string[] }

export const normaliseGaps = (gaps: Gap[]): Gap[] => gaps
  .filter((g) => Number.isSafeInteger(g.from) && Number.isSafeInteger(g.to) && g.from <= g.to)
  .sort((a, b) => a.from - b.from)
  .reduce<Gap[]>((all, gap) => {
    const last = all.at(-1);
    if (last && gap.from <= last.to + 1) last.to = Math.max(last.to, gap.to);
    else all.push({ ...gap });
    return all;
  }, []);

const map = (r: any): SourceWatermark => ({ source: r.source, coveredThrough: Number(r.covered_through), finalizedThrough: Number(r.finalized_through), gaps: typeof r.gaps === "string" ? JSON.parse(r.gaps) : r.gaps, version: Number(r.version), observedAt: new Date(r.observed_at).toISOString() });

export function boundedWatermark(consumer: string, dependencies: Array<{ source: string; minimumFinality: number }>, watermarks: Record<string, SourceWatermark>, overrides: Record<string, number> = {}): BoundedWindow {
  const sources: Record<string, SourceWatermark> = {}; const blocked: BoundedWindow["blocked"] = []; const explain: string[] = []; const candidates: number[] = [];
  for (const dep of dependencies) { const wm = watermarks[dep.source]; if (!wm) { blocked.push({ source: dep.source, reason: "no watermark published" }); continue; } sources[dep.source] = wm; const override = overrides[dep.source]; const gap = wm.gaps.find((g) => g.from <= wm.finalizedThrough); if (gap && override === undefined) { blocked.push({ source: dep.source, reason: `observed gap ${gap.from}-${gap.to}` }); continue; } if (wm.finalizedThrough < dep.minimumFinality && override === undefined) { blocked.push({ source: dep.source, reason: `finality ${wm.finalizedThrough} < required ${dep.minimumFinality}` }); continue; } const through = override === undefined ? wm.finalizedThrough : Math.max(wm.finalizedThrough, override); candidates.push(through); explain.push(`${dep.source} bounds ${consumer} through ${through}${override === undefined ? "" : " (operator override)"}`); }
  return { consumer, through: blocked.length || !candidates.length ? null : Math.min(...candidates), sources, blocked, explain };
}

/** Durable, transactionally serialised progress coordination for ingestion replicas. */
export class IngestionWatermarkCoordinator {
  constructor(private readonly db: Knex = getDatabase()) {}

  async publish(input: Omit<SourceWatermark, "version" | "observedAt"> & { observedAt?: Date; expectedVersion?: number }): Promise<SourceWatermark> {
    if (input.finalizedThrough > input.coveredThrough) throw new Error("finalizedThrough cannot exceed coveredThrough");
    return this.db.transaction(async (tx) => {
      const current = await tx("ingestion_source_watermarks").where({ source: input.source }).forUpdate().first();
      if (current && input.expectedVersion !== undefined && Number(current.version) !== input.expectedVersion) throw new Error("watermark version conflict");
      const coveredThrough = Math.max(input.coveredThrough, Number(current?.covered_through ?? 0));
      const finalizedThrough = Math.max(input.finalizedThrough, Number(current?.finalized_through ?? 0));
      const merged = normaliseGaps([...(current ? (typeof current.gaps === "string" ? JSON.parse(current.gaps) : current.gaps) : []), ...input.gaps])
        .filter((g) => g.to > finalizedThrough);
      const values = { covered_through: coveredThrough, finalized_through: finalizedThrough, gaps: JSON.stringify(merged), version: current ? Number(current.version) + 1 : 1, observed_at: input.observedAt ?? new Date(), updated_at: new Date() };
      const [row] = current
        ? await tx("ingestion_source_watermarks").where({ source: input.source }).update(values).returning("*")
        : await tx("ingestion_source_watermarks").insert({ source: input.source, ...values }).returning("*");
      return map(row);
    });
  }

  async setDependency(consumer: string, source: string, minimumFinality = 0): Promise<void> {
    await this.db("ingestion_dependency_barriers").insert({ consumer, source, minimum_finality: minimumFinality, required: true }).onConflict(["consumer", "source"]).merge({ minimum_finality: minimumFinality, required: true });
  }

  async inspect(consumer: string): Promise<BoundedWindow> {
    const deps = await this.db("ingestion_dependency_barriers").where({ consumer, required: true });
    const overrides = await this.db("ingestion_barrier_overrides").where({ consumer }).where((q) => q.whereNull("expires_at").orWhere("expires_at", ">", new Date()));
    const sources: Record<string, SourceWatermark> = {};
    for (const dep of deps) {
      const row = await this.db("ingestion_source_watermarks").where({ source: dep.source }).first();
      if (row) sources[dep.source] = map(row);
    }
    return boundedWatermark(consumer, deps.map((d) => ({ source: d.source, minimumFinality: Number(d.minimum_finality) })), sources, Object.fromEntries(overrides.map((o) => [o.source, Number(o.allow_through)])));
  }

  async overrideBarrier(input: { consumer: string; source: string; allowThrough: number; reason: string; actorId: string; expiresAt?: Date }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx("ingestion_barrier_overrides").insert({ consumer: input.consumer, source: input.source, allow_through: input.allowThrough, reason: input.reason, actor_id: input.actorId, expires_at: input.expiresAt ?? null });
      await auditService.log({ action: "ingestion.barrier_overridden", actorId: input.actorId, actorType: "admin", resourceType: "ingestion_barrier", resourceId: `${input.consumer}:${input.source}`, metadata: { allowThrough: input.allowThrough, reason: input.reason, expiresAt: input.expiresAt?.toISOString() } });
    });
  }
}
export const ingestionWatermarkCoordinator = new IngestionWatermarkCoordinator();
