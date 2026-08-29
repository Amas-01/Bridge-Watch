import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Datasets represent a logical collection of columns (e.g. "asset_prices").
  await knex.schema.createTable("datasets", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 120).notNullable();
    table.string("display_name", 200).notNullable();
    table.text("description");
    table.string("category", 80).notNullable().defaultTo("observability");
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(["name"]);
    table.index(["category"]);
  });

  // Columns that belong to a dataset.
  await knex.schema.createTable("dataset_columns", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("dataset_id").notNullable()
      .references("id")
      .inTable("datasets")
      .onDelete("CASCADE");
    table.string("name", 120).notNullable();
    table.string("data_type", 60);
    table.text("description");
    table.boolean("is_primary_key").notNullable().defaultTo(false);
    table.integer("position").notNullable().defaultTo(0);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(["dataset_id", "name"]);
    table.index(["dataset_id"]);
  });

  // Column-level lineage edges: source dataset+column -> target column.
  await knex.schema.createTable("dataset_column_lineage", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("dataset_id").notNullable()
      .references("id")
      .inTable("datasets")
      .onDelete("CASCADE");
    table.uuid("column_id").notNullable()
      .references("id")
      .inTable("dataset_columns")
      .onDelete("CASCADE");
    table.uuid("source_dataset_id").notNullable()
      .references("id")
      .inTable("datasets")
      .onDelete("CASCADE");
    table.uuid("source_column_id").notNullable()
      .references("id")
      .inTable("dataset_columns")
      .onDelete("CASCADE");
    table.string("transform_kind", 80).notNullable().defaultTo("copy");
    table.integer("transform_order").notNullable().defaultTo(0);
    table.jsonb("transform_metadata").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.string("created_by", 120);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["dataset_id"]);
    table.index(["column_id"]);
    table.index(["source_dataset_id"]);
    table.index(["source_column_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("dataset_column_lineage");
  await knex.schema.dropTableIfExists("dataset_columns");
  await knex.schema.dropTableIfExists("datasets");
}
