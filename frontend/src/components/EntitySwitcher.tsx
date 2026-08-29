import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAssetsWithHealth } from "../hooks/useAssets";
import { useBridges } from "../hooks/useBridges";
import type { AssetWithHealth, Bridge } from "../types";

type EntityKind = "asset" | "bridge" | "incident";

interface EntityItem {
  id: string;
  kind: EntityKind;
  title: string;
  subtitle: string;
  status?: string;
  href: string;
}

const RECENTS_KEY = "bridge-watch:entity-switcher-recents";
const MAX_RECENTS = 6;

const KIND_LABEL: Record<EntityKind, string> = {
  asset: "Asset",
  bridge: "Bridge",
  incident: "Incident",
};

function getAssetStatus(asset: AssetWithHealth): string {
  const score = asset.health?.overallScore;
  if (typeof score !== "number") return "No health score";
  if (score >= 80) return "Healthy";
  if (score >= 50) return "Watch";
  return "Critical";
}

function buildItems(assets: AssetWithHealth[], bridges: Bridge[]): EntityItem[] {
  const assetItems = assets.map((asset) => ({
    id: `asset:${asset.symbol}`,
    kind: "asset" as const,
    title: asset.symbol,
    subtitle: asset.name || "Monitored asset",
    status: getAssetStatus(asset),
    href: `/assets/${encodeURIComponent(asset.symbol)}`,
  }));

  const bridgeItems = bridges.map((bridge) => ({
    id: `bridge:${bridge.name}`,
    kind: "bridge" as const,
    title: bridge.name,
    subtitle: `${bridge.status} - $${bridge.totalValueLocked.toLocaleString()} TVL`,
    status: `${bridge.mismatchPercentage.toFixed(3)}% mismatch`,
    href: `/bridges?entity=${encodeURIComponent(bridge.name)}`,
  }));

  const incidentItems = [
    {
      id: "incident:heatmap",
      kind: "incident" as const,
      title: "Incident heatmap",
      subtitle: "Review bridge incident clustering and follow-up signals",
      status: "Operational view",
      href: "/incidents",
    },
    ...bridges
      .filter((bridge) => bridge.status === "degraded" || bridge.status === "down")
      .slice(0, 5)
      .map((bridge) => ({
        id: `incident:${bridge.name}`,
        kind: "incident" as const,
        title: `${bridge.name} incident review`,
        subtitle: `${bridge.name} is currently ${bridge.status}`,
        status: bridge.status,
        href: `/incidents?bridgeId=${encodeURIComponent(bridge.name)}`,
      })),
  ];

  return [...assetItems, ...bridgeItems, ...incidentItems];
}

function loadRecents(): EntityItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as EntityItem[]) : [];
  } catch {
    return [];
  }
}

function saveRecents(items: EntityItem[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)));
  } catch {
    // Ignore storage failures; recents are a convenience only.
  }
}

export default function EntitySwitcher() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<EntityItem[]>(loadRecents);
  const { data: assets = [], isLoading: assetsLoading } = useAssetsWithHealth({
    refetchOnWindowFocus: false,
  });
  const { data: bridgesData, isLoading: bridgesLoading } = useBridges({
    refetchOnWindowFocus: false,
  });

  const allItems = useMemo(
    () => buildItems(assets, bridgesData?.bridges ?? []),
    [assets, bridgesData?.bridges],
  );

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      const recentIds = new Set(recents.map((item) => item.id));
      const freshRecents = recents.filter((recent) =>
        allItems.some((item) => item.id === recent.id),
      );
      const topItems = allItems.filter((item) => !recentIds.has(item.id)).slice(0, 8);
      return [...freshRecents, ...topItems].slice(0, 10);
    }

    return allItems
      .filter((item) =>
        [item.title, item.subtitle, KIND_LABEL[item.kind], item.status ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 12);
  }, [allItems, query, recents]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, visibleItems.length]);

  useEffect(() => {
    if (!open) return;

    let touchStart: { x: number; y: number } | null = null;
    let touchDragged = false;
    let suppressMouseUntil = 0;

    const onPointerDown = (event: MouseEvent) => {
      if (Date.now() < suppressMouseUntil) return;
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
      touchDragged = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || !touchStart) return;
      touchDragged =
        Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) > 8;
    };

    const onTouchEnd = (event: TouchEvent) => {
      suppressMouseUntil = Date.now() + 500;
      if (!touchDragged && !panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
      touchStart = null;
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [open]);

  function selectItem(item: EntityItem) {
    setRecents((current) => {
      const next = [item, ...current.filter((recent) => recent.id !== item.id)];
      saveRecents(next);
      return next.slice(0, MAX_RECENTS);
    });
    setOpen(false);
    setQuery("");
    navigate(item.href);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, visibleItems.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" && visibleItems[activeIndex]) {
      event.preventDefault();
      selectItem(visibleItems[activeIndex]);
    }
  }

  const loading = assetsLoading || bridgesLoading;

  return (
    <div className="relative" ref={panelRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-stellar-border px-3 py-2 text-sm text-stellar-text-primary transition-colors hover:border-stellar-blue hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">⌘</span>
        <span className="hidden sm:inline">Entities</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Entity switcher"
          className="fixed inset-x-3 top-20 z-50 rounded-lg border border-stellar-border bg-stellar-card shadow-2xl shadow-black/30 sm:absolute sm:right-0 sm:left-auto sm:top-12 sm:w-[28rem]"
        >
          <div className="border-b border-stellar-border p-3">
            <label htmlFor="entity-switcher-search" className="sr-only">
              Search entities
            </label>
            <input
              ref={inputRef}
              id="entity-switcher-search"
              type="search"
              autoComplete="off"
              placeholder="Search assets, bridges, incidents"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-10 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 text-sm text-stellar-text-primary placeholder-stellar-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2 p-2" aria-busy="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-md bg-stellar-border/70" />
                ))}
              </div>
            ) : visibleItems.length > 0 ? (
              <ul role="listbox" aria-label="Entity results" className="space-y-1">
                {visibleItems.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeIndex === index}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectItem(item)}
                      className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue ${
                        activeIndex === index
                          ? "bg-stellar-blue text-white"
                          : "text-stellar-text-primary hover:bg-stellar-dark"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span
                          className={`block truncate text-xs ${
                            activeIndex === index ? "text-white/80" : "text-stellar-text-secondary"
                          }`}
                        >
                          {item.subtitle}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            activeIndex === index
                              ? "border-white/50 text-white"
                              : "border-stellar-border text-stellar-text-secondary"
                          }`}
                        >
                          {KIND_LABEL[item.kind]}
                        </span>
                        {item.status ? (
                          <span
                            className={`text-[11px] ${
                              activeIndex === index ? "text-white/80" : "text-stellar-text-secondary"
                            }`}
                          >
                            {item.status}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-stellar-text-primary">No entities found</p>
                <p className="mt-1 text-xs text-stellar-text-secondary">
                  Try a symbol, bridge name, or incident keyword.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
