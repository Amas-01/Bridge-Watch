import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("bft_oracle_providers", (table) => {
    table.string("provider_key", 120).primary();
    table.string("display_name", 120).notNullable();
    table.string("public_key", 120).notNullable();
    table.double("stake_weight").notNullable().defaultTo(1.0);
    table.string("status", 20).notNullable().defaultTo("active");
    table.boolean("slashed").notNullable().defaultTo(false);
    table.timestamp("slashed_at", { useTz: true }).nullable();
    table.string("slash_reason", 255).nullable();
    table.integer("total_submissions").notNullable().defaultTo(0);
    table.integer("total_slashes").notNullable().defaultTo(0);
    table.timestamps(true, true);
    table.index(["status"], "idx_bft_providers_status");
  });

  await knex.schema.createTable("bft_consensus_rounds", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("asset_code", 20).notNullable();
    table.double("consensus_price").notNullable();
    table.double("median_of_medians").notNullable();
    table.double("mean").notNullable();
    table.double("std_dev").notNullable();
    table.integer("total_providers").notNullable();
    table.integer("valid_providers").notNullable();
    table.boolean("quorum_reached").notNullable();
    table.text("aggregate_signature").nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["asset_code", "created_at"], "idx_bft_rounds_asset_time");
  });

  await knex.schema.createTable("bft_slashing_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("provider_key", 120).notNullable();
    table.uuid("round_id").nullable();
    table.string("asset_code", 20).notNullable();
    table.double("reported_value").notNullable();
    table.double("consensus_value").notNullable();
    table.double("deviation_sigma").notNullable();
    table.double("slashed_stake").notNullable();
    table.string("reason", 255).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["provider_key", "created_at"], "idx_bft_slashing_provider_time");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("bft_slashing_events");
  await knex.schema.dropTableIfExists("bft_consensus_rounds");
  await knex.schema.dropTableIfExists("bft_oracle_providers");
}
