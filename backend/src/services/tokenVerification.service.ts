/**
 * Token Contract Verification Status Service
 * Issue #1153
 */

export type VerificationStatus = "verified" | "unverified" | "pending" | "flagged";

export interface TokenVerificationRecord {
  contractAddress: string;
  chain: string;
  tokenSymbol: string;
  status: VerificationStatus;
  compilerVersion: string;
  sourceCodeHash: string;
  isAudited: boolean;
  auditorName?: string;
  auditReportUrl?: string;
  verifiedAt?: string;
  flagReason?: string;
}

export class TokenVerificationService {
  private verifications: Map<string, TokenVerificationRecord> = new Map();

  constructor() {
    // Seed default verified contracts
    this.verifications.set("0xXLM_STELLAR", {
      contractAddress: "0xXLM_STELLAR",
      chain: "stellar",
      tokenSymbol: "XLM",
      status: "verified",
      compilerVersion: "soroban-cli 21.0.0",
      sourceCodeHash: "a1b2c3d4e5f6",
      isAudited: true,
      auditorName: "OpenZeppelin",
      auditReportUrl: "https://audits.example.com/xlm",
      verifiedAt: new Date().toISOString(),
    });
  }

  public async getVerificationStatus(
    contractAddress: string,
    chain: string,
  ): Promise<TokenVerificationRecord> {
    const key = `${chain}:${contractAddress}`;
    const record = this.verifications.get(key) ?? this.verifications.get(contractAddress);

    if (record) {
      return record;
    }

    return {
      contractAddress,
      chain,
      tokenSymbol: "UNKNOWN",
      status: "unverified",
      compilerVersion: "unknown",
      sourceCodeHash: "",
      isAudited: false,
    };
  }

  public async verifyTokenContract(
    data: Omit<TokenVerificationRecord, "verifiedAt">,
  ): Promise<TokenVerificationRecord> {
    const key = `${data.chain}:${data.contractAddress}`;
    const record: TokenVerificationRecord = {
      ...data,
      status: "verified",
      verifiedAt: new Date().toISOString(),
    };

    this.verifications.set(key, record);
    return record;
  }

  public async flagContract(
    contractAddress: string,
    chain: string,
    flagReason: string,
  ): Promise<TokenVerificationRecord> {
    const key = `${chain}:${contractAddress}`;
    const existing = await this.getVerificationStatus(contractAddress, chain);
    const updated: TokenVerificationRecord = {
      ...existing,
      status: "flagged",
      flagReason,
    };

    this.verifications.set(key, updated);
    return updated;
  }

  public async listVerifiedContracts(chain?: string): Promise<TokenVerificationRecord[]> {
    const all = Array.from(this.verifications.values());
    if (!chain) return all;
    return all.filter((c) => c.chain.toLowerCase() === chain.toLowerCase());
  }
}

export const tokenVerificationService = new TokenVerificationService();
