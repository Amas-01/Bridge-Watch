import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("reserve_attestations", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("bridge_id", 120).notNullable();
    table.string("asset_code", 20).notNullable();
    table.string("attestor").notNullable();
    table.string("attestation_ref", 128).nullable();
    table.timestamp("issued_at").notNullable();
    table.timestamp("expires_at").notNullable();
    table.string("status", 20).notNullable().defaultTo("active");
    table.string("revoked_reason").nullable();
    table.timestamp("revoked_at").nullable();
    table.timestamps(true, true);

    table.index(["bridge_id", "asset_code"]);
    table.index(["expires_at"]);
    table.index(["status"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("reserve_attestations");
}
