# Alert Playbook Format

Playbooks are parsed from `backend/docs/ALERTING_RUNBOOK.md` and exposed via `/api/v1/playbooks`.

## Structure

```json
{
  "id": "supply-mismatch",
  "alertType": "supply_mismatch",
  "title": "Supply Mismatch",
  "severity": ["critical", "high"],
  "summary": "Detected mismatch between Stellar supply and source chain reserves",
  "steps": [
    { "order": 1, "title": "Verify the Alert", "body": "..." }
  ],
  "tags": ["supply_mismatch", "critical", "high"]
}
```

## Lookup

- `GET /api/v1/playbooks?q=supply` — full-text search
- `GET /api/v1/playbooks?alertType=supply_mismatch` — context-aware lookup for triggered alerts
- `GET /api/v1/playbooks/:id` — fetch a single playbook

The alert playbook viewer at `/alert-playbooks` supports search, step-by-step display, and print-friendly layout.
