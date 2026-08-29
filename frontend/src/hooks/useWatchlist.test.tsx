import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { useWatchlist, WatchlistProvider } from "./useWatchlist";
import React from "react";

// Mock MSW server setup to fulfill established frontend testing patterns,
// even though useWatchlist relies purely on localStorage and has no API interactions.
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe("useWatchlist", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WatchlistProvider>{children}</WatchlistProvider>
  );

  it("should initialize with a default watchlist", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    expect(result.current.watchlists).toHaveLength(1);
    expect(result.current.watchlists[0].id).toBe("default");
    expect(result.current.watchlists[0].name).toBe("Default");
    expect(result.current.activeListId).toBe("default");
  });

  it("should add and remove assets", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    act(() => {
      result.current.addAsset("USDC");
    });
    expect(result.current.activeSymbols).toContain("USDC");
    expect(result.current.isInWatchlist("USDC")).toBe(true);

    act(() => {
      result.current.addAsset("EURC");
    });
    expect(result.current.activeSymbols).toContain("EURC");

    act(() => {
      result.current.removeAsset("USDC");
    });
    expect(result.current.activeSymbols).not.toContain("USDC");
    expect(result.current.isInWatchlist("USDC")).toBe(false);
    expect(result.current.activeSymbols).toContain("EURC");
  });

  it("should ignore empty or duplicate assets", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    act(() => {
      result.current.addAsset("USDC");
      result.current.addAsset("USDC");
      result.current.addAsset("  ");
    });

    expect(result.current.activeSymbols).toEqual(["USDC"]);
  });

  it("should persist state to localStorage", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    act(() => {
      result.current.addAsset("BTC");
    });

    const storedRaw = window.localStorage.getItem("bridgewatch.watchlists.v1");
    expect(storedRaw).toBeTruthy();
    
    const stored = JSON.parse(storedRaw!);
    expect(stored.lists[0].assets).toContain("BTC");
  });

  it("should reorder assets", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    act(() => {
      result.current.addAsset("USDC");
      result.current.addAsset("EURC");
      result.current.addAsset("BTC");
    });

    expect(result.current.activeSymbols).toEqual(["USDC", "EURC", "BTC"]);

    act(() => {
      result.current.reorderAsset("BTC", "up");
    });

    expect(result.current.activeSymbols).toEqual(["USDC", "BTC", "EURC"]);

    act(() => {
      result.current.reorderAsset("USDC", "down");
    });

    expect(result.current.activeSymbols).toEqual(["BTC", "USDC", "EURC"]);
  });

  it("should create, rename, and delete watchlists", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    act(() => {
      result.current.createWatchlist("My Custom List");
    });

    expect(result.current.watchlists).toHaveLength(2);
    expect(result.current.activeListId).toBe("my-custom-list");
    
    act(() => {
      result.current.renameWatchlist("my-custom-list", "Favorites");
    });

    const activeList = result.current.watchlists.find(l => l.id === "my-custom-list");
    expect(activeList?.name).toBe("Favorites");

    act(() => {
      result.current.deleteWatchlist("my-custom-list");
    });

    expect(result.current.watchlists).toHaveLength(1);
    expect(result.current.activeListId).toBe("default");
  });

  it("should clear active watchlist assets", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    act(() => {
      result.current.addAsset("USDC");
    });

    expect(result.current.activeSymbols).toContain("USDC");

    act(() => {
      result.current.clearActiveWatchlist();
    });

    expect(result.current.activeSymbols).toHaveLength(0);
  });

  it("should export and import watchlists", () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    act(() => {
      result.current.addAsset("TEST");
    });

    const exported = result.current.exportWatchlists();

    act(() => {
      result.current.removeAsset("TEST");
    });

    expect(result.current.activeSymbols).not.toContain("TEST");

    let imported = false;
    act(() => {
      imported = result.current.importWatchlists(exported);
    });

    expect(imported).toBe(true);
    expect(result.current.activeSymbols).toContain("TEST");
  });
});
