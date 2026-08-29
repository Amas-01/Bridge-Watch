import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface Watchlist {
  id: string;
  name: string;
  assets: string[];
}

interface WatchlistStore {
  activeListId: string;
  lists: Watchlist[];
}

const STORAGE_KEY = "bridgewatch.watchlists.v1";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function createDefaultStore(): WatchlistStore {
  return {
    activeListId: "default",
    lists: [{ id: "default", name: "Default", assets: [] }],
  };
}

function readStore(): WatchlistStore {
  if (typeof window === "undefined") {
    return createDefaultStore();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultStore();
  }

  try {
    const parsed = JSON.parse(raw) as WatchlistStore;
    if (!parsed.lists?.length) {
      return createDefaultStore();
    }

    const activeExists = parsed.lists.some((list) => list.id === parsed.activeListId);

    return {
      activeListId: activeExists ? parsed.activeListId : parsed.lists[0].id,
      lists: parsed.lists,
    };
  } catch {
    return createDefaultStore();
  }
}

function persistStore(store: WatchlistStore) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

interface WatchlistContextValue {
  watchlists: Watchlist[];
  activeWatchlist: Watchlist | undefined;
  activeListId: string;
  activeSymbols: string[];
  addAsset: (symbol: string, listId?: string) => void;
  removeAsset: (symbol: string, listId?: string) => void;
  reorderAsset: (symbol: string, direction: "up" | "down", listId?: string) => void;
  updateAssetOrder: (watchlistId: string, assets: string[]) => void;
  createWatchlist: (name: string) => void;
  deleteWatchlist: (listId: string) => void;
  renameWatchlist: (listId: string, name: string) => void;
  setActiveWatchlist: (listId: string) => void;
  clearActiveWatchlist: () => void;
  exportWatchlists: () => string;
  importWatchlists: (payload: string) => boolean;
  isInWatchlist: (symbol: string, listId?: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | undefined>(
  undefined
);

function useWatchlistState(): WatchlistContextValue {
  const [store, setStore] = useState<WatchlistStore>(readStore);

  const updateStore = useCallback((updater: (previous: WatchlistStore) => WatchlistStore) => {
    setStore((previous) => {
      const next = updater(previous);
      persistStore(next);
      return next;
    });
  }, []);

  const activeWatchlist = useMemo(
    () =>
      store.lists.find((list) => list.id === store.activeListId) ??
      store.lists[0],
    [store.activeListId, store.lists]
  );

  const addAsset = useCallback(
    (symbol: string, listId?: string) => {
      const normalized = symbol.trim().toUpperCase();
      if (!normalized) {
        return;
      }

      updateStore((previous) => {
        const targetId = listId ?? previous.activeListId;

        return {
          ...previous,
          lists: previous.lists.map((list) => {
            if (list.id !== targetId || list.assets.includes(normalized)) {
              return list;
            }

            return {
              ...list,
              assets: [...list.assets, normalized],
            };
          }),
        };
      });
    },
    [updateStore]
  );

  const removeAsset = useCallback(
    (symbol: string, listId?: string) => {
      const normalized = symbol.trim().toUpperCase();
      updateStore((previous) => {
        const targetId = listId ?? previous.activeListId;

        return {
          ...previous,
          lists: previous.lists.map((list) => {
            if (list.id !== targetId) {
              return list;
            }

            return {
              ...list,
              assets: list.assets.filter((asset) => asset !== normalized),
            };
          }),
        };
      });
    },
    [updateStore]
  );

  const reorderAsset = useCallback(
    (symbol: string, direction: "up" | "down", listId?: string) => {
      const normalized = symbol.trim().toUpperCase();

      updateStore((previous) => {
        const targetId = listId ?? previous.activeListId;

        return {
          ...previous,
          lists: previous.lists.map((list) => {
            if (list.id !== targetId) {
              return list;
            }

            const index = list.assets.indexOf(normalized);
            if (index === -1) {
              return list;
            }

            const nextIndex = direction === "up" ? index - 1 : index + 1;
            if (nextIndex < 0 || nextIndex >= list.assets.length) {
              return list;
            }

            const assets = [...list.assets];
            [assets[index], assets[nextIndex]] = [assets[nextIndex], assets[index]];

            return {
              ...list,
              assets,
            };
          }),
        };
      });
    },
    [updateStore]
  );

  const updateAssetOrder = useCallback(
    (watchlistId: string, assets: string[]) => {
      updateStore((previous) => ({
        ...previous,
        lists: previous.lists.map((list) =>
          list.id === watchlistId ? { ...list, assets } : list
        ),
      }));
    },
    [updateStore]
  );

  const createWatchlist = useCallback(
    (name: string) => {
      const normalizedName = name.trim();
      if (!normalizedName) {
        return;
      }

      updateStore((previous) => {
        const base = slugify(normalizedName) || `watchlist-${previous.lists.length + 1}`;
        let id = base;
        let suffix = 1;

        while (previous.lists.some((list) => list.id === id)) {
          id = `${base}-${suffix}`;
          suffix += 1;
        }

        return {
          activeListId: id,
          lists: [...previous.lists, { id, name: normalizedName, assets: [] }],
        };
      });
    },
    [updateStore]
  );

  const deleteWatchlist = useCallback(
    (listId: string) => {
      updateStore((previous) => {
        if (previous.lists.length <= 1) {
          return previous;
        }

        const lists = previous.lists.filter((list) => list.id !== listId);
        if (!lists.length) {
          return previous;
        }

        return {
          activeListId:
            previous.activeListId === listId ? lists[0].id : previous.activeListId,
          lists,
        };
      });
    },
    [updateStore]
  );

  const renameWatchlist = useCallback(
    (listId: string, name: string) => {
      const normalizedName = name.trim();
      if (!normalizedName) {
        return;
      }

      updateStore((previous) => ({
        ...previous,
        lists: previous.lists.map((list) =>
          list.id === listId ? { ...list, name: normalizedName } : list
        ),
      }));
    },
    [updateStore]
  );

  const setActiveWatchlist = useCallback(
    (listId: string) => {
      updateStore((previous) => {
        if (!previous.lists.some((list) => list.id === listId)) {
          return previous;
        }

        return {
          ...previous,
          activeListId: listId,
        };
      });
    },
    [updateStore]
  );

  const clearActiveWatchlist = useCallback(() => {
    updateStore((previous) => ({
      ...previous,
      lists: previous.lists.map((list) =>
        list.id === previous.activeListId ? { ...list, assets: [] } : list
      ),
    }));
  }, [updateStore]);

  const exportWatchlists = useCallback(() => JSON.stringify(store, null, 2), [store]);

  const importWatchlists = useCallback(
    (payload: string) => {
      try {
        const parsed = JSON.parse(payload) as WatchlistStore;
        if (!parsed.lists?.length) {
          return false;
        }

        updateStore(() => ({
          activeListId: parsed.activeListId,
          lists: parsed.lists,
        }));

        return true;
      } catch {
        return false;
      }
    },
    [updateStore]
  );

  const isInWatchlist = useCallback(
    (symbol: string, listId?: string) => {
      const normalized = symbol.trim().toUpperCase();
      const targetId = listId ?? store.activeListId;
      const list = store.lists.find((entry) => entry.id === targetId);
      return list?.assets.includes(normalized) ?? false;
    },
    [store.activeListId, store.lists]
  );

  return {
    watchlists: store.lists,
    activeWatchlist,
    activeListId: store.activeListId,
    activeSymbols: activeWatchlist?.assets ?? [],
    addAsset,
    removeAsset,
    reorderAsset,
    updateAssetOrder,
    createWatchlist,
    deleteWatchlist,
    renameWatchlist,
    setActiveWatchlist,
    clearActiveWatchlist,
    exportWatchlists,
    importWatchlists,
    isInWatchlist,
  };
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const value = useWatchlistState();
  return createElement(WatchlistContext.Provider, { value }, children);
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error("useWatchlist must be used inside WatchlistProvider");
  }

  return context;
}
