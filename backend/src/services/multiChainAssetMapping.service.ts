/**
 * Multi-Chain Asset Mapping Service
 * Issue #1140
 */

export interface ChainAssetDetails {
  chain: string;
  contractAddress: string;
  symbol: string;
  decimals: number;
  isNative: boolean;
  bridgeContract?: string;
}

export interface MultiChainAssetMapping {
  canonicalAssetId: string;
  commonName: string;
  mappings: ChainAssetDetails[];
  verified: boolean;
  updatedAt: string;
}

export class MultiChainAssetMappingService {
  private mappings: Map<string, MultiChainAssetMapping> = new Map();

  constructor() {
    // Seed default USDC multi-chain mapping
    this.mappings.set("USDC", {
      canonicalAssetId: "USDC",
      commonName: "USD Coin",
      mappings: [
        {
          chain: "stellar",
          contractAddress: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
          symbol: "USDC",
          decimals: 7,
          isNative: false,
        },
        {
          chain: "ethereum",
          contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          symbol: "USDC",
          decimals: 6,
          isNative: false,
        },
      ],
      verified: true,
      updatedAt: new Date().toISOString(),
    });
  }

  public async registerAssetMapping(
    assetId: string,
    commonName: string,
    chainDetails: ChainAssetDetails[],
  ): Promise<MultiChainAssetMapping> {
    const record: MultiChainAssetMapping = {
      canonicalAssetId: assetId,
      commonName,
      mappings: chainDetails,
      verified: true,
      updatedAt: new Date().toISOString(),
    };

    this.mappings.set(assetId, record);
    return record;
  }

  public async getAssetMapping(assetId: string): Promise<MultiChainAssetMapping | null> {
    return this.mappings.get(assetId) ?? null;
  }

  public async listMappedAssets(): Promise<MultiChainAssetMapping[]> {
    return Array.from(this.mappings.values());
  }

  public validateAddress(chain: string, address: string): boolean {
    if (chain.toLowerCase() === "stellar") {
      return address.length === 56 && (address.startsWith("G") || address.startsWith("C"));
    }
    if (chain.toLowerCase() === "ethereum" || chain.toLowerCase() === "polygon") {
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
    return address.length > 0;
  }
}

export const multiChainAssetMappingService = new MultiChainAssetMappingService();
