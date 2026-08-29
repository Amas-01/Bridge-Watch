import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchIndexed, type IndexedSearchResult, type AssetSearchFacets } from "../services/api";

export type SearchCategory = "assets" | "bridges" | "incidents" | "alerts" | "pages";

export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  category: SearchCategory;
  href: string;
  matchText?: string;
}

const STORAGE_KEY = "bridge-watch:recent-searches";
const SAVED_STORAGE_KEY = "bridge-watch:saved-searches";
const MAX_RECENT = 8;
const MAX_SAVED = 30;
const DEBOUNCE_MS = 200;

const PAGE_RESULTS: SearchResult[] = [
  {
    id: "page-dashboard",
    title: "Dashboard",
    subtitle: "Overview of all assets and bridges",
    category: "pages",
    href: "/",
  },
  {
    id: "page-bridges",
    title: "Bridges",
    subtitle: "Cross-chain bridge status, incidents, and TVL",
    category: "pages",
    href: "/bridges",
  },
  {
    id: "page-incidents",
    title: "Incidents",
    subtitle: "Bridge incident tracking and follow-up actions",
    category: "pages",
    href: "/incidents",
  },
  {
    id: "page-analytics",
    title: "Analytics",
    subtitle: "Historical data and performance metrics",
    category: "pages",
    href: "/analytics",
  },
  {
    id: "page-settings",
    title: "Settings",
    subtitle: "Notification preferences and alert controls",
    category: "pages",
    href: "/settings",
  },
  {
    id: "page-help",
    title: "Help Center",
    subtitle: "Documentation, FAQ, and contextual guidance",
    category: "pages",
    href: "/help",
  },
];

function loadRecentSearches(): SearchResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SearchResult[]) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(items: SearchResult[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    // Ignore storage quota failures.
  }
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: string;
  updatedAt: string;
}

function loadSavedSearches(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(SAVED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSearch[]) : [];
  } catch {
    return [];
  }
}

function saveSavedSearches(items: SavedSearch[]): void {
  try {
    localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_SAVED)));
  } catch {
    // Ignore storage quota failures.
  }
}

function matchScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 3;
  if (t.startsWith(q)) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

function mapIndexedCategory(type: IndexedSearchResult["type"]): SearchCategory {
  switch (type) {
    case "asset":
      return "assets";
    case "bridge":
      return "bridges";
    case "incident":
      return "incidents";
    case "alert":
      return "alerts";
  }
}

function resolveHref(result: IndexedSearchResult): string {
  if (typeof result.metadata.href === "string") {
    return result.metadata.href;
  }

  switch (result.type) {
    case "asset":
      return typeof result.metadata.symbol === "string"
        ? `/assets/${result.metadata.symbol}`
        : "/";
    case "bridge":
      return "/bridges";
    case "incident":
      return "/incidents";
    case "alert":
      return "/settings";
  }
}

function mapIndexedResult(result: IndexedSearchResult): SearchResult {
  return {
    id: `${result.type}-${result.id}`,
    title: result.title,
    subtitle: result.description,
    category: mapIndexedCategory(result.type),
    href: resolveHref(result),
    matchText: [result.title, result.description, ...result.highlights].join(" ").trim(),
  };
}

export interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResult[];
  assetFacets: AssetSearchFacets | undefined;
  isLoading: boolean;
  recentSearches: SearchResult[];
  addRecentSearch: (result: SearchResult) => void;
  clearRecentSearches: () => void;
  savedSearches: SavedSearch[];
  saveCurrentQuery: (name?: string) => SavedSearch | null;
  deleteSavedSearch: (id: string) => void;
  renameSavedSearch: (id: string, name: string) => void;
  applySavedSearch: (id: string) => string | null;
  getSavedSearchShareUrl: (saved: SavedSearch) => string;
  debouncedQuery: string;
}

export function useSearch(): UseSearchReturn {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>(
    loadRecentSearches
  );
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(loadSavedSearches);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: indexedData, isFetching } = useQuery({
    queryKey: ["indexed-search", debouncedQuery],
    queryFn: () => searchIndexed(debouncedQuery, 12),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const { data: assetFacetsData } = useQuery({
    queryKey: ["indexed-search-asset-facets", debouncedQuery],
    queryFn: () => searchIndexed(debouncedQuery, 1, "asset"),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const assetFacets: AssetSearchFacets | undefined = assetFacetsData?.data.facets;

  const results = useMemo<SearchResult[]>(() => {
    const q = debouncedQuery;
    if (!q) return [];

    const remoteResults = (indexedData?.data.results ?? []).map(mapIndexedResult);

    const pageMatches = PAGE_RESULTS
      .map((page) => ({
        page,
        score: Math.max(
          matchScore(page.title, q),
          matchScore(page.subtitle ?? "", q)
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((item) => item.page);

    const combined = [...remoteResults, ...pageMatches];
    const deduped: SearchResult[] = [];
    const seen = new Set<string>();

    for (const result of combined) {
      if (seen.has(result.id)) continue;
      seen.add(result.id);
      deduped.push(result);
    }

    return deduped;
  }, [debouncedQuery, indexedData]);

  const addRecentSearch = useCallback((result: SearchResult) => {
    setRecentSearches((prev) => {
      const deduped = [result, ...prev.filter((item) => item.id !== result.id)];
      const trimmed = deduped.slice(0, MAX_RECENT);
      saveRecentSearches(trimmed);
      return trimmed;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const saveCurrentQuery = useCallback((name?: string) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return null;

    const now = new Date().toISOString();
    const newSaved: SavedSearch = {
      id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name?.trim() || normalizedQuery,
      query: normalizedQuery,
      createdAt: now,
      updatedAt: now,
    };

    setSavedSearches((prev) => {
      const deduped = [
        newSaved,
        ...prev.filter(
          (item) => item.query.toLowerCase() !== normalizedQuery.toLowerCase() || item.name !== newSaved.name
        ),
      ];
      saveSavedSearches(deduped);
      return deduped.slice(0, MAX_SAVED);
    });

    return newSaved;
  }, [query]);

  const deleteSavedSearch = useCallback((id: string) => {
    setSavedSearches((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveSavedSearches(next);
      return next;
    });
  }, []);

  const renameSavedSearch = useCallback((id: string, name: string) => {
    const normalized = name.trim();
    if (!normalized) return;

    setSavedSearches((prev) => {
      const next = prev.map((item) =>
        item.id === id ? { ...item, name: normalized, updatedAt: new Date().toISOString() } : item
      );
      saveSavedSearches(next);
      return next;
    });
  }, []);

  const applySavedSearch = useCallback((id: string) => {
    const selected = savedSearches.find((item) => item.id === id);
    if (!selected) return null;
    setQuery(selected.query);
    return selected.query;
  }, [savedSearches]);

  const getSavedSearchShareUrl = useCallback((saved: SavedSearch) => {
    const share = new URL(window.location.href);
    share.searchParams.set("q", saved.query);
    return share.toString();
  }, []);

  return {
    query,
    setQuery,
    results,
    assetFacets,
    isLoading: isFetching,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
    savedSearches,
    saveCurrentQuery,
    deleteSavedSearch,
    renameSavedSearch,
    applySavedSearch,
    getSavedSearchShareUrl,
    debouncedQuery,
  };
}
