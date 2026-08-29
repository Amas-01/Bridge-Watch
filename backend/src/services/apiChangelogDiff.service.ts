import { db } from "../database/db.js";
import type { PoolClient } from "pg";

export interface ApiChangeEntry {
  version: string;
  releaseDate: Date;
  changes: string[];
  breaking: boolean;
}

export interface ChangelogDiff {
  fromVersion: string;
  toVersion: string;
  addedFeatures: string[];
  removedFeatures: string[];
  breakingChanges: string[];
  deprecated: string[];
  timestamp: Date;
}

export const apiChangelogDiffService = {
  async getDiff(fromVersion: string, toVersion: string, client?: PoolClient): Promise<ChangelogDiff> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT version, release_date, changes, is_breaking
         FROM api_changelog
         WHERE version IN ($1, $2)
         ORDER BY version DESC`,
        [toVersion, fromVersion]
      );

      if (result.rows.length < 2) {
        throw new Error(`One or both versions not found: ${fromVersion}, ${toVersion}`);
      }

      const toVer = result.rows.find((r: any) => r.version === toVersion);
      const fromVer = result.rows.find((r: any) => r.version === fromVersion);

      if (!toVer || !fromVer) {
        throw new Error(`One or both versions not found: ${fromVersion}, ${toVersion}`);
      }

      const allChanges = await query.query(
        `SELECT feature, change_type, description, is_breaking
         FROM api_changelog_details
         WHERE version_id IN (
           SELECT id FROM api_changelog WHERE version IN ($1, $2)
         )
         ORDER BY version_id DESC, created_at DESC`,
        [toVersion, fromVersion]
      );

      const diff = this.computeDiff(fromVer, toVer, allChanges.rows);
      return diff;
    } catch (error) {
      throw new Error(`Failed to generate changelog diff: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  computeDiff(
    fromVer: any,
    toVer: any,
    changes: any[]
  ): ChangelogDiff {
    const added: string[] = [];
    const removed: string[] = [];
    const breaking: string[] = [];
    const deprecated: string[] = [];

    for (const change of changes) {
      if (change.version_id === toVer.id) {
        if (change.change_type === "added") {
          added.push(`${change.feature}: ${change.description}`);
        } else if (change.change_type === "deprecated") {
          deprecated.push(`${change.feature}: ${change.description}`);
        }
        if (change.is_breaking) {
          breaking.push(`${change.feature}: ${change.description}`);
        }
      } else if (change.version_id === fromVer.id && change.change_type === "added") {
        removed.push(`${change.feature}: ${change.description}`);
      }
    }

    return {
      fromVersion: fromVer.version,
      toVersion: toVer.version,
      addedFeatures: added,
      removedFeatures: removed,
      breakingChanges: breaking,
      deprecated: deprecated,
      timestamp: new Date(),
    };
  },

  async getAllVersions(client?: PoolClient): Promise<ApiChangeEntry[]> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT version, release_date, changes, is_breaking
         FROM api_changelog
         ORDER BY version DESC`
      );

      return result.rows.map((row: any) => ({
        version: row.version,
        releaseDate: new Date(row.release_date),
        changes: Array.isArray(row.changes) ? row.changes : [row.changes],
        breaking: row.is_breaking || false,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch changelog versions: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getVersionDetails(version: string, client?: PoolClient): Promise<any> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, version, release_date, changes, is_breaking
         FROM api_changelog
         WHERE version = $1`,
        [version]
      );

      if (result.rows.length === 0) {
        throw new Error(`Version ${version} not found`);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to fetch version details: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
