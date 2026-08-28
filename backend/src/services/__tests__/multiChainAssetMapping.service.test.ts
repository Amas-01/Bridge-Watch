import { describe, it, expect, beforeEach } from "vitest";
import { MultiChainAssetMappingService } from "../multiChainAssetMapping.service.js";

describe("MultiChainAssetMappingService (#1140)", () => {
  let service: MultiChainAssetMappingService;

  beforeEach(() => {
    service = new MultiChainAssetMappingService();
  });

  it("should return default multi-chain asset mapping", async () => {
    const mapping = await service.getAssetMapping("USDC");
    expect(mapping).toBeDefined();
    expect(mapping?.mappings.length).toBe(2);
    expect(mapping?.mappings.some((m) => m.chain === "stellar")).toBe(true);
  });

  it("should register new cross-chain mapping", async () => {
    const newMapping = await service.registerAssetMapping("ETH", "Ethereum", [
      {
        chain: "ethereum",
        contractAddress: "0x0000000000000000000000000000000000000000",
        symbol: "ETH",
        decimals: 18,
        isNative: true,
      },
      {
        chain: "stellar",
        contractAddress: "CDETH1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12",
        symbol: "wETH",
        decimals: 7,
        isNative: false,
      },
    ]);

    expect(newMapping.verified).toBe(true);
    const lookup = await service.getAssetMapping("ETH");
    expect(lookup?.commonName).toBe("Ethereum");
  });

  it("should validate address formats per chain", () => {
    expect(service.validateAddress("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")).toBe(true);
    expect(service.validateAddress("ethereum", "invalid-eth")).toBe(false);
    expect(
      service.validateAddress(
        "stellar",
        "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
      ),
    ).toBe(true);
  });
});
