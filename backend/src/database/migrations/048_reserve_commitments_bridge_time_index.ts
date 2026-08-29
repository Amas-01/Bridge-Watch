import type { Knex } from "knex";

/**
 * reserve_commitments previously had `index(["bridge_id", "status"])` and a
 * standalone `index(["committed_at"])` (see 002_reserve_verification.ts),
 * but nothing covering the common "commitment history for a given bridge
 * within a time range, most recent first" access pattern -- e.g.
 * `WHERE bridge_id = ? AND committed_at BETWEEN ? AND ? ORDER BY committed_at DESC`.
 *
 * Without this, the planner has to pick one of the two existing indexes and
 * either scan the committed_at range and filter out non-matching bridge_ids
 * row by row, or scan all of a bridge's rows and sort them in memory.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX idx_reserve_commitments_bridge_time
      ON reserve_commitments (bridge_id, committed_at DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_reserve_commitments_bridge_time");
}
