import type { TransactionFilters as Filters } from "../types";

interface TransactionFiltersProps {
  filters: Filters;
  onFilterChange: (updates: Partial<Filters>) => void;
  onReset: () => void;
  onExport: () => void;
}

const BRIDGE_OPTIONS = [
  { value: "", label: "All Bridges" },
  { value: "Circle", label: "Circle (USDC)" },
  { value: "Wormhole", label: "Wormhole" },
  { value: "Allbridge", label: "Allbridge" },
];

const ASSET_OPTIONS = [
  { value: "", label: "All Assets" },
  { value: "USDC", label: "USDC" },
  { value: "EURC", label: "EURC" },
  { value: "PYUSD", label: "PYUSD" },
  { value: "FOBXX", label: "FOBXX" },
  { value: "XLM", label: "XLM" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
] as const;

export default function TransactionFilters({
  filters,
  onFilterChange,
  onReset,
  onExport,
}: TransactionFiltersProps) {
  const hasActiveFilters =
    filters.bridge !== "" ||
    filters.asset !== "" ||
    filters.status !== "all" ||
    filters.search !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-4 space-y-4">
      {/* Search */}
      <div>
        <label htmlFor="tx-search" className="sr-only">
          Search by hash or address
        </label>
        <input
          id="tx-search"
          type="text"
          placeholder="Search by tx hash or address…"
          value={filters.search}
          onChange={(e) => onFilterChange({ search: e.target.value })}
          className="w-full bg-stellar-dark border border-stellar-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.bridge}
          onChange={(e) => onFilterChange({ bridge: e.target.value })}
          className="bg-stellar-dark border border-stellar-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          aria-label="Filter by bridge"
        >
          {BRIDGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={filters.asset}
          onChange={(e) => onFilterChange({ asset: e.target.value })}
          className="bg-stellar-dark border border-stellar-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          aria-label="Filter by asset"
        >
          {ASSET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(e) =>
            onFilterChange({
              status: e.target.value as Filters["status"],
            })
          }
          className="bg-stellar-dark border border-stellar-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Date range */}
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onFilterChange({ dateFrom: e.target.value })}
          className="bg-stellar-dark border border-stellar-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          aria-label="From date"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onFilterChange({ dateTo: e.target.value })}
          className="bg-stellar-dark border border-stellar-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          aria-label="To date"
        />
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between">
        <div>
          {hasActiveFilters && (
            <button
              type="button"
              data-testid="clear-all-filters-btn"
              onClick={onReset}
              className="text-sm text-stellar-blue hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-1.5 bg-stellar-dark border border-stellar-border rounded-lg px-4 py-2 text-sm text-white hover:bg-stellar-border transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
          Export CSV
        </button>
      </div>
    </div>
  );
}
