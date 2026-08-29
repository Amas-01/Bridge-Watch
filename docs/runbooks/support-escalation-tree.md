# Support Escalation Tree

## Purpose and Scope

Use this escalation tree when a support issue needs an owner, when the first responder is unsure who should act next, or when a runbook does not cover the exact failure mode. It complements the [Incident Response Guide](../incident-response-guide.md) by defining who to contact first, who owns each support area, and how to keep the escalation path current.

## Escalation Principles

- Start with the lowest effective tier and escalate only when the current tier cannot restore service, answer the request, or identify the owner.
- Escalate immediately to incident response for SEV-1 or SEV-2 conditions listed in the [severity matrix](../incident-response-guide.md#2-severity-matrix).
- Page security on-call immediately for suspected key compromise, unauthorized contract activity, data integrity mismatch, or leaked credentials.
- Keep the user-facing support thread updated while escalation happens in the operational channel.
- Record the final owner, action taken, and follow-up issue before closing the support request.

## Tiered Escalation Path

| Tier | First Contact | When to Use | Response Target | Escalate To |
|---|---|---|---|---|
| Tier 0 | Documentation and status checks | Known questions, common setup issues, non-urgent requests | Self-service | Tier 1 if docs do not resolve it |
| Tier 1 | Support triage | New support issue, unclear ownership, user-impacting bug report | 1 business day | Tier 2 owner for affected area |
| Tier 2 | Service owner | Confirmed subsystem failure, degraded feature, failed deployment, noisy alert | Same day for active degradation | Tier 3 lead or incident commander |
| Tier 3 | Functional lead | Cross-team issue, repeated failure, production risk, blocked Tier 2 owner | 4 business hours | Incident commander or engineering manager |
| Emergency | Incident commander and security on-call | SEV-1, SEV-2, suspected compromise, bridge halt, reserve mismatch | 5-15 minutes | Engineering leadership |

## Support Ownership Map

| Support Area | Primary Owner | Backup Owner | Typical Issues | Runbooks and References |
|---|---|---|---|---|
| Incident triage | Platform On-Call Lead | Engineering Manager | Bridge halt, production outage, unresolved critical alert | [Incident Response Guide](../incident-response-guide.md), [Incident Response Templates](incident-response-templates.md) |
| Monitoring and alerting | Observability Guild Lead | Platform On-Call Lead | Alert routing, dashboard gaps, missing runbook links, probe failures | [Monitoring Overview](../monitoring.md), [Monitoring Setup](../deployment/monitoring-setup.md) |
| Deployments and rollbacks | Platform Engineering Lead | DevOps / Infrastructure | Failed release, rollback request, environment drift | [Deployment README](../deployment/README.md), [Deployment Troubleshooting](../deployment/troubleshooting.md), [Release Checklist](../release-checklist.md) |
| Secrets and access | Security Team Lead | Platform On-Call Lead | Secret rotation, leaked credentials, API key audit, access review | [Secret Rotation Playbook](secret-rotation-playbook.md), [Secrets Audit Checklist](../secrets-audit-checklist.md) |
| Database and persistence | Infrastructure Lead | Platform Engineering Lead | Failed migrations, backup restore, TimescaleDB or PostgreSQL health | [Database Setup](../deployment/database-setup.md), [Backup Procedures](../deployment/backup-procedures.md), [Database Schema](../database-schema.md) |
| Smart contracts and bridge integrity | Platform Engineering Lead | Security Team Lead | Circuit breaker events, reserve mismatch, Soroban contract behavior | [Circuit Breaker Contract](../circuit-breaker-contract.md), [Contract Architecture](../architecture/contract-architecture.md), [Security Audit Checklist](../security-audit-checklist.md) |
| API and rate limiting | Backend Service Owner | Platform Engineering Lead | API errors, throttling issues, request tracing, validation failures | [API Architecture](../architecture/api-architecture.md), [Rate Limiting](../RATE_LIMITING.md), [Request Tracing](../REQUEST_TRACING.md) |
| Frontend and user workflow | Frontend Service Owner | Product / Engineering Lead | Dashboard display issues, export flow, user guide gaps | [Frontend Architecture](../architecture/frontend-architecture.md), [User Guide](../user-guide/README.md), [Export Picker Flow](../user-guide/export-picker-flow.md) |

## Availability Notes

| Role | Coverage Expectation | After-Hours Handling |
|---|---|---|
| Support triage | Business hours, Monday-Friday | Queue for next business day unless severity requires paging |
| Platform on-call | 24/7 for production SEV-1 and SEV-2 | Page through the configured incident channel |
| Security on-call | 24/7 for compromise, data integrity, and credential exposure | Page immediately; do not wait for triage confirmation |
| Service owners | Business hours for normal defects and maintenance | Engage after hours only when platform on-call declares active production risk |
| Engineering leadership | Business hours for planning and ownership decisions | Engage for incidents exceeding 60 minutes or high-value bridge route impact |

## Escalation Workflow

1. Capture the support request summary, affected user or system, first observed time, environment, and visible impact.
2. Check the current status page, alert stream, recent deployments, and the runbook index for an existing procedure.
3. Assign the support area from the [Support Ownership Map](#support-ownership-map).
4. Contact the primary owner with the issue link, severity, current evidence, and requested decision.
5. Contact the backup owner if the primary owner does not acknowledge within the response target or is unavailable.
6. Open an incident if the issue meets SEV-1 or SEV-2 criteria, then follow the [Incident Response Guide](../incident-response-guide.md).
7. Add the final resolution, owner, linked runbook, and follow-up issue to the original support thread.

## Maintenance Steps

Update this document whenever ownership, availability, or runbook coverage changes.

1. Review the ownership map during quarterly runbook review and after every major team ownership change.
2. Update owner names or team aliases in the same pull request that changes operational responsibility.
3. Add new runbook links when a support path becomes repeatable.
4. Remove or replace stale contacts during offboarding, team reorganization, or incident tooling changes.
5. Link any support escalation gap discovered during an incident to a follow-up GitHub issue.

## Related Documents

- [Runbook Index](index.md)
- [Incident Response Guide](../incident-response-guide.md)
- [Monitoring Overview](../monitoring.md)
- [Deployment Troubleshooting](../deployment/troubleshooting.md)
- [Secret Rotation Playbook](secret-rotation-playbook.md)
