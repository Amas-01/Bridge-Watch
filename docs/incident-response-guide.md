# Bridge Watch Incident Response Guide

## 1. Triage Workflow
1. Detect and acknowledge incoming incident alert in the alert panel.
2. Validate signal quality by checking dependency graph health, bridge telemetry, and recent deploy activity.
3. Classify severity using the matrix below.
4. Assign an Incident Commander (IC) and functional responders.
5. Open an incident channel and publish first status update within 10 minutes.
6. Stabilize service first, then continue diagnosis and remediation.

## 2. Severity Matrix
| Severity | Trigger Criteria | Target Initial Response | Ownership |
|---|---|---|---|
| SEV-1 | Bridge halted, fund movement blocked, critical security risk | 5 minutes | Incident Commander + on-call engineers |
| SEV-2 | Material degradation (latency, stale data, partial outage) | 15 minutes | On-call engineer + service owner |
| SEV-3 | Limited impact, workaround available | 30 minutes | Service owner |
| SEV-4 | Cosmetic issue, no immediate user risk | Next business cycle | Product/engineering backlog |

## 3. Incident Roles
- Incident Commander: Runs timeline, sets priorities, approves public updates.
- Operations Lead: Executes mitigation and rollback decisions.
- Comms Lead: Publishes stakeholder/customer updates and maintains status page.
- Scribe: Maintains timestamped timeline, decisions, and action log.
- Subject Matter Experts: Own subsystem analysis and remediation.

## 4. Communication Templates

Short-form examples:

### Initial Internal Message
`[INCIDENT OPEN] <service/component> - <short impact>. Severity: <SEV>. IC: <name>. Next update in 15 minutes.`

Full copy-paste templates (triage, updates, status page, postmortem): **[runbooks/incident-response-templates.md](runbooks/incident-response-templates.md)**.

### Customer-Facing Status Page
`We are investigating elevated errors in <component>. Impact: <who/what>. Mitigation is in progress. Next update by <time UTC>.`

### Mitigation Update
`Mitigation applied: <change>. Current status: <improving/stable>. Residual risk: <risk>.`

### Resolution Update
`Incident resolved at <time UTC>. Root cause: <summary>. Monitoring continues for <duration>.`

## 5. Escalation Policy
- Escalate to SEV-1 immediately if transfer integrity, reserve safety, or chain finality validation is at risk.
- Page security on-call for suspicious contract calls, key compromise signals, or data integrity mismatch.
- Escalate to leadership if incident exceeds 60 minutes or affects high-value bridge routes.

## 6. Recovery Verification Checklist
- Alert stream is healthy and no new critical alerts for 30 minutes.
- Dependency graph shows required core services in `healthy` or accepted `degraded` state.
- Cross-chain reserve checks pass for impacted assets.
- Transfer and confirmation flow tested on both Stellar and source chain.
- Post-incident monitoring thresholds temporarily tightened for 24 hours.

## 7. Postmortem Workflow
1. Complete draft within 48 hours.
2. Include timeline, root cause, contributing factors, mitigation effectiveness, and prevention actions.
3. Assign owners and deadlines for all follow-up actions.
4. Track action items in GitHub issues and link to incident record.

## 8. Runbook Links
- `docs/security-audit-checklist.md`
- `docs/database-schema.md`
- `docs/CI-CD-QUICK-REFERENCE.md`
- `docs/circuit-breaker-contract.md`
