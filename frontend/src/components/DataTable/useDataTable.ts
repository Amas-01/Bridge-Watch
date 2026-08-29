import { useCallback, useMemo, useState } from "react";
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import type { DataTableColumnDef, DataTableState } from "./types";
import { useTableSorting } from "./useTableSorting";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

type UseDataTableOptions<TData> = {
  columns: Array<DataTableColumnDef<TData>>;
  defaultPageSize?: number;
  defaultPageIndex?: number;
  defaultSorting?: SortingState;
  storageKey?: string;
};

export function useDataTable<TData>({
  columns,
  defaultPageIndex = 0,
  defaultPageSize = 10,
  defaultSorting = [],
  storageKey,
}: UseDataTableOptions<TData>) {
  const defaultVisibility = useMemo(() => {
    const v: VisibilityState = {};
    for (const col of columns) {
      const id = col.id;
      if (id && col.defaultHidden) v[id] = false;
    }
    return v;
  }, [columns]);

  const {
    sorting,
    setSorting,
    clearSorting,
    hasSorting,
  } = useTableSorting({
    defaultSorting,
    storageKey: storageKey ? `${storageKey}:sorting` : undefined,
  });
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: defaultPageIndex,
    pageSize: defaultPageSize,
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const defaultColumnOrder = useMemo(() => {
    const ids: string[] = [];
    for (const col of columns) {
      if (typeof col.id === "string") ids.push(col.id);
    }
    return ids;
  }, [columns]);

  const [columnVisibility, setColumnVisibility] = useLocalStorageState<VisibilityState>(
    storageKey ? `${storageKey}:col-visibility` : "temporary-col-visibility",
    defaultVisibility,
  );

  const [columnOrder, setColumnOrder] = useLocalStorageState<string[]>(
    storageKey ? `${storageKey}:col-order` : "temporary-col-order",
    defaultColumnOrder,
  );

  const resetColumnPreferences = useCallback(() => {
    setColumnVisibility(defaultVisibility);
    setColumnOrder(defaultColumnOrder);
  }, [defaultVisibility, defaultColumnOrder, setColumnVisibility, setColumnOrder]);

  const state: DataTableState = {
    sorting,
    columnFilters,
    globalFilter,
    pagination,
    columnVisibility,
    rowSelection,
    columnOrder,
  };

  return {
    state,
    setSorting,
    clearSorting,
    hasSorting,
    setColumnFilters,
    setGlobalFilter,
    setPagination,
    setColumnVisibility,
    setRowSelection,
    setColumnOrder,
    resetColumnPreferences,
  };
}

export type { UseDataTableOptions };
export type { ColumnDef };
