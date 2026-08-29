import type { Knex } from "knex";

/**
 * Creates the alert_effect_records table — the idempotency ledger for
 * exactly-once alert delivery.
 *
 * Each row represents one (outbox event, delivery channel) pair and tracks
 * the full lifecycle: pending claim → active lease → delivered | ambiguous
 * | duplicate-suppressed.
 *
 * The unique constraint on effect_key guarantees that INSERT ... ON CONFLICT
 * DO NOTHING provides atomic claim semantics even under concurrent workers.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("alert_effect_records", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    /**
     * Deterministic idempotency key: `${outbox_event_id}:${channel}`.
     * Unique across the table — this is the guard that prevents duplicate effects.
     */
    t.string("effect_key", 200).notNullable().unique();

    /** The outbox_events.id this effect was produced from. */
    t.bigInteger("outbox_event_id").notNullable();

    /**
     * Delivery channel:
     *   in_app | webhook | email | slack | websocket | telegram | discord
     */
    t.string("channel", 50).notNullable();

    /**
     * Effect lifecycle:
     *   pending             — claimed by a worker, lease active
     *   delivered           — effect committed to the external channel
     *   ambiguous           — transport outcome unknown (e.g. webhook timeout)
     *   duplicate_suppressed — a second worker tried to claim an already-owned key
     */
    t.string("status", 30).notNullable().defaultTo("pending");

    /** Worker UUID that currently holds the claim lease. */
    t.string("claimed_by", 100).nullable();

    /** When the lease was first acquired. */
    t.timestamp("claimed_at", { useTz: true }).nullable();

    /**
     * Absolute UTC time after which this claim may be reclaimed by another
     * worker (crash-recovery mechanism).
     */
    t.timestamp("lease_expires_at", { useTz: true }).nullable();

    /** Set when status transitions to delivered. */
    t.timestamp("delivered_at", { useTz: true }).nullable();

    /** Number of delivery attempts made so far. */
    t.integer("attempt_count").notNullable().defaultTo(0);

    /** Error or ambiguity reason — set on non-delivered terminal transitions. */
    t.text("error_message").nullable();

    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Lookups by outbox event (all channels for one event)
    t.index(["outbox_event_id"], "idx_aer_outbox_event_id");
    // Lease-recovery sweep: find expired pending claims
    t.index(["status", "lease_expires_at"], "idx_aer_status_lease");
    // Operator dashboard: filter by channel × status
    t.index(["channel", "status"], "idx_aer_channel_status");
  });

  // Status domain constraint
  await knex.raw(`
    ALTER TABLE alert_effect_records
    ADD CONSTRAINT chk_aer_status
    CHECK (status IN ('pending', 'delivered', 'ambiguous', 'duplicate_suppressed'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("alert_effect_records");
}
