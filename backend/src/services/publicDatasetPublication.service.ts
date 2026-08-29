import { db } from "../database/db.js";
import type { PoolClient } from "pg";

export interface DatasetMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  isPublic: boolean;
  publishedAt?: Date;
  expiresAt?: Date;
  accessLevel: "public" | "restricted" | "internal";
}

export interface PublicationJob {
  id: string;
  datasetId: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  publishedAt?: Date;
  failureReason?: string;
  retryCount: number;
}

export const publicDatasetPublicationService = {
  async registerDataset(
    name: string,
    description: string,
    category: string,
    accessLevel: "public" | "restricted" | "internal" = "public",
    client?: PoolClient
  ): Promise<DatasetMetadata> {
    const query = client || db;

    try {
      const result = await query.query(
        `INSERT INTO public_datasets
         (name, description, category, version, access_level, created_at)
         VALUES ($1, $2, $3, '1.0.0', $4, NOW())
         RETURNING id, name, description, category, version, is_public, access_level`,
        [name, description, category, accessLevel]
      );

      return {
        id: result.rows[0].id,
        name: result.rows[0].name,
        description: result.rows[0].description,
        category: result.rows[0].category,
        version: result.rows[0].version,
        isPublic: result.rows[0].is_public,
        accessLevel: result.rows[0].access_level,
      };
    } catch (error) {
      throw new Error(`Failed to register dataset: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async publishDataset(datasetId: string, client?: PoolClient): Promise<PublicationJob> {
    const query = client || db;

    try {
      // Create publication job
      const jobResult = await query.query(
        `INSERT INTO publication_jobs
         (dataset_id, status, created_at)
         VALUES ($1, 'pending', NOW())
         RETURNING id, dataset_id, status, retry_count`,
        [datasetId]
      );

      // Update dataset as public
      await query.query(
        `UPDATE public_datasets
         SET is_public = true, published_at = NOW()
         WHERE id = $1`,
        [datasetId]
      );

      return {
        id: jobResult.rows[0].id,
        datasetId: jobResult.rows[0].dataset_id,
        status: jobResult.rows[0].status,
        retryCount: jobResult.rows[0].retry_count,
      };
    } catch (error) {
      throw new Error(`Failed to publish dataset: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getPublicDatasets(limit: number = 50, offset: number = 0, client?: PoolClient): Promise<DatasetMetadata[]> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, name, description, category, version, is_public, published_at, access_level
         FROM public_datasets
         WHERE is_public = true AND (access_level = 'public' OR access_level = 'restricted')
         ORDER BY published_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        version: row.version,
        isPublic: row.is_public,
        publishedAt: row.published_at ? new Date(row.published_at) : undefined,
        accessLevel: row.access_level,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch public datasets: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getDatasetDetails(datasetId: string, client?: PoolClient): Promise<any> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, name, description, category, version, is_public, published_at, expires_at, access_level
         FROM public_datasets
         WHERE id = $1`,
        [datasetId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Dataset ${datasetId} not found`);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to fetch dataset: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async updatePublicationStatus(jobId: string, status: string, client?: PoolClient): Promise<any> {
    const query = client || db;

    try {
      const result = await query.query(
        `UPDATE publication_jobs
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, dataset_id, status`,
        [status, jobId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Publication job ${jobId} not found`);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to update publication status: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async retryFailedPublications(maxRetries: number = 3, client?: PoolClient): Promise<number> {
    const query = client || db;

    try {
      const result = await query.query(
        `UPDATE publication_jobs
         SET status = 'pending', retry_count = retry_count + 1, updated_at = NOW()
         WHERE status = 'failed' AND retry_count < $1
         RETURNING id`,
        [maxRetries]
      );

      return result.rows.length;
    } catch (error) {
      throw new Error(`Failed to retry failed publications: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
