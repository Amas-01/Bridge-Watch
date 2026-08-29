import type { Knex } from "knex";

/**
 * Durable worker leases with renewal.
 *
 * The existing `utils/lock.ts` primitive acquires a Redis key with a fixed TTL
 * and offers no way to extend it. A worker whose job outlives that TTL loses
 * the lock silently — Redis expires the key, a second worker acquires it, and
 * both run the same job while the first has no way to notice.
 *
 * Two things fix that, and both need durable state rather than a bare Redis key:
 *
 *   - **Renewal.** The holder extends its own lease on a heartbeat, so the TTL
 *     tracks liveness rather than a guess at job duration.
 *   - **Fencing tokens.** A monotonically increasing token issued per
 *     acquisition. A worker that stalls past its expiry and wakes up still
 *     believing it holds the lease carries a stale token, and downstream writes
 *     can reject it. Renewal alone cannot prevent that race; the token is what
 *     makes the loss detectable at the point of the write.
 *
 * PostgreSQL is the authority here rather than Redis: the fencing token has to
 * survive a Redis eviction to be worth anything.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("worker_leases", (t) => {
    // The resource being leased (e.g. "job:reconciliation", "shard:evm-1").
    t.string("lease_key", 256).primary();

    // Null owner means the lease exists but is currently held by nobody; the
    // row is kept so the fencing token never restarts and a stale holder can
    // always be recognised.
    t.string("owner_id", 128).nullable();

    // Monotonic per lease_key. Never reused, never decremented.
    t.bigInteger("fencing_token").notNullable().defaultTo(0);

    t.timestamp("acquired_at", { useTz: true }).nullable();
    t.timestamp("renewed_at", { useTz: true }).nullable();
    t.timestamp("expires_at", { useTz: true }).nullable();
    t.timestamp("released_at", { useTz: true }).nullable();

    // How long each acquisition/renewal extends the lease.
    t.integer("ttl_ms").notNullable().defaultTo(30000);

    // Observability: how many times this holder has renewed, and how many
    // times a lease was lost rather than cleanly released. A rising loss count
    // is the signal that ttl_ms is too short for the work being done.
    t.integer("renewal_count").notNullable().defaultTo(0);
    t.integer("lost_count").notNullable().defaultTo(0);

    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Expiry sweeps scan this.
    t.index(["expires_at"], "idx_worker_lease_expiry");
    t.index(["owner_id"], "idx_worker_lease_owner");
  });

  // Append-only history, so a duplicated job can be explained after the fact.
  await knex.schema.createTable("worker_lease_events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("lease_key", 256).notNullable();
    t.string("owner_id", 128).nullable();
    t.bigInteger("fencing_token").notNullable();
    // acquired | renewed | released | expired | stolen
    t.string("event_type", 32).notNullable();
    t.string("reason", 500).nullable();
    t.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["lease_key", "occurred_at"], "idx_worker_lease_event_key");
    t.index(["event_type", "occurred_at"], "idx_worker_lease_event_type");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("worker_lease_events");
  await knex.schema.dropTableIfExists("worker_leases");
}
