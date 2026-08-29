import type { Knex } from "knex";

/**
 * Migration for Graceful Shutdown Drain Protocol (#1187).
 * Creates shutdown_drain_sessions and shutdown_drain_logs tables.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("shutdown_drain_sessions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("node_id", 128).notNullable();
    t.string("state", 32).notNullable().defaultTo("ACTIVE"); // ACTIVE, DRAINING, DRAINED, CANCELLED, FAILED
    t.string("drain_mode", 32).notNullable().defaultTo("graceful"); // graceful, force, read_only
    t.string("reason", 500).nullable();
    t.string("initiated_by", 128).notNullable().defaultTo("system");
    t.integer("timeout_seconds").notNullable().defaultTo(30);
    t.integer("pending_jobs_count").notNullable().defaultTo(0);
    t.integer("active_connections_count").notNullable().defaultTo(0);
    t.integer("active_streams_count").notNullable().defaultTo(0);
    t.timestamp("started_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("drained_at", { useTz: true }).nullable();
    t.timestamp("cancelled_at", { useTz: true }).nullable();
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["node_id", "state"], "idx_shutdown_drain_node_state");
    t.index(["created_at"], "idx_shutdown_drain_created");
  });

  await knex.schema.createTable("shutdown_drain_logs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("session_id").notNullable().references("id").inTable("shutdown_drain_sessions").onDelete("CASCADE");
    t.string("event_type", 64).notNullable(); // DRAIN_INITIATED, JOBS_PAUSED, WS_DRAINED, STREAMS_STOPPED, DRAIN_COMPLETED, DRAIN_CANCELLED, DRAIN_FAILED, FORCE_SHUTDOWN
    t.string("message", 500).notNullable();
    t.jsonb("details").notNullable().defaultTo("{}");
    t.timestamp("timestamp", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["session_id", "timestamp"], "idx_shutdown_drain_logs_session");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("shutdown_drain_logs");
  await knex.schema.dropTableIfExists("shutdown_drain_sessions");
}
