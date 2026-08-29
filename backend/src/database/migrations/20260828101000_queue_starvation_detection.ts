import type { Knex } from "knex";

/**
 * Queue starvation detection.
 *
 * Samples are stored rather than only the derived severity, because the
 * detection rule requires a *run* of consecutive starved samples before it
 * raises a signal — and because a tuning change should be answerable against
 * history ("would this threshold have paged us last week?") without waiting to
 * re-collect it.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("queue_starvation_policies", (t) => {
    t.string("queue_name", 128).primary();
    t.integer("degraded_after_ms").notNullable().defaultTo(60000);
    t.integer("starved_after_ms").notNullable().defaultTo(300000);
    t.integer("consecutive_samples").notNullable().defaultTo(3);
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Degraded must trip before starved, or the severities are unreachable in
    // the order the detector expects.
    t.check("degraded_after_ms <= starved_after_ms", [], "chk_starvation_thresholds");
    t.check("consecutive_samples >= 1", [], "chk_starvation_samples");
  });

  await knex.schema.createTable("queue_starvation_samples", (t) => {
    t.bigIncrements("id").primary();
    t.string("queue_name", 128).notNullable();
    t.integer("depth").notNullable();
    t.bigInteger("oldest_age_ms").notNullable();
    t.integer("processed_in_window").notNullable();
    t.integer("active_consumers").notNullable();
    // healthy | degraded | starved
    t.string("severity", 16).notNullable();
    t.string("reason", 500).notNullable();
    t.timestamp("sampled_at", { useTz: true }).notNullable();

    // The detector reads the most recent N samples for one queue.
    t.index(["queue_name", "sampled_at"], "idx_starvation_sample_queue");
    // Retention sweeps scan by age alone.
    t.index(["sampled_at"], "idx_starvation_sample_age");
  });

  await knex.schema.createTable("queue_starvation_signals", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("queue_name", 128).notNullable();
    t.string("severity", 16).notNullable();
    t.string("reason", 500).notNullable();
    t.integer("consecutive_samples").notNullable();
    t.timestamp("raised_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("cleared_at", { useTz: true }).nullable();

    // At most one live signal per queue, so a queue that stays starved across
    // many sampling windows does not raise a duplicate every interval.
    t.index(["queue_name", "cleared_at"], "idx_starvation_signal_live");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("queue_starvation_signals");
  await knex.schema.dropTableIfExists("queue_starvation_samples");
  await knex.schema.dropTableIfExists("queue_starvation_policies");
}
