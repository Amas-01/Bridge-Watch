import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("export_history");
  if (hasTable) {
    await knex.schema.alterTable("export_history", (table) => {
      table.string("checksum_sha256", 64).nullable();
      table.text("signature").nullable();
      table.text("public_key").nullable();
      table.string("verification_status", 30).notNullable().defaultTo("unverified");
      table.timestamp("verified_at", { useTz: true }).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("export_history");
  if (hasTable) {
    await knex.schema.alterTable("export_history", (table) => {
      table.dropColumn("checksum_sha256");
      table.dropColumn("signature");
      table.dropColumn("public_key");
      table.dropColumn("verification_status");
      table.dropColumn("verified_at");
    });
  }
}
