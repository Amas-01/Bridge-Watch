# Supply Mismatch Alert Runbook

## Purpose and Scope
This runbook details the steps to investigate and resolve a "Supply Mismatch" alert. This occurs when the total supply of a bridged token on the Stellar network does not equal the locked collateral on the source chain (e.g., Ethereum).

## Prerequisites
- Access to Bridge Watch Reconciliation dashboard.
- Access to source chain block explorers (e.g., Etherscan).
- Access to the Alert Playbook Viewer at `/alert-playbooks`.

## Procedure

### 1. Detection
- Note the magnitude of the discrepancy from the alert.
- Verify the mismatch in the Reconciliation view.
- Check if the mismatch is due to a lag in indexing or block finality.

### 2. Triage
- Review recent bridge deposit and withdrawal transactions.
- Check the source chain smart contract for any unauthorized mints, administrative burns, or unbacked issuances.
- Identify if the mismatch is growing (active exploit) or static (historical sync issue).

### 3. Mitigation
- If an active exploit or unbacked mint is suspected, IMMEDIATELY escalate to Security On-Call and trigger the [Bridge Halt Response](#).
- If it's a known sync issue, document the affected block ranges and pause the alert temporarily.

### 4. Recovery
- Wait for the indexers to catch up if it was a finality delay.
- If it was an exploit, recovery will follow the Security Incident Response protocol.

## Verification
- Confirm that the Stellar supply and source chain locked balance match precisely.
- Verify that the alert resolves automatically.

## Rollback
- If the bridge was halted, follow the bridge un-halt procedure once verified safe.

## Ownership
- **Primary Owner**: Security Team Lead
- **Secondary Owner**: Platform On-Call Lead

## Related Documents
- [Incident Response Guide](../incident-response-guide.md)
- [Alert Playbook Viewer](/alert-playbooks)
