import { useState } from "react";

interface VolumeData {
  volume24h?: number;
  volume7d?: number;
  volume30d?: number;
  customVolume?: number;
  startDate?: string;
  endDate?: string;
}

interface VolumeAnalyticsProps {
  data: VolumeData | null | undefined;
  isLoading: boolean;
  onDateRangeChange?: (startDate: string, endDate: string) => void;
}

export default function VolumeAnalytics({ data, isLoading, onDateRangeChange }: VolumeAnalyticsProps) {
  const [startDate, setStartDate] = useState(data?.startDate || "");
  const [endDate, setEndDate] = useState(data?.endDate || "");

  const handleApplyRange = () => {
    if (startDate && endDate && onDateRangeChange) {
      onDateRangeChange(startDate, endDate);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Volume Analytics</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-stellar-border rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-xl p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Volume Analytics</h3>
        <div className="flex items-center gap-2">
          <label className="text-xs text-stellar-text-secondary flex items-center gap-1">
            Start:
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-stellar-dark border border-stellar-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-stellar-blue"
              aria-label="Custom start date"
            />
          </label>
          <label className="text-xs text-stellar-text-secondary flex items-center gap-1">
            End:
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-stellar-dark border border-stellar-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-stellar-blue"
              aria-label="Custom end date"
            />
          </label>
          <button
            type="button"
            onClick={handleApplyRange}
            disabled={!startDate || !endDate}
            className="rounded bg-stellar-blue px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition"
            aria-label="Apply custom date range"
          >
            Apply
          </button>
        </div>
      </div>

      {data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          {data.volume24h !== undefined && (
            <div>
              <p className="text-xs text-stellar-text-secondary">24H Volume</p>
              <p className="text-lg font-semibold text-white">${data.volume24h.toLocaleString()}</p>
            </div>
          )}
          {data.volume7d !== undefined && (
            <div>
              <p className="text-xs text-stellar-text-secondary">7D Volume</p>
              <p className="text-lg font-semibold text-white">${data.volume7d.toLocaleString()}</p>
            </div>
          )}
          {data.volume30d !== undefined && (
            <div>
              <p className="text-xs text-stellar-text-secondary">30D Volume</p>
              <p className="text-lg font-semibold text-white">${data.volume30d.toLocaleString()}</p>
            </div>
          )}
          {data.customVolume !== undefined && (
            <div>
              <p className="text-xs text-stellar-text-secondary">Custom Range Volume</p>
              <p className="text-lg font-semibold text-stellar-blue">${data.customVolume.toLocaleString()}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-stellar-text-secondary text-sm">No volume data available.</p>
      )}
    </div>
  );
}
