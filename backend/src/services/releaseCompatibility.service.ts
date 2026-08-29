import { db } from "../database/db.js";
import type { PoolClient } from "pg";

export interface ReleaseCompatibility {
  id: string;
  sourceVersion: string;
  targetVersion: string;
  compatibilityStatus: "compatible" | "incompatible" | "partial" | "untested" | "deprecated";
  migrationPathAvailable: boolean;
  migrationGuideUrl?: string;
  breakingChanges: string[];
  deprecations: string[];
  testCoverage: number;
  verifiedBy?: string;
  verifiedAt?: Date;
}

export interface CompatibilityMatrix {
  id: string;
  releaseVersion: string;
  compatibleVersions: string[];
  incompatibleVersions: string[];
  partialVersions: string[];
  deprecatedVersions: string[];
  overallScore: number;
}

export interface CompatibilityTestResult {
  id: string;
  sourceVersion: string;
  targetVersion: string;
  testId: string;
  testName: string;
  testCategory: "migration" | "api" | "performance" | "security" | "functionality";
  status: "passed" | "failed" | "skipped" | "error";
  executionTimeMs: number;
  errorMessage?: string;
}

export const releaseCompatibilityService = {
  async createCompatibilityRecord(
    sourceVersion: string,
    targetVersion: string,
    compatibilityStatus: "compatible" | "incompatible" | "partial" | "untested" | "deprecated",
    migrationPathAvailable: boolean = false,
    migrationGuideUrl?: string,
    breakingChanges: string[] = [],
    deprecations: string[] = [],
    testCoverage: number = 0,
    client?: PoolClient
  ): Promise<ReleaseCompatibility> {
    const query = client || db;

    try {
      const result = await query.query(
        `INSERT INTO release_compatibility
         (source_version, target_version, compatibility_status, migration_path_available,
          migration_guide_url, breaking_changes, deprecations, test_coverage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, source_version, target_version, compatibility_status, migration_path_available,
                   migration_guide_url, breaking_changes, deprecations, test_coverage, verified_by, verified_at`,
        [
          sourceVersion,
          targetVersion,
          compatibilityStatus,
          migrationPathAvailable,
          migrationGuideUrl,
          breakingChanges,
          deprecations,
          testCoverage,
        ]
      );

      return {
        id: result.rows[0].id,
        sourceVersion: result.rows[0].source_version,
        targetVersion: result.rows[0].target_version,
        compatibilityStatus: result.rows[0].compatibility_status,
        migrationPathAvailable: result.rows[0].migration_path_available,
        migrationGuideUrl: result.rows[0].migration_guide_url,
        breakingChanges: result.rows[0].breaking_changes,
        deprecations: result.rows[0].deprecations,
        testCoverage: result.rows[0].test_coverage,
        verifiedBy: result.rows[0].verified_by,
        verifiedAt: result.rows[0].verified_at,
      };
    } catch (error) {
      throw new Error(`Failed to create compatibility record: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async verifyCompatibility(
    sourceVersion: string,
    targetVersion: string,
    verifiedBy: string,
    client?: PoolClient
  ): Promise<ReleaseCompatibility> {
    const query = client || db;

    try {
      const result = await query.query(
        `UPDATE release_compatibility
         SET verified_by = $1, verified_at = NOW()
         WHERE source_version = $2 AND target_version = $3
         RETURNING id, source_version, target_version, compatibility_status, migration_path_available,
                   migration_guide_url, breaking_changes, deprecations, test_coverage, verified_by, verified_at`,
        [verifiedBy, sourceVersion, targetVersion]
      );

      if (result.rows.length === 0) {
        throw new Error(`Compatibility record not found: ${sourceVersion} -> ${targetVersion}`);
      }

      return {
        id: result.rows[0].id,
        sourceVersion: result.rows[0].source_version,
        targetVersion: result.rows[0].target_version,
        compatibilityStatus: result.rows[0].compatibility_status,
        migrationPathAvailable: result.rows[0].migration_path_available,
        migrationGuideUrl: result.rows[0].migration_guide_url,
        breakingChanges: result.rows[0].breaking_changes,
        deprecations: result.rows[0].deprecations,
        testCoverage: result.rows[0].test_coverage,
        verifiedBy: result.rows[0].verified_by,
        verifiedAt: result.rows[0].verified_at,
      };
    } catch (error) {
      throw new Error(`Failed to verify compatibility: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async recordTestResult(
    sourceVersion: string,
    targetVersion: string,
    testId: string,
    testName: string,
    testCategory: "migration" | "api" | "performance" | "security" | "functionality",
    status: "passed" | "failed" | "skipped" | "error",
    executionTimeMs: number = 0,
    errorMessage?: string,
    client?: PoolClient
  ): Promise<CompatibilityTestResult> {
    const query = client || db;

    try {
      const result = await query.query(
        `INSERT INTO compatibility_test_results
         (source_version, target_version, test_id, test_name, test_category, status, execution_time_ms, error_message, run_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id, source_version, target_version, test_id, test_name, test_category, status, execution_time_ms, error_message`,
        [sourceVersion, targetVersion, testId, testName, testCategory, status, executionTimeMs, errorMessage]
      );

      return {
        id: result.rows[0].id,
        sourceVersion: result.rows[0].source_version,
        targetVersion: result.rows[0].target_version,
        testId: result.rows[0].test_id,
        testName: result.rows[0].test_name,
        testCategory: result.rows[0].test_category,
        status: result.rows[0].status,
        executionTimeMs: result.rows[0].execution_time_ms,
        errorMessage: result.rows[0].error_message,
      };
    } catch (error) {
      throw new Error(`Failed to record test result: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getCompatibilityMatrix(releaseVersion: string, client?: PoolClient): Promise<CompatibilityMatrix> {
    const query = client || db;

    try {
      // Get all compatibility records for this version
      const allVersions = await query.query(
        `SELECT DISTINCT source_version FROM release_compatibility
         UNION
         SELECT DISTINCT target_version FROM release_compatibility`
      );

      const compatibilityRecords = await query.query(
        `SELECT target_version, compatibility_status FROM release_compatibility
         WHERE source_version = $1`,
        [releaseVersion]
      );

      const compatible: string[] = [];
      const incompatible: string[] = [];
      const partial: string[] = [];
      const deprecated: string[] = [];

      compatibilityRecords.rows.forEach((row) => {
        switch (row.compatibility_status) {
          case "compatible":
            compatible.push(row.target_version);
            break;
          case "incompatible":
            incompatible.push(row.target_version);
            break;
          case "partial":
            partial.push(row.target_version);
            break;
          case "deprecated":
            deprecated.push(row.target_version);
            break;
        }
      });

      // Calculate overall score
      const totalVersions = compatible.length + incompatible.length + partial.length + deprecated.length;
      const overallScore = totalVersions > 0 ? (compatible.length / totalVersions) * 100 : 0;

      // Check if matrix exists or create new one
      const existingMatrix = await query.query(
        `SELECT id FROM compatibility_matrix WHERE release_version = $1`,
        [releaseVersion]
      );

      if (existingMatrix.rows.length > 0) {
        const result = await query.query(
          `UPDATE compatibility_matrix
           SET compatible_versions = $1, incompatible_versions = $2, partial_versions = $3,
               deprecated_versions = $4, overall_score = $5, last_updated = NOW()
           WHERE release_version = $6
           RETURNING id, release_version, compatible_versions, incompatible_versions, partial_versions,
                     deprecated_versions, overall_score`,
          [compatible, incompatible, partial, deprecated, overallScore, releaseVersion]
        );

        return {
          id: result.rows[0].id,
          releaseVersion: result.rows[0].release_version,
          compatibleVersions: result.rows[0].compatible_versions,
          incompatibleVersions: result.rows[0].incompatible_versions,
          partialVersions: result.rows[0].partial_versions,
          deprecatedVersions: result.rows[0].deprecated_versions,
          overallScore: result.rows[0].overall_score,
        };
      } else {
        const result = await query.query(
          `INSERT INTO compatibility_matrix
           (release_version, compatible_versions, incompatible_versions, partial_versions, deprecated_versions, overall_score)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, release_version, compatible_versions, incompatible_versions, partial_versions,
                     deprecated_versions, overall_score`,
          [releaseVersion, compatible, incompatible, partial, deprecated, overallScore]
        );

        return {
          id: result.rows[0].id,
          releaseVersion: result.rows[0].release_version,
          compatibleVersions: result.rows[0].compatible_versions,
          incompatibleVersions: result.rows[0].incompatible_versions,
          partialVersions: result.rows[0].partial_versions,
          deprecatedVersions: result.rows[0].deprecated_versions,
          overallScore: result.rows[0].overall_score,
        };
      }
    } catch (error) {
      throw new Error(`Failed to get compatibility matrix: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getTestResultsForVersions(
    sourceVersion: string,
    targetVersion: string,
    limit: number = 50,
    offset: number = 0,
    client?: PoolClient
  ): Promise<CompatibilityTestResult[]> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, source_version, target_version, test_id, test_name, test_category, status, execution_time_ms, error_message
         FROM compatibility_test_results
         WHERE source_version = $1 AND target_version = $2
         ORDER BY run_timestamp DESC
         LIMIT $3 OFFSET $4`,
        [sourceVersion, targetVersion, limit, offset]
      );

      return result.rows.map((row) => ({
        id: row.id,
        sourceVersion: row.source_version,
        targetVersion: row.target_version,
        testId: row.test_id,
        testName: row.test_name,
        testCategory: row.test_category,
        status: row.status,
        executionTimeMs: row.execution_time_ms,
        errorMessage: row.error_message,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch test results: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getCompatibilityRecord(
    sourceVersion: string,
    targetVersion: string,
    client?: PoolClient
  ): Promise<ReleaseCompatibility | null> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, source_version, target_version, compatibility_status, migration_path_available,
                migration_guide_url, breaking_changes, deprecations, test_coverage, verified_by, verified_at
         FROM release_compatibility
         WHERE source_version = $1 AND target_version = $2`,
        [sourceVersion, targetVersion]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        id: result.rows[0].id,
        sourceVersion: result.rows[0].source_version,
        targetVersion: result.rows[0].target_version,
        compatibilityStatus: result.rows[0].compatibility_status,
        migrationPathAvailable: result.rows[0].migration_path_available,
        migrationGuideUrl: result.rows[0].migration_guide_url,
        breakingChanges: result.rows[0].breaking_changes,
        deprecations: result.rows[0].deprecations,
        testCoverage: result.rows[0].test_coverage,
        verifiedBy: result.rows[0].verified_by,
        verifiedAt: result.rows[0].verified_at,
      };
    } catch (error) {
      throw new Error(`Failed to fetch compatibility record: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
