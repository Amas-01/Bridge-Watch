import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("operator_availability", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("operator", 120).notNullable();
    table
      .string("status", 20)
      .notNullable()
      .comment("Status: available, unavailable, on_call");
    table.timestamp("start_time", { useTz: true }).notNullable();
    table.timestamp("end_time", { useTz: true }).notNullable();
    table.text("notes").nullable();
    table.string("created_by", 120).notNullable();
    table.timestamps(true, true);

    table.index(["operator"], "idx_operator_availability_operator");
    table.index(["start_time", "end_time"], "idx_operator_availability_window");
    table.index(["status"], "idx_operator_availability_status");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("operator_availability");
}
