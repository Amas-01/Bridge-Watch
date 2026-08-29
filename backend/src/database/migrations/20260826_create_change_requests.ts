import type { Knex } from "knex";

/**
 * Migration: Operational Change Approval Workflow
 * Issue: #1060
 *
 * Creates the change_requests table to gate configuration changes behind a
 * two-person (four-eyes) review process with a strict state machine:
 *   draft → pending_approval → approved → applied
 *                           └→ rejected
 *   draft|pending_approval → cancelled
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("change_requests", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // One-line summary for the changes list view
    table.string("title", 512).notNullable();

    // Full description of what is changing and why
    table.text("description").notNullable();

    // Functional domain of the change
    // config_update | rule_change | sampling_update | other
    table.string("change_type", 50).notNullable().defaultTo("config_update");

    // Serialised representation of the proposed change (JSON payload)
    // The applyChange() method deserialises this and delegates to the
    // appropriate service for execution.
    table.jsonb("payload").notNullable().defaultTo("{}");

    // State machine status — transitions enforced in ChangeApprovalService
    // draft | pending_approval | approved | rejected | applied | cancelled
    table.string("status", 30).notNullable().defaultTo("draft");

    // Creator identity (string, matching request.apiKeyAuth?.name pattern)
    table.string("submitted_by", 255).notNullable();

    // Set when creator calls submitForApproval()
    table.timestamp("submitted_at", { useTz: true }).nullable();

    // Reviewer identity — must differ from submitted_by (four-eyes)
    table.string("reviewed_by", 255).nullable();
    table.timestamp("reviewed_at", { useTz: true }).nullable();

    // Required for rejection; optional for approval
    table.text("review_comment").nullable();

    // Set when the change is applied to the system
    table.timestamp("applied_at", { useTz: true }).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Admin list view: filter by status, sorted by submission time
    table.index(
      ["status", "submitted_at"],
      "change_requests_status_submitted_idx"
    );

    // Creator's own request list
    table.index(["submitted_by"], "change_requests_submitted_by_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("change_requests");
}
