import type { Knex } from "knex";

/**
 * External source response archive (#1162).
 *
 * Bridge Watch derives price, supply, and attestation data from third-party
 * sources. When a data point is later disputed — a price spike, a reserve
 * mismatch, a reconciliation break — there is currently no way to see what the
 * upstream source actually returned at collection time. The remote body is
 * gone, and all that survives is the parsed value we stored.
 *
 * This table archives the raw response: which source and endpoint, the request
 * shape, the transport outcome (status, latency, error), and the body itself
 * (hashed, size-capped, and with obvious secrets redacted). Each row carries an
 * `expires_at` so a retention job can prune it without re-deriving the policy.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("external_source_responses", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // Logical source key, e.g. "coingecko", "circle", "horizon".
    t.string("source_key", 120).notNullable();
    // The specific operation within that source, e.g. "simple/price".
    t.string("endpoint", 500).notNullable();
    // GET | POST | ... — the request method, for replay context.
    t.string("method", 10).notNullable().defaultTo("GET");
    // Sanitised request parameters (query/body), secrets removed.
    t.jsonb("request_params").notNullable().defaultTo(knex.raw("'{}'::jsonb"));

    // Transport outcome. `outcome` is a coarse classification the UI filters on.
    // ok | client_error | server_error | timeout | transport_error
    t.string("outcome", 20).notNullable();
    t.integer("status_code").nullable();
    t.integer("latency_ms").nullable();
    t.string("error_message", 1000).nullable();

    // The archived body. `body_truncated` marks a body clipped to the size cap;
    // `body_hash` is a sha256 of the full pre-truncation body, so two captures
    // can be compared even when both are truncated.
    t.text("response_body").nullable();
    t.string("content_type", 200).nullable();
    t.boolean("body_truncated").notNullable().defaultTo(false);
    t.string("body_hash", 64).nullable();
    t.integer("body_bytes").nullable();

    // Correlation to the collection run / job that made the request, when known.
    t.string("collection_run_id", 128).nullable();
    // Asset or entity the request was about, for lookup from a disputed value.
    t.string("subject", 200).nullable();

    t.timestamp("collected_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // Retention horizon. A NULL value means "keep indefinitely" (legal hold).
    t.timestamp("expires_at", { useTz: true }).nullable();

    // Primary lookup: what did <source> return for <subject> around <time>.
    t.index(["source_key", "subject", "collected_at"], "idx_ext_src_resp_lookup");
    // Retention sweep.
    t.index(["expires_at"], "idx_ext_src_resp_expiry");
    // Trace from a collection run.
    t.index(["collection_run_id"], "idx_ext_src_resp_run");
    // Failure triage: recent non-ok responses for a source.
    t.index(["source_key", "outcome", "collected_at"], "idx_ext_src_resp_outcome");

    t.check(
      "outcome IN ('ok','client_error','server_error','timeout','transport_error')",
      [],
      "chk_ext_src_resp_outcome"
    );
    t.check("latency_ms IS NULL OR latency_ms >= 0", [], "chk_ext_src_resp_latency");
    t.check("body_bytes IS NULL OR body_bytes >= 0", [], "chk_ext_src_resp_bytes");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("external_source_responses");
}
