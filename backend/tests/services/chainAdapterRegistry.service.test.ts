import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "crypto";

const mockQuery = vi.fn();
vi.mock("../../src/database/db.js", () => ({
  db: { query: (...args: any[]) => mockQuery(...args), connect: vi.fn() },
}));

import {
  chainAdapterRegistryService,
  canonicalizeAbi,
  computeAbiHash,
  buildRegistryVersion,
  adapterFingerprint,
  verifyAdapterSignature,
  decodeLogWithAbi,
  resolveEpochForBlock,
} from "../../src/services/chainAdapterRegistry.service.js";

const BRIDGE_ABI = [
  "event TokensLocked(address indexed token, address indexed sender, uint256 amount, bytes32 recipient, uint16 targetChain)",
  "event TokensUnlocked(address indexed token, address indexed recipient, uint256 amount)",
];

describe("chainAdapterRegistry pure helpers", () => {
  it("computeAbiHash is stable under entry order and whitespace", () => {
    const a = computeAbiHash(BRIDGE_ABI);
    const b = computeAbiHash([BRIDGE_ABI[1], `  ${BRIDGE_ABI[0]}  `]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("computeAbiHash changes when the ABI changes", () => {
    const changed = [...BRIDGE_ABI, "event Paused(address account)"];
    expect(computeAbiHash(changed)).not.toBe(computeAbiHash(BRIDGE_ABI));
  });

  it("buildRegistryVersion is deterministic and lower-cases the identity", () => {
    expect(buildRegistryVersion("ethereum", "0xABC", 3)).toBe("ethereum:0xabc:3");
  });

  it("adapterFingerprint is order-independent over its fields", () => {
    const base = {
      chainId: "ethereum",
      contractIdentity: "0xAbC",
      epoch: 2,
      abiHash: "deadbeef",
      deploymentFromBlock: 100,
    };
    expect(adapterFingerprint(base)).toBe(
      adapterFingerprint({ ...base, deploymentToBlock: null, proxyImplementation: null })
    );
    expect(adapterFingerprint(base)).not.toBe(adapterFingerprint({ ...base, epoch: 3 }));
  });

  it("verifyAdapterSignature round-trips an ed25519 signature and rejects tampering", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const fp = adapterFingerprint({
      chainId: "ethereum",
      contractIdentity: "0xabc",
      epoch: 1,
      abiHash: computeAbiHash(BRIDGE_ABI),
      deploymentFromBlock: 12_000_000,
    });
    const sig = cryptoSign(null, Buffer.from(fp), privateKey).toString("hex");

    expect(verifyAdapterSignature(fp, sig, pem, "ed25519")).toBe(true);
    expect(verifyAdapterSignature(fp + "x", sig, pem, "ed25519")).toBe(false);
    expect(verifyAdapterSignature(fp, "00" + sig.slice(2), pem, "ed25519")).toBe(false);
  });

  it("decodeLogWithAbi decodes an EVM event log deterministically", () => {
    // encoded TokensUnlocked(token, recipient=0x222..., amount=5e17)
    const rawLog = {
      topics: [
        "0xece684e11f49f06d351439e63189ad1703238b8040d90cf994901ca2b3da8d44",
        "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "0x0000000000000000000000002222222222222222222222222222222222222222",
      ],
      data: "0x00000000000000000000000000000000000000000000000006f05b59d3b20000",
    };
    const first = decodeLogWithAbi(BRIDGE_ABI, rawLog);
    const second = decodeLogWithAbi(BRIDGE_ABI, rawLog);
    expect(first).toEqual(second);
    expect(first.eventName).toBe("TokensUnlocked");
    expect(first.args.amount).toBe("500000000000000000");
  });

  it("resolveEpochForBlock picks the epoch whose range contains the block", () => {
    const epochs = [
      { deploymentFromBlock: 100, deploymentToBlock: 199 },
      { deploymentFromBlock: 200, deploymentToBlock: null },
    ];
    expect(resolveEpochForBlock(epochs, 150)).toBe(epochs[0]);
    expect(resolveEpochForBlock(epochs, 5_000)).toBe(epochs[1]);
    expect(resolveEpochForBlock(epochs, 50)).toBeNull();
  });

  it("canonicalizeAbi produces valid JSON", () => {
    expect(() => JSON.parse(canonicalizeAbi(BRIDGE_ABI))).not.toThrow();
  });
});

describe("chainAdapterRegistryService.stageAdapter", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseInput = {
    chainId: "ethereum",
    contractIdentity: "0x3ee18B2214AFF97000D974cf647E7C347E8fa585",
    abi: BRIDGE_ABI,
    deploymentFromBlock: 12_000_000,
  };

  it("refuses to stage an unsigned adapter", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // listEpochs
    await expect(chainAdapterRegistryService.stageAdapter(baseInput)).rejects.toThrow(
      /must be signed/i
    );
  });

  it("rejects a signature from an unknown signer", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // listEpochs
      .mockResolvedValueOnce({ rows: [] }); // signer lookup -> none
    await expect(
      chainAdapterRegistryService.stageAdapter({
        ...baseInput,
        signature: "abcd",
        signerKeyId: "ghost-key",
      })
    ).rejects.toThrow(/Unknown or revoked signer/i);
  });

  it("rejects a valid-looking but wrong signature", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // listEpochs
      .mockResolvedValueOnce({ rows: [{ algorithm: "ed25519", public_key_pem: pem }] });
    await expect(
      chainAdapterRegistryService.stageAdapter({
        ...baseInput,
        signature: "00".repeat(64),
        signerKeyId: "real-key",
      })
    ).rejects.toThrow(/signature verification failed/i);
  });

  it("accepts a correctly signed adapter and assigns epoch 1", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const fp = adapterFingerprint({
      chainId: baseInput.chainId,
      contractIdentity: baseInput.contractIdentity,
      epoch: 1,
      abiHash: computeAbiHash(BRIDGE_ABI),
      deploymentFromBlock: baseInput.deploymentFromBlock,
    });
    const sig = cryptoSign(null, Buffer.from(fp), privateKey).toString("hex");

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // listEpochs
      .mockResolvedValueOnce({ rows: [{ algorithm: "ed25519", public_key_pem: pem }] }) // signer
      .mockResolvedValueOnce({
        rows: [
          {
            id: "adapter-1",
            chain_id: baseInput.chainId,
            contract_identity: baseInput.contractIdentity,
            epoch: 1,
            registry_version: buildRegistryVersion(baseInput.chainId, baseInput.contractIdentity, 1),
            abi_json: BRIDGE_ABI,
            abi_hash: computeAbiHash(BRIDGE_ABI),
            deployment_from_block: baseInput.deploymentFromBlock,
            deployment_to_block: null,
            proxy_history: [],
            event_schemas: {},
            status: "staged",
            created_by: "system",
            created_at: new Date(),
          },
        ],
      }); // insert

    const adapter = await chainAdapterRegistryService.stageAdapter({
      ...baseInput,
      signature: sig,
      signerKeyId: "real-key",
    });
    expect(adapter.epoch).toBe(1);
    expect(adapter.status).toBe("staged");
    const insertCall = mockQuery.mock.calls.find((c) => String(c[0]).includes("INSERT INTO chain_adapters"));
    expect(insertCall).toBeTruthy();
  });

  it("allows unsigned staging only with the explicit escape hatch", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // listEpochs
      .mockResolvedValueOnce({
        rows: [{ id: "a", chain_id: "ethereum", contract_identity: "0xabc", epoch: 1, registry_version: "ethereum:0xabc:1", abi_json: BRIDGE_ABI, abi_hash: computeAbiHash(BRIDGE_ABI), deployment_from_block: 1, deployment_to_block: null, proxy_history: [], event_schemas: {}, status: "staged", created_by: "system", created_at: new Date() }],
      });
    const adapter = await chainAdapterRegistryService.stageAdapter({ ...baseInput, allowUnsigned: true });
    expect(adapter.status).toBe("staged");
  });
});
