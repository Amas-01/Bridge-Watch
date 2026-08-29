import { describe, expect, it, vi } from "vitest";
import type { Knex } from "knex";
import {
  AGGREGATE_RETENTION_DAYS,
  CONTINUOUS_AGGREGATES,
  RAW_HYPERTABLES,
  RAW_RETENTION_DAYS,
  down,
  up,
} from "../../src/database/migrations/044_timescale_aggregate_retention.js";

function mockKnex(supported = true): { knex: Knex; raw: ReturnType<typeof vi.fn> } {
  const raw = vi.fn(async (sql: string, bindings?: string[]) => {
    if (sql.includes("FROM pg_proc")) return { rows: [{ supported }] };
    if (sql.includes("to_regclass")) return { rows: [{ relation: bindings?.[0] ?? null }] };
    return { rows: [] };
  });
  return { knex: { raw } as unknown as Knex, raw };
}

function addPolicyCalls(raw: ReturnType<typeof vi.fn>) {
  return raw.mock.calls.filter(([sql]) =>
    String(sql).includes("SELECT add_retention_policy(?"),
  );
}

describe("TimescaleDB aggregate retention migration", () => {
  it("keeps raw data for 90 days and aggregate data for 365 days", async () => {
    const { knex, raw } = mockKnex();

    await up(knex);

    const calls = addPolicyCalls(raw);
    for (const table of RAW_HYPERTABLES) {
      expect(calls).toContainEqual([
        expect.stringContaining(`INTERVAL '${RAW_RETENTION_DAYS} days'`),
        [table],
      ]);
    }
    for (const view of CONTINUOUS_AGGREGATES) {
      expect(calls).toContainEqual([
        expect.stringContaining(`INTERVAL '${AGGREGATE_RETENTION_DAYS} days'`),
        [view],
      ]);
      expect(calls).not.toContainEqual([
        expect.stringContaining(`INTERVAL '${RAW_RETENTION_DAYS} days'`),
        [view],
      ]);
    }
  });

  it("is a no-op when TimescaleDB retention functions are unavailable", async () => {
    const { knex, raw } = mockKnex(false);

    await up(knex);

    expect(raw).toHaveBeenCalledOnce();
    expect(addPolicyCalls(raw)).toHaveLength(0);
  });

  it("removes only aggregate policies on rollback", async () => {
    const { knex, raw } = mockKnex();

    await down(knex);

    const removals = raw.mock.calls.filter(([sql]) =>
      String(sql).includes("remove_retention_policy"),
    );
    expect(removals.map(([, bindings]) => bindings?.[0])).toEqual(
      CONTINUOUS_AGGREGATES,
    );
    expect(removals.map(([, bindings]) => bindings?.[0])).not.toEqual(
      expect.arrayContaining(RAW_HYPERTABLES),
    );
  });
});
