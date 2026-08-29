import { type ReactNode } from "react";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { PreferencesContext } from "./PreferencesContextValue";

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useUserPreferences();
  return (
    <PreferencesContext.Provider value={{ prefs, setPrefs }}>{children}</PreferencesContext.Provider>
  );
}
