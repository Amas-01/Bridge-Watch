import type { Knex } from "knex";
import { getTenantContext } from "../multi-tenant/tenantContext.js";
import { isTenantScopedTable } from "../multi-tenant/tenantGuard.js";

export class TenantQueryBuilder {
  private db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  query(table: string) {
    const builder = this.db(table);
    if (!isTenantScopedTable(table)) return builder;

    const ctx = getTenantContext();
    if (!ctx || ctx.bypass) return builder;

    return builder.where("tenant_id", ctx.tenantId);
  }

  insert(table: string, data: Record<string, unknown>) {
    if (!isTenantScopedTable(table)) {
      return this.db(table).insert(data);
    }

    const ctx = getTenantContext();
    if (ctx && !ctx.bypass) {
      data.tenant_id = ctx.tenantId;
    }

    return this.db(table).insert(data);
  }

  async assertOwns(
    table: string,
    recordId: string,
    idColumn = "id"
  ): Promise<void> {
    if (!isTenantScopedTable(table)) return;

    const ctx = getTenantContext();
    if (!ctx || ctx.bypass) return;

    const record = await this.db(table)
      .where(idColumn, recordId)
      .first();

    if (!record) {
      throw new Error(`Record not found: ${table}:${recordId}`);
    }

    if (record.tenant_id !== ctx.tenantId) {
      throw new Error(
        `Cross-tenant access denied: ${table}:${recordId}`
      );
    }
  }
}
