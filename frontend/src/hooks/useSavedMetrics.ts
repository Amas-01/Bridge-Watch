import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSavedMetric,
  deleteSavedMetric,
  listSavedMetrics,
  validateMetricFormula,
  type SavedMetric,
} from "../services/api";

export function useSavedMetrics() {
  return useQuery({
    queryKey: ["savedMetrics"],
    queryFn: listSavedMetrics,
    staleTime: 30_000,
  });
}

export function useValidateMetricFormula() {
  return useMutation({
    mutationFn: (formula: string) => validateMetricFormula(formula),
  });
}

export function useCreateSavedMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSavedMetric,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedMetrics"] });
    },
  });
}

export function useDeleteSavedMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSavedMetric,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedMetrics"] });
    },
  });
}

export type { SavedMetric };
