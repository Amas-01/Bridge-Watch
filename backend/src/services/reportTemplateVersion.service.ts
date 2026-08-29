import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import type { ReportTemplateVersionRecord } from "../database/types.js";

export interface CreateTemplateVersionInput {
  name?: string;
  type?: string;
  description?: string;
  sections?: unknown[];
  includes?: Record<string, boolean>;
  filters?: unknown[];
  changeSummary?: string;
}

export class ReportTemplateVersionService {
  private readonly db = getDatabase();

  async createVersion(
    templateId: string,
    input: CreateTemplateVersionInput,
    author: string
  ): Promise<ReportTemplateVersionRecord> {
    const template = await this.db("report_templates").where({ id: templateId }).first();
    if (!template) {
      throw new Error(`Report template ${templateId} not found`);
    }

    const currentVersion: number = template.version ?? 1;
    const nextVersion = currentVersion + 1;
    const now = new Date();

    const name = input.name ?? template.name;
    const type = input.type ?? template.type;
    const description = input.description ?? template.description;
    const sections = input.sections ? JSON.stringify(input.sections) : (typeof template.sections === "string" ? template.sections : JSON.stringify(template.sections));
    const includes = input.includes ? JSON.stringify(input.includes) : (typeof template.includes === "string" ? template.includes : JSON.stringify(template.includes));
    const filters = input.filters ? JSON.stringify(input.filters) : (typeof template.filters === "string" ? template.filters : JSON.stringify(template.filters));

    const [versionRecord] = await this.db("report_template_versions")
      .insert({
        template_id: templateId,
        version: nextVersion,
        name,
        type,
        description,
        sections,
        includes,
        filters,
        change_summary: input.changeSummary ?? `Updated to version ${nextVersion}`,
        created_by: author,
        created_at: now,
      })
      .returning("*");

    await this.db("report_templates")
      .where({ id: templateId })
      .update({
        version: nextVersion,
        name,
        type,
        description,
        sections,
        includes,
        filters,
        change_summary: input.changeSummary ?? `Updated to version ${nextVersion}`,
        updated_at: now,
      });

    logger.info(
      { templateId, version: nextVersion, author },
      "Created new report template version"
    );

    return this.parseRecord(versionRecord);
  }

  async getVersion(templateId: string, version: number): Promise<ReportTemplateVersionRecord | undefined> {
    const record = await this.db("report_template_versions")
      .where({ template_id: templateId, version })
      .first();

    return record ? this.parseRecord(record) : undefined;
  }

  async listVersions(templateId: string): Promise<ReportTemplateVersionRecord[]> {
    const records = await this.db("report_template_versions")
      .where({ template_id: templateId })
      .orderBy("version", "desc");

    return records.map((r) => this.parseRecord(r));
  }

  async restoreVersion(
    templateId: string,
    version: number,
    restoredBy: string
  ): Promise<ReportTemplateVersionRecord> {
    const target = await this.getVersion(templateId, version);
    if (!target) {
      throw new Error(`Version ${version} of template ${templateId} not found`);
    }

    return this.createVersion(
      templateId,
      {
        name: target.name,
        type: target.type,
        description: target.description,
        sections: typeof target.sections === "string" ? JSON.parse(target.sections) : target.sections,
        includes: typeof target.includes === "string" ? JSON.parse(target.includes) : target.includes,
        filters: typeof target.filters === "string" ? JSON.parse(target.filters) : target.filters,
        changeSummary: `Restored from version ${version}`,
      },
      restoredBy
    );
  }

  private parseRecord(record: any): ReportTemplateVersionRecord {
    return {
      ...record,
      sections: typeof record.sections === "string" ? JSON.parse(record.sections) : record.sections,
      includes: typeof record.includes === "string" ? JSON.parse(record.includes) : record.includes,
      filters: typeof record.filters === "string" ? JSON.parse(record.filters) : record.filters,
    };
  }
}
