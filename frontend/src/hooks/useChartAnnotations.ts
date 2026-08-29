import { useCallback, useMemo } from "react";
import { useLocalStorageState } from "./useLocalStorageState";

export type ChartAnnotationKind = "note" | "marker" | "comparison";

export interface ChartAnnotation {
  id: string;
  kind: ChartAnnotationKind;
  label: string;
  timestamp: string;
  notes: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChartAnnotationInput {
  kind: ChartAnnotationKind;
  label: string;
  timestamp: string;
  notes?: string;
  color?: string;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAnnotation(input: ChartAnnotationInput, existing?: ChartAnnotation): ChartAnnotation {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? createId(),
    kind: input.kind,
    label: input.label.trim(),
    timestamp: input.timestamp,
    notes: input.notes?.trim() ?? "",
    color: input.color ?? "#3b82f6",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function useChartAnnotations(symbol: string) {
  const [annotations, setAnnotations] = useLocalStorageState<ChartAnnotation[]>(
    `bridge-watch:chart-annotations:${symbol.toUpperCase()}:v1`,
    []
  );

  const sortedAnnotations = useMemo(
    () =>
      [...annotations].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ),
    [annotations]
  );

  const addAnnotation = useCallback(
    (input: ChartAnnotationInput) => {
      const next = normalizeAnnotation(input);
      setAnnotations((current) => [next, ...current]);
      return next;
    },
    [setAnnotations]
  );

  const updateAnnotation = useCallback(
    (id: string, input: ChartAnnotationInput) => {
      setAnnotations((current) =>
        current.map((annotation) =>
          annotation.id === id ? normalizeAnnotation(input, annotation) : annotation
        )
      );
    },
    [setAnnotations]
  );

  const removeAnnotation = useCallback(
    (id: string) => {
      setAnnotations((current) => current.filter((annotation) => annotation.id !== id));
    },
    [setAnnotations]
  );

  const clearAnnotations = useCallback(() => {
    setAnnotations([]);
  }, [setAnnotations]);

  const exportAnnotations = useCallback(() => JSON.stringify(sortedAnnotations, null, 2), [sortedAnnotations]);

  return {
    annotations: sortedAnnotations,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    clearAnnotations,
    exportAnnotations,
  };
}

