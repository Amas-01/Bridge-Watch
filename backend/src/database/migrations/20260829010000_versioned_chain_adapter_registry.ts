import type { Knex } from "knex";

/**
 * Versioned Chain Adapter & ABI Compatibility Registry (#1015).
 *
 * A signed, versioned registry of chain adapters. Each row in `chain_adapters`
 * is one immutable adapter *epoch* for a (chain_id, contract_identity) pair:
 * contract identity, ABI hash, deployment block range, event schemas, decimals,
 * proxy implementation history and an optional migration handler.
 *
 * Proxy upgrades and ABI changes create a *new* epoch rather than mutating an
 * existing one, so historical logs remain decodable from `registry_version`
 * plus the raw log alone. Unknown bytecode / unexpected ABI hashes are routed
 * to `chain_adapter_quarantine` instead of being decoded with a stale adapter.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("chain_adapter_signers", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("key_id", 128).notNullable().unique();
    t.string("algorithm", 32).notNullable().defaultTo("ed25519"); // ed25519 | secp256k1 | p256
    t.text("public_key_pem").notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.text("description").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("revoked_at", { useTz: true }).nullable();
  });

  await knex.schema.createTable("chain_adapters", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("chain_id", 64).notNullable(); // ethereum | polygon | base | soroban ...
    t.string("contract_identity", 128).notNullable(); // EVM address / Soroban contract id
    t.string("contract_alias", 128).nullable(); // e.g. wormhole-token-bridge
    t.integer("epoch").notNullable(); // 1-based, monotonic per (chain_id, contract_identity)
    t.string("registry_version", 200).notNullable().unique(); // chain:identity:epoch — the reproducibility key

    t.jsonb("abi_json").notNullable().defaultTo("[]");
    t.string("abi_hash", 64).notNullable(); // sha256 of the canonicalised ABI
    t.string("bytecode_hash", 66).nullable(); // sha256/keccak of deployed bytecode, if known
    t.integer("decimals").nullable();

    t.bigInteger("deployment_from_block").notNullable();
    t.bigInteger("deployment_to_block").nullable(); // null = open ended / current epoch

    t.string("proxy_implementation", 128).nullable();
    t.jsonb("proxy_history").notNullable().defaultTo("[]"); // [{ implementation, fromBlock, txHash }]
    t.jsonb("event_schemas").notNullable().defaultTo("{}"); // { EventName: { fields... } }
    t.string("migration_handler", 128).nullable(); // named handler that rewrites prior-epoch rows

    t.text("signature").nullable(); // hex signature over the adapter fingerprint
    t.string("signer_key_id", 128).nullable();

    t.string("status", 24).notNullable().defaultTo("staged"); // staged | active | superseded | rolled_back | quarantined
    t.string("created_by", 128).notNullable().defaultTo("system");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("activated_at", { useTz: true }).nullable();
    t.timestamp("rolled_back_at", { useTz: true }).nullable();

    t.unique(["chain_id", "contract_identity", "epoch"], { indexName: "uq_chain_adapter_epoch" });
    t.index(["chain_id", "contract_identity", "status"], "idx_chain_adapter_lookup");
    t.index(["status"], "idx_chain_adapter_status");
  });

  // At most one active epoch per (chain_id, contract_identity).
  await knex.raw(
    `CREATE UNIQUE INDEX uq_chain_adapter_single_active
       ON chain_adapters (chain_id, contract_identity)
       WHERE status = 'active'`
  );

  await knex.schema.createTable("chain_adapter_quarantine", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("chain_id", 64).notNullable();
    t.string("contract_identity", 128).notNullable();
    // unknown_bytecode | abi_change | no_active_adapter | out_of_range | decode_failure | unsigned_adapter
    t.string("reason", 32).notNullable();
    t.string("expected_abi_hash", 64).nullable();
    t.string("observed_abi_hash", 64).nullable();
    t.string("expected_bytecode_hash", 66).nullable();
    t.string("observed_bytecode_hash", 66).nullable();
    t.bigInteger("block_number").nullable();
    t.jsonb("raw_log").notNullable().defaultTo("{}");
    t.text("detail").nullable();
    t.boolean("resolved").notNullable().defaultTo(false);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("resolved_at", { useTz: true }).nullable();

    t.index(["chain_id", "resolved", "created_at"], "idx_chain_adapter_quarantine_open");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("chain_adapter_quarantine");
  await knex.raw("DROP INDEX IF EXISTS uq_chain_adapter_single_active");
  await knex.schema.dropTableIfExists("chain_adapters");
  await knex.schema.dropTableIfExists("chain_adapter_signers");
}
