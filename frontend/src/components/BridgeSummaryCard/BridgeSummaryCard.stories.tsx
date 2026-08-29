import type { Meta, StoryObj } from "@storybook/react";
import BridgeSummaryCard from "./BridgeSummaryCard";
import BridgeSummaryGrid from "./BridgeSummaryGrid";
import type { BridgeSummary } from "../../types";

const meta = {
  title: "Components/BridgeSummaryCard",
  component: BridgeSummaryCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof BridgeSummaryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Mock data
const healthyBridge: BridgeSummary = {
  id: "circle-bridge",
  name: "Circle",
  status: "healthy",
  coverage: 99.5,
  performance: 234.5,
  totalValueLocked: 500_000_000,
  supplyOnStellar: 400_000_000,
  supplyOnSource: 400_000_000,
  mismatchPercentage: 0,
  lastUpdated: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
};

const degradedBridge: BridgeSummary = {
  id: "wormhole-bridge",
  name: "Wormhole",
  status: "degraded",
  coverage: 95.2,
  performance: 450.8,
  totalValueLocked: 200_000_000,
  supplyOnStellar: 180_000_000,
  supplyOnSource: 190_000_000,
  mismatchPercentage: 5.26,
  lastUpdated: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
};

const downBridge: BridgeSummary = {
  id: "down-bridge",
  name: "Down Bridge",
  status: "down",
  coverage: 0,
  performance: 9999,
  totalValueLocked: 50_000_000,
  supplyOnStellar: 40_000_000,
  supplyOnSource: 50_000_000,
  mismatchPercentage: 20,
  lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
};

// Standard Variant
export const StandardHealthy: Story = {
  args: {
    summary: healthyBridge,
    variant: "standard",
  },
};

export const StandardDegraded: Story = {
  args: {
    summary: degradedBridge,
    variant: "standard",
  },
};

export const StandardDown: Story = {
  args: {
    summary: downBridge,
    variant: "standard",
  },
};

// Compact Variant
export const CompactHealthy: Story = {
  args: {
    summary: healthyBridge,
    variant: "compact",
  },
};

export const CompactDegraded: Story = {
  args: {
    summary: degradedBridge,
    variant: "compact",
  },
};

// Detailed Variant
export const DetailedHealthy: Story = {
  args: {
    summary: healthyBridge,
    variant: "detailed",
  },
};

export const DetailedDegraded: Story = {
  args: {
    summary: degradedBridge,
    variant: "detailed",
  },
};

// Loading State
export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

// Error State
export const Error: Story = {
  args: {
    isError: true,
    error: "Failed to fetch bridge data",
  },
};

export const ErrorNoMessage: Story = {
  args: {
    isError: true,
  },
};

// Grid Stories
const gridMeta = {
  title: "Components/BridgeSummaryGrid",
  component: BridgeSummaryGrid,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof BridgeSummaryGrid>;

export const GridStories = gridMeta;

type GridStory = StoryObj<typeof BridgeSummaryGrid>;

const mockBridges: BridgeSummary[] = [
  healthyBridge,
  degradedBridge,
  downBridge,
  {
    id: "bridging-protocol",
    name: "Bridging Protocol",
    status: "healthy",
    coverage: 98.0,
    performance: 300.0,
    totalValueLocked: 300_000_000,
    supplyOnStellar: 250_000_000,
    supplyOnSource: 250_000_000,
    mismatchPercentage: 0.5,
    lastUpdated: new Date().toISOString(),
  },
];

export const GridPopulated: GridStory = {
  args: {
    summaries: mockBridges,
    variant: "standard",
  },
};

export const GridCompact: GridStory = {
  args: {
    summaries: mockBridges,
    variant: "compact",
  },
};

export const GridDetailed: GridStory = {
  args: {
    summaries: mockBridges,
    variant: "detailed",
  },
};

export const GridLoading: GridStory = {
  args: {
    isLoading: true,
    loadingCount: 4,
  },
};

export const GridError: GridStory = {
  args: {
    isError: true,
    error: "Unable to connect to bridge service",
  },
};

export const GridEmpty: GridStory = {
  args: {
    summaries: [],
  },
};

export const GridLargeList: GridStory = {
  render: () => {
    const largeBridgeList = Array.from({ length: 12 }, (_, i) => ({
      ...healthyBridge,
      id: `bridge-${i}`,
      name: `Bridge ${i + 1}`,
    }));
    return <BridgeSummaryGrid summaries={largeBridgeList} variant="standard" />;
  },
};
