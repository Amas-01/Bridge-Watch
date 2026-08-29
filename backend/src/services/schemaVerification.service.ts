import { getDatabase } from "../database/connection.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { AlertService } from "./alert.service.js";

interface TableColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface TableIndexInfo {
  table_name: string;
  index_name: string;
  index_def: string;
}

interface SchemaDrift {
  table: string;
  type: "missing_table" | "missing_column" | "type_mismatch" | "nullable_mismatch" | "missing_index";
  expected: string;
  actual: string | null;
}

const CRITICAL_TABLES = [
  "prices",
  "health_scores",
  "liquidity_snapshots",
  "alert_events",
  "verification_results",
  "reconciliation_runs",
  "tracked_balances",
  "reserve_commitments",
  "bridge_operators",
];

const HYPERTABLE_EXPECTATIONS: Record<string, { time_column: string }> = {
  prices: { time_column: "time" },
  health_scores: { time_column: "time" },
  liquidity_snapshots: { time_column: "time" },
  alert_events: { time_column: "time" },
  verification_results: { time_column: "verified_at" },
  reconciliation_runs: { time_column: "started_at" },
};

const EXPECTED_COLUMNS: Record<string, Array<{ name: string; type: string; nullable: boolean }>> = {
  tracked_balances: [
    { name: "id", type: "uuid", nullable: false },
    { name: "asset_code", type: "character varying", nullable: false },
    { name: "address", type: "character varying", nullable: false },
    { name: "chain", type: "character varying", nullable: false },
    { name: "address_type", type: "character varying", nullable: false },
    { name: "current_balance", type: "numeric", nullable: false },
    { name: "previous_balance", type: "numeric", nullable: false },
  ],
  reserve_commitments: [
    { name: "id", type: "uuid", nullable: false },
    { name: "bridge_id", type: "character varying", nullable: false },
    { name: "sequence", type: "bigint", nullable: false },
    { name: "merkle_root", type: "character varying", nullable: false },
    { name: "total_reserves", type: "bigint", nullable: false },
    { name: "status", type: "character varying", nullable: false },
  ],
  bridge_operators: [
    { name: "id", type: "uuid", nullable: false },
    { name: "bridge_id", type: "character varying", nullable: false },
    { name: "operator_address", type: "character varying", nullable: false },
    { name: "asset_code", type: "character varying", nullable: false },
    { name: "stake", type: "bigint", nullable: false },
    { name: "is_active", type: "boolean", nullable: false },
  ],
};

export class SchemaVerificationService {
  private readonly db = getDatabase();
  private readonly alertService = new AlertService();

  public async verifyAndReport(): Promise<{ passed: boolean; drifts: SchemaDrift[] }> {
    logger.info("Starting schema drift verification");

    const drifts: SchemaDrift[] = [];

    const tableChecks = CRITICAL_TABLES.map((table) => this.verifyTableExists(table));
    const tableResults = await Promise.all(tableChecks);

    for (let i = 0; i < CRITICAL_TABLES.length; i++) {
      if (!tableResults[i]) {
        drifts.push({
          table: CRITICAL_TABLES[i],
          type: "missing_table",
          expected: `Table ${CRITICAL_TABLES[i]} should exist`,
          actual: null,
        });
      }
    }

    const existingTables = CRITICAL_TABLES.filter((_, i) => tableResults[i]);

    for (const table of existingTables) {
      const columnDrifts = await this.verifyTableColumns(table);
      drifts.push(...columnDrifts);

      if (HYPERTABLE_EXPECTATIONS[table]) {
        const hypertableDrifts = await this.verifyHypertable(table, HYPERTABLE_EXPECTATIONS[table].time_column);
        drifts.push(...hypertableDrifts);
      }
    }

    const criticalDrifts = drifts.filter(
      (d) => d.type === "missing_table" || (d.type === "missing_column" && CRITICAL_TABLES.includes(d.table))
    );

    if (drifts.length > 0) {
      logger.error({ driftCount: drifts.length, criticalCount: criticalDrifts.length, drifts }, "Schema drift detected");

      try {
        await this.alertService.evaluateAsset({
          assetCode: "system",
          metrics: {
            schema_drift_count: drifts.length,
            critical_drift_count: criticalDrifts.length,
          },
        });
      } catch (alertErr) {
        logger.warn({ err: alertErr }, "Failed to trigger schema drift alert");
      }

      for (const drift of drifts) {
        logger.error(
          { table: drift.table, type: drift.type, expected: drift.expected, actual: drift.actual },
          "Schema drift detail"
        );
      }
    } else {
      logger.info("Schema drift verification passed — all tables and columns match expectations");
    }

    const passed = criticalDrifts.length === 0;

    if (!passed && config.NODE_ENV === "production") {
      logger.fatal(
        { criticalDrifts },
        "Critical schema drift detected in production — enforcing startup guard"
      );
    }

    return { passed, drifts };
  }

  public async enforceStartupGuard(): Promise<void> {
    const { passed, drifts } = await this.verifyAndReport();

    if (!passed) {
      if (config.NODE_ENV === "production") {
        const criticalTables = drifts
          .filter((d) => d.type === "missing_table")
          .map((d) => d.table);

        if (criticalTables.length > 0) {
          logger.fatal(
            { criticalTables },
            "FATAL: Critical TimescaleDB hypertables missing — aborting startup"
          );
          process.exit(1);
        }
      } else {
        logger.warn(
          { driftCount: drifts.length },
          "Schema drift detected but startup guard bypassed (non-production environment)"
        );
      }
    }
  }

  private async verifyTableExists(tableName: string): Promise<boolean> {
    try {
      const result = await this.db.raw(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = ? AND table_schema = 'public') AS exists",
        [tableName]
      );
      return result.rows?.[0]?.exists ?? false;
    } catch {
      return false;
    }
  }

  private async verifyTableColumns(table: string): Promise<SchemaDrift[]> {
    const drifts: SchemaDrift[] = [];
    const expected = EXPECTED_COLUMNS[table];
    if (!expected) return drifts;

    try {
      const result = await this.db.raw<{ rows: TableColumnInfo[] }>(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_name = ? AND table_schema = 'public'`,
        [table]
      );
      const actualColumns = new Map(
        result.rows.map((col) => [col.column_name, col])
      );

      for (const expectedCol of expected) {
        const actualCol = actualColumns.get(expectedCol.name);

        if (!actualCol) {
          drifts.push({
            table,
            type: "missing_column",
            expected: `Column ${expectedCol.name} (${expectedCol.type})`,
            actual: null,
          });
          continue;
        }

        const actualType = actualCol.data_type.toLowerCase();
        const expectedType = expectedCol.type.toLowerCase();

        if (actualType !== expectedType && !actualType.startsWith(expectedType)) {
          drifts.push({
            table,
            type: "type_mismatch",
            expected: `${expectedCol.name}: ${expectedCol.type}`,
            actual: `${expectedCol.name}: ${actualCol.data_type}`,
          });
        }

        const actualNullable = actualCol.is_nullable === "YES";
        if (actualNullable === expectedCol.nullable) {
          drifts.push({
            table,
            type: "nullable_mismatch",
            expected: `${expectedCol.name}: nullable=${expectedCol.nullable}`,
            actual: `${expectedCol.name}: nullable=${actualNullable}`,
          });
        }
      }
    } catch (err) {
      logger.error({ table, err }, "Failed to verify columns for table");
    }

    return drifts;
  }

  private async verifyHypertable(table: string, timeColumn: string): Promise<SchemaDrift[]> {
    const drifts: SchemaDrift[] = [];

    try {
      const result = await this.db.raw(
        `SELECT hypertable_name, partitioning_column
         FROM timescaledb_information.hypertables
         WHERE hypertable_name = ?`,
        [table]
      );

      if (!result.rows || result.rows.length === 0) {
        drifts.push({
          table,
          type: "missing_index",
          expected: `TimescaleDB hypertable on ${table} (time column: ${timeColumn})`,
          actual: "Not a hypertable",
        });
      }
    } catch {
      logger.warn({ table }, "Cannot verify hypertable status — TimescaleDB extension may not be available");
    }

    return drifts;
  }
}

export const schemaVerificationService = new SchemaVerificationService();
