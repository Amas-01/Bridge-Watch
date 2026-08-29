import { createContext, useContext } from "react";
import type { UserPreferences } from "../hooks/useUserPreferences";

export type PreferencesContextValue = {
  prefs: UserPreferences;
  setPrefs: (next: Partial<UserPreferences>) => void;
};

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
