import type { Knex } from "knex";

/**
 * Migration: Structured Error Catalog
 * Issue: #1059
 *
 * Creates the error_catalog table for consistent error classification and
 * management. Catalog entries can be looked up by error_code to enrich
 * error responses with titles, templates, HTTP status hints, and retry guidance.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("error_catalog", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // Stable machine-readable code, e.g. BRIDGE_TIMEOUT, RATE_LIMIT_EXCEEDED
    table.string("error_code", 128).notNullable().unique();

    // Short human-readable title shown in UIs and alerting
    table.string("title", 255).notNullable();

    // Parameterised message template: use {param_name} placeholders
    // e.g. "Operation failed after {retries} retries on {bridge}"
    table.text("message_template").notNullable();

    // Suggested HTTP status code for this error type
    table.integer("http_status").notNullable();

    // Severity level: info | warning | error | critical
    table.string("severity", 20).notNullable().defaultTo("error");

    // Functional domain: network | auth | validation | bridge | rate_limit | internal
    table.string("category", 50).notNullable().defaultTo("internal");

    // Human-readable retry guidance — null means "do not retry"
    table.text("retry_guidance").nullable();

    // Link to extended runbook or documentation
    table.string("documentation_url", 1024).nullable();

    // Soft-delete: deactivate without losing history
    table.boolean("is_active").notNullable().defaultTo(true);

    table.string("created_by", 255).notNullable();
    table.string("updated_by", 255).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Lookup by category/severity for filtered admin views
    table.index(["category"], "error_catalog_category_idx");
    table.index(["severity"], "error_catalog_severity_idx");
    table.index(["is_active"], "error_catalog_is_active_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("error_catalog");
}
