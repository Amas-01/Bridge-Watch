import { useState, useMemo } from "react";
import { useAssetsWithHealth } from "../hooks/useAssets";
import { useBridges } from "../hooks/useBridges";
import PrintButton from "../components/PrintButton";
import ReportQuickActions from "../components/ReportQuickActions";
import { TableFooterSummary } from "../components/TableFooterSummary";
import { sumColumn, avgColumn, formatCompact } from "../utils/tableSummary";
import { AssetStatusBadge } from "../components/AssetStatusBadge";
import { bridgeStatusToAssetStatus, scoreToStatus } from "../utils/status";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReportTemplate = "overview" | "assets" | "bridges" | "custom";

interface DateRange {
  from: string;
  to: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-stellar-text-secondary";
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function scoreLabel(score: number | null): string {
  if (score === null) return "No data";
  if (score >= 80) return "Healthy";
  if (score >= 50) return "Warning";
  return "Critical";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Shared printed report header — hidden on screen, visible in print CSS. */
function ReportHeader({
  title,
  dateRange,
}: {
  title: string;
  dateRange: DateRange;
}) {
  const now = new Date().toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <div className="print-header hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-stellar-blue">
            Bridge Watch · Stellar Network Monitor
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">{title}</h1>
          {dateRange.from && dateRange.to && (
            <p className="mt-1 text-sm text-stellar-text-secondary">
              Period: {formatDate(dateRange.from)} – {formatDate(dateRange.to)}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-stellar-text-secondary">
          <p>Generated</p>
          <p className="font-medium text-white">{now}</p>
        </div>
      </div>
    </div>
  );
}

/** Shared printed report footer — fixed to the bottom of each printed page. */
function ReportFooter() {
  return (
    <div className="print-footer hidden text-center text-xs text-stellar-text-secondary">
      Bridge Watch · Stellar Network Monitor · Confidential — for internal use
      only
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report templates
// ---------------------------------------------------------------------------

function OverviewReport({
  dateRange,
  assetsData,
  bridgesData,
}: {
  dateRange: DateRange;
  assetsData: ReturnType<typeof useAssetsWithHealth>["data"];
  bridgesData: ReturnType<typeof useBridges>["data"];
}) {
  const totalAssets = assetsData?.length ?? 0;
  const healthy =
    assetsData?.filter((a) => (a.health?.overallScore ?? 0) >= 80).length ?? 0;
  const warning =
    assetsData?.filter(
      (a) =>
        (a.health?.overallScore ?? 0) >= 50 &&
        (a.health?.overallScore ?? 0) < 80,
    ).length ?? 0;
  const critical =
    assetsData?.filter((a) => (a.health?.overallScore ?? 101) < 50).length ?? 0;
  const avgScore =
    totalAssets > 0
      ? (
          (assetsData ?? [])
            .map((a) => a.health?.overallScore ?? 0)
            .reduce((s, v) => s + v, 0) / totalAssets
        ).toFixed(1)
      : "—";
  const totalBridges = bridgesData?.bridges?.length ?? 0;

  return (
    <div className="space-y-6">
      <ReportHeader title="Network Overview Report" dateRange={dateRange} />

      {/* Summary stats */}
      <section className="print-avoid-break">
        <h2 className="text-lg font-semibold text-white mb-3">Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Assets Tracked", value: totalAssets },
            { label: "Average Health Score", value: avgScore },
            { label: "Total Bridges", value: totalBridges },
            {
              label: "Report Period",
              value: `${dateRange.from} — ${dateRange.to}`,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-stellar-card border border-stellar-border rounded-lg p-4 print-avoid-break"
            >
              <p className="text-xs text-stellar-text-secondary uppercase tracking-wide">
                {stat.label}
              </p>
              <p className="mt-1 text-xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Status breakdown */}
      <section className="print-avoid-break">
        <h2 className="text-lg font-semibold text-white mb-3">
          Asset Health Distribution
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Healthy (≥ 80)",
              count: healthy,
              color: "text-green-400",
            },
            {
              label: "Warning (50–79)",
              count: warning,
              color: "text-yellow-400",
            },
            {
              label: "Critical (< 50)",
              count: critical,
              color: "text-red-400",
            },
          ].map((row) => (
            <div
              key={row.label}
              className="bg-stellar-card border border-stellar-border rounded-lg p-4"
            >
              <p className="text-xs text-stellar-text-secondary">{row.label}</p>
              <p className={`mt-1 text-3xl font-bold ${row.color}`}>
                {row.count}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* All assets table */}
      <section className="print-avoid-break">
        <h2 className="text-lg font-semibold text-white mb-3">
          Asset Health Table
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-stellar-border text-left text-stellar-text-secondary">
                <th className="pb-2 pr-4 font-medium">Asset</th>
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Health Score</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {(assetsData ?? []).map((asset) => (
                <tr
                  key={asset.symbol}
                  className="border-b border-stellar-border/50 text-white print-avoid-break"
                >
                  <td className="py-2 pr-4 font-mono font-semibold">
                    {asset.symbol}
                  </td>
                  <td className="py-2 pr-4 text-stellar-text-secondary">
                    {asset.name}
                  </td>
                  <td className="py-2 pr-4 font-bold text-white">
                    {asset.health?.overallScore ?? "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <AssetStatusBadge
                      status={scoreToStatus(asset.health?.overallScore)}
                      size="sm"
                    />
                  </td>
                  <td className="py-2 capitalize text-stellar-text-secondary">
                    {asset.health?.trend ?? "—"}
                  </td>
                </tr>
              ))}
              {(assetsData ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-6 text-center text-stellar-text-secondary"
                  >
                    No asset data available
                  </td>
                </tr>
              )}
            </tbody>
            <TableFooterSummary
              ariaLabel="Asset health table summary"
              columns={[
                {
                  id: "symbol",
                  value: `${(assetsData ?? []).length} assets`,
                  ariaLabel: "Total assets",
                },
                { id: "name", value: "" },
                {
                  id: "score",
                  value: avgScore !== "—" ? `Avg ${avgScore}` : "—",
                  ariaLabel: "Average health score",
                },
                {
                  id: "status",
                  value: `${healthy} healthy · ${warning} warning · ${critical} critical`,
                  ariaLabel: "Status distribution",
                },
                { id: "trend", value: "" },
              ]}
              summaryNote="Health scores range 0–100. Healthy ≥ 80, Warning 50–79, Critical < 50."
            />
          </table>
        </div>
      </section>

      <ReportFooter />
    </div>
  );
}

function AssetsReport({
  dateRange,
  assetsData,
}: {
  dateRange: DateRange;
  assetsData: ReturnType<typeof useAssetsWithHealth>["data"];
}) {
  return (
    <div className="space-y-6">
      <ReportHeader
        title="Asset Health Detailed Report"
        dateRange={dateRange}
      />

      {(assetsData ?? []).map((asset, idx) => (
        <section
          key={asset.symbol}
          className={`bg-stellar-card border border-stellar-border rounded-lg p-6 print-avoid-break ${
            idx > 0 ? "print-break-before" : ""
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{asset.symbol}</h2>
              <p className="text-sm text-stellar-text-secondary">
                {asset.name}
              </p>
            </div>
            <div className="text-right">
              <p
                className={`text-3xl font-bold ${scoreColor(
                  asset.health?.overallScore ?? null,
                )}`}
              >
                {asset.health?.overallScore ?? "—"}
              </p>
              <p
                className={`text-sm font-medium ${scoreColor(
                  asset.health?.overallScore ?? null,
                )}`}
              >
                {scoreLabel(asset.health?.overallScore ?? null)}
              </p>
            </div>
          </div>

          {asset.health && (
            <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {[
                {
                  label: "Liquidity Depth",
                  value: asset.health.factors.liquidityDepth,
                },
                {
                  label: "Price Stability",
                  value: asset.health.factors.priceStability,
                },
                {
                  label: "Bridge Uptime",
                  value: asset.health.factors.bridgeUptime,
                },
                {
                  label: "Reserve Backing",
                  value: asset.health.factors.reserveBacking,
                },
                {
                  label: "Volume Trend",
                  value: asset.health.factors.volumeTrend,
                },
                { label: "Trend", value: asset.health.trend, isText: true },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-stellar-dark rounded-lg p-3"
                >
                  <dt className="text-stellar-text-secondary">{item.label}</dt>
                  <dd
                    className={`mt-1 font-semibold ${
                      item.isText
                        ? "text-white capitalize"
                        : scoreColor(
                            typeof item.value === "number" ? item.value : null,
                          )
                    }`}
                  >
                    {item.value ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <p className="mt-3 text-xs text-stellar-text-secondary">
            Last updated:{" "}
            {asset.health?.lastUpdated
              ? formatDate(asset.health.lastUpdated)
              : "No data"}
          </p>
        </section>
      ))}

      {(assetsData ?? []).length === 0 && (
        <p className="text-center text-stellar-text-secondary py-8">
          No asset data available for this report.
        </p>
      )}

      <ReportFooter />
    </div>
  );
}

function BridgesReport({
  dateRange,
  bridgesData,
}: {
  dateRange: DateRange;
  bridgesData: ReturnType<typeof useBridges>["data"];
}) {
  const bridges = bridgesData?.bridges ?? [];

  return (
    <div className="space-y-6">
      <ReportHeader title="Bridge Status Report" dateRange={dateRange} />

      <section className="print-avoid-break">
        <h2 className="text-lg font-semibold text-white mb-3">
          Bridge Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Bridges", value: bridges.length },
            {
              label: "Healthy",
              value: bridges.filter((b) => b.status === "healthy").length,
            },
            {
              label: "Degraded",
              value: bridges.filter((b) => b.status === "degraded").length,
            },
            {
              label: "Down",
              value: bridges.filter((b) => b.status === "down").length,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-stellar-card border border-stellar-border rounded-lg p-4"
            >
              <p className="text-xs text-stellar-text-secondary uppercase tracking-wide">
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-white">{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Bridge Detail</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-stellar-border text-left text-stellar-text-secondary">
                <th className="pb-2 pr-4 font-medium">Bridge</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">TVL</th>
                <th className="pb-2 pr-4 font-medium">Supply (Stellar)</th>
                <th className="pb-2 pr-4 font-medium">Supply (Source)</th>
                <th className="pb-2 font-medium">Mismatch %</th>
              </tr>
            </thead>
            <tbody>
              {bridges.map((bridge) => {
                return (
                  <tr
                    key={bridge.name}
                    className="border-b border-stellar-border/50 text-white print-avoid-break"
                  >
                    <td className="py-2 pr-4 font-semibold">{bridge.name}</td>
                    <td className="py-2 pr-4">
                      <AssetStatusBadge
                        status={bridgeStatusToAssetStatus(bridge.status)}
                        size="sm"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      ${bridge.totalValueLocked.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      {bridge.supplyOnStellar.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      {bridge.supplyOnSource.toLocaleString()}
                    </td>
                    <td
                      className={`py-2 font-medium ${
                        bridge.mismatchPercentage > 1
                          ? "text-red-400"
                          : bridge.mismatchPercentage > 0.1
                            ? "text-yellow-400"
                            : "text-green-400"
                      }`}
                    >
                      {bridge.mismatchPercentage.toFixed(3)}%
                    </td>
                  </tr>
                );
              })}
              {bridges.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-6 text-center text-stellar-text-secondary"
                  >
                    No bridge data available
                  </td>
                </tr>
              )}
            </tbody>
            <TableFooterSummary
              ariaLabel="Bridge status table summary"
              columns={[
                {
                  id: "name",
                  value: `${bridges.length} bridges`,
                  ariaLabel: "Total bridges",
                },
                { id: "status", value: "" },
                {
                  id: "tvl",
                  value: formatCompact(
                    sumColumn(bridges.map((b) => b.totalValueLocked)),
                  ),
                  ariaLabel: "Total value locked",
                  align: "right",
                },
                {
                  id: "stellar",
                  value: (
                    sumColumn(bridges.map((b) => b.supplyOnStellar)) ?? 0
                  ).toLocaleString(),
                  ariaLabel: "Total supply on Stellar",
                  align: "right",
                },
                {
                  id: "source",
                  value: (
                    sumColumn(bridges.map((b) => b.supplyOnSource)) ?? 0
                  ).toLocaleString(),
                  ariaLabel: "Total supply on source chain",
                  align: "right",
                },
                {
                  id: "mismatch",
                  value: `${(avgColumn(bridges.map((b) => b.mismatchPercentage)) ?? 0).toFixed(3)}%`,
                  ariaLabel: "Average mismatch percentage",
                  align: "right",
                },
              ]}
              summaryNote="TVL and supply figures are approximate. Mismatch % is the average across all bridges."
            />
          </table>
        </div>
      </section>

      <ReportFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Reports page
// ---------------------------------------------------------------------------

const TEMPLATES: { id: ReportTemplate; label: string; description: string }[] =
  [
    {
      id: "overview",
      label: "Network Overview",
      description:
        "High-level summary of all assets and bridges with status distribution.",
    },
    {
      id: "assets",
      label: "Asset Health Detail",
      description:
        "Per-asset score breakdown including all health factor components.",
    },
    {
      id: "bridges",
      label: "Bridge Status",
      description: "Bridge TVL, supply consistency, and mismatch analysis.",
    },
    {
      id: "custom",
      label: "Custom Report",
      description: "Combine overview and bridge data with a custom date range.",
    },
  ];

export default function Reports() {
  const {
    data: assetsData,
    isLoading: assetsLoading,
    refetch: refetchAssets,
  } = useAssetsWithHealth();
  const {
    data: bridgesData,
    isLoading: bridgesLoading,
    refetch: refetchBridges,
  } = useBridges();

  const [activeTemplate, setActiveTemplate] =
    useState<ReportTemplate>("overview");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: thirtyDaysAgo(),
    to: nowIso(),
  });

  const isLoading = assetsLoading || bridgesLoading;

  const generatedAt = useMemo(
    () =>
      new Date().toLocaleString("en-US", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    [],
  );

  const handleRefresh = async () => {
    await Promise.all([refetchAssets(), refetchBridges()]);
  };

  const handleExportCsv = (): string | null => {
    if (activeTemplate === "assets" || activeTemplate === "overview") {
      const rows = (assetsData ?? []).map(
        (a) =>
          `${a.symbol},${a.name},${a.health?.overallScore ?? ""},${a.health?.trend ?? ""}`,
      );
      return ["Symbol,Name,Health Score,Trend", ...rows].join("\n");
    }
    if (activeTemplate === "bridges" || activeTemplate === "custom") {
      const rows = (bridgesData?.bridges ?? []).map(
        (b) =>
          `${b.name},${b.status},${b.totalValueLocked},${b.supplyOnStellar},${b.supplyOnSource},${b.mismatchPercentage}`,
      );
      return [
        "Bridge,Status,TVL,Supply (Stellar),Supply (Source),Mismatch %",
        ...rows,
      ].join("\n");
    }
    return null;
  };

  const handleExportJson = (): string | null => {
    if (activeTemplate === "assets" || activeTemplate === "overview") {
      return JSON.stringify(assetsData ?? [], null, 2);
    }
    if (activeTemplate === "bridges" || activeTemplate === "custom") {
      return JSON.stringify(bridgesData?.bridges ?? [], null, 2);
    }
    return null;
  };

  return (
    <div className="space-y-8">
      {/* ── Screen-only controls (hidden in print) ── */}
      <header className="no-print">
        <h1 className="text-3xl font-bold text-white">Reports</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Generate print-ready reports and export them as PDF using your
          browser's built-in Save as PDF option.
        </p>
      </header>

      {/* Template selector */}
      <section className="no-print">
        <h2 className="text-lg font-semibold text-white mb-3">
          Report Template
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setActiveTemplate(tpl.id)}
              aria-pressed={activeTemplate === tpl.id}
              className={[
                "rounded-lg border p-4 text-left transition-colors focus:outline-none",
                "focus:ring-2 focus:ring-stellar-blue",
                activeTemplate === tpl.id
                  ? "border-stellar-blue bg-stellar-blue/10 text-white"
                  : "border-stellar-border bg-stellar-card text-stellar-text-secondary hover:text-white",
              ].join(" ")}
            >
              <p className="font-semibold text-sm">{tpl.label}</p>
              <p className="mt-1 text-xs leading-snug">{tpl.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Date range controls */}
      <section className="no-print">
        <h2 className="text-lg font-semibold text-white mb-3">Date Range</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label
              htmlFor="date-from"
              className="block text-sm text-stellar-text-secondary mb-1"
            >
              From
            </label>
            <input
              id="date-from"
              type="date"
              value={dateRange.from}
              max={dateRange.to}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, from: e.target.value }))
              }
              className="rounded-lg border border-stellar-border bg-stellar-card px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            />
          </div>
          <div>
            <label
              htmlFor="date-to"
              className="block text-sm text-stellar-text-secondary mb-1"
            >
              To
            </label>
            <input
              id="date-to"
              type="date"
              value={dateRange.to}
              min={dateRange.from}
              max={nowIso()}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, to: e.target.value }))
              }
              className="rounded-lg border border-stellar-border bg-stellar-card px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            />
          </div>

          <PrintButton label="Print / Export PDF" />
        </div>

        <div className="mt-4">
          <ReportQuickActions
            onRefresh={handleRefresh}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            disabled={isLoading}
          />
        </div>
      </section>

      {/* ── Report content (visible on screen + printed) ── */}
      <div
        id="report-content"
        className="bg-stellar-card border border-stellar-border rounded-lg p-6 space-y-4"
        aria-live="polite"
      >
        {/* Screen-only report meta banner */}
        <div className="no-print flex items-center justify-between border-b border-stellar-border pb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-stellar-blue font-semibold">
              Bridge Watch · Stellar Network Monitor
            </p>
            <h2 className="text-xl font-bold text-white mt-1">
              {TEMPLATES.find((t) => t.id === activeTemplate)?.label}
            </h2>
            <p className="text-sm text-stellar-text-secondary mt-1">
              Period: {formatDate(dateRange.from)} – {formatDate(dateRange.to)}{" "}
              · Generated: {generatedAt}
            </p>
          </div>
          <PrintButton label="Print this report" />
        </div>

        {isLoading ? (
          <div
            className="py-16 text-center text-stellar-text-secondary"
            role="status"
          >
            Loading report data…
          </div>
        ) : (
          <>
            {(activeTemplate === "overview" || activeTemplate === "custom") && (
              <OverviewReport
                dateRange={dateRange}
                assetsData={assetsData}
                bridgesData={bridgesData}
              />
            )}
            {activeTemplate === "assets" && (
              <AssetsReport dateRange={dateRange} assetsData={assetsData} />
            )}
            {activeTemplate === "bridges" && (
              <BridgesReport dateRange={dateRange} bridgesData={bridgesData} />
            )}
            {activeTemplate === "custom" && (
              <BridgesReport dateRange={dateRange} bridgesData={bridgesData} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
