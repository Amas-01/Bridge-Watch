export type WidgetContract = {
  id: string;
  title: string;
  version: string;
  refreshSeconds: number;
  requiredFields: Array<{ name: string; type: string; description: string }>;
  example: Record<string, unknown>;
};

const contracts: WidgetContract[] = [
  {
    id: "endpoint-reliability",
    title: "Endpoint Reliability Scorecard",
    version: "1.0.0",
    refreshSeconds: 60,
    requiredFields: [
      { name: "endpoint", type: "string", description: "Route path or endpoint identifier" },
      { name: "score", type: "number", description: "Reliability score from 0 to 100" },
      { name: "p95Ms", type: "number", description: "95th percentile latency in milliseconds" },
      { name: "errorRate", type: "number", description: "Server error rate from 0 to 1" },
    ],
    example: { endpoint: "/api/v1/assets", score: 97, p95Ms: 240, errorRate: 0.003 },
  },
  {
    id: "cache-hit-rate",
    title: "Cache Hit-Rate Attribution",
    version: "1.0.0",
    refreshSeconds: 30,
    requiredFields: [
      { name: "namespace", type: "string", description: "Redis key namespace or cache source" },
      { name: "hits", type: "number", description: "Cache hit count" },
      { name: "misses", type: "number", description: "Cache miss count" },
      { name: "hitRate", type: "number|null", description: "Hit rate from 0 to 1 when lookups exist" },
    ],
    example: { namespace: "asset-metadata", hits: 821, misses: 43, hitRate: 0.9502 },
  },
  {
    id: "worker-capacity",
    title: "Worker Capacity Planning",
    version: "1.0.0",
    refreshSeconds: 30,
    requiredFields: [
      { name: "queue", type: "string", description: "Worker queue name" },
      { name: "waiting", type: "number", description: "Jobs waiting to be processed" },
      { name: "active", type: "number", description: "Jobs currently running" },
      { name: "capacityUtilization", type: "number", description: "Estimated worker utilization from 0 to 1" },
    ],
    example: { queue: "bridge-watch-jobs-medium", waiting: 12, active: 3, capacityUtilization: 0.6 },
  },
  {
    id: "saved-query-versions",
    title: "Saved Query Version History",
    version: "1.0.0",
    refreshSeconds: 300,
    requiredFields: [
      { name: "presetId", type: "string", description: "Saved query preset identifier" },
      { name: "version", type: "string", description: "Semantic version of the query definition" },
      { name: "createdBy", type: "string", description: "User or API key that created the version" },
      { name: "changeNotes", type: "string|null", description: "Operator-supplied change notes" },
    ],
    example: { presetId: "preset-123", version: "1.0.3", createdBy: "api-key-1", changeNotes: "Add bridge filter" },
  },
];

export function listDashboardWidgetContracts(): WidgetContract[] {
  return contracts;
}

export function getDashboardWidgetContract(id: string): WidgetContract | null {
  return contracts.find((contract) => contract.id === id) ?? null;
}
