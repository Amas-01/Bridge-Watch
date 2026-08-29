import { describe, it, expect, beforeEach } from "vitest";
import { BridgeFlowSankeyService } from "../bridgeFlowSankey.service.js";

describe("BridgeFlowSankeyService (#1156)", () => {
  let service: BridgeFlowSankeyService;

  beforeEach(() => {
    service = new BridgeFlowSankeyService();
  });

  it("should generate valid Sankey nodes and links data", () => {
    const flows = [
      {
        sourceChain: "ethereum",
        bridge: "StellarBridge",
        targetChain: "stellar",
        asset: "USDC",
        volume: 100000,
        usdValue: 100000,
      },
      {
        sourceChain: "polygon",
        bridge: "StellarBridge",
        targetChain: "stellar",
        asset: "USDT",
        volume: 50000,
        usdValue: 50000,
      },
    ];

    const sankey = service.generateSankeyFlow(flows, "24h");

    expect(sankey.nodes.length).toBe(4); // ethereum, polygon, StellarBridge, stellar
    expect(sankey.links.length).toBe(4); // 2 source->bridge + 2 bridge->target
    expect(sankey.totalInflowUsd).toBe(150000);
  });
});
