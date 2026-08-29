# Bridge Topology Model

The bridge topology graph models cross-chain connectivity as a directed graph.

## Nodes

Each **node** represents a blockchain network (e.g. Stellar, Ethereum). Node attributes include:

| Field | Description |
|-------|-------------|
| `id` | Stable chain identifier |
| `label` | Display name |
| `healthScore` | Aggregated bridge health on this chain |
| `totalSupplyUsd` | Total wrapped asset supply |
| `assets` | Per-asset locked/minted amounts |

## Edges

Each **edge** represents a bridge protocol connecting two chains:

| Field | Description |
|-------|-------------|
| `bridgeName` | Operator/protocol name |
| `source` / `target` | Connected chain node IDs |
| `status` | `healthy`, `degraded`, or `offline` |
| `volume24hUsd` | 24h transfer volume |
| `assets` | Symbols routed across the bridge |

## API

```
GET /api/v1/supply-chain
```

Returns `{ nodes, edges, totalSupplyUsd, totalBridgeVolumeUsd, lastUpdated }`.

The topology explorer UI at `/bridge-topology` renders this graph with filtering, edge highlighting, drill-down detail, and SVG export.
