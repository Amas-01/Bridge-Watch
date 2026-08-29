# Reconciliation workflow

Bridge Watch reconciles three values for each bridged asset:

- On-chain supply observed on Stellar
- Reserve attestation or reserve commitment supplied by the bridge operator
- Reported backing from the source-chain reserve balance

The dashboard is available at `/reconciliation`. It is built for operators resolving drift between circulating bridged supply and backing data.

## Operator workflow

1. Filter the queue by asset, bridge, and time range.
2. Review severity and trend direction.
3. Open a queue item to inspect mismatch history and source data.
4. Compare the source cards:
   - Stellar on-chain supply
   - Latest reserve attestation or reserve commitment
   - Reported source-chain backing
5. Set triage status and owner:
   - `open`
   - `investigating`
   - `acknowledged`
   - `resolved`
   - `false_positive`
6. Add a note with the investigation outcome or next handoff.

`resolved` and `false_positive` close the dashboard's unresolved state for the latest run. Other statuses keep the mismatch in the active queue.

## Data model

The canonical table is `reconciliation_runs`.

Existing run fields:

- `asset_code`
- `status`: `running`, `success`, `mismatch`, or `failed`
- `stellar_supply`
- `reported_supply`
- `mismatch_percentage`
- `started_at` and `finished_at`
- `job_id`, `attempt`, and `error`

Dashboard fields added by migration `032_reconciliation_dashboard`:

- `bridge_name`: bridge display name used for filtering and grouping
- `source_chain`: source chain for reported backing
- `on_chain_source`: JSON metadata for the Stellar observation
- `reserve_attestation`: JSON metadata for the attestation or commitment
- `reported_backing`: JSON metadata for the reported backing source
- `triage_status`
- `triage_owner`
- `triage_note`
- `triaged_at`

Historical rows without `bridge_name` are enriched at read time from asset and bridge metadata.

## Severity and trend

Severity is computed from `mismatch_percentage`:

- `aligned`: 0.1% or less
- `low`: greater than 0.1% and up to 0.5%
- `medium`: greater than 0.5% and up to 1%
- `high`: greater than 1% and up to 5%, or failed reconciliation
- `critical`: greater than 5%

Trend compares the latest run against the previous run in the selected time range:

- `new`: no previous run
- `improving`: mismatch decreased by at least 0.01 percentage points
- `worsening`: mismatch increased by at least 0.01 percentage points
- `flat`: all other cases

## API

Raw run history:

- `GET /api/v1/reconciliation/runs?assetCode=USDC&limit=50`
- `GET /api/v1/reconciliation/latest/:assetCode`

Dashboard summaries:

- `GET /api/v1/reconciliation/drift-summaries`
- Query parameters:
  - `assetCode`
  - `bridge`
  - `range`: `24h`, `7d`, `30d`, `90d`
  - `startDate`
  - `endDate`

Mismatch detail:

- `GET /api/v1/reconciliation/mismatches/:id?range=30d`
- Returns the selected run, same-pair history, source data cards, and latest reserve commitment metadata when available.

Triage update:

- `PATCH /api/v1/reconciliation/runs/:id/triage`
- Body:

```json
{
  "status": "investigating",
  "owner": "ops-oncall",
  "note": "Comparing operator attestation against Ethereum reserve balance."
}
```

## Worker integration

The reconciliation worker records runs through `ReconciliationService`.

- `startRun` creates a `running` row and stores bridge/source metadata when available.
- `finishRun` stores final supply values, mismatch percentage, source metadata, and terminal status.
- Dashboard endpoints can still enrich older rows that predate the dashboard fields.
