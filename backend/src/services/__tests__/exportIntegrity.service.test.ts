import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExportIntegrityService } from "../exportIntegrity.service.js";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(Buffer.from("sample_export_data_csv_content")),
  },
}));

vi.mock("../../database/connection.js", () => {
  const mockExportRecord = {
    id: "exp-uuid-1",
    file_path: "/tmp/exports/exp-uuid-1.csv",
    checksum_sha256: null,
    signature: null,
    verification_status: "unverified",
  };

  const mockDb: any = vi.fn().mockImplementation(() => {
    const builder: any = {
      select: vi.fn().mockImplementation(() => builder),
      where: vi.fn().mockImplementation(() => builder),
      first: vi.fn().mockImplementation(() => Promise.resolve(mockExportRecord)),
      update: vi.fn().mockImplementation((data) => {
        Object.assign(mockExportRecord, data);
        return Promise.resolve(1);
      }),
    };
    return builder;
  });

  return { getDatabase: () => mockDb };
});

describe("ExportIntegrityService", () => {
  let service: ExportIntegrityService;

  beforeEach(() => {
    service = new ExportIntegrityService();
    vi.clearAllMocks();
  });

  it("computes SHA-256 checksum for export content", () => {
    const checksum = service.computeChecksum("sample_export_data_csv_content");
    expect(checksum).toHaveLength(64);
  });

  it("digitally signs checksum and verifies signature", () => {
    const checksum = service.computeChecksum("test_data");
    const { signature, publicKey } = service.signChecksum(checksum);

    expect(signature).toBeDefined();
    expect(publicKey).toBeDefined();
    expect(service.verifySignature(checksum, signature)).toBe(true);
  });

  it("attaches integrity metadata to export record", async () => {
    const metadata = await service.attachIntegrityMetadata("exp-uuid-1", "/tmp/exports/exp-uuid-1.csv");
    expect(metadata.checksum).toHaveLength(64);
    expect(metadata.signature).toBeDefined();
  });

  it("verifies export integrity successfully when checksum matches", async () => {
    await service.attachIntegrityMetadata("exp-uuid-1", "/tmp/exports/exp-uuid-1.csv");
    const result = await service.verifyExportIntegrity("exp-uuid-1");

    expect(result.isVerified).toBe(true);
    expect(result.verificationStatus).toBe("verified");
  });
});
