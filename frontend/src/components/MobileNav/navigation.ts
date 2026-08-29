export interface NavItem {
  to: string;
  label: string;
  /** i18n key under the translation namespace (e.g. nav.dashboard) */
  labelKey?: string;
  description: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    id: "monitoring",
    label: "Monitoring",
    items: [
      { to: "/dashboard", label: "Dashboard", labelKey: "nav.dashboard", description: "Real-time asset health overview" },
      { to: "/incidents", label: "Incidents", description: "Incident heatmap and clustering" },
      { to: "/incidents/replay/demo", label: "Incident Replay", description: "Replay incident event timelines" },
      { to: "/bridges", label: "Bridges", labelKey: "nav.bridges", description: "Bridge performance and incidents" },
      { to: "/bridge-topology", label: "Topology", description: "Explore bridge network graph and connections" },
      { to: "/transactions", label: "Transactions", description: "Recent bridge transfer activity" },
      { to: "/reconciliation", label: "Reconciliation", description: "Supply drift and reserve backing triage" },
      { to: "/cross-chain-verification", label: "State Verification", description: "Cryptographic cross-chain state proof validation" },
      { to: "/analytics", label: "Analytics", labelKey: "nav.analytics", description: "Trend analysis and health scoring" },
      { to: "/freshness", label: "Freshness", description: "Data freshness and staleness status for monitored sources" },
      { to: "/liquidity-dashboard", label: "Liquidity", description: "Aggregated liquidity depth across SDEX, StellarX AMM, and Phoenix" },
      { to: "/schema-drift", label: "Schema Drift", description: "Monitor field-level schema drift across upstream data sources" },
      { to: "/analytics", label: "Analytics", description: "Trend analysis and health scoring" },
      { to: "/analytics/metric-builder", label: "Metric Builder", description: "Create and save custom SQL metrics" },
      { to: "/data-provenance", label: "Provenance", description: "Trace metric lineage from source to destination" },
      { to: "/watchlist", label: "Watchlist", description: "Tracked assets and alerts" },
      { to: "/reports", label: "Reports", description: "Operational reporting views" },
      { to: "/bridge-health-timeline", label: "Health Timeline", description: "Bridge health score progression over time" },
      { to: "/asset-comparison", label: "Asset Matrix", description: "Compare multiple assets across key metrics" },
      { to: "/service-annotations", label: "Service Annotations", description: "Create and manage service annotations" },
      { to: "/asset-exposure", label: "Asset Exposure", description: "Asset exposure concentration dashboard and HHI scoring" },
      { to: "/transfer-sla", label: "Transfer SLA", description: "Bridge transfer latency SLA tracking and breach metrics" },
      { to: "/data-quality", label: "Data Quality", description: "Configurable data quality scoring and dimension weightings" },
      { to: "/provider-latency", label: "Provider Latency", description: "Side-by-side API and RPC provider latency comparison" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { to: "/help", label: "Help Center", description: "Search docs, FAQ, and support workflows" },
      { to: "/api-docs", label: "API Docs", labelKey: "nav.docs", description: "Interactive API documentation and explorer" },
      { to: "/admin/api-keys", label: "API Keys", description: "Manage integrator credentials" },
      { to: "/admin/api-key-templates", label: "API Key Templates", description: "Saved API key scope and rate-limit bundles" },
      { to: "/admin/import-validation-preview", label: "Import Validation", description: "Preview import validation before committing" },
      { to: "/admin/dataset-lineage", label: "Dataset Lineage", description: "Trace dataset column lineage and provenance" },
      { to: "/admin/quarantine", label: "Parse Quarantine", description: "Review and resolve failed-parse quarantine queue" },
      {
        to: "/admin/alert-routing",
        label: "Alert Routing",
        description: "Manage alert dispatch routing and audit",
      },
      {
        to: "/alert-playbooks",
        label: "Alert Playbooks",
        description: "Runbooks and remediation steps for triggered alerts",
      },
      {
        to: "/admin/access-audit",
        label: "Access Audit",
        description: "Review operator roles, permissions, and access history",
      },
      { to: "/settings", label: "Settings", labelKey: "nav.settings", description: "Notification and dashboard preferences" },
      { to: "/circuit-breaker-actions", label: "Circuit Breaker Remediation", description: "Manage automated circuit breaker remediation actions and execution logs" },
      { to: "/export-scheduler", label: "Export Scheduler", description: "Schedule recurring report exports" },
      { to: "/metrics-sidebar", label: "Pinned Metrics", description: "Pin and manage frequently viewed metrics" },
      { to: "/assets/lifecycle-timeline", label: "Lifecycle Timeline", description: "Asset lifecycle state transitions and audit timeline" },
      { to: "/notifications/permission-changes", label: "Permission Notifications", description: "Permission change alerts and user dispatches" },
      { to: "/user/devices", label: "Session Devices", description: "Manage active session devices and security revocations" },
      { to: "/admin/impersonation-safeguards", label: "Impersonation Safeguards", description: "Admin impersonation controls and audit logs" },
    ],
  },
];

export const desktopNavItems = navGroups.flatMap((group) => group.items);

export function isNavItemActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}
