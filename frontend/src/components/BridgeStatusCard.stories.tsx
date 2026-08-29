import type { Meta, StoryObj } from "@storybook/react";
import BridgeStatusCard from "./BridgeStatusCard";
import FavoriteTagChip from "./favorites/FavoriteTagChip";
import { useState } from "react";

const meta = {
  title: "Bridge Watch/Bridges/BridgeStatusCard",
  component: BridgeStatusCard,
  tags: ["autodocs"],
} satisfies Meta<typeof BridgeStatusCard>;

export default meta;

type Story = StoryObj<typeof BridgeStatusCard>;

const base = {
  name: "Example Bridge",
  status: "healthy" as const,
  totalValueLocked: 12_500_000,
  supplyOnStellar: 5_200_000,
  supplyOnSource: 5_180_000,
  mismatchPercentage: 0.12,
};

export const Default: Story = {
  args: {
    ...base,
  },
};

export const WithFavorite: Story = {
  render: () => {
    const [active, setActive] = useState(false);
    return (
      <BridgeStatusCard
        {...base}
        topRight={
          <FavoriteTagChip
            compact
            label={base.name}
            active={active}
            onToggle={() => setActive((v) => !v)}
          />
        }
      />
    );
  },
};
