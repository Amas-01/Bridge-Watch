import crypto from "crypto";
import fs from "fs";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface ExportIntegrityResult {
  exportId: string;
  isVerified: boolean;
  verificationStatus: "verified" | "unverified" | "tampered" | "failed";
  expectedChecksum: string | null;
  actualChecksum: string | null;
  signatureVerified: boolean;
  verifiedAt: Date;
  errorMessage?: string;
}

export class ExportIntegrityService {
  private readonly db = getDatabase();

  computeChecksum(content: Buffer | string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  computeFileChecksum(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return this.computeChecksum(fileBuffer);
  }

  signChecksum(checksum: string): { signature: string; publicKey: string } {
    const signingKey = process.env.EXPORT_SIGNING_SECRET || "default-export-integrity-secret-key-32b";
    const hmac = crypto.createHmac("sha256", signingKey);
    hmac.update(checksum);
    const signature = hmac.digest("hex");

    const publicKey = crypto.createHash("sha256").update(signingKey).digest("hex").slice(0, 32);
    return { signature, publicKey };
  }

  verifySignature(checksum: string, signature: string): boolean {
    const expected = this.signChecksum(checksum).signature;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  async attachIntegrityMetadata(exportId: string, filePath: string): Promise<{ checksum: string; signature: string; publicKey: string }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Export file does not exist at path: ${filePath}`);
    }

    const checksum = this.computeFileChecksum(filePath);
    const { signature, publicKey } = this.signChecksum(checksum);
    const now = new Date();

    await this.db("export_history")
      .where({ id: exportId })
      .update({
        checksum_sha256: checksum,
        signature,
        public_key: publicKey,
        verification_status: "verified",
        verified_at: now,
        updated_at: now,
      });

    logger.info({ exportId, checksum }, "Export integrity metadata attached");
    return { checksum, signature, publicKey };
  }

  async verifyExportIntegrity(exportId: string): Promise<ExportIntegrityResult> {
    const record = await this.db("export_history").where({ id: exportId }).first();
    if (!record) {
      throw new Error(`Export record ${exportId} not found`);
    }

    const now = new Date();

    if (!record.file_path || !fs.existsSync(record.file_path)) {
      await this.db("export_history")
        .where({ id: exportId })
        .update({ verification_status: "failed", verified_at: now, updated_at: now });

      return {
        exportId,
        isVerified: false,
        verificationStatus: "failed",
        expectedChecksum: record.checksum_sha256 ?? null,
        actualChecksum: null,
        signatureVerified: false,
        verifiedAt: now,
        errorMessage: "Export file not found on disk",
      };
    }

    const actualChecksum = this.computeFileChecksum(record.file_path);
    const expectedChecksum = record.checksum_sha256;

    let signatureVerified = true;
    if (record.signature) {
      signatureVerified = this.verifySignature(actualChecksum, record.signature);
    }

    const isChecksumValid = expectedChecksum ? actualChecksum === expectedChecksum : true;
    const isVerified = isChecksumValid && signatureVerified;
    const verificationStatus: "verified" | "tampered" | "failed" = isVerified ? "verified" : "tampered";

    await this.db("export_history")
      .where({ id: exportId })
      .update({
        checksum_sha256: expectedChecksum ?? actualChecksum,
        verification_status: verificationStatus,
        verified_at: now,
        updated_at: now,
      });

    logger.info({ exportId, isVerified, verificationStatus }, "Export integrity verification complete");

    return {
      exportId,
      isVerified,
      verificationStatus,
      expectedChecksum: expectedChecksum ?? actualChecksum,
      actualChecksum,
      signatureVerified,
      verifiedAt: now,
      errorMessage: isVerified ? undefined : "File checksum or signature mismatch detected",
    };
  }

  async getIntegrityStatus(exportId: string): Promise<ExportIntegrityResult | undefined> {
    const record = await this.db("export_history").where({ id: exportId }).first();
    if (!record) return undefined;

    return {
      exportId,
      isVerified: record.verification_status === "verified",
      verificationStatus: record.verification_status ?? "unverified",
      expectedChecksum: record.checksum_sha256 ?? null,
      actualChecksum: record.checksum_sha256 ?? null,
      signatureVerified: record.verification_status === "verified",
      verifiedAt: record.verified_at ?? record.created_at,
    };
  }
}
