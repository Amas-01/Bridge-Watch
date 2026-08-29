/**
 * Storybook stories for RecentActivityTimeline component
 */

import type { Meta, StoryObj } from "@storybook/react";
import { BrowserRouter } from "react-router-dom";
import RecentActivityTimeline from "./RecentActivityTimeline";
const meta: Meta<typeof RecentActivityTimeline> = {
  title: "Components/Timeline/RecentActivityTimeline",
  component: RecentActivityTimeline,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <div className="bg-stellar-dark p-6 min-h-screen">
          <Story />
        </div>
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof RecentActivityTimeline>;

export const Default: Story = {
  args: {
    maxEvents: 50,
    defaultMode: "compact",
    showFilters: true,
    showHeader: true,
  },
};

export const CompactMode: Story = {
  args: {
    defaultMode: "compact",
    showFilters: true,
    showHeader: true,
  },
};

export const ExpandedMode: Story = {
  args: {
    defaultMode: "expanded",
    showFilters: true,
    showHeader: true,
  },
};

export const WithoutFilters: Story = {
  args: {
    showFilters: false,
    showHeader: true,
  },
};

export const WithoutHeader: Story = {
  args: {
    showFilters: true,
    showHeader: false,
  },
};

export const LimitedEvents: Story = {
  args: {
    maxEvents: 3,
    showFilters: true,
    showHeader: true,
  },
};

export const WithDefaultFilters: Story = {
  args: {
    defaultFilters: {
      types: ["alert", "bridge"],
      severities: ["critical", "warning"],
    },
    showFilters: true,
    showHeader: true,
  },
};

export const AssetFocused: Story = {
  args: {
    defaultFilters: {
      assetSymbol: "USDC",
    },
    showFilters: true,
    showHeader: true,
  },
};

export const BridgeFocused: Story = {
  args: {
    defaultFilters: {
      bridgeName: "Circle",
    },
    showFilters: true,
    showHeader: true,
  },
};

export const CriticalOnly: Story = {
  args: {
    defaultFilters: {
      severities: ["critical"],
    },
    showFilters: true,
    showHeader: true,
  },
};
