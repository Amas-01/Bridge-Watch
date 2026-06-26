# Provider/Source Health Failure Alert Runbook

## Purpose and Scope
This runbook covers the procedure for a "Provider/Source Health Failure" alert. This happens when an external dependency (e.g., Soroban RPC, Circle API, Chainlink nodes) goes down or begins returning excessive errors.

## Prerequisites
- Access to the Bridge Watch System Health dashboard.
- Access to external provider status pages (e.g., status.stellar.org).
- Access to the Alert Playbook Viewer at `/alert-playbooks`.

## Procedure

### 1. Detection
- Identify the failing provider from the alert details.
- Check the System Health dashboard to see the error rate and latency metrics for that provider.

### 2. Triage
- Check the official status page of the provider (e.g., Circle, Stellar, Infura).
- If the provider's status page is green, check our own egress networking, NAT gateways, and API key limits/quotas.
- Look at backend logs for specific HTTP error codes (e.g., 429 Too Many Requests, 500 Internal Server Error).

### 3. Mitigation
- If it's a rate limit issue (429), reduce the polling frequency or rotate API keys if permissible.
- If the provider is down, switch to a fallback provider if configured (e.g., alternate RPC node).
- If no fallback is available, post a status update to users acknowledging the degraded performance.

### 4. Recovery
- Monitor the error rates.
- Once the provider recovers, ensure our system automatically reconnects and clears any backlog/queues.

## Verification
- Confirm error rates return to normal baselines.
- Verify the alert auto-resolves.

## Rollback
- Revert any polling frequency changes or fallback switches made during mitigation, once the primary provider is fully stable.

## Ownership
- **Primary Owner**: Infrastructure Lead
- **Secondary Owner**: Platform On-Call Lead

## Related Documents
- [Incident Response Guide](../incident-response-guide.md)
- [Alert Playbook Viewer](/alert-playbooks)
