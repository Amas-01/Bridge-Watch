import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("evm_lock_contracts", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("bridge_name").notNullable(); // matches bridges.name
    table.string("chain_id").notNullable(); // ethereum | polygon | base
    table.string("contract_address").notNullable(); // lock/custody contract holding reserves
    table.string("token_address").notNullable(); // ERC-20 token held by the lock contract
    table.string("asset_symbol").notNullable(); // Stellar-side wrapped asset code
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.unique(["chain_id", "contract_address", "token_address"]);
    table.index(["bridge_name", "is_active"]);
    table.index(["asset_symbol"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("evm_lock_contracts");
}
