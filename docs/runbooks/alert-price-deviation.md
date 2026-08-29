# Price Deviation Alert Runbook

## Purpose and Scope
This runbook guides the response to a "Price Deviation" alert, triggered when the price difference between multiple tracked oracles or exchanges exceeds the configured tolerance for an asset.

## Prerequisites
- Access to the Bridge Watch Price Feeds dashboard.
- Access to the Alert Playbook Viewer at `/alert-playbooks`.

## Procedure

### 1. Detection
- Identify the asset and the specific sources (e.g., Chainlink vs. Soroban Oracle) that are diverging.
- Review the history of the deviation on the dashboard to determine if it's a spike or a sustained divergence.

### 2. Triage
- Check if one of the oracles has stopped updating (stale data).
- Look for market volatility that might cause temporary spreads between exchanges.
- Assess the risk of arbitrage exploitation.

### 3. Mitigation
- If an oracle is stale, initiate the [Stale Oracle / Price Feed](#) runbook.
- If it's extreme market volatility, alert the trading and risk teams.
- Adjust the deviation threshold if it's a known, safe structural spread.

### 4. Recovery
- Monitor the feeds until the prices converge back within limits.

## Verification
- Verify that all oracle sources are updating correctly.
- Confirm the alert transitions to "Resolved".

## Rollback
- Revert any temporary threshold adjustments made during triage.

## Ownership
- **Primary Owner**: Platform On-Call Lead
- **Secondary Owner**: Observability Guild

## Related Documents
- [Incident Response Guide](../incident-response-guide.md)
- [Alert Playbook Viewer](/alert-playbooks)
