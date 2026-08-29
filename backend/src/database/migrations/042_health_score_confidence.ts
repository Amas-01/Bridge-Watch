import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("source_health_scores", (table) => {
    table.integer("confidence_score");
    table.string("confidence_band");
  });

  await knex.schema.alterTable("source_health_score_history", (table) => {
    table.integer("confidence_score");
    table.string("confidence_band");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("source_health_score_history", (table) => {
    table.dropColumn("confidence_band");
    table.dropColumn("confidence_score");
  });

  await knex.schema.alterTable("source_health_scores", (table) => {
    table.dropColumn("confidence_band");
    table.dropColumn("confidence_score");
  });
}
