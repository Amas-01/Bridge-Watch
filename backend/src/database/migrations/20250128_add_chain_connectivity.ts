import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("chain_endpoints", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("chain_id").notNullable();
    table.string("endpoint_url").notNullable();
    table
      .string("endpoint_type")
      .notNullable()
      .comment("Type: rpc, api, websocket");
    table.string("provider_name");
    table.boolean("is_active").defaultTo(true);
    table.integer("priority").defaultTo(0);
    table.jsonb("config").defaultTo("{}");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index(["chain_id", "is_active"]);
    table.index(["endpoint_type"]);
  });

  await knex.schema.createTable("connectivity_checks", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("endpoint_id")
      .notNullable()
      .references("id")
      .inTable("chain_endpoints")
      .onDelete("CASCADE");
    table.timestamp("check_timestamp").notNullable();
    table.boolean("is_reachable").notNullable();
    table.integer("response_time_ms");
    table.integer("block_height");
    table.string("error_message");
    table.jsonb("metadata").defaultTo("{}");
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index(["endpoint_id", "check_timestamp"]);
    table.index(["check_timestamp"]);
  });

  await knex.schema.createTable(
    "connectivity_comparison_snapshots",
    (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.string("chain_id").notNullable();
      table.timestamp("snapshot_timestamp").notNullable();
      table
        .jsonb("endpoints_status")
        .notNullable()
        .comment("Status map of all endpoints");
      table.float("overall_health_score").notNullable();
      table.integer("total_endpoints").notNullable();
      table.integer("reachable_endpoints").notNullable();
      table.integer("unreachable_endpoints").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());

      table.index(["chain_id", "snapshot_timestamp"]);
      table.index(["snapshot_timestamp"]);
    },
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("connectivity_comparison_snapshots");
  await knex.schema.dropTableIfExists("connectivity_checks");
  await knex.schema.dropTableIfExists("chain_endpoints");
}
