import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { devtools } from "zustand/middleware";
import type {
  DashboardFilters,
  DashboardTimeRangePreset,
} from "../hooks/useDashboardFilters";

export type { DashboardTimeRangePreset };

export type DashboardView = "overview" | "assets" | "bridges";

export interface SavedView {
  id: string;
  name: string;
  description?: string;
  view: DashboardView;
  filters: Partial<DashboardFilters>;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

interface SavedViewsState {
  savedViews: SavedView[];
  activeViewId: string | null;
  saveView: (view: Omit<SavedView, "id" | "createdAt" | "updatedAt">) => string;
  updateView: (
    id: string,
    updates: Partial<Omit<SavedView, "id" | "createdAt">>
  ) => void;
  deleteView: (id: string) => void;
  setDefault: (id: string) => void;
  setActiveView: (id: string | null) => void;
  getDefaultView: () => SavedView | undefined;
  getShareableUrl: (id: string) => string;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const useSavedViewsStore = create<SavedViewsState>()(
  devtools(
    persist(
      (set, get) => ({
        savedViews: [],
        activeViewId: null,

        saveView: (view) => {
          const id = generateId();
          const now = Date.now();
          const newView: SavedView = { ...view, id, createdAt: now, updatedAt: now };

          set(
            (state) => ({
              savedViews: [...state.savedViews, newView],
              activeViewId: id,
            }),
            false,
            "saveView"
          );

          return id;
        },

        updateView: (id, updates) => {
          set(
            (state) => ({
              savedViews: state.savedViews.map((v) =>
                v.id === id ? { ...v, ...updates, updatedAt: Date.now() } : v
              ),
            }),
            false,
            `updateView/${id}`
          );
        },

        deleteView: (id) => {
          set(
            (state) => ({
              savedViews: state.savedViews.filter((v) => v.id !== id),
              activeViewId:
                state.activeViewId === id ? null : state.activeViewId,
            }),
            false,
            `deleteView/${id}`
          );
        },

        setDefault: (id) => {
          set(
            (state) => ({
              savedViews: state.savedViews.map((v) => ({
                ...v,
                isDefault: v.id === id,
                updatedAt: v.id === id ? Date.now() : v.updatedAt,
              })),
            }),
            false,
            `setDefault/${id}`
          );
        },

        setActiveView: (id) => {
          set({ activeViewId: id }, false, "setActiveView");
        },

        getDefaultView: () => {
          return get().savedViews.find((v) => v.isDefault);
        },

        getShareableUrl: (id) => {
          return `${window.location.origin}/dashboard?savedView=${id}`;
        },
      }),
      {
        name: "bridge-watch-saved-views",
        storage: createJSONStorage(() => localStorage),
      }
    ),
    { name: "SavedViewsStore" }
  )
);
