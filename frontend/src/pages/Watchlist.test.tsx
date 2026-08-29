import { fireEvent, render, screen, waitFor } from "../test/utils";
import { WatchlistProvider } from "../hooks/useWatchlist";
import WatchlistPage from "./Watchlist";

vi.mock("../services/api", () => ({
  getAssetPrice: vi.fn().mockResolvedValue(null),
  getAssetHealth: vi.fn().mockResolvedValue(null),
}));

vi.mock("../components/WatchlistManager", () => ({
  WatchlistManager: () => <div data-testid="watchlist-manager" />,
}));

const STORAGE_KEY = "bridgewatch.watchlists.v1";

function seedWatchlists() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      activeListId: "default",
      lists: [
        { id: "default", name: "Default", assets: ["XLM", "USDC"] },
        { id: "starred", name: "Starred", assets: [] },
      ],
    })
  );
}

function Harness() {
  return (
    <WatchlistProvider>
      <WatchlistPage />
    </WatchlistProvider>
  );
}

describe("WatchlistPage bulk actions", () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedWatchlists();
  });

  it("shows the bulk action toolbar once an asset is selected", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select XLM" }));

    expect(screen.getByRole("toolbar", { name: "Bulk watchlist actions" })).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("removes selected assets from the active watchlist", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select XLM" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Selected" }));

    await waitFor(() => {
      expect(screen.queryByText("XLM")).not.toBeInTheDocument();
    });
    expect(screen.getByText("USDC")).toBeInTheDocument();
  });

  it("moves selected assets to another watchlist", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select XLM" }));
    fireEvent.change(screen.getByDisplayValue("Move to watchlist…"), {
      target: { value: "starred" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => {
      expect(screen.queryByText("XLM")).not.toBeInTheDocument();
    });

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    const starred = stored.lists.find((l: { id: string }) => l.id === "starred");
    expect(starred.assets).toContain("XLM");
  });
});
