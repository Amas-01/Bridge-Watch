import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HealthScoreCard from "./HealthScoreCard";

const factors = {
  liquidityDepth: 82,
  priceStability: 76,
  bridgeUptime: 91,
  reserveBacking: 88,
  volumeTrend: 70,
};

const mockPoints = [
  { timestamp: "2024-01-01T00:00:00.000Z", value: 78 },
  { timestamp: "2024-01-02T00:00:00.000Z", value: 80 },
  { timestamp: "2024-01-03T00:00:00.000Z", value: 84 },
];

function withSparklineData(symbol: string) {
  return (Story: ComponentType) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["sparkline", "health", symbol, "7d"], mockPoints);
    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  };
}

const meta = {
  title: "Bridge Watch/Assets/HealthScoreCard",
  component: HealthScoreCard,
  tags: ["autodocs"],
} satisfies Meta<typeof HealthScoreCard>;

export default meta;

type Story = StoryObj<typeof HealthScoreCard>;

export const Loaded: Story = {
  decorators: [withSparklineData("USDC")],
  args: {
    symbol: "USDC",
    name: "USD Coin",
    overallScore: 84,
    factors,
    trend: "stable",
    compact: false,
  },
};

export const Compact: Story = {
  decorators: [withSparklineData("XLM")],
  args: {
    symbol: "XLM",
    name: "Stellar Lumens",
    overallScore: 72,
    factors,
    trend: "improving",
    compact: true,
  },
};
