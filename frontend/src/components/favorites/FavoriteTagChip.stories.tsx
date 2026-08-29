import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import FavoriteTagChip from "./FavoriteTagChip";

const meta = {
  title: "Bridge Watch/Favorites/FavoriteTagChip",
  component: FavoriteTagChip,
  tags: ["autodocs"],
  argTypes: {
    active: { control: "boolean" },
    compact: { control: "boolean" },
    label: { control: "text" },
  },
} satisfies Meta<typeof FavoriteTagChip>;

export default meta;

type Story = StoryObj<typeof FavoriteTagChip>;

export const Interactive: Story = {
  render: function InteractiveChip(args) {
    const [active, setActive] = useState(args.active ?? false);
    return (
      <FavoriteTagChip
        {...args}
        active={active}
        onToggle={() => setActive((a) => !a)}
      />
    );
  },
  args: {
    label: "USDC",
    compact: false,
    active: false,
  },
};

export const Active: Story = {
  args: {
    label: "ETH Bridge",
    active: true,
    compact: true,
    onToggle: () => {},
  },
};
