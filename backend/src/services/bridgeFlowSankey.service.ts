/**
 * Bridge Inflow Outflow Sankey Service
 * Issue #1156
 */

export interface SankeyNode {
  id: string;
  name: string;
  type: "source_chain" | "bridge_contract" | "destination_chain";
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number; // Volume in token units
  usdValue: number;
  asset: string;
}

export interface BridgeFlowSankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
  timeframe: string;
  totalInflowUsd: number;
  totalOutflowUsd: number;
  netFlowUsd: number;
}

export class BridgeFlowSankeyService {
  public generateSankeyFlow(
    flows: Array<{
      sourceChain: string;
      bridge: string;
      targetChain: string;
      asset: string;
      volume: number;
      usdValue: number;
    }>,
    timeframe: string = "24h",
  ): BridgeFlowSankeyData {
    const nodeMap = new Map<string, SankeyNode>();
    const links: SankeyLink[] = [];

    let totalInflowUsd = 0;
    let totalOutflowUsd = 0;

    for (const f of flows) {
      if (!nodeMap.has(f.sourceChain)) {
        nodeMap.set(f.sourceChain, {
          id: f.sourceChain,
          name: f.sourceChain.toUpperCase(),
          type: "source_chain",
        });
      }

      if (!nodeMap.has(f.bridge)) {
        nodeMap.set(f.bridge, {
          id: f.bridge,
          name: f.bridge,
          type: "bridge_contract",
        });
      }

      if (!nodeMap.has(f.targetChain)) {
        nodeMap.set(f.targetChain, {
          id: f.targetChain,
          name: f.targetChain.toUpperCase(),
          type: "destination_chain",
        });
      }

      // Source -> Bridge link
      links.push({
        source: f.sourceChain,
        target: f.bridge,
        value: f.volume,
        usdValue: f.usdValue,
        asset: f.asset,
      });

      // Bridge -> Target link
      links.push({
        source: f.bridge,
        target: f.targetChain,
        value: f.volume,
        usdValue: f.usdValue,
        asset: f.asset,
      });

      totalInflowUsd += f.usdValue;
      totalOutflowUsd += f.usdValue;
    }

    return {
      nodes: Array.from(nodeMap.values()),
      links,
      timeframe,
      totalInflowUsd,
      totalOutflowUsd,
      netFlowUsd: totalInflowUsd - totalOutflowUsd,
    };
  }
}

export const bridgeFlowSankeyService = new BridgeFlowSankeyService();
