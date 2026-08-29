import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("operator_handoffs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("shift_name", 120).notNullable();
    table.string("outgoing_operator", 120).notNullable();
    table.string("incoming_operator", 120).notNullable();
    table.string("status", 30).notNullable().defaultTo("draft");
    table.jsonb("checklist_items").notNullable().defaultTo("[]");
    table.text("summary_notes").nullable();
    table.jsonb("incidents_reviewed").notNullable().defaultTo("[]");
    table.text("signoff_outgoing_signature").nullable();
    table.text("signoff_incoming_signature").nullable();
    table.timestamp("submitted_at", { useTz: true }).nullable();
    table.timestamp("acknowledged_at", { useTz: true }).nullable();
    table.timestamps(true, true);

    table.index(["status"], "idx_operator_handoffs_status");
    table.index(["outgoing_operator"], "idx_operator_handoffs_outgoing");
    table.index(["incoming_operator"], "idx_operator_handoffs_incoming");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("operator_handoffs");
}
