# Canary Deployment

How Bridge Watch gradually rolls out new versions before promoting to full production traffic.

## Overview

The canary workflow (`.github/workflows/canary.yml`) runs after every successful Docker build on `main`. It:

1. Deploys the new image to a canary replica with a configurable traffic weight (default 10%)
2. Polls `/health` for 5 minutes to confirm stability
3. Promotes to 100% production if all checks pass
4. Rolls back automatically if three consecutive health checks fail

## Triggering manually

```bash
# Deploy with default 10% canary weight
gh workflow run canary.yml --repo StellaBridge/Bridge-Watch

# Deploy with a custom weight and explicit image tag
gh workflow run canary.yml \
  --repo StellaBridge/Bridge-Watch \
  --field canary_weight=20 \
  --field image_tag=abc1234
```

## Traffic routing

Traffic splitting is done at the Ingress layer via the `nginx.ingress.kubernetes.io/canary-weight` annotation. Uncomment and adapt the `kubectl` commands in the workflow to your cluster.

| Phase | Canary weight | Stable weight |
|---|---|---|
| Canary active | `CANARY_WEIGHT` (default 10%) | remaining % |
| Promoted | 100% (canary becomes stable) | 0% |
| Rolled back | 0% (canary deleted) | 100% |

## Health monitoring

The monitor step polls `CANARY_HOST/health` every 30 seconds for 10 attempts (5 minutes total). Three consecutive non-200 responses trigger an immediate abort and rollback.

Set the `CANARY_HOST` variable in the GitHub Actions environment named `canary`:

```
Settings → Environments → canary → Environment variables → CANARY_HOST=https://canary.yourhost.com
```

## Rollback behavior

Rollback runs automatically on any failure in the `monitor-canary` or `deploy-canary` jobs. It:

- Deletes the canary deployment (`bridge-watch-canary`)
- Resets the stable deployment's canary-weight annotation to `0`
- Logs an error annotation visible in the Actions summary

To trigger a manual rollback at any time:

```bash
kubectl delete deployment/bridge-watch-canary --ignore-not-found
kubectl annotate deployment/bridge-watch \
  nginx.ingress.kubernetes.io/canary-weight="0" --overwrite
```

## Abort policy

The `concurrency` block prevents two canary runs from overlapping:

```yaml
concurrency:
  group: canary-deployment
  cancel-in-progress: false
```

A new push to `main` while a canary is active will queue — not cancel — the current run, so the in-flight health window always completes.
