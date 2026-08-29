# Incident Response Templates

Copy-paste templates for triage, stakeholder updates, status pages, and postmortems. Severity labels match the [Incident Response Guide](../incident-response-guide.md) matrix (SEV-1 through SEV-4).

**Usage:** Duplicate the block you need into Slack, email, the status page, or a GitHub incident record (`POST /api/v1/incidents`).

---

## 1. Triage Template

```markdown
## Incident Triage

**Incident ID:** INC-YYYYMMDD-###
**Opened at (UTC):** YYYY-MM-DD HH:MM
**Severity:** SEV-_
**Incident Commander (IC):** @name — Owner: ___
**Comms Lead:** @name — Owner: ___
**Operations Lead:** @name — Owner: ___

### Impact summary
- **Affected component(s):** 
- **User/customer impact:** 
- **Regions/routes/assets:** 

### Initial signal
- **Alert/source:** 
- **Detection time (UTC):** 
- **Related deploy/change:** none | link

### Hypothesis
- **Working theory:** 
- **Ruled out:** 

### Immediate actions
| Action | Owner | Status | ETA (UTC) |
|--------|-------|--------|-----------|
| Acknowledge alert | | done / pending | |
| Open incident channel | | | |
| Assign IC + roles | | | |
| First stakeholder update | | | +10 min |

### Next update
**Next update by (UTC):** YYYY-MM-DD HH:MM (+15 min for SEV-1/2)
```

---

## 2. Status Update Template (internal + external)

```markdown
## Incident Update — YYYY-MM-DD HH:MM UTC

**Incident ID:** INC-YYYYMMDD-###
**Severity:** SEV-_
**Status:** investigating | mitigating | monitoring | resolved
**IC:** @name

### Current impact
- 

### Actions since last update
- 

### Mitigation status
- **Applied:** 
- **Effect:** improving | stable | unchanged
- **Residual risk:** 

### Action items
| Item | Owner | Deadline (UTC) | Status |
|------|-------|------------------|--------|
| | | | open / done |

### Next update
**Next update by (UTC):** 
```

---

## 3. Status Page Template (customer-facing)

```markdown
**Title:** [Investigating | Identified | Monitoring | Resolved] — <short component name>

**Summary:** We are investigating elevated errors affecting <who/what>.

**Impact:** <scope — e.g., delayed bridge confirmations for USDC routes>

**Workaround:** <none | steps>

**Status:** Our team is <investigating | applying mitigation | monitoring recovery>.

**Next update by:** YYYY-MM-DD HH:MM UTC

---
Last updated: YYYY-MM-DD HH:MM UTC
```

### Resolution variant

```markdown
**Title:** [Resolved] — <short component name>

**Summary:** The incident affecting <who/what> has been resolved.

**Impact window:** YYYY-MM-DD HH:MM – HH:MM UTC

**Root cause (customer-safe):** <one sentence>

**Follow-up:** We will continue monitoring for <duration>. A detailed postmortem will be published if required by policy.
```

---

## 4. Postmortem Template

```markdown
# Postmortem — INC-YYYYMMDD-###

**Date:** YYYY-MM-DD
**Authors:** @name
**Severity:** SEV-_
**Duration:** HH:MM UTC – HH:MM UTC (X hours Y minutes)
**Incident Commander:** @name

## Summary
One paragraph describing what happened and customer impact.

## Timeline (UTC)
| Time | Event |
|------|-------|
| HH:MM | Alert fired / customer report |
| HH:MM | IC assigned, channel opened |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |
| HH:MM | Incident closed |

## Root cause
Technical explanation of the failure mechanism.

## Contributing factors
- 
- 

## Mitigation effectiveness
What worked / what did not.

## Action items
| ID | Action | Owner | Priority | Deadline | Status | Tracking |
|----|--------|-------|----------|----------|--------|----------|
| 1 | | @name | P0/P1/P2 | YYYY-MM-DD | open | GitHub # |

## Lessons learned
- 

## Verification / prevention
- Monitoring changes:
- Runbook updates:
- Tests or guards added:
```

---

## Related documents

- [Incident Response Guide](../incident-response-guide.md)
- [ALERTING_RUNBOOK.md](../../backend/docs/ALERTING_RUNBOOK.md)
- [Runbook index](index.md)
- Incidents API: `GET/POST /api/v1/incidents`
