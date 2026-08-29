import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("replay_snapshots", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("asset_code").notNullable();
    table.string("snapshot_type").notNullable();
    table.jsonb("snapshot_data").notNullable();
    table.timestamp("snapshot_time").notNullable();
    table.timestamps(true, true);
    table.index(["asset_code", "snapshot_time"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("replay_snapshots");
}
