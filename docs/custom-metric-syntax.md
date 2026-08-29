# Custom Metric Query Language

Saved metrics use **read-only SQL SELECT** statements against Bridge Watch analytics tables.

## Rules

- Must start with `SELECT`
- Single statement only (no semicolons)
- No `INSERT`, `UPDATE`, `DELETE`, `DROP`, or DDL keywords
- Results are cached per metric `cacheTtl` (default 600 seconds)

## Common tables

| Table | Use |
|-------|-----|
| `bridge_operators` | Bridge provider metadata |
| `verification_results` | Bridge verification outcomes |
| `liquidity_snapshots` | DEX liquidity by symbol |
| `alert_events` | Alert delivery history |
| `bridge_volume_stats` | Cross-chain flow volumes |
| `prices` | Asset price time series |

## Example

```sql
SELECT bridge_id, COUNT(*) AS verifications
FROM verification_results
WHERE verified_at >= NOW() - INTERVAL '7 days'
GROUP BY bridge_id
ORDER BY verifications DESC
```

Use the metric builder at `/analytics/metric-builder` to validate, preview, save, and share formulas.
