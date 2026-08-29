import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  deserializeTimeRangeSelection,
  serializeTimeRangeSelection,
  type TimeRangeSelection,
} from "../utils/timeRange";

interface TimeRangeContextValue {
  applyGlobally: boolean;
  setApplyGlobally: (next: boolean) => void;
  globalSelection?: TimeRangeSelection;
  setGlobalSelection: (selection?: TimeRangeSelection) => void;
  getChartSelection: (chartId: string) => TimeRangeSelection | undefined;
  setChartSelection: (chartId: string, selection?: TimeRangeSelection) => void;
  getEffectiveSelection: (chartId: string) => TimeRangeSelection | undefined;
  clearSelection: (chartId: string) => void;
  lastSelection?: TimeRangeSelection;
}

const TimeRangeContext = createContext<TimeRangeContextValue | undefined>(
  undefined
);

const STORAGE_KEY = "bridgewatch.timeRanges.v1";
const DEFAULT_APPLY_GLOBALLY = true;

interface PersistedTimeRangeState {
  applyGlobally: boolean;
  globalSelection?: TimeRangeSelection;
  chartSelections: Record<string, TimeRangeSelection | undefined>;
  lastSelection?: TimeRangeSelection;
}

function readPersistedState(): PersistedTimeRangeState {
  if (typeof window === "undefined") {
    return {
      applyGlobally: DEFAULT_APPLY_GLOBALLY,
      chartSelections: {},
    };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      applyGlobally: DEFAULT_APPLY_GLOBALLY,
      chartSelections: {},
    };
  }

  try {
    const parsed = JSON.parse(raw) as PersistedTimeRangeState;
    return {
      applyGlobally:
        typeof parsed.applyGlobally === "boolean"
          ? parsed.applyGlobally
          : DEFAULT_APPLY_GLOBALLY,
      globalSelection: parsed.globalSelection,
      chartSelections: parsed.chartSelections ?? {},
      lastSelection: parsed.lastSelection,
    };
  } catch {
    return {
      applyGlobally: DEFAULT_APPLY_GLOBALLY,
      chartSelections: {},
    };
  }
}

function searchParamsEqual(a: string, b: string): boolean {
  const paramsA = new URLSearchParams(a);
  const paramsB = new URLSearchParams(b);

  const keys = new Set([...paramsA.keys(), ...paramsB.keys()]);
  for (const key of keys) {
    const valsA = paramsA.getAll(key).sort();
    const valsB = paramsB.getAll(key).sort();
    if (valsA.length !== valsB.length) return false;
    for (let i = 0; i < valsA.length; i++) {
      if (valsA[i] !== valsB[i]) return false;
    }
  }
  return true;
}

function parseStateFromSearch(search: string): Partial<PersistedTimeRangeState> {
  const params = new URLSearchParams(search);

  const applyGlobally = params.get("tr_apply_global");
  const globalSelection = deserializeTimeRangeSelection(params.get("tr_global"));

  const chartSelections: Record<string, TimeRangeSelection | undefined> = {};
  params.forEach((value, key) => {
    if (!key.startsWith("tr_chart_")) {
      return;
    }

    const chartId = key.replace("tr_chart_", "");
    chartSelections[chartId] = deserializeTimeRangeSelection(value);
  });

  return {
    applyGlobally:
      applyGlobally === null
        ? undefined
        : applyGlobally === "1" || applyGlobally.toLowerCase() === "true",
    globalSelection,
    chartSelections,
  };
}

export function TimeRangeProvider({ children }: { children: ReactNode }) {
  const persisted = useMemo(readPersistedState, []);
  const location = useLocation();
  const navigate = useNavigate();

  const fromUrl = useMemo(
    () => parseStateFromSearch(location.search),
    [location.search]
  );

  const [applyGlobally, setApplyGlobally] = useState<boolean>(
    fromUrl.applyGlobally ?? persisted.applyGlobally
  );
  const [globalSelection, setGlobalSelectionState] = useState<
    TimeRangeSelection | undefined
  >(fromUrl.globalSelection ?? persisted.globalSelection);
  const [chartSelections, setChartSelections] = useState<
    Record<string, TimeRangeSelection | undefined>
  >({
    ...persisted.chartSelections,
    ...fromUrl.chartSelections,
  });
  const [lastSelection, setLastSelection] = useState<
    TimeRangeSelection | undefined
  >(persisted.lastSelection ?? fromUrl.globalSelection ?? persisted.globalSelection);

  const setGlobalSelection = useCallback((selection?: TimeRangeSelection) => {
    setGlobalSelectionState(selection);
    if (selection) {
      setLastSelection(selection);
    }
  }, []);

  const setChartSelection = useCallback(
    (chartId: string, selection?: TimeRangeSelection) => {
      setChartSelections((previous) => ({
        ...previous,
        [chartId]: selection,
      }));

      if (selection) {
        setLastSelection(selection);
      }
    },
    []
  );

  const getChartSelection = useCallback(
    (chartId: string) => chartSelections[chartId],
    [chartSelections]
  );

  const getEffectiveSelection = useCallback(
    (chartId: string) => {
      if (applyGlobally) {
        return globalSelection;
      }
      return chartSelections[chartId];
    },
    [applyGlobally, chartSelections, globalSelection]
  );

  const clearSelection = useCallback(
    (chartId: string) => {
      if (applyGlobally) {
        setGlobalSelectionState(undefined);
        return;
      }

      setChartSelections((previous) => ({
        ...previous,
        [chartId]: undefined,
      }));
    },
    [applyGlobally]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload: PersistedTimeRangeState = {
      applyGlobally,
      globalSelection,
      chartSelections,
      lastSelection,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [applyGlobally, chartSelections, globalSelection, lastSelection]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (applyGlobally) {
      params.set("tr_apply_global", "1");
    } else {
      params.set("tr_apply_global", "0");
    }

    const globalSerialized = serializeTimeRangeSelection(globalSelection);
    if (globalSerialized) {
      params.set("tr_global", globalSerialized);
    } else {
      params.delete("tr_global");
    }

    Object.keys(chartSelections)
      .filter((key) => key.length > 0)
      .forEach((chartId) => {
        const serialized = serializeTimeRangeSelection(chartSelections[chartId]);
        const paramKey = `tr_chart_${chartId}`;

        if (serialized) {
          params.set(paramKey, serialized);
        } else {
          params.delete(paramKey);
        }
      });

    const nextSearch = params.toString();

    if (!searchParamsEqual(nextSearch, location.search)) {
      navigate({ search: nextSearch }, { replace: true });
    }
  }, [
    applyGlobally,
    chartSelections,
    globalSelection,
    location.search,
    navigate,
  ]);

  const value = useMemo<TimeRangeContextValue>(
    () => ({
      applyGlobally,
      setApplyGlobally,
      globalSelection,
      setGlobalSelection,
      getChartSelection,
      setChartSelection,
      getEffectiveSelection,
      clearSelection,
      lastSelection,
    }),
    [
      applyGlobally,
      clearSelection,
      getChartSelection,
      getEffectiveSelection,
      globalSelection,
      lastSelection,
      setChartSelection,
      setGlobalSelection,
    ]
  );

  return (
    <TimeRangeContext.Provider value={value}>{children}</TimeRangeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTimeRange() {
  const context = useContext(TimeRangeContext);
  if (!context) {
    throw new Error("useTimeRange must be used inside TimeRangeProvider");
  }

  return context;
}
