import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { getTransactions } from "../services/api";
import { useWebSocket } from "./useWebSocket";
import type { TransactionFilters, BridgeTransaction } from "../types";

const DEFAULT_FILTERS: TransactionFilters = {
  bridge: "",
  asset: "",
  status: "all",
  search: "",
  dateFrom: "",
  dateTo: "",
};

const PAGE_SIZE = 25;

type TransactionRefreshOptions = {
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
};

export function useTransactions(options?: TransactionRefreshOptions) {
  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["transactions", filters, page, pageSize],
    queryFn: () => getTransactions(filters, page, pageSize),
    refetchInterval: options?.refetchInterval ?? 30_000,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });

  const updateFilters = useCallback(
    (updates: Partial<TransactionFilters>) => {
      setFilters((prev) => ({ ...prev, ...updates }));
      setPage(1);
    },
    []
  );

  const updatePageSize = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const handleStatusUpdate = useCallback(
    (data: unknown) => {
      const update = data as {
        channel: string;
        txHash: string;
        status: BridgeTransaction["status"];
        confirmedAt?: string;
      };
      if (!update.txHash) return;

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    [queryClient]
  );

  useWebSocket("transaction-updates", handleStatusUpdate);

  return {
    ...query,
    filters,
    page,
    pageSize,
    totalPages: query.data?.totalPages ?? 1,
    setPage,
    updatePageSize,
    updateFilters,
    resetFilters,
  };
}
