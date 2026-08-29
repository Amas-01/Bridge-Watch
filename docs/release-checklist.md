# Release Checklist

Use this checklist for every production deployment so readiness, verification, rollback, and communication are consistent.

## Release Gates

- Confirm the automated `Release Shield` job reports **PROMOTION APPROVED** before creating or promoting a release.
- Configure `RELEASE_HEALTH_URLS` with comma-separated readiness endpoints (for example, production and critical dependency readiness URLs).
- Confirm `RELEASE_REQUIRED_WORKFLOWS` matches the workflow names that protect the release commit; the default is `CI,Code Quality,Security Scanning`.
- Confirm the release owner, reviewer, and on-call engineer are assigned before work starts.
- Confirm the deployment window, target environment, and rollback owner are documented in the release ticket.
- Confirm the PR references all closing issues and includes the release notes summary.
- Confirm required tests, migrations, and smoke checks have passed on the release branch.

## Pre-Release Checks

- Verify `main` is green in CI and the release branch is rebased or merged cleanly.
- Confirm database migrations have been reviewed for backward compatibility and rollback impact.
- Confirm environment variables, secrets, API keys, and feature flags are present in the target environment.
- Complete the [secrets audit checklist](./secrets-audit-checklist.md) when rotating or adding secrets for this release.
- Confirm dashboards and alerts used during rollout are available:
  - [docs/deployment/monitoring-setup.md](/Users/ab/stellardrips/Bridge-Watch/docs/deployment/monitoring-setup.md)
  - [monitoring/runbooks/critical-alerts.md](/Users/ab/stellardrips/Bridge-Watch/monitoring/runbooks/critical-alerts.md)
- Confirm backups and restore procedures are current:
  - [docs/deployment/backup-procedures.md](/Users/ab/stellardrips/Bridge-Watch/docs/deployment/backup-procedures.md)
- Confirm any dependent external providers are stable and not in maintenance.

## Artifact Versioning

- Tag the release commit or record the deploy SHA before rollout.
- Record backend image tag, frontend build identifier, contract artifact version, and migration batch number.
- Store the final deployment metadata in the release ticket or deployment log.

## Emergency Override

Use the release shield override only for an incident or time-critical recovery where the failed gate is understood and separately mitigated.

1. Dispatch the `Release` workflow manually.
2. Enable `override_release_shield`.
3. Enter an audit reason of at least 10 characters, including the incident or change reference.
4. Confirm the operator has repository `maintain` or `admin` permission.
5. Copy the shield report and override reason into the release ticket.

Tag-triggered releases cannot bypass the shield. An unauthorized or unexplained override remains blocked.

## Data Migration Checks

- Create migration notes for the release using [migration-notes-template.md](./migration-notes-template.md) and link the completed notes in the release ticket.
- Review pending migrations and identify:
  - schema changes
  - backfills
  - retention or cleanup side effects
  - blocking locks or long-running statements
- Run migrations in staging first and verify no unexpected row-count drift.
- Capture migration start/end times and affected tables.
- Confirm post-migration read paths and write paths still work against the new schema.

## Deployment Verification

- Verify the backend boots cleanly and exposes healthy `health`, readiness, and metrics endpoints.
- Verify the frontend loads and key routes render without runtime errors.
- Verify scheduled workers reconnect and repeatable jobs are present.
- Run smoke checks for:
  - asset list
  - bridge status
  - search
  - incident feed
  - external dependency monitor
- Confirm logs show no burst of unhandled exceptions or migration failures.

## Monitoring Checks

- Watch error rate, p95 latency, queue depth, and dependency monitor status for at least 15 minutes.
- Confirm alert volume is expected and no suppression rules are masking real regressions.
- Confirm upstream dependency latency and heartbeat history remain within configured thresholds.
- Confirm dashboard cards and Prometheus targets reflect the new version.

## Communication Steps

- Notify stakeholders when deployment starts.
- Post the deployed SHA, environment, and expected completion window.
- Notify when smoke checks complete.
- If rollback is triggered, notify immediately with the reason and next checkpoint.
- Post a final completion update with the deployed version and follow-up items.

## Rollback Criteria

Rollback immediately if any of the following occur and cannot be resolved within the deployment window:

- repeated failed migrations
- sustained `down` or `degraded` status on critical dependencies
- elevated 5xx rate or major latency regression
- broken asset, bridge, incident, or search flows
- worker startup failure or stuck queues
- incorrect contract or data behavior affecting monitored assets

## Post-Release Review

- Record what changed, what was verified, and any incidents or manual interventions.
- Capture metrics deltas observed during the first monitoring window.
- Document any follow-up bugs, cleanup tasks, or threshold adjustments.
- Link the release review back to the deployment ticket and closed issues.
