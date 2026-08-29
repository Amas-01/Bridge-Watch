import { describe, it, expect, beforeEach } from "vitest";
import {
  useUserPreferencesStore,
  selectUserPreferences,
  selectAlertThresholds,
  selectFavoriteAssets,
} from "./userPreferencesStore";

const PERSIST_KEY = "bridge-watch-user-preferences";

function resetStoreState() {
  useUserPreferencesStore.setState(
    useUserPreferencesStore.getInitialState(),
    true
  );
}

describe("userPreferencesStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreState();
  });

  it("initializes with the default preferences", () => {
    const state = useUserPreferencesStore.getState();

    expect(state.defaultAsset).toBe("USDC");
    expect(state.defaultTimeRange).toBe("24h");
    expect(state.refreshInterval).toBe(30000);
    expect(state.dashboardLayout).toBe("grid");
    expect(state.favoriteAssets).toEqual([]);
    expect(state.favoriteBridges).toEqual([]);
    expect(state.alertThresholds).toEqual({
      priceDeviation: 0.02,
      supplyMismatch: 0.1,
      healthScoreDrop: 10,
    });
  });

  describe("setPreference / setPreferences", () => {
    it("updates a single preference by key", () => {
      useUserPreferencesStore.getState().setPreference("defaultAsset", "XLM");
      expect(useUserPreferencesStore.getState().defaultAsset).toBe("XLM");
    });

    it("merges a partial set of preferences", () => {
      useUserPreferencesStore.getState().setPreferences({
        dashboardLayout: "list",
        soundEnabled: true,
      });

      const state = useUserPreferencesStore.getState();
      expect(state.dashboardLayout).toBe("list");
      expect(state.soundEnabled).toBe(true);
      // Untouched preferences keep their defaults.
      expect(state.defaultAsset).toBe("USDC");
    });

    it("resets all preferences back to defaults", () => {
      const store = useUserPreferencesStore.getState();
      store.setPreference("defaultAsset", "XLM");
      store.addFavoriteAsset("USDC");

      store.resetPreferences();

      const state = useUserPreferencesStore.getState();
      expect(state.defaultAsset).toBe("USDC");
      expect(state.favoriteAssets).toEqual([]);
    });
  });

  describe("favorite assets", () => {
    it("adds a favorite asset", () => {
      useUserPreferencesStore.getState().addFavoriteAsset("USDC");
      expect(useUserPreferencesStore.getState().favoriteAssets).toEqual(["USDC"]);
    });

    it("does not add duplicate favorite assets", () => {
      const store = useUserPreferencesStore.getState();
      store.addFavoriteAsset("USDC");
      store.addFavoriteAsset("USDC");

      expect(useUserPreferencesStore.getState().favoriteAssets).toEqual(["USDC"]);
    });

    it("removes a favorite asset", () => {
      const store = useUserPreferencesStore.getState();
      store.addFavoriteAsset("USDC");
      store.addFavoriteAsset("XLM");

      store.removeFavoriteAsset("USDC");

      expect(useUserPreferencesStore.getState().favoriteAssets).toEqual(["XLM"]);
    });
  });

  describe("favorite bridges", () => {
    it("toggles a bridge on and off", () => {
      const store = useUserPreferencesStore.getState();

      store.toggleFavoriteBridge("Circle");
      expect(useUserPreferencesStore.getState().favoriteBridges).toEqual(["Circle"]);

      store.toggleFavoriteBridge("Circle");
      expect(useUserPreferencesStore.getState().favoriteBridges).toEqual([]);
    });
  });

  describe("misc setters", () => {
    it("sets the favorites filter mode", () => {
      useUserPreferencesStore.getState().setFavoritesFilterMode("favorites");
      expect(useUserPreferencesStore.getState().favoritesFilterMode).toBe(
        "favorites"
      );
    });

    it("toggles the sidebar collapsed state", () => {
      const store = useUserPreferencesStore.getState();
      expect(useUserPreferencesStore.getState().sidebarCollapsed).toBe(false);

      store.toggleSidebar();
      expect(useUserPreferencesStore.getState().sidebarCollapsed).toBe(true);

      store.toggleSidebar();
      expect(useUserPreferencesStore.getState().sidebarCollapsed).toBe(false);
    });

    it("updates a single alert threshold without clobbering the others", () => {
      useUserPreferencesStore.getState().setAlertThreshold("priceDeviation", 0.05);

      const thresholds = useUserPreferencesStore.getState().alertThresholds;
      expect(thresholds.priceDeviation).toBe(0.05);
      expect(thresholds.supplyMismatch).toBe(0.1);
      expect(thresholds.healthScoreDrop).toBe(10);
    });
  });

  describe("persistence", () => {
    it("writes preference changes to localStorage", () => {
      useUserPreferencesStore.getState().setPreference("defaultAsset", "EURC");

      const persisted = localStorage.getItem(PERSIST_KEY);
      expect(persisted).toBeTruthy();
      const parsed = JSON.parse(persisted as string);
      expect(parsed.state.defaultAsset).toBe("EURC");
    });

    it("rehydrates persisted preferences", async () => {
      localStorage.setItem(
        PERSIST_KEY,
        JSON.stringify({
          state: { ...useUserPreferencesStore.getInitialState(), defaultAsset: "PYUSD" },
          version: 2,
        })
      );

      await useUserPreferencesStore.persist.rehydrate();

      expect(useUserPreferencesStore.getState().defaultAsset).toBe("PYUSD");
    });
  });

  describe("selectors", () => {
    it("selectUserPreferences exposes the full preference set", () => {
      useUserPreferencesStore.getState().setPreference("dashboardLayout", "list");

      const selected = selectUserPreferences(useUserPreferencesStore.getState());
      expect(selected.dashboardLayout).toBe("list");
      expect(selected).toHaveProperty("alertThresholds");
      expect(selected).not.toHaveProperty("setPreference");
    });

    it("selectAlertThresholds returns the thresholds slice", () => {
      const thresholds = selectAlertThresholds(useUserPreferencesStore.getState());
      expect(thresholds).toEqual({
        priceDeviation: 0.02,
        supplyMismatch: 0.1,
        healthScoreDrop: 10,
      });
    });

    it("selectFavoriteAssets returns the favorites list", () => {
      useUserPreferencesStore.getState().addFavoriteAsset("USDC");
      expect(selectFavoriteAssets(useUserPreferencesStore.getState())).toEqual([
        "USDC",
      ]);
    });
  });
});
