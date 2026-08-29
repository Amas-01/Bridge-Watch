import { db } from "../database/db.js";
import type { PoolClient } from "pg";

export interface ArtifactProvenance {
  id: string;
  artifactId: string;
  artifactName: string;
  artifactType: "build" | "package" | "image" | "binary" | "config";
  artifactHash: string;
  sourceRepository: string;
  sourceCommit: string;
  creatorId: string;
  createdAt: Date;
}

export interface ArtifactChainRecord {
  id: string;
  artifactId: string;
  action: "created" | "verified" | "signed" | "deployed" | "revoked";
  actorId: string;
  actionTimestamp: Date;
  signature?: string;
}

export interface ArtifactVerificationResult {
  id: string;
  artifactId: string;
  verificationType: "hash_verification" | "signature_verification" | "sbom_scan" | "vulnerability_scan" | "license_scan";
  status: "pending" | "passed" | "failed" | "warning" | "skipped";
  riskLevel: "low" | "medium" | "high" | "critical";
  findings: string[];
  verifiedBy?: string;
}

export const artifactProvenanceService = {
  async registerArtifact(
    artifactId: string,
    artifactName: string,
    artifactType: "build" | "package" | "image" | "binary" | "config",
    artifactHash: string,
    sourceRepository: string,
    sourceCommit: string,
    creatorId: string,
    client?: PoolClient
  ): Promise<ArtifactProvenance> {
    const query = client || db;

    try {
      const result = await query.query(
        `INSERT INTO artifact_provenance
         (artifact_id, artifact_name, artifact_type, artifact_hash, source_repository, source_commit, creator_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, artifact_id, artifact_name, artifact_type, artifact_hash, source_repository, source_commit, creator_id, created_at`,
        [artifactId, artifactName, artifactType, artifactHash, sourceRepository, sourceCommit, creatorId]
      );

      return {
        id: result.rows[0].id,
        artifactId: result.rows[0].artifact_id,
        artifactName: result.rows[0].artifact_name,
        artifactType: result.rows[0].artifact_type,
        artifactHash: result.rows[0].artifact_hash,
        sourceRepository: result.rows[0].source_repository,
        sourceCommit: result.rows[0].source_commit,
        creatorId: result.rows[0].creator_id,
        createdAt: result.rows[0].created_at,
      };
    } catch (error) {
      throw new Error(`Failed to register artifact: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async publishArtifact(artifactId: string, client?: PoolClient): Promise<void> {
    const query = client || db;

    try {
      await query.query(
        `UPDATE artifact_provenance
         SET published_at = NOW()
         WHERE artifact_id = $1`,
        [artifactId]
      );
    } catch (error) {
      throw new Error(`Failed to publish artifact: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async recordArtifactAction(
    artifactId: string,
    action: "created" | "verified" | "signed" | "deployed" | "revoked",
    actorId: string,
    signature?: string,
    client?: PoolClient
  ): Promise<ArtifactChainRecord> {
    const query = client || db;

    try {
      // Get artifact UUID from artifact_id
      const artifactResult = await query.query(`SELECT id FROM artifact_provenance WHERE artifact_id = $1`, [artifactId]);

      if (artifactResult.rows.length === 0) {
        throw new Error(`Artifact not found: ${artifactId}`);
      }

      const result = await query.query(
        `INSERT INTO artifact_chain
         (artifact_id, action, actor_id, action_timestamp, signature)
         VALUES ($1, $2, $3, NOW(), $4)
         RETURNING id, artifact_id, action, actor_id, action_timestamp, signature`,
        [artifactResult.rows[0].id, action, actorId, signature]
      );

      return {
        id: result.rows[0].id,
        artifactId: result.rows[0].artifact_id,
        action: result.rows[0].action,
        actorId: result.rows[0].actor_id,
        actionTimestamp: result.rows[0].action_timestamp,
        signature: result.rows[0].signature,
      };
    } catch (error) {
      throw new Error(`Failed to record artifact action: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async verifyArtifact(
    artifactId: string,
    verificationType: "hash_verification" | "signature_verification" | "sbom_scan" | "vulnerability_scan" | "license_scan",
    status: "pending" | "passed" | "failed" | "warning" | "skipped",
    findings: string[] = [],
    riskLevel: "low" | "medium" | "high" | "critical" = "low",
    verifiedBy?: string,
    client?: PoolClient
  ): Promise<ArtifactVerificationResult> {
    const query = client || db;

    try {
      // Get artifact UUID from artifact_id
      const artifactResult = await query.query(`SELECT id FROM artifact_provenance WHERE artifact_id = $1`, [artifactId]);

      if (artifactResult.rows.length === 0) {
        throw new Error(`Artifact not found: ${artifactId}`);
      }

      const result = await query.query(
        `INSERT INTO artifact_verification_results
         (artifact_id, verification_type, status, findings, risk_level, verified_by, verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id, artifact_id, verification_type, status, findings, risk_level, verified_by`,
        [artifactResult.rows[0].id, verificationType, status, findings, riskLevel, verifiedBy]
      );

      return {
        id: result.rows[0].id,
        artifactId: result.rows[0].artifact_id,
        verificationType: result.rows[0].verification_type,
        status: result.rows[0].status,
        riskLevel: result.rows[0].risk_level,
        findings: result.rows[0].findings,
        verifiedBy: result.rows[0].verified_by,
      };
    } catch (error) {
      throw new Error(`Failed to verify artifact: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getArtifactChain(artifactId: string, limit: number = 50, offset: number = 0, client?: PoolClient): Promise<ArtifactChainRecord[]> {
    const query = client || db;

    try {
      // Get artifact UUID from artifact_id
      const artifactResult = await query.query(`SELECT id FROM artifact_provenance WHERE artifact_id = $1`, [artifactId]);

      if (artifactResult.rows.length === 0) {
        throw new Error(`Artifact not found: ${artifactId}`);
      }

      const result = await query.query(
        `SELECT id, artifact_id, action, actor_id, action_timestamp, signature
         FROM artifact_chain
         WHERE artifact_id = $1
         ORDER BY action_timestamp DESC
         LIMIT $2 OFFSET $3`,
        [artifactResult.rows[0].id, limit, offset]
      );

      return result.rows.map((row) => ({
        id: row.id,
        artifactId: row.artifact_id,
        action: row.action,
        actorId: row.actor_id,
        actionTimestamp: row.action_timestamp,
        signature: row.signature,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch artifact chain: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getArtifactVerifications(
    artifactId: string,
    limit: number = 50,
    offset: number = 0,
    client?: PoolClient
  ): Promise<ArtifactVerificationResult[]> {
    const query = client || db;

    try {
      // Get artifact UUID from artifact_id
      const artifactResult = await query.query(`SELECT id FROM artifact_provenance WHERE artifact_id = $1`, [artifactId]);

      if (artifactResult.rows.length === 0) {
        throw new Error(`Artifact not found: ${artifactId}`);
      }

      const result = await query.query(
        `SELECT id, artifact_id, verification_type, status, findings, risk_level, verified_by
         FROM artifact_verification_results
         WHERE artifact_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [artifactResult.rows[0].id, limit, offset]
      );

      return result.rows.map((row) => ({
        id: row.id,
        artifactId: row.artifact_id,
        verificationType: row.verification_type,
        status: row.status,
        riskLevel: row.risk_level,
        findings: row.findings,
        verifiedBy: row.verified_by,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch artifact verifications: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getArtifactDetails(artifactId: string, client?: PoolClient): Promise<ArtifactProvenance | null> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, artifact_id, artifact_name, artifact_type, artifact_hash, source_repository, source_commit, creator_id, created_at
         FROM artifact_provenance
         WHERE artifact_id = $1`,
        [artifactId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        id: result.rows[0].id,
        artifactId: result.rows[0].artifact_id,
        artifactName: result.rows[0].artifact_name,
        artifactType: result.rows[0].artifact_type,
        artifactHash: result.rows[0].artifact_hash,
        sourceRepository: result.rows[0].source_repository,
        sourceCommit: result.rows[0].source_commit,
        creatorId: result.rows[0].creator_id,
        createdAt: result.rows[0].created_at,
      };
    } catch (error) {
      throw new Error(`Failed to fetch artifact details: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async revokeArtifact(artifactId: string, revokedBy: string, client?: PoolClient): Promise<void> {
    const query = client || db;

    try {
      // Record revocation in artifact chain
      await artifactProvenanceService.recordArtifactAction(artifactId, "revoked", revokedBy, undefined, client);
    } catch (error) {
      throw new Error(`Failed to revoke artifact: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
