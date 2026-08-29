import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AssetSelector from "./AssetSelector";

describe("AssetSelector", () => {
  it("filters the visible asset buttons by category", async () => {
    const user = userEvent.setup();

    render(
      <AssetSelector
        assets={[
          { symbol: "USDC", name: "USD Coin", category: "stablecoin" },
          { symbol: "XLM", name: "Stellar", category: "native" },
        ]}
        selected={[]}
        max={4}
        onToggle={vi.fn()}
        isLoading={false}
        activeCategory="all"
        onCategoryChange={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "USDC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "XLM" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /native/i }));

    expect(screen.queryByRole("button", { name: "USDC" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "XLM" })).toBeInTheDocument();
  });
});
