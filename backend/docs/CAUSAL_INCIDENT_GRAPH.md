# Causal Incident Graph

This document describes the causal incident graph implemented in
`backend/src/services/causalGraph.service.ts`. It reconstructs why an incident
happened from partial, delayed, and corrected evidence, distinguishing what is
directly proven from what is merely correlated.

## Model

A graph is scoped to a single incident (`bridge_incidents.id`) and made of:

- **Nodes** (`causal_graph_nodes`) — one per piece of evidence: an
  `observation`, `derived_metric`, `alert`, `operator_action`,
  `contract_event`, or `provider_failure`. Each node carries `occurredAt`
  (when the real-world event happened) separately from `observedAt` (when it
  was recorded), plus an optional `entityType`/`entityId` pointing back at the
  source row for provenance, and a `confidenceState` of `confirmed`,
  `corrected`, or `reverted`.
- **Edges** (`causal_graph_edges`) — a directed link from an earlier node to a
  later one. Every edge names:
  - `evidence`: an array of `{ type, id, description }` references backing
    the claim.
  - `inferenceRule`: the name of the rule or algorithm that produced it (e.g.
    `explicit_provenance_reference`, `temporal_adjacency_same_entity`,
    `temporal_precedence_only`, or a caller-supplied name for manual edges).

  Both fields are required — `addEdge` rejects an edge with no evidence or no
  named rule.
- **Revisions** (`causal_graph_revisions`) — an append-only audit trail of
  every node/edge addition, correction, and reversion.

## Causal confidence

Every edge has a `confidenceClass`:

| Class            | Meaning                                                    | Default score |
|------------------|-------------------------------------------------------------|---------------|
| `direct_evidence` | The effect's own data explicitly references the cause.     | 0.95          |
| `correlation`      | Same bridge/asset/entity, close in time, but not proven.  | 0.6           |
| `unknown`          | Temporally plausible only; weakest signal.                 | 0.3           |

`confidenceScore` (0-1) can be overridden per edge; auto-inferred edges scale
the score by temporal proximity within the class's window.

## Incremental updates (late evidence & reorg corrections)

Nothing is ever deleted:

- **Late evidence for a node already recorded** (`addNode` called again for
  the same `entityType`/`entityId`) marks the previous row `corrected` and
  links it to the new one via `supersededByNodeId`, then inserts the new
  version as `confirmed`. Edges drawn from the old version remain in place.
- **Reverted evidence** (e.g. a reorg drops the underlying transaction) is
  handled by `revertNode`, which sets `confidenceState = reverted` and cascades
  to mark any active edges touching that node `reverted` — never deleting
  rows.
- **Corrected conclusions** (e.g. new evidence upgrades an edge from
  `correlation` to `direct_evidence`) use `supersedeEdge`, which keeps the
  original edge (`status = superseded`, linked via `supersededByEdgeId`) and
  inserts the new one.
- Every one of these actions writes a `causal_graph_revisions` row naming the
  actor and reason (`late_evidence`, `reorg_correction`, `manual`, ...).

Default reads (`getSubgraph`, `exportIncidentGraph`) only return
`confirmed`/`active` (and `superseded`, for edges — so the current
conclusion's provenance chain is visible) state; pass `includeReverted: true`
to see the full history for audit.

## Automatic inference

Adding a node (unless `autoLink: false`) runs an inference pass against prior
nodes in the same incident:

1. `explicit_provenance_reference` — the new node's `metadata.causedByEntityId`
   or `metadata.relatedEntityIds` names the candidate's `entityId` →
   `direct_evidence`.
2. `temporal_adjacency_same_entity` — both nodes share `metadata.bridgeId`,
   `metadata.assetCode`, or `entityType`, within a 30-minute window →
   `correlation`, score scaled by proximity.
3. `temporal_precedence_only` — no shared entity but within a 15-minute
   window → `unknown`, low score.

To keep this bounded on high-volume incidents, the pass only scans the most
recent 200 candidate nodes and keeps at most the top 5 scoring edges per new
node.

## Reproducible exports

`GET /api/v1/incidents/:id/causal-graph/export` returns nodes and edges in a
deterministic order (by `occurredAt`/`createdAt`, then `id`) plus a SHA-256
`checksum` computed over that canonical ordering — exporting the same graph
state twice yields the same checksum, so an incident export can be verified.

## API Endpoints

- `GET /api/v1/incidents/:id/causal-graph?includeReverted&nodeTypes&since&limit`
  — subgraph (bounded, default limit 2000 nodes/edges).
- `GET /api/v1/incidents/:id/causal-graph/export?includeReverted` —
  reproducible export with checksum.
- `GET /api/v1/incidents/:id/causal-graph/revisions?limit` — audit trail.
- `POST /api/v1/incidents/:id/causal-graph/nodes` — add/correct a node
  (admin/operator).
- `POST /api/v1/incidents/:id/causal-graph/nodes/:nodeId/revert` — revert a
  node (admin/operator).
- `POST /api/v1/incidents/:id/causal-graph/edges` — add a manual edge
  (admin/operator).
- `POST /api/v1/incidents/:id/causal-graph/edges/:edgeId/revert` — revert an
  edge (admin/operator).
- `POST /api/v1/incidents/:id/causal-graph/edges/:edgeId/supersede` —
  correct an edge's conclusion (admin/operator).

## Performance

- Auto-inference candidate scans are capped at 200 rows and 5 created edges
  per new node.
- Subgraph reads are capped at 2000 nodes/edges per request (`limit` query
  param, never exceeding that ceiling).
- All tables are indexed on `(incident_id, ...)` for the query patterns above.
