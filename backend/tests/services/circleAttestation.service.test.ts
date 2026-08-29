import { describe, it, expect } from "vitest";
import { CircleAttestationService } from "../../src/services/circleAttestation.service.js";

describe("CircleAttestationService", () => {
  const service = new CircleAttestationService();

  it("fetches a valid Verifiable Credential attestation envelope for USDC", async () => {
    const credential = await service.fetchAttestation("USDC");
    expect(credential).toBeDefined();
    expect(credential.credentialSubject.assetSymbol).toBe("USDC");
    expect(credential.issuer.id).toContain("circle");
    expect(credential.proof.signatureValue).toBeDefined();
  });

  it("cryptographically verifies a valid Circle Verifiable Credential signature", async () => {
    const credential = await service.fetchAttestation("USDC");
    const result = service.verifyCredential(credential);

    expect(result.isValid).toBe(true);
    expect(result.rootCertificateChain.length).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it("fails verification if the signature value is corrupted", async () => {
    const credential = await service.fetchAttestation("USDC");
    credential.proof.signatureValue = "InvalidCorruptedBase64Signature==";

    const result = service.verifyCredential(credential);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("verification failed");
  });
});
