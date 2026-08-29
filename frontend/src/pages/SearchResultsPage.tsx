import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchIndexed, type IndexedSearchResult } from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultType = IndexedSearchResult["type"] | "all";
type SortField = "relevance" | "type" | "title";
type SortOrder = "asc" | "desc";

interface GroupedResults {
  asset: IndexedSearchResult[];
  bridge: IndexedSearchResult[];
  incident: IndexedSearchResult[];
  alert: IndexedSearchResult[];
}

const TYPE_LABELS: Record<ResultType, string> = {
  all: "All",
  asset: "Assets",
  bridge: "Bridges",
  incident: "Incidents",
  alert: "Alerts",
};

const TYPE_ICONS: Record<Exclude<ResultType, "all">, string> = {
  asset: "◈",
  bridge: "⇄",
  incident: "!",
  alert: "^",
};

const TYPE_HREF_MAP: Record<Exclude<ResultType, "all">, string> = {
  asset: "/assets",
  bridge: "/bridges",
  incident: "/incidents",
  alert: "/settings",
};

const PAGE_SIZE = 20;
const FILTER_TYPES: ResultType[] = ["all", "asset", "bridge", "incident", "alert"];

// ─── Highlight helper ─────────────────────────────────────────────────────────

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRe(query)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-stellar-blue/30 text-white rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ─── Resolve href for a result ────────────────────────────────────────────────

function resolveHref(result: IndexedSearchResult): string {
  if (typeof result.metadata.href === "string") return result.metadata.href;
  if (result.type === "asset" && typeof result.metadata.symbol === "string") {
    return `/assets/${result.metadata.symbol}`;
  }
  return TYPE_HREF_MAP[result.type];
}

// ─── Single result card ───────────────────────────────────────────────────────

function ResultCard({ result, query }: { result: IndexedSearchResult; query: string }) {
  const href = resolveHref(result);
  const icon = TYPE_ICONS[result.type];

  return (
    <Link
      to={href}
      className="flex items-start gap-4 p-4 rounded-xl border border-stellar-border bg-stellar-card hover:border-stellar-blue/50 hover:bg-stellar-card/80 transition-colors group"
    >
      <span className="flex-none w-10 h-10 flex items-center justify-center rounded-lg bg-stellar-border text-stellar-text-secondary text-base font-mono group-hover:bg-stellar-blue/20 group-hover:text-stellar-blue transition-colors">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white truncate">
            <Highlight text={result.title} query={query} />
          </span>
          <span className="flex-none text-xs px-1.5 py-0.5 rounded bg-stellar-border text-stellar-text-secondary uppercase tracking-wide">
            {result.type}
          </span>
        </div>
        {result.description && (
          <p className="mt-1 text-sm text-stellar-text-secondary line-clamp-2">
            <Highlight text={result.description} query={query} />
          </p>
        )}
        {result.highlights.length > 0 && (
          <p className="mt-1.5 text-xs text-stellar-text-secondary/70 italic line-clamp-1">
            …<Highlight text={result.highlights[0]} query={query} />…
          </p>
        )}
      </div>
      <span className="flex-none text-stellar-text-secondary opacity-0 group-hover:opacity-100 transition-opacity text-sm self-center">
        →
      </span>
    </Link>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-5xl mb-4 opacity-40">⊘</span>
      <p className="text-lg font-semibold text-white">
        No results for &ldquo;{query}&rdquo;
      </p>
      <p className="mt-2 text-sm text-stellar-text-secondary max-w-sm">
        Try adjusting your search term, clearing filters, or searching for an asset symbol,
        bridge name, incident, or alert.
      </p>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function ResultSkeleton() {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-stellar-border bg-stellar-card animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-stellar-border flex-none" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-stellar-border rounded w-3/5" />
        <div className="h-3 bg-stellar-border rounded w-4/5" />
        <div className="h-3 bg-stellar-border rounded w-2/5" />
      </div>
    </div>
  );
}

// ─── Pagination controls ──────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <nav className="flex items-center justify-center gap-1 mt-8" aria-label="Pagination">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="px-3 py-1.5 rounded-lg text-sm text-stellar-text-secondary hover:text-white hover:bg-stellar-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        ← Prev
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-2 text-stellar-text-secondary">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
              p === page
                ? "bg-stellar-blue text-white"
                : "text-stellar-text-secondary hover:text-white hover:bg-stellar-border"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="px-3 py-1.5 rounded-lg text-sm text-stellar-text-secondary hover:text-white hover:bg-stellar-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </nav>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const queryParam = searchParams.get("q") ?? "";
  const typeParam = (searchParams.get("type") ?? "all") as ResultType;
  const sortParam = (searchParams.get("sort") ?? "relevance") as SortField;
  const orderParam = (searchParams.get("order") ?? "desc") as SortOrder;
  const pageParam = Math.max(1, Number(searchParams.get("page") ?? "1"));

  const [inputValue, setInputValue] = useState(queryParam);

  useEffect(() => {
    setInputValue(queryParam);
  }, [queryParam]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(updates)) {
          if (v === null || v === "") {
            next.delete(k);
          } else {
            next.set(k, v);
          }
        }
        return next;
      });
    },
    [setSearchParams]
  );

  const { data, isFetching, isError } = useQuery({
    queryKey: ["search-page", queryParam, PAGE_SIZE * 10],
    queryFn: () => searchIndexed(queryParam, PAGE_SIZE * 10),
    enabled: queryParam.length >= 2,
    staleTime: 30_000,
  });

  const allResults = data?.data.results ?? [];

  // Filter by type
  const filtered =
    typeParam === "all" ? allResults : allResults.filter((r) => r.type === typeParam);

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortParam === "relevance") {
      cmp = b.relevanceScore - a.relevanceScore;
    } else if (sortParam === "type") {
      cmp = a.type.localeCompare(b.type);
    } else if (sortParam === "title") {
      cmp = a.title.localeCompare(b.title);
    }
    return orderParam === "asc" ? -cmp : cmp;
  });

  // Pagination
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageParam, totalPages);
  const paginatedResults = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Group for display header counts
  const grouped: GroupedResults = { asset: [], bridge: [], incident: [], alert: [] };
  for (const r of allResults) {
    grouped[r.type].push(r);
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    updateParams({ q: trimmed, page: "1" });
  };

  const handleTypeChange = (t: ResultType) => {
    updateParams({ type: t === "all" ? null : t, page: "1" });
  };

  const handleSortChange = (field: SortField) => {
    if (field === sortParam) {
      updateParams({ order: orderParam === "asc" ? "desc" : "asc" });
    } else {
      updateParams({ sort: field, order: "desc", page: "1" });
    }
  };

  const handlePageChange = (p: number) => {
    updateParams({ page: String(p) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showSkeletons = isFetching && queryParam.length >= 2;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary">Search Results</h1>
        {queryParam && !isFetching && (
          <p className="mt-1 text-stellar-text-secondary text-sm">
            {total === 0
              ? "No results found"
              : `${total} result${total !== 1 ? "s" : ""} for "${queryParam}"`}
          </p>
        )}
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stellar-text-secondary pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 6.5 6.5a7.5 7.5 0 0 0 10.15 10.15z"
            />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search assets, bridges, incidents, alerts…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-stellar-card border border-stellar-border text-white placeholder:text-stellar-text-secondary focus:outline-none focus:border-stellar-blue/60 transition-colors"
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl bg-stellar-blue text-white font-medium hover:bg-stellar-blue/90 transition-colors text-sm"
        >
          Search
        </button>
      </form>

      {/* Filters + Sort bar */}
      {queryParam.length >= 2 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          {/* Type filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_TYPES.map((t) => {
              const count =
                t === "all" ? allResults.length : grouped[t as Exclude<ResultType, "all">].length;
              const isActive = typeParam === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-stellar-blue text-white"
                      : "bg-stellar-border text-stellar-text-secondary hover:text-white hover:bg-stellar-border/80"
                  }`}
                >
                  {TYPE_LABELS[t]}
                  {!isFetching && (
                    <span className={`ml-1.5 ${isActive ? "text-white/80" : "text-stellar-text-secondary"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sort controls */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-stellar-text-secondary">Sort:</span>
            {(["relevance", "type", "title"] as SortField[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => handleSortChange(f)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                  sortParam === f
                    ? "text-stellar-blue"
                    : "text-stellar-text-secondary hover:text-white"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {sortParam === f && (
                  <span className="text-xs">{orderParam === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          Search failed. Please try again.
        </div>
      )}

      {/* Results */}
      {showSkeletons ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <ResultSkeleton key={i} />
          ))}
        </div>
      ) : queryParam.length < 2 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-4 opacity-30">⊞</span>
          <p className="text-stellar-text-secondary text-sm">
            Enter at least 2 characters to search across assets, bridges, incidents, and alerts.
          </p>
        </div>
      ) : paginatedResults.length === 0 && !isFetching ? (
        <EmptyState query={queryParam} />
      ) : (
        <>
          <div className="space-y-3">
            {paginatedResults.map((result) => (
              <ResultCard key={`${result.type}-${result.id}`} result={result} query={queryParam} />
            ))}
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />

          {total > 0 && (
            <p className="text-center text-xs text-stellar-text-secondary pb-4">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
          )}
        </>
      )}
    </div>
  );
}
