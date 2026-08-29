import { describe, it, expect, beforeEach } from "vitest";
import {
  useUIStore,
  selectActiveModal,
  selectModalData,
  selectSidebarOpen,
  selectToasts,
  selectGlobalLoading,
  selectSelectedAsset,
  selectIsMobileView,
  selectInsightsTray,
} from "./uiStore";

function resetStoreState() {
  const initialState = useUIStore.getInitialState();
  useUIStore.setState(initialState, true);
}

describe("uiStore", () => {
  beforeEach(() => {
    resetStoreState();
  });

  it("initializes with default UI state", () => {
    const state = useUIStore.getState();

    expect(state.activeModal).toBeNull();
    expect(state.modalData).toBeNull();
    expect(state.sidebarOpen).toBe(true);
    expect(state.sidebarView).toBe("default");
    expect(state.toasts).toEqual([]);
    expect(state.globalLoading).toBe(false);
    expect(state.loadingMessage).toBeNull();
    expect(state.selectedAsset).toBeNull();
    expect(state.selectedBridge).toBeNull();
    expect(state.selectedTimeRange).toBe("24h");
    expect(state.isMobileView).toBe(false);
    expect(state.isTouchDevice).toBe(false);
    expect(state.insightsTrayOpen).toBe(false);
  });

  describe("modal actions", () => {
    it("opens a modal and sets its data", () => {
      useUIStore.getState().openModal("assetDetails", { assetId: "XLM" });

      const state = useUIStore.getState();
      expect(state.activeModal).toBe("assetDetails");
      expect(state.modalData).toEqual({ assetId: "XLM" });
    });

    it("opens a modal without data", () => {
      useUIStore.getState().openModal("settings");

      const state = useUIStore.getState();
      expect(state.activeModal).toBe("settings");
      expect(state.modalData).toBeNull();
    });

    it("closes the active modal and clears data", () => {
      useUIStore.getState().openModal("bridgeDetails", { bridgeId: "1" });
      useUIStore.getState().closeModal();

      const state = useUIStore.getState();
      expect(state.activeModal).toBeNull();
      expect(state.modalData).toBeNull();
    });

    it("merges modal data with setModalData", () => {
      useUIStore.getState().openModal("alertSettings", { alertId: "alert-1" });
      useUIStore.getState().setModalData({ threshold: "high" });

      const state = useUIStore.getState();
      expect(state.modalData).toEqual({ alertId: "alert-1", threshold: "high" });
    });

    it("handles closeModal when no modal is open", () => {
      useUIStore.getState().closeModal();

      const state = useUIStore.getState();
      expect(state.activeModal).toBeNull();
      expect(state.modalData).toBeNull();
    });
  });

  describe("sidebar actions", () => {
    it("toggles sidebar from open to closed", () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true);

      useUIStore.getState().toggleSidebar();

      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });

    it("toggles sidebar from closed to open", () => {
      useUIStore.getState().setSidebarOpen(false);

      useUIStore.getState().toggleSidebar();

      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it("sets sidebar open state explicitly", () => {
      useUIStore.getState().setSidebarOpen(false);
      expect(useUIStore.getState().sidebarOpen).toBe(false);

      useUIStore.getState().setSidebarOpen(true);
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it("sets sidebar view", () => {
      useUIStore.getState().setSidebarView("favorites");
      expect(useUIStore.getState().sidebarView).toBe("favorites");

      useUIStore.getState().setSidebarView("alerts");
      expect(useUIStore.getState().sidebarView).toBe("alerts");

      useUIStore.getState().setSidebarView("settings");
      expect(useUIStore.getState().sidebarView).toBe("settings");
    });

    it("resets sidebar view to default", () => {
      useUIStore.getState().setSidebarView("alerts");

      useUIStore.getState().setSidebarView("default");

      expect(useUIStore.getState().sidebarView).toBe("default");
    });
  });

  describe("toast actions", () => {
    it("adds a toast with auto-generated id", () => {
      useUIStore.getState().addToast("Operation successful", "success");

      const state = useUIStore.getState();
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].message).toBe("Operation successful");
      expect(state.toasts[0].type).toBe("success");
      expect(state.toasts[0].id).toMatch(/^toast-/);
      expect(state.toasts[0].duration).toBe(5000);
    });

    it("adds a toast with custom duration", () => {
      useUIStore.getState().addToast("Persistent toast", "info", 10000);

      expect(useUIStore.getState().toasts[0].duration).toBe(10000);
    });

    it("adds multiple toasts", () => {
      useUIStore.getState().addToast("First", "info");
      useUIStore.getState().addToast("Second", "warning");

      const { toasts } = useUIStore.getState();
      expect(toasts).toHaveLength(2);
      expect(toasts[0].message).toBe("First");
      expect(toasts[1].message).toBe("Second");
    });

    it("removes a toast by id", () => {
      useUIStore.getState().addToast("Removable", "error");
      const id = useUIStore.getState().toasts[0].id;

      useUIStore.getState().removeToast(id);

      expect(useUIStore.getState().toasts).toHaveLength(0);
    });

    it("removing a non-existent toast does nothing", () => {
      useUIStore.getState().addToast("Stay", "info");

      useUIStore.getState().removeToast("non-existent-id");

      expect(useUIStore.getState().toasts).toHaveLength(1);
    });

    it("clears all toasts", () => {
      useUIStore.getState().addToast("One", "info");
      useUIStore.getState().addToast("Two", "warning");

      useUIStore.getState().clearToasts();

      expect(useUIStore.getState().toasts).toEqual([]);
    });
  });

  describe("loading actions", () => {
    it("sets global loading with a message", () => {
      useUIStore.getState().setGlobalLoading(true, "Fetching data...");

      const state = useUIStore.getState();
      expect(state.globalLoading).toBe(true);
      expect(state.loadingMessage).toBe("Fetching data...");
    });

    it("sets global loading without a message", () => {
      useUIStore.getState().setGlobalLoading(true);

      const state = useUIStore.getState();
      expect(state.globalLoading).toBe(true);
      expect(state.loadingMessage).toBeNull();
    });

    it("clears global loading", () => {
      useUIStore.getState().setGlobalLoading(true, "Loading");
      useUIStore.getState().setGlobalLoading(false);

      const state = useUIStore.getState();
      expect(state.globalLoading).toBe(false);
      expect(state.loadingMessage).toBeNull();
    });
  });

  describe("selection actions", () => {
    it("sets selected asset", () => {
      useUIStore.getState().setSelectedAsset("XLM");
      expect(useUIStore.getState().selectedAsset).toBe("XLM");
    });

    it("clears selected asset", () => {
      useUIStore.getState().setSelectedAsset("XLM");
      useUIStore.getState().setSelectedAsset(null);

      expect(useUIStore.getState().selectedAsset).toBeNull();
    });

    it("sets selected bridge", () => {
      useUIStore.getState().setSelectedBridge("bridge-1");
      expect(useUIStore.getState().selectedBridge).toBe("bridge-1");
    });

    it("clears selected bridge", () => {
      useUIStore.getState().setSelectedBridge("bridge-1");
      useUIStore.getState().setSelectedBridge(null);

      expect(useUIStore.getState().selectedBridge).toBeNull();
    });

    it("sets selected time range", () => {
      useUIStore.getState().setSelectedTimeRange("7d");
      expect(useUIStore.getState().selectedTimeRange).toBe("7d");

      useUIStore.getState().setSelectedTimeRange("1h");
      expect(useUIStore.getState().selectedTimeRange).toBe("1h");

      useUIStore.getState().setSelectedTimeRange("30d");
      expect(useUIStore.getState().selectedTimeRange).toBe("30d");
    });
  });

  describe("insights tray actions", () => {
    it("opens insights tray and sets the asset symbol", () => {
      useUIStore.getState().openInsightsTray("XLM");

      const state = useUIStore.getState();
      expect(state.insightsTrayOpen).toBe(true);
      expect(state.selectedAsset).toBe("XLM");
    });

    it("closes insights tray", () => {
      useUIStore.getState().openInsightsTray("XLM");
      useUIStore.getState().closeInsightsTray();

      const state = useUIStore.getState();
      expect(state.insightsTrayOpen).toBe(false);
    });

    it("closing insights tray does not clear the selected asset", () => {
      useUIStore.getState().openInsightsTray("XLM");
      useUIStore.getState().closeInsightsTray();

      expect(useUIStore.getState().selectedAsset).toBe("XLM");
    });
  });

  describe("view actions", () => {
    it("sets mobile view", () => {
      useUIStore.getState().setIsMobileView(true);
      expect(useUIStore.getState().isMobileView).toBe(true);

      useUIStore.getState().setIsMobileView(false);
      expect(useUIStore.getState().isMobileView).toBe(false);
    });

    it("sets touch device", () => {
      useUIStore.getState().setIsTouchDevice(true);
      expect(useUIStore.getState().isTouchDevice).toBe(true);

      useUIStore.getState().setIsTouchDevice(false);
      expect(useUIStore.getState().isTouchDevice).toBe(false);
    });
  });

  describe("resetUI", () => {
    it("resets all UI state to initial values", () => {
      const store = useUIStore.getState();
      store.openModal("help", { page: "overview" });
      store.toggleSidebar();
      store.setSidebarView("settings");
      store.addToast("Temp", "warning");
      store.setGlobalLoading(true, "Working");
      store.setSelectedAsset("XLM");
      store.setSelectedBridge("bridge-2");
      store.setSelectedTimeRange("7d");
      store.openInsightsTray("USDC");
      store.setIsMobileView(true);
      store.setIsTouchDevice(true);

      useUIStore.getState().resetUI();

      const state = useUIStore.getState();
      expect(state.activeModal).toBeNull();
      expect(state.modalData).toBeNull();
      expect(state.sidebarOpen).toBe(true);
      expect(state.sidebarView).toBe("default");
      expect(state.toasts).toEqual([]);
      expect(state.globalLoading).toBe(false);
      expect(state.loadingMessage).toBeNull();
      expect(state.selectedAsset).toBeNull();
      expect(state.selectedBridge).toBeNull();
      expect(state.selectedTimeRange).toBe("24h");
      expect(state.insightsTrayOpen).toBe(false);
      expect(state.isMobileView).toBe(false);
      expect(state.isTouchDevice).toBe(false);
    });
  });

  describe("selectors", () => {
    it("selectActiveModal returns the active modal", () => {
      useUIStore.getState().openModal("settings");
      expect(selectActiveModal(useUIStore.getState())).toBe("settings");
    });

    it("selectModalData returns the modal data", () => {
      useUIStore.getState().openModal("assetDetails", { assetId: "XLM" });
      expect(selectModalData(useUIStore.getState())).toEqual({ assetId: "XLM" });
    });

    it("selectSidebarOpen returns sidebar state", () => {
      useUIStore.getState().setSidebarOpen(false);
      expect(selectSidebarOpen(useUIStore.getState())).toBe(false);
    });

    it("selectToasts returns the toasts array", () => {
      useUIStore.getState().addToast("Test", "info");
      const toasts = selectToasts(useUIStore.getState());
      expect(toasts).toHaveLength(1);
    });

    it("selectGlobalLoading returns loading state and message", () => {
      useUIStore.getState().setGlobalLoading(true, "Working");
      const result = selectGlobalLoading(useUIStore.getState());
      expect(result).toEqual({ loading: true, message: "Working" });
    });

    it("selectSelectedAsset returns the selected asset", () => {
      useUIStore.getState().setSelectedAsset("ETH");
      expect(selectSelectedAsset(useUIStore.getState())).toBe("ETH");
    });

    it("selectIsMobileView returns mobile view state", () => {
      useUIStore.getState().setIsMobileView(true);
      expect(selectIsMobileView(useUIStore.getState())).toBe(true);
    });

    it("selectInsightsTray returns tray state and actions", () => {
      useUIStore.getState().openInsightsTray("USDC");
      const result = selectInsightsTray(useUIStore.getState());
      expect(result.open).toBe(true);
      expect(result.symbol).toBe("USDC");
      expect(typeof result.openInsightsTray).toBe("function");
      expect(typeof result.closeInsightsTray).toBe("function");
    });
  });
});
