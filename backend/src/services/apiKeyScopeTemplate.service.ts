import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export interface ApiKeyScopeTemplate {
  id: string;
  name: string;
  description: string | null;
  scopes: string[];
  rateLimitPerMinute: number | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  [key: string]: unknown;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ApiKeyScopeTemplateService {
  async listTemplates(includeInactive = false): Promise<ApiKeyScopeTemplate[]> {
    const db = getDatabase();
    const rows = (await db("api_key_scope_templates")
      .modify((qb) => {
        if (!includeInactive) {
          qb.where("is_active", true);
        }
      })
      .orderBy("name")) as Row[];

    return rows.map((row) => this.mapRow(row));
  }

  async getTemplate(id: string): Promise<ApiKeyScopeTemplate | null> {
    const db = getDatabase();
    const row = (await db("api_key_scope_templates")
      .where({ id })
      .first()) as Row | undefined;
    return row ? this.mapRow(row) : null;
  }

  async getTemplateByName(name: string): Promise<ApiKeyScopeTemplate | null> {
    const db = getDatabase();
    const row = (await db("api_key_scope_templates")
      .where({ name })
      .first()) as Row | undefined;
    return row ? this.mapRow(row) : null;
  }

  async createTemplate(input: {
    name: string;
    description?: string;
    scopes: string[];
    rateLimitPerMinute?: number;
    createdBy?: string;
  }): Promise<ApiKeyScopeTemplate> {
    const db = getDatabase();

    if (!input.name?.trim()) {
      throw new Error("name is required");
    }
    const normalizedScopes = Array.from(
      new Set((input.scopes ?? []).map((s) => s.trim()).filter(Boolean))
    );
    if (normalizedScopes.length === 0) {
      throw new Error("at least one scope is required");
    }

    const existing = await this.getTemplateByName(input.name.trim());
    if (existing) {
      throw new Error(`template with name '${input.name.trim()}' already exists`);
    }

    const [inserted] = await db("api_key_scope_templates")
      .insert({
        name: input.name.trim(),
        description: input.description ?? null,
        scopes: JSON.stringify(normalizedScopes),
        rate_limit_per_minute: input.rateLimitPerMinute ?? null,
        is_active: true,
        created_by: input.createdBy ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "api_key_scope_templates",
        action: "template_created",
        template_id: inserted.id,
        name: inserted.name,
        scope_count: normalizedScopes.length,
      },
      "API key scope template created"
    );

    return this.mapRow(inserted as Row);
  }

  async updateTemplate(
    id: string,
    input: Partial<{
      name: string;
      description: string | null;
      scopes: string[];
      rateLimitPerMinute: number | null;
      isActive: boolean;
    }>,
    updatedBy?: string
  ): Promise<ApiKeyScopeTemplate | null> {
    const db = getDatabase();
    const existing = await this.getTemplate(id);
    if (!existing) {
      return null;
    }

    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined && input.name?.trim()) {
      patch.name = input.name.trim();
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (input.scopes !== undefined) {
      patch.scopes = JSON.stringify(
        Array.from(new Set(input.scopes.map((s) => s.trim()).filter(Boolean)))
      );
    }
    if (input.rateLimitPerMinute !== undefined) {
      patch.rate_limit_per_minute = input.rateLimitPerMinute;
    }
    if (input.isActive !== undefined) {
      patch.is_active = input.isActive;
    }

    const [updated] = await db("api_key_scope_templates")
      .where({ id })
      .update(patch)
      .returning("*");

    logger.info(
      {
        feature: "api_key_scope_templates",
        action: "template_updated",
        template_id: id,
        actor: updatedBy ?? null,
      },
      "API key scope template updated"
    );

    return updated ? this.mapRow(updated as Row) : null;
  }

  private mapRow(row: Row): ApiKeyScopeTemplate {
    return {
      id: String(row.id),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      scopes: this.parseScopes(row.scopes),
      rateLimitPerMinute: row.rate_limit_per_minute
        ? Number(row.rate_limit_per_minute)
        : null,
      isActive: Boolean(row.is_active),
      createdBy: row.created_by ? String(row.created_by) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private parseScopes(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String);
    try {
      return JSON.parse(String(value)).map(String);
    } catch {
      return [];
    }
  }
}

export const apiKeyScopeTemplateService = new ApiKeyScopeTemplateService();
