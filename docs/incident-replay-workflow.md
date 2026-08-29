# Incident Replay Workflow

Operators can reconstruct the sequence of events that led to a bridge incident using the replay player.

## API

```
GET /api/v1/incidents/:id/replay
```

Returns an ordered `events` array with timestamps, event types, and metadata drawn from ingestion history and incident lifecycle fields.

## UI

Navigate to `/incidents/replay/:incidentId` to open the player.

### Controls

- **Play / Pause** — auto-advance through events at the selected speed
- **Restart** — jump back to the first event
- **Speed** — 0.5x, 1x, 2x, or 4x
- **Timeline scrubber** — seek to any event
- **Event details drawer** — inspect metadata for the selected event
- **Export JSON** — download the full replay payload for postmortems

## Event types

| Type | Source |
|------|--------|
| `incident_created` | Incident record `occurredAt` |
| `ingestion` | `bridge_incident_ingestion_history` rows |
| `enrichment` | Enrichment tags and metadata |
| `status_change` | Status transitions |
| `resolution` | `resolvedAt` timestamp |
