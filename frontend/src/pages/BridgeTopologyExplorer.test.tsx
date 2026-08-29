import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BridgeTopologyExplorer from "./BridgeTopologyExplorer";

vi.mock("../hooks/useSupplyChainData", () => ({
  useSupplyChainData: () => ({
    data: {
      nodes: [
        {
          id: "stellar",
          label: "Stellar",
          chain: "stellar",
          color: "#7B64FF",
          totalSupplyUsd: 1000000,
          lockedSupplyUsd: 500000,
          healthScore: 95,
          assets: [{ symbol: "USDC", lockedAmount: 100, mintedAmount: 100 }],
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "stellar",
          target: "ethereum",
          bridgeName: "Allbridge",
          protocol: "allbridge",
          volume24hUsd: 250000,
          assets: ["USDC"],
          status: "healthy",
          flowDirection: "bidirectional",
          latencyMs: 120,
        },
      ],
      totalSupplyUsd: 1000000,
      totalBridgeVolumeUsd: 250000,
      lastUpdated: "2026-01-01T00:00:00.000Z",
    },
    isLoading: false,
    error: null,
  }),
}));

describe("BridgeTopologyExplorer", () => {
  it("renders topology filters and graph region", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <BridgeTopologyExplorer />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Bridge Topology Explorer" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filter chains")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter bridges")).toBeInTheDocument();
    expect(screen.getAllByText("Stellar").length).toBeGreaterThan(0);
  });
});
