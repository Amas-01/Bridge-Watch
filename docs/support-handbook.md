# Support Handbook

This handbook is a quick-reference guide for support and operations staff handling Bridge Watch incidents, degraded behavior, and user-facing API issues.

## Audience and Scope

- Audience: Support, Operations, On-Call Engineers, Incident Commanders.
- Scope: First-response triage, ownership routing, escalation timing, and status verification.
- Out of scope: deep implementation changes and release engineering decisions.

## Triage Checklist (First 10 Minutes)

1. Confirm incident scope: user-specific, asset-specific, bridge-specific, or platform-wide.
2. Capture timestamp, impacted endpoint/path, and request IDs if available.
3. Check system health endpoints and current deployment status.
4. Check dashboards and active alerts.
5. Classify severity and start the escalation path.

## Common Issues and Fast Actions

| Symptom | Likely area | First checks | Immediate action |
|---|---|---|---|
| `401` / `403` on protected API route | API auth / key scopes | validate `x-api-key`, key status, required scopes | route to API/Auth owner if scope mismatch persists |
| `429 Too Many Requests` | rate limiting | inspect request burst pattern and limiter metrics | advise retry/backoff; verify no abuse/spike |
| stale asset health or price snapshots | ingestion / workers | queue depth, worker health, upstream feeds | trigger worker checks and verify source availability |
| bridge appears paused unexpectedly | circuit breaker / governance | pause state endpoints, recent alerts, admin actions | escalate to Platform On-Call immediately |
| cache inconsistency | Redis/cache layer | cache health, TTL behavior, recent invalidations | follow cache runbook and verify fallback behavior |
| release regression after deploy | deployment / release flow | release SHA, migration status, health URLs | apply rollback criteria from release checklist |

## Escalation Paths

### Severity Routing

- SEV-1: full outage, data integrity risk, or cross-bridge impact.
- SEV-2: major feature degraded for many users.
- SEV-3: limited feature impact or workaround exists.
- SEV-4: low-risk support issue or documentation discrepancy.

### Escalation Matrix

| Severity | Initial owner | Escalate within | Next escalation |
|---|---|---|---|
| SEV-1 | Platform On-Call | 5 minutes | Incident Commander + Security On-Call |
| SEV-2 | Service owner + Platform On-Call | 15 minutes | Engineering Manager |
| SEV-3 | Service owner | 60 minutes | Platform On-Call |
| SEV-4 | Support owner | next business window | Service owner |

## Ownership Directory

| Area | Primary owner | Backup owner |
|---|---|---|
| Incident response | Platform On-Call Lead | Engineering Manager |
| Security operations | Security Team Lead | Platform On-Call Lead |
| Deployments/releases | Platform Engineering Lead | DevOps / Infrastructure |
| Monitoring/alerts | Observability Guild Lead | Platform On-Call Lead |
| API auth and keys | Platform Engineering | Security Team |

See the canonical ownership tables in the runbook index.

## Status Checks and Verification

### Runtime checks

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `GET /health/detailed`

### CI/CD checks (PR and release readiness)

- CI
- Code Quality
- Security Scanning
- Backend Integration Tests
- E2E (when applicable)

Use these references for workflow triage and required checks:

- [CI/CD Quick Reference](./CI-CD-QUICK-REFERENCE.md)
- [CI/CD Setup](./CI-CD-SETUP.md)
- [Release Checklist](./release-checklist.md)

## Reference Links

- [Runbook Index](./runbooks/index.md)
- [Incident Response Guide](./incident-response-guide.md)
- [Support Escalation Tree](./runbooks/support-escalation-tree.md)
- [Monitoring Overview](./monitoring.md)
- [Health Checks](./HEALTH_CHECKS.md)
- [Deployment Troubleshooting](./deployment/troubleshooting.md)
- [Architecture Overview](./architecture/README.md)

## Troubleshooting Quick Entries

### API key authentication errors

- Confirm the request includes `x-api-key`.
- Confirm key is active, unexpired, and not revoked.
- Confirm required route scopes are present.
- If still failing, escalate to API/Auth owner with request ID and endpoint.

### Alert storm or repeated alert flapping

- Verify source health and threshold settings.
- Check alert cooldown and routing rules.
- If noise persists, coordinate temporary tuning with Observability owner.

### Queue/worker lag

- Check worker process health and queue backlog.
- Check dependency latency and external API availability.
- Escalate when lag threatens freshness SLOs or incident SLA.

### Deployment smoke-check failure

- Validate current release SHA and environment.
- Check migrations, logs, and readiness probes.
- Trigger rollback if release checklist criteria are met.

## Update Process

- Keep this handbook concise and operational.
- Update handbook links whenever runbooks or ownership change.
- Record post-incident learnings here only after they are validated.