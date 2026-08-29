import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("report_template_versions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("template_id", 120).notNullable();
    table.integer("version").notNullable();
    table.string("name", 120).notNullable();
    table.string("type", 50).notNullable();
    table.text("description").notNullable();
    table.jsonb("sections").notNullable().defaultTo("[]");
    table.jsonb("includes").notNullable().defaultTo("{}");
    table.jsonb("filters").notNullable().defaultTo("[]");
    table.text("change_summary").nullable();
    table.string("created_by", 120).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(["template_id", "version"], { indexName: "uq_template_version" });
    table.index(["template_id"], "idx_template_versions_template_id");
  });

  const hasTemplates = await knex.schema.hasTable("report_templates");
  if (hasTemplates) {
    await knex.schema.alterTable("report_templates", (table) => {
      table.integer("version").notNullable().defaultTo(1);
      table.string("parent_template_id", 120).nullable();
      table.boolean("is_latest").notNullable().defaultTo(true);
      table.text("change_summary").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTemplates = await knex.schema.hasTable("report_templates");
  if (hasTemplates) {
    await knex.schema.alterTable("report_templates", (table) => {
      table.dropColumn("version");
      table.dropColumn("parent_template_id");
      table.dropColumn("is_latest");
      table.dropColumn("change_summary");
    });
  }
  await knex.schema.dropTableIfExists("report_template_versions");
}
