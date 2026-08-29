/**
 * Tests for EvmLockDetailsPanel component
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EvmLockDetailsPanel from "./EvmLockDetailsPanel";
import { useBridgeStats } from "../hooks/useBridges";
import type { BridgeStats } from "../types";

vi.mock("../hooks/useBridges");

const mockUseBridgeStats = vi.mocked(useBridgeStats);

const baseStats: BridgeStats = {
  name: "Wormhole",
  volume24h: 0,
  volume7d: 0,
  volume30d: 0,
  totalTransactions: 0,
  averageTransferTime: 0,
  uptime30d: 0,
  evmLockDetails: [
    {
      chain: "ethereum",
      contractAddress: "0xabc123",
      tokenAddress: "0xdef456",
      assetSymbol: "USDC",
      lockedAmount: "1234567.0000034",
      isPaused: false,
      blockNumber: 100,
      timestamp: Date.now(),
      error: null,
    },
    {
      chain: "polygon",
      contractAddress: "0xerr000",
      tokenAddress: "0xdef456",
      assetSymbol: "USDC",
      lockedAmount: "0",
      isPaused: false,
      blockNumber: 100,
      timestamp: Date.now(),
      error: "RPC timeout",
    },
  ],
};

function mockStats(overrides: Partial<ReturnType<typeof useBridgeStats>> = {}) {
  mockUseBridgeStats.mockReturnValue({
    data: baseStats,
    isLoading: false,
    ...overrides,
  } as ReturnType<typeof useBridgeStats>);
}

describe("EvmLockDetailsPanel", () => {
  it("renders nothing while loading", () => {
    mockUseBridgeStats.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useBridgeStats>);

    const { container } = render(<EvmLockDetailsPanel bridgeName="Wormhole" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no EVM lock details", () => {
    mockUseBridgeStats.mockReturnValue({
      data: { ...baseStats, evmLockDetails: [] },
      isLoading: false,
    } as ReturnType<typeof useBridgeStats>);

    const { container } = render(<EvmLockDetailsPanel bridgeName="Wormhole" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("defaults to 4 decimal places for the locked amount", () => {
    mockStats();
    render(<EvmLockDetailsPanel bridgeName="Wormhole" />);

    expect(screen.getByText("1,234,567.0000")).toBeInTheDocument();
  });

  it("shows an em dash for rows with an error instead of a formatted amount", () => {
    mockStats();
    render(<EvmLockDetailsPanel bridgeName="Wormhole" />);

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("reformats the locked amount to 7 decimal places when selected, revealing micro-amount precision", async () => {
    mockStats();
    render(<EvmLockDetailsPanel bridgeName="Wormhole" />);

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText("Locked amount decimal precision"),
      "7",
    );

    expect(screen.getByText("1,234,567.0000034")).toBeInTheDocument();
    expect(screen.queryByText("1,234,567.0000")).not.toBeInTheDocument();
  });

  it("reformats the locked amount to 2 decimal places when selected", async () => {
    mockStats();
    render(<EvmLockDetailsPanel bridgeName="Wormhole" />);

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText("Locked amount decimal precision"),
      "2",
    );

    expect(screen.getByText("1,234,567.00")).toBeInTheDocument();
  });
});
