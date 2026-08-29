import type { Knex } from "knex";

/**
 * Horizon Cursor Audit History (#1091)
 * Maintains comprehensive audit trail for Horizon cursor position changes.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("horizon_cursor_positions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // Cursor identification
    table.string("cursor_key", 120).notNullable().unique();
    table.string("cursor_type", 50).notNullable();
    table.string("source_name", 100).notNullable();

    // Current position
    table.string("current_position", 200).notNullable();
    table.dateTime("last_synced_at").notNullable();

    // Metadata
    table.integer("total_events_processed").notNullable().defaultTo(0);
    table.integer("total_errors").notNullable().defaultTo(0);
    table.string("status", 20).notNullable().defaultTo("active");

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["cursor_type", "source_name"], "idx_hcp_type_source");
    table.index(["status"], "idx_hcp_status");
    table.index(["last_synced_at"], "idx_hcp_last_synced");
  });

  await knex.schema.createTable("horizon_cursor_audit_logs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("cursor_id").notNullable().references("id").inTable("horizon_cursor_positions").onDelete("CASCADE");

    // Audit details
    table.string("action", 50).notNullable();
    table.string("previous_position", 200).nullable();
    table.string("new_position", 200).notNullable();
    table.integer("events_in_batch").notNullable().defaultTo(0);

    // Change metadata
    table.string("initiated_by", 100).notNullable().defaultTo("worker");
    table.string("reason_code", 50).nullable();
    table.text("reason_description").nullable();

    // Validation
    table.boolean("validation_passed").notNullable().defaultTo(true);
    table.text("validation_errors").nullable();

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["cursor_id", "created_at"], "idx_hcal_cursor_time");
    table.index(["action", "created_at"], "idx_hcal_action_time");
    table.index(["initiated_by", "created_at"], "idx_hcal_initiator_time");
  });

  await knex.schema.createTable("horizon_cursor_rollbacks", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("cursor_id").notNullable().references("id").inTable("horizon_cursor_positions").onDelete("CASCADE");

    // Rollback details
    table.string("from_position", 200).notNullable();
    table.string("to_position", 200).notNullable();
    table.integer("events_rolled_back").notNullable().defaultTo(0);

    // Reason
    table.string("rollback_reason", 100).notNullable();
    table.text("description").notNullable();

    // Impact
    table.string("severity", 20).notNullable();
    table.boolean("requires_reprocessing").notNullable().defaultTo(true);
    table.integer("affected_transaction_count").notNullable().defaultTo(0);

    // Status
    table.string("status", 20).notNullable().defaultTo("initiated");
    table.dateTime("completed_at").nullable();

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["cursor_id", "created_at"], "idx_hcr_cursor_time");
    table.index(["status", "created_at"], "idx_hcr_status_time");
    table.index(["severity"], "idx_hcr_severity");
  });

  await knex.schema.createTable("horizon_cursor_reconciliations", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("cursor_id").notNullable().references("id").inTable("horizon_cursor_positions").onDelete("CASCADE");

    // Reconciliation details
    table.string("cursor_type", 50).notNullable();
    table.dateTime("checked_at").notNullable();

    // State comparison
    table.string("horizon_position", 200).notNullable();
    table.string("local_position", 200).notNullable();
    table.boolean("positions_match").notNullable();
    table.integer("position_gap").notNullable().defaultTo(0);

    // Consistency check
    table.boolean("consistency_verified").notNullable().defaultTo(false);
    table.text("inconsistency_details").nullable();

    // Action taken
    table.string("action_taken", 50).notNullable().defaultTo("none");
    table.boolean("auto_corrected").notNullable().defaultTo(false);

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["cursor_id", "checked_at"], "idx_hcreconcile_cursor_time");
    table.index(["positions_match", "consistency_verified"], "idx_hcreconcile_status");
  });

  // Action domain constraint
  await knex.raw(`
    ALTER TABLE horizon_cursor_audit_logs
    ADD CONSTRAINT chk_hcal_action
    CHECK (action IN ('advance', 'reset', 'initialize', 'resume', 'pause'))
  `);

  // Rollback status constraint
  await knex.raw(`
    ALTER TABLE horizon_cursor_rollbacks
    ADD CONSTRAINT chk_hcr_status
    CHECK (status IN ('initiated', 'in_progress', 'completed', 'failed'))
  `);

  // Rollback reason constraint
  await knex.raw(`
    ALTER TABLE horizon_cursor_rollbacks
    ADD CONSTRAINT chk_hcr_reason
    CHECK (rollback_reason IN ('data_corruption', 'network_failure', 'duplicate_events', 'ordering_violation', 'manual_override'))
  `);

  // Rollback severity constraint
  await knex.raw(`
    ALTER TABLE horizon_cursor_rollbacks
    ADD CONSTRAINT chk_hcr_severity
    CHECK (severity IN ('low', 'medium', 'high', 'critical'))
  `);

  // Reconciliation action constraint
  await knex.raw(`
    ALTER TABLE horizon_cursor_reconciliations
    ADD CONSTRAINT chk_hcreconcile_action
    CHECK (action_taken IN ('none', 'corrected_local', 'corrected_horizon', 'escalated'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("horizon_cursor_reconciliations");
  await knex.schema.dropTableIfExists("horizon_cursor_rollbacks");
  await knex.schema.dropTableIfExists("horizon_cursor_audit_logs");
  await knex.schema.dropTableIfExists("horizon_cursor_positions");
}
