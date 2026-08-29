import { useMemo } from "react";
import { useLocalStorageState } from "./useLocalStorageState";

export type SnoozeDurationMinutes = 1 | 15 | 30 | 60 | 240;

export interface SnoozedAlertEntry {
  key: string;
  label: string;
  snoozedUntil: number;
  updatedAt: number;
}

type SnoozeStore = Record<string, SnoozedAlertEntry>;

const STORAGE_KEY = "alert-snoozes-v1";

export function useAlertSnoozes() {
  const [snoozes, setSnoozes] = useLocalStorageState<SnoozeStore>(STORAGE_KEY, {});

  const now = Date.now();
  const activeSnoozes = useMemo(() => {
    const entries = Object.values(snoozes).filter((entry) => entry.snoozedUntil > now);
    return entries.sort((left, right) => left.snoozedUntil - right.snoozedUntil);
  }, [now, snoozes]);

  const cleanup = () => {
    setSnoozes((previous) => {
      const next: SnoozeStore = {};
      for (const [key, entry] of Object.entries(previous)) {
        if (entry.snoozedUntil > Date.now()) {
          next[key] = entry;
        }
      }
      return next;
    });
  };

  const snooze = (key: string, label: string, durationMinutes: SnoozeDurationMinutes) => {
    const snoozedUntil = Date.now() + durationMinutes * 60_000;
    setSnoozes((previous) => ({
      ...previous,
      [key]: {
        key,
        label,
        snoozedUntil,
        updatedAt: Date.now(),
      },
    }));
  };

  const snoozeMany = (items: Array<{ key: string; label: string }>, durationMinutes: SnoozeDurationMinutes) => {
    const snoozedUntil = Date.now() + durationMinutes * 60_000;
    setSnoozes((previous) => {
      const next = { ...previous };
      for (const item of items) {
        next[item.key] = {
          key: item.key,
          label: item.label,
          snoozedUntil,
          updatedAt: Date.now(),
        };
      }
      return next;
    });
  };

  const unsnooze = (key: string) => {
    setSnoozes((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const getStatus = (key: string) => {
    const entry = snoozes[key];
    if (!entry) return null;
    if (entry.snoozedUntil <= Date.now()) return null;
    return entry;
  };

  return {
    snoozes: activeSnoozes,
    snooze,
    snoozeMany,
    unsnooze,
    getStatus,
    cleanup,
  };
}