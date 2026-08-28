import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create export quotas table
  await knex.schema.createTable("export_quotas", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("user_id").notNullable();
    table.string("quota_type").notNullable();
    table.integer("max_exports").notNullable();
    table.date("period_start").notNullable();
    table.integer("current_count").notNullable().defaultTo(0);
    table.timestamps(true, true);

    table.unique(["user_id", "quota_type", "period_start"]);
    table.index(["user_id", "quota_type", "period_start"]);

    // Add check constraint for quota_type
    table.check("?? IN ('daily', 'monthly')", ["quota_type"]);
  });

  // Create export audit log table
  await knex.schema.createTable("export_audit_log", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("user_id").notNullable();
    table.string("export_type").notNullable();
    table.integer("record_count").notNullable();
    table.timestamp("exported_at").notNullable().defaultTo(knex.fn.now());
    table.jsonb("quota_snapshot").notNullable();
    table.timestamps(true, true);

    table.index(["user_id", "exported_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("export_audit_log");
  await knex.schema.dropTableIfExists("export_quotas");
}
