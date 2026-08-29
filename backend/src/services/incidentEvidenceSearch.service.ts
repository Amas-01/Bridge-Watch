import { db } from "../database/db.js";
import type { PoolClient } from "pg";

export interface EvidenceSearchResult {
  id: string;
  incidentId: string;
  annotationId: string;
  content: string;
  author: string;
  severity: "low" | "medium" | "high" | "critical";
  tags: string[];
  createdAt: Date;
  relevanceScore?: number;
}

export interface EvidenceAnnotation {
  id: string;
  incidentId: string;
  content: string;
  author: string;
  severity: "low" | "medium" | "high" | "critical";
  tags: string[];
  evidenceType: string;
  createdAt: Date;
  updatedAt: Date;
}

export const incidentEvidenceSearchService = {
  async searchEvidence(
    query: string,
    filters?: {
      incidentId?: string;
      severity?: string;
      tags?: string[];
      dateFrom?: Date;
      dateTo?: Date;
    },
    client?: PoolClient
  ): Promise<EvidenceSearchResult[]> {
    const dbQuery = client || db;

    try {
      let sql = `
        SELECT id, incident_id, annotation_id, content, author, severity, tags, created_at
        FROM incident_evidence_annotations
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      // Full-text search on content
      if (query) {
        sql += ` AND content ILIKE $${paramIndex}`;
        params.push(`%${query}%`);
        paramIndex++;
      }

      // Filter by incident
      if (filters?.incidentId) {
        sql += ` AND incident_id = $${paramIndex}`;
        params.push(filters.incidentId);
        paramIndex++;
      }

      // Filter by severity
      if (filters?.severity) {
        sql += ` AND severity = $${paramIndex}`;
        params.push(filters.severity);
        paramIndex++;
      }

      // Filter by tags
      if (filters?.tags && filters.tags.length > 0) {
        sql += ` AND tags && $${paramIndex}`;
        params.push(filters.tags);
        paramIndex++;
      }

      // Date range filters
      if (filters?.dateFrom) {
        sql += ` AND created_at >= $${paramIndex}`;
        params.push(filters.dateFrom);
        paramIndex++;
      }

      if (filters?.dateTo) {
        sql += ` AND created_at <= $${paramIndex}`;
        params.push(filters.dateTo);
        paramIndex++;
      }

      sql += ` ORDER BY created_at DESC LIMIT 100`;

      const result = await dbQuery.query(sql, params);

      return result.rows.map((row: any) => ({
        id: row.id,
        incidentId: row.incident_id,
        annotationId: row.annotation_id,
        content: row.content,
        author: row.author,
        severity: row.severity,
        tags: Array.isArray(row.tags) ? row.tags : [row.tags],
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      throw new Error(`Failed to search evidence: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async addEvidenceAnnotation(
    incidentId: string,
    content: string,
    author: string,
    severity: "low" | "medium" | "high" | "critical",
    tags: string[],
    evidenceType: string,
    client?: PoolClient
  ): Promise<EvidenceAnnotation> {
    const query = client || db;

    try {
      const result = await query.query(
        `INSERT INTO incident_evidence_annotations
         (incident_id, content, author, severity, tags, evidence_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING id, incident_id, content, author, severity, tags, evidence_type, created_at, updated_at`,
        [incidentId, content, author, severity, tags, evidenceType]
      );

      return {
        id: result.rows[0].id,
        incidentId: result.rows[0].incident_id,
        content: result.rows[0].content,
        author: result.rows[0].author,
        severity: result.rows[0].severity,
        tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [result.rows[0].tags],
        evidenceType: result.rows[0].evidence_type,
        createdAt: new Date(result.rows[0].created_at),
        updatedAt: new Date(result.rows[0].updated_at),
      };
    } catch (error) {
      throw new Error(`Failed to add evidence annotation: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getIncidentEvidence(incidentId: string, client?: PoolClient): Promise<EvidenceAnnotation[]> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, incident_id, content, author, severity, tags, evidence_type, created_at, updated_at
         FROM incident_evidence_annotations
         WHERE incident_id = $1
         ORDER BY created_at DESC`,
        [incidentId]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        incidentId: row.incident_id,
        content: row.content,
        author: row.author,
        severity: row.severity,
        tags: Array.isArray(row.tags) ? row.tags : [row.tags],
        evidenceType: row.evidence_type,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      throw new Error(`Failed to fetch incident evidence: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async updateEvidenceAnnotation(
    id: string,
    updates: Partial<EvidenceAnnotation>,
    client?: PoolClient
  ): Promise<EvidenceAnnotation> {
    const query = client || db;

    try {
      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (updates.content) {
        updateFields.push(`content = $${paramIndex}`);
        params.push(updates.content);
        paramIndex++;
      }

      if (updates.severity) {
        updateFields.push(`severity = $${paramIndex}`);
        params.push(updates.severity);
        paramIndex++;
      }

      if (updates.tags) {
        updateFields.push(`tags = $${paramIndex}`);
        params.push(updates.tags);
        paramIndex++;
      }

      updateFields.push(`updated_at = NOW()`);

      if (updateFields.length === 1) {
        throw new Error("No updates provided");
      }

      params.push(id);

      const result = await query.query(
        `UPDATE incident_evidence_annotations
         SET ${updateFields.join(", ")}
         WHERE id = $${paramIndex}
         RETURNING id, incident_id, content, author, severity, tags, evidence_type, created_at, updated_at`,
        params
      );

      if (result.rows.length === 0) {
        throw new Error(`Evidence annotation ${id} not found`);
      }

      return {
        id: result.rows[0].id,
        incidentId: result.rows[0].incident_id,
        content: result.rows[0].content,
        author: result.rows[0].author,
        severity: result.rows[0].severity,
        tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [result.rows[0].tags],
        evidenceType: result.rows[0].evidence_type,
        createdAt: new Date(result.rows[0].created_at),
        updatedAt: new Date(result.rows[0].updated_at),
      };
    } catch (error) {
      throw new Error(`Failed to update evidence annotation: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
