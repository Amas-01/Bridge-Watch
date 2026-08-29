export type TimeRangePreset = "1H" | "24H" | "7D" | "30D" | "1Y";

export interface TimeRangeSelection {
  preset?: TimeRangePreset;
  start?: string;
  end?: string;
}

export interface TimeRangePresetOption {
  id: TimeRangePreset;
  label: string;
  durationMs: number;
}

export const TIME_RANGE_PRESETS: TimeRangePresetOption[] = [
  { id: "1H", label: "1H", durationMs: 60 * 60 * 1000 },
  { id: "24H", label: "24H", durationMs: 24 * 60 * 60 * 1000 },
  { id: "7D", label: "7D", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { id: "30D", label: "30D", durationMs: 30 * 24 * 60 * 60 * 1000 },
  { id: "1Y", label: "1Y", durationMs: 365 * 24 * 60 * 60 * 1000 },
];

const PRESET_MAP: Record<TimeRangePreset, TimeRangePresetOption> = TIME_RANGE_PRESETS.reduce(
  (acc, preset) => ({ ...acc, [preset.id]: preset }),
  {} as Record<TimeRangePreset, TimeRangePresetOption>
);

const URL_PRESET_PREFIX = "preset|";
const URL_CUSTOM_PREFIX = "custom|";

export function isCustomRange(selection?: TimeRangeSelection): boolean {
  return Boolean(selection?.start || selection?.end);
}

export function getRangeBounds(
  selection?: TimeRangeSelection,
  now: Date = new Date()
): { startMs: number | null; endMs: number | null } {
  if (!selection) {
    return { startMs: null, endMs: null };
  }

  if (selection.preset) {
    const preset = PRESET_MAP[selection.preset];
    if (!preset) {
      return { startMs: null, endMs: null };
    }

    const endMs = now.getTime();
    return { startMs: endMs - preset.durationMs, endMs };
  }

  const startMs = selection.start ? new Date(selection.start).getTime() : null;
  const endMs = selection.end ? new Date(selection.end).getTime() : null;

  return {
    startMs: Number.isNaN(startMs) ? null : startMs,
    endMs: Number.isNaN(endMs) ? null : endMs,
  };
}

export function serializeTimeRangeSelection(
  selection?: TimeRangeSelection
): string | undefined {
  if (!selection) {
    return undefined;
  }

  if (selection.preset) {
    return `${URL_PRESET_PREFIX}${selection.preset}`;
  }

  if (selection.start && selection.end) {
    return `${URL_CUSTOM_PREFIX}${selection.start}|${selection.end}`;
  }

  return undefined;
}

export function deserializeTimeRangeSelection(
  value?: string | null
): TimeRangeSelection | undefined {
  if (!value) {
    return undefined;
  }

  if (value.startsWith(URL_PRESET_PREFIX)) {
    const preset = value.replace(URL_PRESET_PREFIX, "") as TimeRangePreset;
    if (PRESET_MAP[preset]) {
      return { preset };
    }
    return undefined;
  }

  if (value.startsWith(URL_CUSTOM_PREFIX)) {
    const payload = value.replace(URL_CUSTOM_PREFIX, "");
    const [start, end] = payload.split("|");
    if (!start || !end) {
      return undefined;
    }
    return { start, end };
  }

  return undefined;
}

export function formatRangeLabel(selection?: TimeRangeSelection): string {
  if (!selection) {
    return "All time";
  }

  if (selection.preset) {
    return selection.preset;
  }

  if (selection.start && selection.end) {
    const start = new Date(selection.start);
    const end = new Date(selection.end);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return "Custom";
    }

    return `${start.toLocaleDateString()} → ${end.toLocaleDateString()}`;
  }

  return "Custom";
}

export function filterSeriesByTimeRange<T>(
  data: T[],
  getTimestamp: (item: T) => string | number | Date | undefined,
  selection?: TimeRangeSelection
): T[] {
  const { startMs, endMs } = getRangeBounds(selection);

  if (startMs === null && endMs === null) {
    return data;
  }

  return data.filter((item) => {
    const timestamp = getTimestamp(item);
    if (!timestamp) {
      return false;
    }

    const ts = new Date(timestamp).getTime();
    if (Number.isNaN(ts)) {
      return false;
    }

    if (startMs !== null && ts < startMs) {
      return false;
    }

    if (endMs !== null && ts > endMs) {
      return false;
    }

    return true;
  });
}

export function toInputDateTimeValue(value?: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

export function fromInputDateTimeValue(value: string): string {
  return new Date(value).toISOString();
}
