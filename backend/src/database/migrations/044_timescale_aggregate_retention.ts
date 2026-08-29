import type { Knex } from "knex";

export const RAW_RETENTION_DAYS = 90;
export const AGGREGATE_RETENTION_DAYS = 365;

export const RAW_HYPERTABLES = [
  "prices",
  "health_scores",
  "liquidity_snapshots",
] as const;

export const CONTINUOUS_AGGREGATES = [
  "prices_hourly",
  "prices_daily",
  "health_scores_hourly",
  "health_scores_daily",
  "liquidity_hourly",
  "liquidity_daily",
] as const;

async function supportsRetentionPolicies(knex: Knex): Promise<boolean> {
  const result = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'add_retention_policy'
    ) AS supported
  `);
  return Boolean((result.rows?.[0] as { supported?: boolean } | undefined)?.supported);
}

async function relationExists(knex: Knex, relation: string): Promise<boolean> {
  const result = await knex.raw("SELECT to_regclass(?) AS relation", [relation]);
  return Boolean((result.rows?.[0] as { relation?: string | null } | undefined)?.relation);
}

async function replacePolicy(
  knex: Knex,
  relation: string,
  retentionDays: number,
): Promise<void> {
  if (!(await relationExists(knex, relation))) return;

  await knex.raw("SELECT remove_retention_policy(?, if_exists => TRUE)", [relation]);
  await knex.raw(
    `SELECT add_retention_policy(?, INTERVAL '${retentionDays} days', if_not_exists => TRUE)`,
    [relation],
  );
}

async function removePolicy(knex: Knex, relation: string): Promise<void> {
  if (!(await relationExists(knex, relation))) return;
  await knex.raw("SELECT remove_retention_policy(?, if_exists => TRUE)", [relation]);
}

/**
 * Keep high-volume raw measurements for 90 days while preserving continuous
 * aggregate history for one year. Policies are replaced explicitly so an
 * installation with an older value converges to the configured windows.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await supportsRetentionPolicies(knex))) return;

  for (const table of RAW_HYPERTABLES) {
    await replacePolicy(knex, table, RAW_RETENTION_DAYS);
  }
  for (const view of CONTINUOUS_AGGREGATES) {
    await replacePolicy(knex, view, AGGREGATE_RETENTION_DAYS);
  }
}

/** Restore the previous behavior: raw policies remain at 90 days and aggregate data is indefinite. */
export async function down(knex: Knex): Promise<void> {
  if (!(await supportsRetentionPolicies(knex))) return;

  for (const view of CONTINUOUS_AGGREGATES) {
    await removePolicy(knex, view);
  }
}
