import type { Knex } from "knex";

/**
 * Finality-aware observation ledger.
 *
 * The ledger is append-mostly: an observation's `state` changes as it settles
 * or is reorganised away, but the row itself is never deleted. A reverted
 * observation is compensated by an offsetting entry in `finality_compensations`
 * rather than erased, so a metric can be corrected while the history of *why*
 * it changed stays inspectable — which is what makes a reorg explainable after
 * the fact instead of just visible as a number that moved.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("chain_finality_policies", (t) => {
    t.string("chain", 64).notNullable();
    // Null means the chain-wide default; a value overrides it for one bridge.
    t.string("bridge_id", 128).nullable();
    t.integer("confirmations").notNullable();
    t.boolean("reorg_possible").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.check("confirmations >= 1", [], "chk_finality_confirmations");
  });

  // A partial unique index rather than a composite primary key: PostgreSQL
  // treats NULLs as distinct, so a plain unique constraint would allow several
  // chain-wide defaults for the same chain.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_finality_policy_chain_default
      ON chain_finality_policies (chain)
      WHERE bridge_id IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uq_finality_policy_chain_bridge
      ON chain_finality_policies (chain, bridge_id)
      WHERE bridge_id IS NOT NULL
  `);

  await knex.schema.createTable("finality_observations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("chain", 64).notNullable();
    t.string("bridge_id", 128).nullable();
    t.bigInteger("block_number").notNullable();
    t.string("block_hash", 128).notNullable();
    t.integer("confirmations").notNullable().defaultTo(0);
    // provisional | finalized | reverted
    t.string("state", 16).notNullable().defaultTo("provisional");
    // Numeric as text: chain amounts exceed IEEE-754 exact range.
    t.string("value", 96).notNullable().defaultTo("0");
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.timestamp("observed_at", { useTz: true }).notNullable();
    t.timestamp("finalized_at", { useTz: true }).nullable();
    t.timestamp("reverted_at", { useTz: true }).nullable();
    t.string("revert_reason", 500).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // The same log entry must not be ingested twice across restarts, which is
    // what makes recovery idempotent.
    t.unique(["chain", "block_hash", "block_number"], { indexName: "uq_finality_observation_block" });

    // The promotion job scans for provisional rows on one chain.
    t.index(["chain", "state", "block_number"], "idx_finality_promotion_scan");
    // Metrics aggregate per bridge and need the evidence level with the row.
    t.index(["bridge_id", "state", "observed_at"], "idx_finality_bridge_evidence");
  });

  await knex.schema.createTable("finality_compensations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("observation_id").notNullable();
    t.string("chain", 64).notNullable();
    t.string("bridge_id", 128).nullable();
    t.string("compensating_value", 96).notNullable();
    t.string("reason", 500).notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // One compensation per observation: replaying a reorg after a restart must
    // not double-unwind the same contribution. This constraint is what makes
    // recovery idempotent rather than relying on the caller checking first.
    t.unique(["observation_id"], { indexName: "uq_finality_compensation_observation" });
    t.index(["bridge_id", "created_at"], "idx_finality_compensation_bridge");

    t.foreign("observation_id").references("finality_observations.id").onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("finality_compensations");
  await knex.schema.dropTableIfExists("finality_observations");
  await knex.raw("DROP INDEX IF EXISTS uq_finality_policy_chain_bridge");
  await knex.raw("DROP INDEX IF EXISTS uq_finality_policy_chain_default");
  await knex.schema.dropTableIfExists("chain_finality_policies");
}
