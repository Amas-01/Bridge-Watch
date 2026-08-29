import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("zk_proof_verifications", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("bridge_id", 120).notNullable();
    table.string("asset_code", 20).notNullable();
    table.string("scheme", 20).notNullable().defaultTo("groth16");
    table.string("curve", 20).notNullable().defaultTo("bn254");
    table.string("total_reserves", 50).notNullable();
    table.string("on_chain_supply", 50).notNullable();
    table.integer("reserve_ratio_bps").notNullable();
    table.string("commitment_hash", 64).notNullable();
    table.text("proof_pi_a").notNullable();
    table.text("proof_pi_b").notNullable();
    table.text("proof_pi_c").notNullable();
    table.boolean("is_valid").notNullable();
    table.string("verification_status", 30).notNullable().defaultTo("verified");
    table.string("tx_hash", 128).nullable();
    table.string("attestation_id", 64).nullable();
    table.string("error_reason", 255).nullable();
    table.timestamps(true, true);

    table.index(["bridge_id", "created_at"], "idx_zk_proofs_bridge_time");
    table.index(["asset_code", "created_at"], "idx_zk_proofs_asset_time");
    table.index(["commitment_hash"], "idx_zk_proofs_commitment");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("zk_proof_verifications");
}
