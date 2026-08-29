import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { getSystemStatus } from "../services/api";

const DISMISSED_KEY = "maintenance-banner-dismissed";

interface SeverityConfig {
  bgColor: string;
  borderColor: string;
  iconColor: string;
  icon: string;
}

const SEVERITY_CONFIG: Record<"info" | "warning" | "critical", SeverityConfig> = {
  info: {
    bgColor: "bg-blue-500/15",
    borderColor: "border-blue-500/30",
    iconColor: "text-blue-400",
    icon: "ℹ️",
  },
  warning: {
    bgColor: "bg-amber-500/15",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-400",
    icon: "⚠️",
  },
  critical: {
    bgColor: "bg-rose-500/15",
    borderColor: "border-rose-500/30",
    iconColor: "text-rose-400",
    icon: "🔴",
  },
};

function MaintenanceBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(DISMISSED_KEY);
    if (stored) {
      const lastDismissed = parseInt(stored, 10);
      const oneHour = 60 * 60 * 1000;
      if (Date.now() - lastDismissed < oneHour) {
        setDismissed(true);
      }
    }
  }, []);

  const { data: systemStatus } = useQuery({
    queryKey: ["system-status"],
    queryFn: getSystemStatus,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const maintenance = systemStatus?.maintenance;

  if (!maintenance?.active || dismissed) {
    return null;
  }

  const config = SEVERITY_CONFIG[maintenance.severity];

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    setDismissed(true);
  };

  const BannerIcon = () => (
    <span className="text-lg" aria-hidden="true">
      {config.icon}
    </span>
  );

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`border ${config.borderColor} ${config.bgColor} rounded-lg p-4 mb-4`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-center gap-2">
          <BannerIcon />
          <p className={`font-medium ${config.iconColor}`}>
            {maintenance.message || "System is under maintenance"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          {maintenance.statusPageUrl && (
            <a
              href={maintenance.statusPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-stellar-text-secondary hover:text-white underline underline-offset-2"
            >
              View Status Page →
            </a>
          )}
          <button
            onClick={handleDismiss}
            className="text-sm text-stellar-text-secondary hover:text-white transition-colors"
            aria-label="Dismiss this banner for one hour"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default MaintenanceBanner;