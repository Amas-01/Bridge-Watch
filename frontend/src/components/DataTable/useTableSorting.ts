import { useEffect, useState } from "react";
import type { SortingState } from "@tanstack/react-table";

type UseTableSortingOptions = {
  defaultSorting?: SortingState;
  storageKey?: string;
};

function readSortingState(
  storageKey: string | undefined,
  fallback: SortingState
): SortingState {
  if (!storageKey || typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;

    return parsed.filter(
      (entry): entry is SortingState[number] =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as { id?: unknown }).id === "string" &&
        ((entry as { desc?: unknown }).desc === undefined ||
          typeof (entry as { desc?: unknown }).desc === "boolean")
    );
  } catch {
    return fallback;
  }
}

export function useTableSorting({
  defaultSorting = [],
  storageKey,
}: UseTableSortingOptions) {
  const [sorting, setSorting] = useState<SortingState>(() =>
    readSortingState(storageKey, defaultSorting)
  );

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(sorting));
    } catch {
      // Ignore storage failures. Sorting still works without persistence.
    }
  }, [sorting, storageKey]);

  return {
    sorting,
    setSorting,
    clearSorting: () => setSorting([]),
    hasSorting: sorting.length > 0,
  };
}
