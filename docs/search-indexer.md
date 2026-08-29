# Search Indexer

Bridge Watch now uses a denormalized `search_documents` index to support app-wide search across operational entities.

## Indexed Entities

- assets
- bridges
- incidents
- alerts

## Schema

Each indexed document stores:

- `document_key`
- `entity_type`
- `entity_id`
- `title`
- `subtitle`
- `body`
- `search_tokens`
- `metadata`
- `rank_weight`
- `visibility`
- `source_updated_at`
- `indexed_at`

## Ranking Rules

- exact and prefix title matches rank above body matches
- entity-specific `rank_weight` boosts important operational items
- recent incidents and alerts receive additional recency weight
- severity and priority influence incident and alert ranking
- synonym expansion improves recall for common asset and protocol terminology

## Incremental Updates

- the service tracks per-entity metadata in `search_index_metadata`
- full rebuilds are available through `POST /api/v1/search/rebuild-index`
- incremental sync runs on-demand before searches when the index is stale
- inactive assets and bridges are removed from the denormalized index during sync

## Operational Endpoints

- `GET /api/v1/search`
- `POST /api/v1/search`
- `GET /api/v1/search/suggestions`
- `GET /api/v1/search/index-status`
- `GET /api/v1/search/health`
- `POST /api/v1/search/rebuild-index`

`index-status`, `analytics`, and `rebuild-index` are API-key protected.

## Failure Recovery

- rebuilds mark entity metadata as `running`, `ready`, or `error`
- the latest indexing error is stored on `search_index_metadata`
- a failed incremental sync does not break the search endpoint; the last successful indexed data remains queryable
