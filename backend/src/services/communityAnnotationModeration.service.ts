import { db } from "../database/db.js";
import type { PoolClient } from "pg";

export interface ModerationRequest {
  annotationId: string;
  action: "approve" | "reject" | "review";
  reason?: string;
  moderatorId: string;
}

export interface ModerationLog {
  id: string;
  annotationId: string;
  action: "approve" | "reject" | "review";
  moderatorId: string;
  reason?: string;
  createdAt: Date;
  status: "pending" | "approved" | "rejected";
}

export const communityAnnotationModerationService = {
  async submitForModeration(annotationId: string, client?: PoolClient): Promise<any> {
    const query = client || db;

    try {
      const result = await query.query(
        `UPDATE community_annotations
         SET status = 'pending_review', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [annotationId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Annotation ${annotationId} not found`);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to submit annotation for moderation: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async moderateAnnotation(
    request: ModerationRequest,
    client?: PoolClient
  ): Promise<ModerationLog> {
    const query = client || db;

    try {
      // Check if annotation exists
      const annotationCheck = await query.query(
        `SELECT id, status FROM community_annotations WHERE id = $1`,
        [request.annotationId]
      );

      if (annotationCheck.rows.length === 0) {
        throw new Error(`Annotation ${request.annotationId} not found`);
      }

      // Create moderation log
      const logResult = await query.query(
        `INSERT INTO annotation_moderation_logs
         (annotation_id, action, moderator_id, reason, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id, annotation_id, action, moderator_id, reason, status, created_at`,
        [
          request.annotationId,
          request.action,
          request.moderatorId,
          request.reason || null,
          request.action === "approve" ? "approved" : request.action === "reject" ? "rejected" : "pending",
        ]
      );

      // Update annotation status based on action
      const newStatus = request.action === "approve" ? "approved" : request.action === "reject" ? "rejected" : "under_review";
      await query.query(
        `UPDATE community_annotations
         SET status = $1, moderated_at = NOW(), moderator_id = $2
         WHERE id = $3`,
        [newStatus, request.moderatorId, request.annotationId]
      );

      return {
        id: logResult.rows[0].id,
        annotationId: logResult.rows[0].annotation_id,
        action: logResult.rows[0].action,
        moderatorId: logResult.rows[0].moderator_id,
        reason: logResult.rows[0].reason,
        createdAt: new Date(logResult.rows[0].created_at),
        status: logResult.rows[0].status,
      };
    } catch (error) {
      throw new Error(`Failed to moderate annotation: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getPendingReviews(client?: PoolClient): Promise<any[]> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, content, author, created_at, status, review_count
         FROM community_annotations
         WHERE status = 'pending_review'
         ORDER BY created_at ASC
         LIMIT 100`
      );

      return result.rows;
    } catch (error) {
      throw new Error(`Failed to fetch pending reviews: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getModerationHistory(annotationId: string, client?: PoolClient): Promise<ModerationLog[]> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, annotation_id, action, moderator_id, reason, status, created_at
         FROM annotation_moderation_logs
         WHERE annotation_id = $1
         ORDER BY created_at DESC`,
        [annotationId]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        annotationId: row.annotation_id,
        action: row.action,
        moderatorId: row.moderator_id,
        reason: row.reason,
        createdAt: new Date(row.created_at),
        status: row.status,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch moderation history: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getApprovedAnnotations(limit: number = 100, client?: PoolClient): Promise<any[]> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, content, author, created_at, moderated_at
         FROM community_annotations
         WHERE status = 'approved'
         ORDER BY moderated_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      throw new Error(`Failed to fetch approved annotations: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
