import { useQuery } from "@tanstack/react-query";
import { getAlertPlaybook, searchAlertPlaybooks } from "../services/api";

export function useAlertPlaybooks(query?: string, alertType?: string) {
  return useQuery({
    queryKey: ["alertPlaybooks", query, alertType],
    queryFn: () => searchAlertPlaybooks({ q: query, alertType }),
    staleTime: 60_000,
  });
}

export function useAlertPlaybook(id?: string) {
  return useQuery({
    queryKey: ["alertPlaybook", id],
    queryFn: () => getAlertPlaybook(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
