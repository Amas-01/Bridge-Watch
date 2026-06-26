# Depeg Alert Runbook

## Purpose and Scope
This runbook covers the procedure for responding to a "Depeg" alert. A depeg occurs when a stable asset's price on Stellar deviates significantly from its target peg (e.g., $1.00) beyond the configured threshold for a sustained period.

## Prerequisites
- Access to the Bridge Watch dashboard and Grafana dashboards.
- Access to the Alert Playbook Viewer at `/alert-playbooks`.
- Permissions to view price oracle feeds and DEX liquidity metrics.

## Procedure

### 1. Detection
- Review the alert notification details (asset, current price, threshold).
- Confirm the depeg on the Bridge Watch Asset Overview dashboard.
- Check external oracles (e.g., Chainlink, Band) and CEX prices to verify if it's a global depeg or an isolated Stellar DEX liquidity issue.

### 2. Triage
- If the depeg is global (happening on all chains/CEXs), escalate to the Incident Commander to assess systemic risk.
- If the depeg is isolated to Stellar, check the DEX liquidity depth for the affected asset.
- Identify if there were recent large swaps or bridge transfers that depleted liquidity.

### 3. Mitigation
- If it's a liquidity issue, notify market makers or the Treasury team to replenish the liquidity pools if applicable.
- If it's an oracle or feed error, initiate the [Stale Oracle / Price Feed](#) procedure.

### 4. Recovery
- Monitor the asset's price until it returns to within the acceptable deviation threshold.
- The alert should auto-resolve once the price stabilizes for 5 consecutive minutes.

## Verification
- Confirm the price is tracking the peg accurately in the dashboard.
- Check that the alert status is "Resolved" in PagerDuty/Slack.

## Rollback
- N/A - observational and communication-based mitigation.

## Ownership
- **Primary Owner**: Platform On-Call Lead
- **Secondary Owner**: Trading / Treasury Ops

## Related Documents
- [Incident Response Guide](../incident-response-guide.md)
- [Alert Playbook Viewer](/alert-playbooks)
