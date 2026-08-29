import { useState, useEffect } from "react";
import { SummaryCard } from "../SummaryCard";
import type { ReactNode } from "react";

interface DrilldownMetric {
  id: string;
  label: string;
  value: string | number;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
  icon?: ReactNode;
  href?: string;
}

interface MetricsDrilldownProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: DrilldownMetric[];
  title?: string;
  loading?: boolean;
}

export default function MetricsDrilldown({
  isOpen,
  onClose,
  metrics,
  title = "Metrics Drilldown",
  loading = false,
}: MetricsDrilldownProps) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsClosing(false);
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-300"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`bg-stellar-card border border-stellar-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col transition-all duration-300 ${
          isClosing ? "opacity-0 scale-95" : "opacity-100 scale-100"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stellar-border bg-stellar-dark/30">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stellar-text-secondary hover:text-white transition-colors"
            aria-label="Close drilldown panel"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="bg-stellar-card border border-stellar-border rounded-lg p-5 animate-pulse"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-6 w-6 bg-stellar-border rounded" />
                    <div className="h-4 w-24 bg-stellar-border rounded" />
                  </div>
                  <div className="h-8 w-32 bg-stellar-border rounded mb-3" />
                  <div className="h-3 w-20 bg-stellar-border rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {metrics.map((metric) => (
                <SummaryCard
                  key={metric.id}
                  title={metric.label}
                  value={metric.value}
                  trend={metric.trend}
                  icon={metric.icon}
                  href={metric.href}
                />
              ))}
            </div>
          )}

          {/* Chart Section */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-white mb-4">Detailed Metrics</h3>
            <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
              {loading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-pulse space-y-3 w-full">
                    <div className="h-4 w-1/3 bg-stellar-border rounded" />
                    <div className="h-48 w-full bg-stellar-border rounded" />
                  </div>
                </div>
              ) : (
                <div className="text-stellar-text-secondary text-center py-8">
                  <p>Chart visualization would render here</p>
                  <p className="text-sm mt-2">Connect to your charting library for detailed metrics</p>
                </div>
              )}
            </div>
          </div>

          {/* Table Section */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-white mb-4">Underlying Data</h3>
            <div className="bg-stellar-card border border-stellar-border rounded-lg overflow-hidden">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-4 w-full bg-stellar-border rounded" />
                  ))}
                </div>
              ) : (
                <div className="text-stellar-text-secondary text-center py-8">
                  <p>Data table would render here</p>
                  <p className="text-sm mt-2">Connect to your data source for detailed metrics</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stellar-border bg-stellar-dark/30 flex items-center justify-between">
          <span className="text-sm text-stellar-text-secondary">
            {loading ? "Loading metrics..." : `${metrics.length} metrics available`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-stellar-blue text-white rounded-lg hover:bg-stellar-blue/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
