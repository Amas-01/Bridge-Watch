export type ReleaseTag = "breaking" | "new" | "improvement" | "fix" | "deprecated";

export interface ReleaseNote {
  id: string;
  version: string;
  date: string;
  summary: string;
  tags: ReleaseTag[];
  entries: {
    tag: ReleaseTag;
    title: string;
    description: string;
    migrationNote?: string;
  }[];
}

export const releaseNotes: ReleaseNote[] = [
  {
    id: "v1.5.0",
    version: "1.5.0",
    date: "2026-05-29",
    summary: "State export functions, frozen asset controls, and supply-chain graph improvements.",
    tags: ["new", "improvement"],
    entries: [
      {
        tag: "new",
        title: "State Export Functions",
        description:
          "Export contract state snapshots via GET /api/export/state for off-chain sync and auditing. Supports JSON and compact formats.",
      },
      {
        tag: "new",
        title: "Frozen Asset Controls",
        description:
          "Administrators can now freeze and unfreeze individual assets. All asset metadata responses include a new is_frozen field.",
      },
      {
        tag: "improvement",
        title: "Supply-Chain Graph",
        description: "Improved rendering performance and edge-label legibility for large graphs.",
      },
    ],
  },
  {
    id: "v1.4.0",
    version: "1.4.0",
    date: "2026-05-15",
    summary: "Whitelist management, asset category and status filtering.",
    tags: ["new"],
    entries: [
      {
        tag: "new",
        title: "Whitelist Management",
        description: "Add or remove asset codes from the protocol whitelist via POST /api/whitelist/add.",
      },
      {
        tag: "new",
        title: "Asset Category Filtering",
        description:
          "Retrieve assets by category (stablecoin, real-world-asset, native, bridged, wrapped, other) via GET /api/assets/category/{category}.",
      },
      {
        tag: "new",
        title: "Asset Status Filtering",
        description:
          "Retrieve assets by lifecycle status (active, paused, deprecated, pending-review) via GET /api/assets/status/{status}.",
      },
    ],
  },
  {
    id: "v1.3.0",
    version: "1.3.0",
    date: "2026-04-28",
    summary: "Alert routing engine, digest scheduling, and suppression controls.",
    tags: ["new", "improvement"],
    entries: [
      {
        tag: "new",
        title: "Alert Routing Engine",
        description:
          "Route alerts to specific channels based on configurable rules. Supports priority, asset type, and severity matching.",
      },
      {
        tag: "new",
        title: "Digest Scheduling",
        description:
          "Subscribe to hourly or daily digests instead of real-time notifications. Configurable per user via the digest scheduler endpoint.",
      },
      {
        tag: "improvement",
        title: "Alert Suppression Controls",
        description:
          "Suppress repeat alerts within a configurable time window to reduce notification fatigue.",
      },
    ],
  },
  {
    id: "v1.2.0",
    version: "1.2.0",
    date: "2026-03-10",
    summary: "Supply chain visualization, external dependency monitoring, and breaking pagination change.",
    tags: ["new", "breaking", "improvement"],
    entries: [
      {
        tag: "breaking",
        title: "Pagination cursor format changed",
        description:
          "The cursor parameter in paginated list endpoints is now base64-encoded. Clients constructing cursors manually must update their encoding.",
        migrationNote:
          "Replace raw cursor strings with base64(JSON.stringify({ id, createdAt })) before passing to the API.",
      },
      {
        tag: "new",
        title: "Supply Chain Visualization",
        description:
          "New /supply-chain page shows cross-chain asset flow, bridge health, and dependency graphs.",
      },
      {
        tag: "new",
        title: "External Dependency Monitoring",
        description:
          "Track health of external price feeds, oracles, and RPC providers. Alerts fire when a dependency degrades.",
      },
    ],
  },
  {
    id: "v1.1.0",
    version: "1.1.0",
    date: "2026-01-20",
    summary: "Watchlists, transaction history, and analytics dashboard.",
    tags: ["new"],
    entries: [
      {
        tag: "new",
        title: "Watchlists",
        description:
          "Users can create named watchlists and monitor a custom set of assets from the dashboard.",
      },
      {
        tag: "new",
        title: "Transaction History",
        description:
          "Browse and filter all bridge transactions with status, amount, fee, and chain details.",
      },
      {
        tag: "new",
        title: "Analytics Dashboard",
        description:
          "Volume, liquidity depth, and health score trend charts are now available on the Analytics page.",
      },
    ],
  },
  {
    id: "v1.0.0",
    version: "1.0.0",
    date: "2025-12-01",
    summary: "Initial public release of Bridge Watch.",
    tags: ["new"],
    entries: [
      {
        tag: "new",
        title: "Initial Release",
        description:
          "Bridge Watch is live. Monitor Stellar bridge assets, track incidents, and receive real-time alerts.",
      },
    ],
  },
];

export const TAG_LABELS: Record<ReleaseTag, string> = {
  breaking: "Breaking",
  new: "New",
  improvement: "Improvement",
  fix: "Fix",
  deprecated: "Deprecated",
};

export const TAG_COLORS: Record<ReleaseTag, string> = {
  breaking: "bg-red-500/20 text-red-400 border border-red-500/30",
  new: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  improvement: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  fix: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  deprecated: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
};
