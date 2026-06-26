# Circuit Breaker Trip Alert Runbook

## Purpose and Scope
This runbook covers the procedure for a "Circuit Breaker Trip" alert. This alert is triggered when an automated circuit breaker activates on a bridge or asset, halting transfers due to detected anomalies (e.g., massive outflows, extreme volatility).

## Prerequisites
- Access to the Bridge Watch Dashboard.
- Access to the Soroban contract admin tools or multisig.
- Access to the Alert Playbook Viewer at `/alert-playbooks`.

## Procedure

### 1. Detection
- Identify which asset/bridge triggered the circuit breaker.
- Review the specific condition that caused the trip (e.g., outflow limits exceeded).

### 2. Triage
- Investigate the root cause of the anomaly. Look for large whale movements, smart contract exploits, or oracle manipulation.
- Check community channels and security alert feeds (e.g., Forta, PeckShield).

### 3. Mitigation
- Leave the circuit breaker active until the root cause is fully understood.
- If it's a false positive or an expected large transfer, prepare to un-pause.
- If it's a true exploit, initiate full Incident Response and notify users.

### 4. Recovery
- Execute the un-pause transaction via the administrative multisig once verified safe.
- Monitor the bridge closely for the next hour.

## Verification
- Confirm that transfers are processing correctly after the un-pause.
- Ensure the alert resolves.

## Rollback
- If un-pausing leads to further anomalies, re-trigger the circuit breaker manually.

## Ownership
- **Primary Owner**: Security Team Lead
- **Secondary Owner**: Platform Engineering Lead

## Related Documents
- [Incident Response Guide](../incident-response-guide.md)
- [Alert Playbook Viewer](/alert-playbooks)
