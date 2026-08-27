import type { Knex } from "knex";

/**
 * Migration: Request Sampling Rules
 * Issue: #1058
 *
 * Creates the sampling_rules table for configurable request sampling controls.
 * Rules are evaluated in priority order; the first matching rule's sample_rate
 * determines whether a request should be included in traffic analysis.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sampling_rules", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // Human-readable rule name — must be unique to prevent ambiguous rule sets
    table.string("name", 255).notNullable().unique();

    // Optional description for operator notes
    table.text("description").nullable();

    // Fraction of matching requests to include: 0.0 = none, 1.0 = all
    table.decimal("sample_rate", 5, 4).notNullable().defaultTo(1.0);

    // Scope of this rule: all_requests, endpoint_pattern, or client_id
    table.string("target", 50).notNullable().defaultTo("all_requests");

    // Endpoint glob or client identifier when target != all_requests
    table.string("target_value", 512).nullable();

    // Whether this rule is currently active
    table.boolean("enabled").notNullable().defaultTo(true);

    // Lower number = evaluated first when multiple rules match
    table.integer("priority").notNullable().defaultTo(0);

    // Identity of the admin who created the rule
    table.string("created_by", 255).notNullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Efficient rule evaluation scan: active rules ordered by priority
    table.index(["enabled", "priority"], "sampling_rules_enabled_priority_idx");

    // Pattern matching lookups
    table.index(["target_value"], "sampling_rules_target_value_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("sampling_rules");
}
