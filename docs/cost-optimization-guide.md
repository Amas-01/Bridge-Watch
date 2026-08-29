# Cost Optimization Guide

Practical strategies for reducing operational costs in Bridge Watch deployments.

---

## Cost Baselines

Use these reference figures when sizing a production deployment. Adjust based on your actual traffic profile.

| Component | Low traffic (<100 rps) | Medium (100–500 rps) | High (500+ rps) |
|---|---|---|---|
| API servers | 2 × 2 vCPU / 4 GB | 4 × 4 vCPU / 8 GB | 8+ × 4 vCPU / 8 GB |
| Worker nodes | 1 × 2 vCPU / 2 GB | 2 × 2 vCPU / 4 GB | 4 × 4 vCPU / 8 GB |
| PostgreSQL | db.t3.medium (RDS) | db.m6g.large | db.m6g.xlarge |
| Redis | cache.t3.micro | cache.m6g.large | cache.m6g.xlarge |
| Monitoring stack | shared node | dedicated 2 vCPU | dedicated 4 vCPU |

Estimated monthly cost for the low-traffic tier on AWS: **~$120–160 USD**.

---

## 1. API Optimization

### Response compression

Enable gzip/brotli at the Nginx or load-balancer layer. Bridge Watch API responses are JSON-heavy and typically compress 4–6×.

```nginx
# nginx.conf
gzip on;
gzip_types application/json text/plain;
gzip_min_length 1024;
gzip_comp_level 5;
```

### HTTP keep-alive

Ensure upstream connections to the Node API stay alive. Without this, TLS handshake overhead accumulates under load.

```nginx
upstream bridgewatch_api {
    server api:3000;
    keepalive 32;
}
```

### Pagination and field selection

Avoid returning full records when callers need summary data. The `/bridges` and `/transfers` endpoints support `?fields=` to limit response size.

```bash
# Fetch only id, status, amount — skips heavy metadata fields
GET /api/v1/transfers?fields=id,status,amount&page=1&limit=50
```

---

## 2. Caching Strategies

### Redis TTL tiers

Not all data ages at the same rate. Match TTLs to staleness tolerance:

| Data type | Recommended TTL | Rationale |
|---|---|---|
| Asset metadata | 1 hour | Changes rarely |
| Bridge configs | 5 minutes | Config changes need fast propagation |
| Transfer status | 30 seconds | Users expect near-real-time status |
| Chain fee estimates | 10 seconds | Gas prices fluctuate |
| Health check results | 15 seconds | Avoids downstream hammering |

```typescript
// Example: cache fee estimates with a short TTL
await redis.set(`fee:${chainId}`, JSON.stringify(estimate), 'EX', 10);
```

### Cache stampede protection

Use a lock-or-recompute pattern to avoid parallel cache misses all hitting the DB simultaneously:

```typescript
async function getCachedFee(chainId: string): Promise<FeeEstimate> {
  const cached = await redis.get(`fee:${chainId}`);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:fee:${chainId}`;
  const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 5);
  if (!acquired) {
    // Another worker is recomputing — wait briefly and retry
    await sleep(100);
    return getCachedFee(chainId);
  }

  const fresh = await fetchFeeFromChain(chainId);
  await redis.set(`fee:${chainId}`, JSON.stringify(fresh), 'EX', 10);
  await redis.del(lockKey);
  return fresh;
}
```

### Static asset CDN

Serve the React frontend through a CDN (CloudFront, Cloudflare). This eliminates origin bandwidth costs for all UI traffic.

---

## 3. Database Tuning

### Index audit

Run this query monthly to identify missing or unused indexes:

```sql
-- Tables with sequential scans on >10k rows (candidates for new indexes)
SELECT
  schemaname, relname, seq_scan, idx_scan,
  n_live_tup
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan
  AND n_live_tup > 10000
ORDER BY seq_scan DESC;

-- Indexes never used (candidates for removal)
SELECT
  schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY relname;
```

### Connection pooling

Use PgBouncer in transaction mode between the API and PostgreSQL. This lets 10× more API processes share a smaller DB connection pool.

```
# pgbouncer.ini
[databases]
bridgewatch = host=postgres port=5432 dbname=bridgewatch

[pgbouncer]
pool_mode = transaction
max_client_conn = 500
default_pool_size = 20
```

### Partition large tables

`transfers` and `events` grow unboundedly. Partition by month to keep query planner estimates accurate and vacuums fast:

```sql
-- Partition transfers by created_at month
CREATE TABLE transfers_2025_01 PARTITION OF transfers
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

### Archive old records

Transfers older than 90 days are rarely queried but represent significant storage. Move them to a cold table:

```sql
INSERT INTO transfers_archive SELECT * FROM transfers WHERE created_at < NOW() - INTERVAL '90 days';
DELETE FROM transfers WHERE created_at < NOW() - INTERVAL '90 days';
```

---

## 4. Infrastructure Sizing

### Horizontal vs vertical scaling

Bridge Watch API workers are stateless — prefer horizontal scaling (more small nodes) over vertical. This gives better availability and lets you scale to zero non-critical workers overnight.

### Spot / preemptible instances

Worker nodes that process async jobs (outbox workers, event indexers) tolerate interruption. Run them on spot/preemptible instances to cut compute cost 60–80%.

```yaml
# k8s/workers/deployment.yaml
nodeSelector:
  cloud.google.com/gke-spot: "true"
tolerations:
  - key: cloud.google.com/gke-spot
    operator: Equal
    value: "true"
    effect: NoSchedule
```

### Auto-scaling policies

Scale API replicas based on CPU utilization rather than request count — CPU is a better proxy for Bridge Watch workloads which include crypto verification.

```yaml
# k8s/api/hpa.yaml
spec:
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
```

---

## 5. Monitoring ROI

### Alert fatigue reduction

Each unnecessary alert page costs engineering time. Audit PagerDuty/Alertmanager monthly:

1. List all firing alerts over the last 30 days.
2. Mark alerts that triggered no action → raise threshold or add suppression window.
3. Merge alerts that always fire together into a single alert.

### Sampling high-volume traces

Tracing every request at high traffic multiplies storage costs. Use head-based sampling in the Otel collector:

```yaml
# otel-collector-config.yaml
processors:
  probabilistic_sampler:
    sampling_percentage: 10   # trace 10% at steady state
  tail_sampling:
    policies:
      - name: errors-always
        type: status_code
        status_code: { status_codes: [ERROR] }
```

Errors are always traced in full; normal traffic is sampled at 10%.

### Cost dashboards

Add a Grafana panel tracking estimated monthly spend alongside SLA metrics. This makes cost a first-class concern during incident review.

Recommended metrics to track:
- `node_cpu_seconds_total` → compute cost proxy
- `pg_database_size_bytes` → storage cost proxy
- Redis `used_memory` → cache cost proxy
- Outbound bytes from load balancer → bandwidth cost proxy

---

## Trade-offs Summary

| Optimization | Effort | Saving | Risk |
|---|---|---|---|
| Response compression | Low | 30–50% bandwidth | Tiny CPU increase |
| Redis TTL tuning | Low | 20–40% Redis memory | Stale reads during TTL window |
| PgBouncer | Medium | ~50% DB instance size | Config complexity |
| Spot instances for workers | Medium | 60–80% worker compute | Occasional job restarts |
| Table partitioning | High | 40–70% query time at scale | Migration effort |
| Trace sampling | Low | 80–90% trace storage | Reduced observability for normal requests |

Start with compression, TTL tuning, and spot instances — together they reduce the typical Bridge Watch monthly bill by 35–45% with minimal risk.
