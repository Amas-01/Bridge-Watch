import type { 
  Asset, 
  Bridge, 
  HealthScore, 
  HealthFactors, 
  DependencyGraph,
  AssetWithHealth
} from "../types";

/**
 * Deterministic seeded random number generator for factories.
 */
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export const buildAsset = (overrides?: Partial<Asset>, seed = 1): Asset => ({
  symbol: overrides?.symbol ?? (seededRandom(seed) > 0.5 ? "XLM" : "USDC"),
  name: overrides?.name ?? (seededRandom(seed) > 0.5 ? "Stellar Lumens" : "USD Coin"),
  ...overrides,
});

export const buildHealthFactors = (overrides?: Partial<HealthFactors>, seed = 1): HealthFactors => ({
  liquidityDepth: overrides?.liquidityDepth ?? Math.floor(seededRandom(seed) * 100),
  priceStability: overrides?.priceStability ?? Math.floor(seededRandom(seed + 1) * 100),
  bridgeUptime: overrides?.bridgeUptime ?? Math.floor(seededRandom(seed + 2) * 100),
  reserveBacking: overrides?.reserveBacking ?? Math.floor(seededRandom(seed + 3) * 100),
  volumeTrend: overrides?.volumeTrend ?? Math.floor(seededRandom(seed + 4) * 100),
  ...overrides,
});

export const buildHealthScore = (symbol: string, overrides?: Partial<HealthScore>, seed = 1): HealthScore => ({
  symbol,
  overallScore: overrides?.overallScore ?? Math.floor(seededRandom(seed) * 40 + 60),
  factors: buildHealthFactors(overrides?.factors, seed),
  trend: overrides?.trend ?? (seededRandom(seed + 5) > 0.5 ? "improving" : "stable"),
  lastUpdated: overrides?.lastUpdated ?? new Date().toISOString(),
  ...overrides,
});

export const buildAssetWithHealth = (overrides?: Partial<AssetWithHealth>, seed = 1): AssetWithHealth => {
  const asset = buildAsset(overrides, seed);
  return {
    ...asset,
    health: buildHealthScore(asset.symbol, overrides?.health ?? undefined, seed),
  };
};

export const buildBridge = (overrides?: Partial<Bridge>, seed = 1): Bridge => ({
  name: overrides?.name ?? (seededRandom(seed) > 0.5 ? "Stellar-Ethereum" : "Stellar-Celo"),
  status: overrides?.status ?? (seededRandom(seed + 1) > 0.8 ? "degraded" : "healthy"),
  totalValueLocked: overrides?.totalValueLocked ?? Math.floor(seededRandom(seed + 2) * 1000000),
  supplyOnStellar: overrides?.supplyOnStellar ?? 500000,
  supplyOnSource: overrides?.supplyOnSource ?? 500000,
  mismatchPercentage: overrides?.mismatchPercentage ?? 0,
  ...overrides,
});

export const buildDependencyGraph = (overrides?: Partial<DependencyGraph>, seed = 1): DependencyGraph => {
  const nodeCount = overrides?.summary?.totalNodes ?? 5;
  const nodes = overrides?.nodes ?? Array.from({ length: nodeCount }).map((_, i) => ({
    id: `node-${i}`,
    label: `Service ${i}`,
    description: `Description for service ${i}`,
    type: seededRandom(seed + i) > 0.5 ? "bridge" : "rpc",
    status: (seededRandom(seed + i + 10) > 0.9 ? "degraded" : "healthy") as "degraded" | "healthy",
    impactHint: "High impact",
  }));

  const edges = overrides?.edges ?? Array.from({ length: nodeCount - 1 }).map((_, i) => ({
    from: nodes[i].id,
    to: nodes[i + 1].id,
    kind: "dependency",
  }));

  return {
    summary: {
      totalNodes: nodes.length,
      degradedServices: nodes.filter(n => n.status === "degraded").length,
      downServices: nodes.filter(n => n.status === "down").length,
      ...overrides?.summary,
    },
    nodes,
    edges,
  };
};
