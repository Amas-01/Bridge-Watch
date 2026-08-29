import React from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  accent?: string; // tailwind color e.g. 'bg-green-500'
  loading?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle, accent = "bg-indigo-500", loading }) => {
  return (
    <div className="flex flex-col p-4 rounded-lg shadow-sm bg-white dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${accent} animate-pulse`} aria-hidden />
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</h3>
        </div>
        <div className="text-xs text-slate-400">{subtitle}</div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="h-10 w-32 bg-slate-100 dark:bg-slate-700 rounded" />
        ) : (
          <div className="text-2xl font-semibold text-slate-900 dark:text-white">{value}</div>
        )}
      </div>
    </div>
  );
};
