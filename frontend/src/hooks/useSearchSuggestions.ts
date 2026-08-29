/**
 * useSearchSuggestions
 *
 * A focused autocomplete hook built on top of useSearch.
 * Provides a minimal surface for the combobox/autocomplete pattern:
 *  - debounced query state (200 ms, handled by useSearch internally)
 *  - grouped suggestion results (assets, bridges, pages, …)
 *  - loading / empty states
 *  - recent-search persistence
 *  - keyboard-navigation helpers (activeIndex + navigation callbacks)
 */
import { useState, useCallback } from "react";
import { useSearch, type SearchResult, type SearchCategory } from "./useSearch";

export type { SearchResult, SearchCategory };

/** Groups a flat result array into a Map keyed by category. */
export function groupResults(
  results: SearchResult[]
): Map<SearchCategory, SearchResult[]> {
  const grouped = new Map<SearchCategory, SearchResult[]>();
  for (const result of results) {
    const bucket = grouped.get(result.category) ?? [];
    bucket.push(result);
    grouped.set(result.category, bucket);
  }
  return grouped;
}

export interface UseSearchSuggestionsReturn {
  /** Raw text currently in the search input. */
  query: string;
  /** Setter for the raw query — debouncing is handled internally. */
  setQuery: (q: string) => void;
  /** Debounced query — the value actually used for API lookups. */
  debouncedQuery: string;
  /** Flat list of suggestion results (deduplicated, sorted by relevance). */
  suggestions: SearchResult[];
  /** Results grouped by category for rendering grouped lists. */
  groupedSuggestions: Map<SearchCategory, SearchResult[]>;
  /** True while the backend search request is in-flight. */
  isLoading: boolean;
  /** True when a debounced query produced zero results. */
  isEmpty: boolean;
  /** Recently selected search results, persisted to localStorage. */
  recentSearches: SearchResult[];
  /** Call when the user selects a suggestion to persist it in recents. */
  addRecentSearch: (result: SearchResult) => void;
  /** Wipes the recent searches list from state and localStorage. */
  clearRecentSearches: () => void;
  /** Index of the currently keyboard-highlighted suggestion (-1 = none). */
  activeIndex: number;
  /** Move keyboard highlight one position down in the flat list. */
  moveDown: () => void;
  /** Move keyboard highlight one position up (clamped to -1 = no selection). */
  moveUp: () => void;
  /** Reset keyboard highlight to "no selection". */
  resetActiveIndex: () => void;
}

/**
 * Delegates debouncing to useSearch (200 ms internal delay) and adds
 * keyboard-navigation state and grouped-results utilities on top.
 */
export function useSearchSuggestions(): UseSearchSuggestionsReturn {
  const {
    query,
    setQuery,
    debouncedQuery,
    results,
    isLoading,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
  } = useSearch();

  const [activeIndex, setActiveIndex] = useState(-1);

  const moveDown = useCallback(() => {
    setActiveIndex((i) => Math.min(i + 1, results.length - 1));
  }, [results.length]);

  const moveUp = useCallback(() => {
    setActiveIndex((i) => Math.max(i - 1, -1));
  }, []);

  const resetActiveIndex = useCallback(() => {
    setActiveIndex(-1);
  }, []);

  const groupedSuggestions = groupResults(results);
  const isEmpty = debouncedQuery.length > 0 && !isLoading && results.length === 0;

  return {
    query,
    setQuery,
    debouncedQuery,
    suggestions: results,
    groupedSuggestions,
    isLoading,
    isEmpty,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    activeIndex,
    moveDown,
    moveUp,
    resetActiveIndex,
  };
}
