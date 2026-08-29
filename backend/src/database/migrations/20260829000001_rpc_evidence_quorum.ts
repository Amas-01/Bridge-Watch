import type { Knex } from "knex";

/**
 * Migration for Independent RPC Evidence Quorum (#1014).
 * Creates rpc_evidence_quorum_configs, rpc_provider_groups, and rpc_evidence_logs tables.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("rpc_evidence_quorum_configs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("chain_id", 64).notNullable(); // e.g. ethereum-mainnet, soroban-mainnet, horizon
    t.string("operation_type", 64).notNullable(); // e.g. contract_read, reserve_proof, block_header, asset_supply
    t.integer("min_quorum_size").notNullable().defaultTo(2);
    t.float("quorum_threshold_ratio").notNullable().defaultTo(0.67); // e.g. 67% consensus required
    t.integer("max_lag_blocks").notNullable().defaultTo(5);
    t.boolean("fail_closed").notNullable().defaultTo(false); // explicit fail-closed vs fail-open
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(["chain_id", "operation_type"], { indexName: "uq_rpc_quorum_chain_op" });
  });

  await knex.schema.createTable("rpc_provider_groups", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("endpoint_url", 256).notNullable().unique();
    t.string("provider_group", 128).notNullable(); // e.g. infura, alchemy, quicknode, self-hosted-datacenter-1
    t.string("asn_or_org", 128).nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["provider_group"], "idx_rpc_provider_group");
  });

  await knex.schema.createTable("rpc_evidence_logs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("chain_id", 64).notNullable();
    t.string("operation_type", 64).notNullable();
    t.string("read_identifier", 256).notNullable(); // contract address / key / method
    t.integer("total_providers").notNullable();
    t.integer("independent_groups_count").notNullable();
    t.float("confidence_score").notNullable().defaultTo(1.0); // 0.0 to 1.0
    t.boolean("is_degraded").notNullable().defaultTo(false);
    t.boolean("has_disagreement").notNullable().defaultTo(false);
    t.boolean("has_excessive_lag").notNullable().defaultTo(false);
    t.string("decision", 32).notNullable(); // ACCEPTED, DEGRADED, REJECTED
    t.jsonb("header_anchors").notNullable().defaultTo("{}"); // block_number, block_hash, state_root, timestamp
    t.jsonb("provider_responses").notNullable().defaultTo("[]");
    t.jsonb("disagreement_details").notNullable().defaultTo("{}");
    t.timestamp("evaluated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["chain_id", "evaluated_at"], "idx_rpc_evidence_chain_time");
    t.index(["has_disagreement", "evaluated_at"], "idx_rpc_evidence_disagreement");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("rpc_evidence_logs");
  await knex.schema.dropTableIfExists("rpc_provider_groups");
  await knex.schema.dropTableIfExists("rpc_evidence_quorum_configs");
}
