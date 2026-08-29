import type { Knex } from "knex";

const TENANT_TABLES = [
  "alert_rules",
  "alert_events",
  "export_history",
  "webhook_endpoints",
  "user_preferences",
  "api_keys",
  "saved_dashboards",
  "query_presets",
  "alert_suppression_rules",
  "event_subscription_filters",
  "asset_tags",
  "notification_channels",
  "notification_digests",
  "saved_metrics",
  "audit_logs",
];

export async function up(knex: Knex): Promise<void> {
  for (const table of TENANT_TABLES) {
    const exists = await knex.schema.hasTable(table);
    if (!exists) continue;

    const hasCol = await knex.schema.hasColumn(table, "tenant_id");
    if (!hasCol) {
      await knex.schema.alterTable(table, (t) => {
        t.string("tenant_id", 64).notNullable().defaultTo("default");
        t.index(["tenant_id"], `idx_${table}_tenant_id`);
      });
    }
  }

  await knex.raw(`
    CREATE OR REPLACE FUNCTION enforce_tenant_context()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := 'default';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  for (const table of TENANT_TABLES) {
    const exists = await knex.schema.hasTable(table);
    if (!exists) continue;

    const hasTrigger = await knex.raw(`
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_${table}_tenant'
    `);
    const rows = hasTrigger?.rows ?? hasTrigger ?? [];
    if (Array.isArray(rows) && rows.length > 0) continue;

    await knex.raw(`
      CREATE TRIGGER trg_${table}_tenant
      BEFORE INSERT OR UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context()
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TENANT_TABLES) {
    const exists = await knex.schema.hasTable(table);
    if (!exists) continue;

    await knex.raw(`DROP TRIGGER IF EXISTS trg_${table}_tenant ON ${table}`);

    const hasCol = await knex.schema.hasColumn(table, "tenant_id");
    if (hasCol) {
      await knex.schema.alterTable(table, (t) => {
        t.dropIndex([], `idx_${table}_tenant_id`);
        t.dropColumn("tenant_id");
      });
    }
  }

  await knex.raw(
    "DROP FUNCTION IF EXISTS enforce_tenant_context()"
  );
}
