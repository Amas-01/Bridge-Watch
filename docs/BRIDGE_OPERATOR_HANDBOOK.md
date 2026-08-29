# Bridge Operator Handbook

## Overview

This handbook provides comprehensive guidance for bridge operators covering deployment, monitoring, incident response, and best practices for maintaining healthy bridge operations.

## Table of Contents

1. [Deployment Guide](#deployment-guide)
2. [Health Checks](#health-checks)
3. [Incident Response](#incident-response)
4. [Best Practices](#best-practices)
5. [Troubleshooting](#troubleshooting)

---

## Deployment Guide

### Prerequisites

Before deploying a bridge, ensure you have:

- Access to both source and destination chain RPC endpoints
- Administrative credentials for bridge contracts
- Monitoring infrastructure ready
- Backup and recovery procedures tested

### Initial Setup

1. **Deploy Bridge Contracts**

   ```bash
   # Deploy to source chain
   soroban contract deploy --wasm bridge.wasm --network mainnet
   ```

   # Record contract ID for configuration

   export BRIDGE_CONTRACT_ID=<contract_id>

   ```

   ```

2. **Configure Bridge Parameters**

   ```bash
   # Set transfer limits
   soroban contract invoke \
     --id $BRIDGE_CONTRACT_ID \
     --fn set_transfer_limit \
     -- --limit 1000000

   # Configure operator addresses
   soroban contract invoke \
     --id $BRIDGE_CONTRACT_ID \
     --fn add_operator \
     -- --operator <operator_address>
   ```

3. **Initialize Monitoring**
   - Set up Prometheus exporters for bridge metrics
   - Configure Grafana dashboards from `monitoring/grafana/dashboards/bridge-monitoring.json`
   - Enable alerting via AlertManager

4. **Test Bridge Transfers**
   ```bash
   # Execute test transfer
   soroban contract invoke \
     --id $BRIDGE_CONTRACT_ID \
     --fn transfer \
     -- --amount 100 --recipient <test_address>
   ```

### Configuration Checklist

- [ ] Contract deployed on both chains
- [ ] Transfer limits configured
- [ ] Operator keys secured in vault
- [ ] Monitoring dashboards active
- [ ] Alert rules configured
- [ ] Test transfers completed successfully
- [ ] Emergency shutdown procedures documented

---

## Health Checks

### Automated Health Monitoring

Bridge operators should monitor these key metrics:

#### Bridge Uptime

- **Metric**: `bridge_uptime_seconds`
- **Threshold**: > 99.9%
- **Action**: Investigate if drops below threshold

#### Transfer Success Rate

- **Metric**: `bridge_transfer_success_rate`
- **Threshold**: > 99%
- **Action**: Check for network issues or contract errors

#### Pending Transfers

- **Metric**: `bridge_pending_transfers`
- **Threshold**: < 10 for > 5 minutes
- **Action**: Check relayer health and gas availability

#### Balance Discrepancies

- **Metric**: `bridge_balance_mismatch`
- **Threshold**: 0
- **Action**: Immediate reconciliation required

### Manual Health Checks

Perform these checks daily:

1. **Verify Bridge Balances**

   ```bash
   soroban contract invoke \
     --id $BRIDGE_CONTRACT_ID \
     --fn get_balance
   ```

2. **Check Operator Status**

   ```bash
   soroban contract invoke \
     --id $BRIDGE_CONTRACT_ID \
     --fn get_operators
   ```

3. **Review Recent Transfers**

   ```bash
   # Query last 24 hours of transfers
   curl -X GET "https://api.bridge-watch.io/v1/transfers?bridge_id=$BRIDGE_ID&since=24h"
   ```

4. **Verify RPC Endpoint Connectivity**

   ```bash
   # Test source chain
   curl -X POST $SOURCE_RPC -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

   # Test destination chain
   curl -X POST $DEST_RPC -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
   ```

---

## Incident Response

### Severity Levels

**P0 - Critical**

- Bridge completely down
- Funds at risk
- Security breach detected

**P1 - High**

- Degraded performance affecting >50% of transfers
- Single chain connectivity loss
- Abnormal balance discrepancy

**P2 - Medium**

- Intermittent transfer failures
- Elevated error rates
- Monitoring gaps

**P3 - Low**

- Minor performance degradation
- Documentation updates needed

### Response Procedures

#### P0: Critical Incidents

1. **Immediate Actions** (0-5 minutes)
   - Trigger emergency shutdown if funds at risk
   - Page on-call operator
   - Activate incident command center
   - Post status update to status page

2. **Investigation** (5-15 minutes)
   - Gather logs and metrics
   - Identify root cause
   - Assess impact scope
   - Coordinate with chain operators if needed

3. **Resolution** (15+ minutes)
   - Execute fix or workaround
   - Validate bridge health
   - Resume operations gradually
   - Monitor for recurrence

4. **Post-Incident** (within 24 hours)
   - Complete incident report
   - Update runbooks
   - Schedule post-mortem
   - Implement preventive measures

#### P1: High Priority

1. Notify operations team
2. Begin investigation within 15 minutes
3. Provide status updates every 30 minutes
4. Document findings and resolution

#### Emergency Shutdown

```bash
# Pause bridge operations
soroban contract invoke \
  --id $BRIDGE_CONTRACT_ID \
  --fn pause \
  -- --reason "Emergency shutdown"

# Notify all stakeholders
curl -X POST "https://api.bridge-watch.io/v1/notifications/emergency" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"message":"Bridge emergency shutdown","bridge_id":"$BRIDGE_ID"}'
```

---

## Best Practices

### Operational Excellence

1. **Key Management**
   - Use hardware security modules (HSM) for operator keys
   - Implement multi-signature requirements for critical operations
   - Rotate keys quarterly
   - Store backup keys in geographically distributed secure locations

2. **Monitoring**
   - Set up redundant monitoring systems
   - Configure alerts for all critical metrics
   - Review dashboards daily
   - Test alert delivery monthly

3. **Capacity Planning**
   - Monitor transfer volume trends
   - Plan for 3x peak capacity
   - Review gas fee strategies weekly
   - Maintain operational reserves for both chains

4. **Documentation**
   - Keep runbooks up to date
   - Document all configuration changes
   - Maintain operator contact list
   - Update incident response procedures after each incident

5. **Regular Testing**
   - Weekly test transfers
   - Monthly failover drills
   - Quarterly disaster recovery tests
   - Annual security audits

### Security Best Practices

- Enable rate limiting on API endpoints
- Implement transaction size limits
- Use circuit breakers for anomaly detection
- Log all administrative actions
- Review access logs weekly
- Maintain separation of duties

### Performance Optimization

- Cache frequently accessed data
- Batch RPC calls when possible
- Use WebSocket connections for real-time updates
- Implement exponential backoff for retries
- Monitor and optimize gas usage

---

## Troubleshooting

### Common Issues

#### Transfers Stuck in Pending

**Symptoms**: Transfers not completing within expected timeframe

**Diagnosis**:

```bash
# Check relayer status
curl "https://api.bridge-watch.io/v1/relayer/status?bridge_id=$BRIDGE_ID"

# Check gas prices
soroban contract invoke --id $BRIDGE_CONTRACT_ID --fn get_gas_price
```

**Resolution**:

- Verify relayer has sufficient balance
- Check network congestion
- Increase gas price if needed
- Restart relayer service if hung

#### Balance Mismatch

**Symptoms**: Source and destination balances don't match

**Diagnosis**:

```bash
# Get detailed balance report
soroban contract invoke --id $BRIDGE_CONTRACT_ID --fn reconcile_balances
```

**Resolution**:

- Run reconciliation job
- Verify all pending transfers
- Check for failed but not rolled-back transactions
- Contact support if discrepancy persists

#### RPC Connection Failures

**Symptoms**: Unable to connect to chain RPC endpoints

**Diagnosis**:

```bash
# Test connectivity
nc -zv $RPC_HOST $RPC_PORT

# Check DNS resolution
nslookup $RPC_HOST
```

**Resolution**:

- Switch to backup RPC endpoint
- Verify firewall rules
- Check API key validity
- Contact RPC provider

#### High Error Rates

**Symptoms**: Increased transfer failures

**Diagnosis**:

```bash
# Get error breakdown
curl "https://api.bridge-watch.io/v1/metrics/errors?bridge_id=$BRIDGE_ID&since=1h"
```

**Resolution**:

- Identify error pattern
- Check contract event logs
- Verify input validation
- Update contract if bug identified

### Debug Commands

```bash
# Get contract state
soroban contract invoke --id $BRIDGE_CONTRACT_ID --fn get_state

# View recent events
soroban contract invoke --id $BRIDGE_CONTRACT_ID --fn get_events --count 100

# Check operator permissions
soroban contract invoke --id $BRIDGE_CONTRACT_ID --fn is_operator -- --address <addr>

# Get transfer details
soroban contract invoke --id $BRIDGE_CONTRACT_ID --fn get_transfer -- --id <transfer_id>
```

### Log Analysis

Key log patterns to monitor:

- `ERROR: transfer_failed` - Failed transfer attempts
- `WARN: rate_limit_exceeded` - Rate limiting triggered
- `ERROR: insufficient_balance` - Balance too low
- `ERROR: signature_invalid` - Authentication failure

### Escalation Path

1. **On-call operator** - First responder for all incidents
2. **Bridge engineering team** - For complex technical issues
3. **Security team** - For suspected security incidents
4. **Chain operators** - For underlying blockchain issues

---

## Support and Resources

### Documentation Links

- [API Documentation](../backend/docs/API.md)
- [Bridge Architecture](../docs/architecture/system-overview.md)
- [Monitoring Setup](../monitoring/README.md)
- [Incident Response Templates](../docs/runbooks/incident-response-templates.md)

### Contact Information

- **Operations Team**: ops@bridge-watch.io
- **Security Team**: security@bridge-watch.io
- **On-call Hotline**: +1-555-BRIDGE-0
- **Status Page**: https://status.bridge-watch.io

### Community Resources

- **Operator Forum**: https://forum.bridge-watch.io
- **Discord**: https://discord.gg/bridge-watch
- **GitHub Issues**: https://github.com/bridge-watch/issues

---

## Appendix

### Glossary

- **Relayer**: Service that submits transactions to destination chain
- **Circuit Breaker**: Automated mechanism to pause operations during anomalies
- **Reconciliation**: Process of verifying source and destination balances match
- **Slashing**: Penalty mechanism for operator misbehavior

### Configuration Examples

See `backend/docs/bridge_transaction_monitoring.md` for detailed configuration examples.

### Change Log

- 2026-06-25: Initial handbook creation
- Version: 1.0.0
