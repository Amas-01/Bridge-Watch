import { describe, it, expect, beforeEach } from "vitest";
import { TokenVerificationService } from "../tokenVerification.service.js";

describe("TokenVerificationService (#1153)", () => {
  let service: TokenVerificationService;

  beforeEach(() => {
    service = new TokenVerificationService();
  });

  it("should return default verified contract status", async () => {
    const status = await service.getVerificationStatus("0xXLM_STELLAR", "stellar");
    expect(status.status).toBe("verified");
    expect(status.isAudited).toBe(true);
    expect(status.tokenSymbol).toBe("XLM");
  });

  it("should return unverified for unknown contracts", async () => {
    const status = await service.getVerificationStatus("0xUNKNOWN_RANDOM", "ethereum");
    expect(status.status).toBe("unverified");
    expect(status.isAudited).toBe(false);
  });

  it("should verify a new token contract", async () => {
    const verified = await service.verifyTokenContract({
      contractAddress: "0xNEW_TOKEN",
      chain: "solana",
      tokenSymbol: "SOL_TEST",
      status: "verified",
      compilerVersion: "anchor 0.30.0",
      sourceCodeHash: "hash123456",
      isAudited: true,
      auditorName: "CertiK",
    });

    expect(verified.status).toBe("verified");
    expect(verified.verifiedAt).toBeDefined();

    const lookup = await service.getVerificationStatus("0xNEW_TOKEN", "solana");
    expect(lookup.status).toBe("verified");
  });

  it("should flag a suspicious contract", async () => {
    const flagged = await service.flagContract(
      "0xFLAGGED_CONTRACT",
      "ethereum",
      "Honeypot transfer restriction detected",
    );

    expect(flagged.status).toBe("flagged");
    expect(flagged.flagReason).toContain("Honeypot");
  });
});
