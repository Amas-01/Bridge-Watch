import type { SearchResult, SearchCategory } from "../../hooks/useSearch";
import type { AssetSearchFacets } from "../../services/api";

// ─── Highlight helper ─────────────────────────────────────────────────────────

/**
 * Splits `text` into parts and wraps substrings that match `query` in a
 * `<mark>` element, case-insensitively.
 */
function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query) return <>{text}</>;

  const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-stellar-blue/30 text-white rounded-sm px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Category icon/label helpers ─────────────────────────────────────────────

const CATEGORY_META: Record<
  SearchCategory,
  { label: string; icon: string }
> = {
  assets: { label: "Assets", icon: "◈" },
  bridges: { label: "Bridges", icon: "⇄" },
  incidents: { label: "Incidents", icon: "!" },
  alerts: { label: "Alerts", icon: "^" },
  pages: { label: "Pages", icon: "⊞" },
};

const CATEGORY_ORDER: SearchCategory[] = ["assets", "bridges", "incidents", "alerts", "pages"];

// ─── AssetFacetCounts ─────────────────────────────────────────────────────────

const FACET_LABELS: Record<keyof AssetSearchFacets, string> = {
  bridgeProvider: "Bridge",
  sourceChain: "Chain",
};

function AssetFacetCounts({ facets }: { facets: AssetSearchFacets }) {
  const groups: Array<{ key: keyof AssetSearchFacets; label: string }> = [
    { key: "bridgeProvider", label: FACET_LABELS.bridgeProvider },
    { key: "sourceChain", label: FACET_LABELS.sourceChain },
  ].filter((group) => facets[group.key].length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="px-4 pb-2 flex flex-wrap gap-x-4 gap-y-1">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-stellar-text-secondary">{group.label}:</span>
          {facets[group.key].map((facet) => (
            <span
              key={facet.value}
              className="inline-flex items-center rounded-full bg-stellar-border px-2 py-0.5 text-xs text-stellar-text-secondary"
            >
              {facet.value} ({facet.count})
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── ResultItem ───────────────────────────────────────────────────────────────

interface ResultItemProps {
  result: SearchResult;
  query: string;
  isActive: boolean;
  onSelect: (result: SearchResult) => void;
  onMouseEnter: () => void;
}

export function ResultItem({
  result,
  query,
  isActive,
  onSelect,
  onMouseEnter,
}: ResultItemProps) {
  const { icon } = CATEGORY_META[result.category];

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors rounded-lg ${
        isActive
          ? "bg-stellar-blue/20 text-white"
          : "text-stellar-text-secondary hover:bg-stellar-border/50 hover:text-white"
      }`}
      onClick={() => onSelect(result)}
      onMouseEnter={onMouseEnter}
    >
      {/* Category icon */}
      <span
        className={`flex-none w-8 h-8 flex items-center justify-center rounded-md text-base font-mono ${
          isActive ? "bg-stellar-blue text-white" : "bg-stellar-border text-stellar-text-secondary"
        }`}
      >
        {icon}
      </span>

      {/* Text */}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate text-white">
          <HighlightedText
            text={result.title}
            query={query}
          />
        </span>
        {result.subtitle && (
          <span className="block text-xs text-stellar-text-secondary truncate mt-0.5">
            <HighlightedText text={result.subtitle} query={query} />
          </span>
        )}
      </span>

      {/* Arrow hint */}
      {isActive && (
        <span className="flex-none text-stellar-text-secondary text-xs">↵</span>
      )}
    </button>
  );
}

// ─── SearchResults ────────────────────────────────────────────────────────────

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  activeIndex: number;
  onSelect: (result: SearchResult) => void;
  onHover: (index: number) => void;
  /** Flat list of all displayed items — caller passes this so active index is
   *  computed relative to the same ordered array used for keyboard nav. */
  flatItems: SearchResult[];
  /** Facet counts for the "assets" category, shown under its group header. */
  assetFacets?: AssetSearchFacets;
}

export function SearchResults({
  results,
  query,
  activeIndex,
  onSelect,
  onHover,
  flatItems,
  assetFacets,
}: SearchResultsProps) {
  if (results.length === 0) return null;

  // Group by category in fixed display order
  const grouped = new Map<SearchCategory, SearchResult[]>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);
  for (const result of results) {
    grouped.get(result.category)!.push(result);
  }

  return (
    <div role="listbox" aria-label="Search results">
      {CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat)!;
        if (items.length === 0) return null;
        const { label } = CATEGORY_META[cat];

        return (
          <div key={cat} className="mb-2">
            <p className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-stellar-text-secondary">
              {label}
            </p>
            {cat === "assets" && assetFacets && <AssetFacetCounts facets={assetFacets} />}
            {items.map((result) => {
              const flatIdx = flatItems.indexOf(result);
              return (
                <ResultItem
                  key={result.id}
                  result={result}
                  query={query}
                  isActive={flatIdx === activeIndex}
                  onSelect={onSelect}
                  onMouseEnter={() => onHover(flatIdx)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── RecentSearches ───────────────────────────────────────────────────────────

interface RecentSearchesProps {
  items: SearchResult[];
  activeIndex: number;
  onSelect: (result: SearchResult) => void;
  onHover: (index: number) => void;
  onClear: () => void;
}

export function RecentSearches({
  items,
  activeIndex,
  onSelect,
  onHover,
  onClear,
}: RecentSearchesProps) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-stellar-text-secondary">
          Recent
        </p>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-stellar-text-secondary hover:text-white transition-colors"
        >
          Clear
        </button>
      </div>
      {items.map((result, i) => (
        <ResultItem
          key={result.id}
          result={result}
          query=""
          isActive={i === activeIndex}
          onSelect={onSelect}
          onMouseEnter={() => onHover(i)}
        />
      ))}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({ query }: { query: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-2xl mb-2">¿</p>
      <p className="text-sm font-medium text-white">
        No results for &ldquo;{query}&rdquo;
      </p>
      <p className="text-xs text-stellar-text-secondary mt-1">
        Try searching for an asset symbol, bridge name, incident, alert, or page.
      </p>
    </div>
  );
}
