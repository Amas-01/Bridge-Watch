# Data clocks and bitemporal observations

Every new observation uses UTC `timestamptz` values. `valid_*` is when a fact was true on-chain; `transaction_*` is when Bridge Watch knew that fact. Dashboard and report queries that need historical reproducibility must call `BitemporalObservationService.asKnownAt(kind, subject, systemTime, validTime)`. Existing endpoints that read `prices`, `health_scores`, alerts, or reserves remain processing-time views until migrated; their API descriptions should explicitly say `clock=processing`.

Corrections close the prior transaction-time interval and append a replacement row. The PostgreSQL exclusion constraint rejects overlapping current valid-time intervals for the same kind/subject, while closed transaction-time versions retain the audit trail. This prevents timezone-dependent chart changes and makes late RPC/backfill observations explainable.

For TimescaleDB, retain raw hypertables by valid time and keep continuous aggregates on the current bitemporal projection rather than on the audit table. Index `(kind, subject, transaction_from)` for time-travel reads; add a `valid_from` partition/index when a high-volume observation kind is migrated. Backfill in bounded valid-time chunks and verify the current projection against the legacy hypertable before switching an endpoint.
