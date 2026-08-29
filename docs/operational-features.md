# Operational Features

This document describes the four operational features added to Bridge Watch for safer deployments and better operational visibility.

## 1. Slow Query Regression Detection (Issue #1070)

### Purpose
Detect when database query performance degrades beyond historical baselines, enabling early detection of performance regressions.

### Data Model

#### slow_query_baselines
- `id` (UUID): Unique identifier
- `query_name` (string): Human-readable query name
- `query_hash` (string): SHA256 hash of the query text
- `baseline_ms` (integer): Historical baseline execution time in milliseconds
- `threshold_ms` (integer): Maximum acceptable execution time
- `variance_threshold` (float): Acceptable variance as percentage (default 0.2 = 20%)
- `status` (enum): `active`, `disabled`, `testing`

#### slow_query_observations
- `id` (UUID): Unique identifier
- `baseline_id` (UUID): Reference to baseline
- `execution_ms` (integer): Actual execution time
- `variance_pct` (float): Percentage deviation from baseline
- `is_regression` (boolean): Whether this exceeds the threshold
- `query_details` (text): Query plan or additional context
- `observed_at` (timestamp): When observed

#### slow_query_alerts
- `id` (UUID): Unique identifier
- `baseline_id` (UUID): Reference to baseline
- `severity` (enum): `low`, `medium`, `high`, `critical`
- `observation_count` (integer): Number of regression observations
- `max_duration_ms` (integer): Worst observation time
- `avg_variance_pct` (float): Average deviation percentage
- `status` (enum): `active`, `resolved`
- `first_observed_at` (timestamp): When first regression detected
- `resolved_at` (timestamp): When manually resolved

### API Endpoints

```
POST /api/v1/slow-queries/baseline
  Creates a new query baseline
  Body: { queryName, baselineMs, varianceThreshold? }

GET /api/v1/slow-queries/baseline
  List all baselines (query param: status)

GET /api/v1/slow-queries/baseline/:id
  Get a specific baseline

PATCH /api/v1/slow-queries/baseline/:id
  Update baseline threshold values
  Body: { baselineMs?, varianceThreshold? }

POST /api/v1/slow-queries/observations
  Record a query execution time
  Body: { baselineId, executionMs, queryDetails? }

GET /api/v1/slow-queries/alerts
  Get all active alerts

POST /api/v1/slow-queries/alerts/:id/resolve
  Mark an alert as resolved

POST /api/v1/slow-queries/baseline/:id/disable
  Disable monitoring of a baseline
```

### Usage Example

```typescript
const baseline = await fetch('/api/v1/slow-queries/baseline', {
  method: 'POST',
  body: JSON.stringify({
    queryName: 'SELECT users WHERE status=active',
    baselineMs: 150
  })
});

await fetch('/api/v1/slow-queries/observations', {
  method: 'POST',
  body: JSON.stringify({
    baselineId: baseline.id,
    executionMs: 250
  })
});
```

### Observability
- Prometheus metrics: `slow_query_regressions_total`, `slow_query_alert_severity_distribution`
- Logs: All observations and alerts logged at info level
- Alerts: Automated alerts for high/critical severity regressions

### Rollout Procedure

1. Deploy service with migration applied
2. Create baselines for critical queries via API
3. Monitor for 24h to establish patterns
4. Adjust variance_threshold based on baseline noise
5. Enable alerts and integrate with alert routing

### Rollback Procedure

1. Disable all baselines via `POST /baseline/:id/disable`
2. Alert system becomes no-op
3. No data loss; logs and observations retained
4. Can be re-enabled by creating new baselines

---

## 2. Automated Rollback Readiness Checks (Issue #1068)

### Purpose
Verify deployment readiness for rollback by running prerequisite checks before initiating rollback operations.

### Data Model

#### rollback_readiness_checks
- `id` (UUID): Unique identifier
- `deployment_id` (string): Deployment identifier
- `check_type` (string): Type of check (e.g., 'data-consistency', 'pending-transactions')
- `status` (enum): `pending`, `running`, `completed`, `failed`
- `passed` (boolean): Check pass/fail result
- `check_criteria` (jsonb): Input criteria for the check
- `check_result` (jsonb): Output of the check execution
- `failure_reason` (text): Why the check failed if applicable
- `executed_at` (timestamp): When the check ran

#### rollback_readiness_summaries
- `id` (UUID): Unique identifier
- `deployment_id` (string): Deployment identifier
- `total_checks` (integer): Number of checks configured
- `passed_checks` (integer): Number of passed checks
- `overall_status` (enum): `pending`, `in_progress`, `ready`, `blocked`
- `ready_for_rollback` (boolean): Safe to rollback
- `blocked_checks` (jsonb): List of failed check names
- `evaluated_at` (timestamp): Last evaluation time

#### rollback_execution_history
- `id` (UUID): Unique identifier
- `deployment_id` (string): Deployment identifier
- `initiated_by` (string): User who initiated rollback
- `status` (enum): `initiated`, `in_progress`, `completed`, `failed`
- `reason` (text): Why rollback was initiated
- `rollback_config` (jsonb): Configuration for rollback
- `duration_seconds` (integer): Time to complete rollback
- `started_at` (timestamp): Start time
- `completed_at` (timestamp): Completion time

### API Endpoints

```
POST /api/v1/rollback/checks
  Create a readiness check
  Body: { deploymentId, checkType, criteria }

POST /api/v1/rollback/checks/:id/execute
  Execute a check
  Body: { result, passed, failureReason? }

GET /api/v1/rollback/deployments/:deploymentId/summary
  Get readiness summary

GET /api/v1/rollback/deployments/:deploymentId/checks
  List checks for a deployment

POST /api/v1/rollback/initiate?deploymentId=X
  Initiate rollback (requires ready_for_rollback=true)
  Body: { initiatedBy, reason?, config? }

POST /api/v1/rollback/executions/:id/complete
  Mark rollback as complete/failed
  Body: { status, durationSeconds? }

GET /api/v1/rollback/deployments/:deploymentId/history
  Get rollback execution history
```

### Standard Check Types

- `data-consistency`: Verify data integrity before rollback
- `pending-transactions`: Check for in-flight transactions
- `backup-verification`: Confirm backup availability
- `state-validation`: Verify system state is valid
- `dependency-check`: Verify all dependencies healthy

### Rollout Procedure

1. Deploy service with migration
2. Define check types for your deployment process
3. Create checks automatically during deployment
4. Run checks before rollback initiation
5. Block rollback if checks fail

### Rollback Procedure

1. Delete all checks: `DELETE FROM rollback_readiness_checks WHERE deployment_id=X`
2. Reset summary: `DELETE FROM rollback_readiness_summaries WHERE deployment_id=X`
3. Manually verify rollback safety
4. Execute rollback outside of this system

---

## 3. Canary Metric Comparison (Issue #1067)

### Purpose
Deploy to canary environment and automatically compare metrics against baseline to detect issues before full rollout.

### Data Model

#### canary_deployments
- `id` (UUID): Unique identifier
- `deployment_name` (string): Name of the deployment
- `version` (string): Application version
- `environment` (string): Target environment (staging, canary, prod)
- `status` (enum): `running`, `completed`, `failed`, `aborted`
- `deployment_config` (jsonb): Deployment configuration
- `traffic_percentage` (integer): Traffic directed to canary (default 10%)
- `baseline_version` (string): Version being compared against
- `started_at` (timestamp): Start time
- `ended_at` (timestamp): End time
- `created_at` (timestamp): Creation time

#### canary_metrics
- `id` (UUID): Unique identifier
- `deployment_id` (UUID): Reference to deployment
- `metric_name` (string): Name of the metric
- `metric_type` (string): Type of metric (latency, throughput, error_rate, cpu, memory)
- `canary_value` (float): Value from canary deployment
- `baseline_value` (float): Value from baseline
- `deviation_pct` (float): Percentage deviation
- `threshold_pct` (float): Acceptable deviation threshold
- `within_threshold` (boolean): Whether metric is healthy
- `measured_at` (timestamp): When measured

#### canary_metric_comparisons
- `id` (UUID): Unique identifier
- `deployment_id` (UUID): Reference to deployment
- `comparison_status` (enum): `in_progress`, `completed`, `failed`
- `total_metrics` (integer): Number of metrics tracked
- `healthy_metrics` (integer): Number of healthy metrics
- `overall_deviation_pct` (float): Average deviation across metrics
- `anomalies` (jsonb): List of unhealthy metrics
- `recommendation` (enum): `continue_monitoring`, `expand_traffic`, `rollback`, `investigate`
- `evaluated_at` (timestamp): Last evaluation time
- `created_at` (timestamp): Creation time

### API Endpoints

```
POST /api/v1/canary/deployments
  Create a canary deployment
  Body: { deploymentName, version, environment, config, trafficPercentage?, baselineVersion? }

GET /api/v1/canary/deployments
  List deployments (query params: environment, status)

GET /api/v1/canary/deployments/:id
  Get deployment details

POST /api/v1/canary/deployments/:deploymentId/metrics
  Record a metric observation
  Body: { metricName, metricType, canaryValue, baselineValue, thresholdPct? }

GET /api/v1/canary/deployments/:deploymentId/metrics
  Get all metrics for deployment

GET /api/v1/canary/deployments/:deploymentId/comparison
  Get comparison results and recommendation

POST /api/v1/canary/deployments/:deploymentId/complete
  Mark deployment as complete/failed/aborted
  Body: { status }
```

### Metric Types and Thresholds

- `latency` (p99, p95): 10% deviation acceptable
- `throughput` (requests/sec): 15% deviation acceptable
- `error_rate` (percentage): 50% relative increase not acceptable
- `cpu` (percentage): 20% deviation acceptable
- `memory` (MB): 25% deviation acceptable

### Recommendations

- `continue_monitoring`: All metrics healthy, continue observing
- `expand_traffic`: All metrics healthy, safe to increase traffic
- `investigate`: Some metrics unhealthy but not critical
- `rollback`: Multiple metrics failing or severe anomaly detected

### Rollout Procedure

1. Deploy canary version to staging environment
2. Create canary deployment record
3. Start recording metrics (latency, throughput, errors, resource usage)
4. Monitor comparison results for 30+ minutes
5. If recommendation is 'expand_traffic', gradually increase traffic
6. If recommendation is 'rollback', abort and investigate

### Rollback Procedure

1. Abort canary: `POST /deployments/:id/complete` with status=aborted
2. All metrics and comparison data retained for analysis
3. Route all traffic back to baseline version
4. Investigate anomalies identified during canary phase

---

## 4. Environment Promotion Gates (Issue #1066)

### Purpose
Control flow of deployments through environments with configurable gates requiring checks and approvals.

### Data Model

#### promotion_gates
- `id` (UUID): Unique identifier
- `source_environment` (string): Source environment (dev, staging, prod)
- `target_environment` (string): Target environment
- `gate_name` (string): User-friendly gate name
- `gate_type` (string): Type of gate (automated-check, manual-approval, hybrid)
- `status` (enum): `active`, `disabled`
- `gate_criteria` (jsonb): Criteria for gate execution
- `approval_count` (integer): Current approvals received
- `required_approvals` (integer): Number of approvals needed
- `approval_roles` (string): Comma-separated roles allowed to approve
- `created_at` (timestamp): Creation time
- `updated_at` (timestamp): Last update

#### promotion_history
- `id` (UUID): Unique identifier
- `deployment_id` (string): Deployment identifier
- `version` (string): Application version
- `source_environment` (string): Source environment
- `target_environment` (string): Target environment
- `status` (enum): `pending`, `approved`, `denied`, `promoted`, `cancelled`
- `gate_results` (jsonb): Results of gate executions
- `passed_gates` (integer): Number of gates that passed
- `total_gates` (integer): Total number of gates
- `reason_denied` (text): Why promotion was denied
- `requested_at` (timestamp): When requested
- `approved_at` (timestamp): When approved
- `promoted_at` (timestamp): When actually promoted

#### promotion_approvals
- `id` (UUID): Unique identifier
- `promotion_id` (UUID): Reference to promotion
- `approver_id` (string): User approving
- `decision` (enum): `approved`, `denied`
- `comment` (text): Approval comment
- `approved_at` (timestamp): When decided

#### gate_execution_logs
- `id` (UUID): Unique identifier
- `gate_id` (UUID): Reference to gate
- `promotion_id` (UUID): Reference to promotion
- `execution_status` (enum): `pending`, `running`, `completed`, `failed`
- `passed` (boolean): Whether gate passed
- `execution_result` (jsonb): Detailed result
- `duration_ms` (integer): Execution time
- `executed_at` (timestamp): When executed

### API Endpoints

```
POST /api/v1/promotion-gates
  Create a promotion gate
  Body: { sourceEnvironment, targetEnvironment, gateName, gateType, criteria, requiredApprovals?, approvalRoles? }

GET /api/v1/promotion-gates
  List gates (query params: sourceEnvironment, targetEnvironment)

POST /api/v1/promotions
  Request promotion
  Body: { deploymentId, version, sourceEnvironment, targetEnvironment }

GET /api/v1/promotions
  List promotions (query params: sourceEnvironment, targetEnvironment, status)

GET /api/v1/promotions/:promotionId
  Get promotion details

POST /api/v1/promotions/:promotionId/execute-gate
  Execute a gate check
  Body: { gateId, passed, result?, durationMs? }

POST /api/v1/promotions/:promotionId/approve
  Approve promotion
  Body: { approverId, comment? }

POST /api/v1/promotions/:promotionId/deny
  Deny promotion
  Body: { approverId, reason }

POST /api/v1/promotions/:promotionId/promote
  Complete the promotion (requires approved status)
```

### Typical Gate Types

- **Automated checks**: Run security scanning, dependency checks, test results validation
- **Manual approval**: Require explicit approval from maintainers or ops team
- **Hybrid**: Both automated checks and manual approval required

### Rollout Procedure

1. Define gates for each environment transition (dev->staging->prod)
2. Create gates via API
3. Request promotion for each deployment
4. Execute automated gate checks
5. Collect manual approvals if required
6. Complete promotion when all gates pass

### Example Workflow

```
Request promotion: dev -> staging
  ├─ Security scan gate: automated
  ├─ Performance baseline gate: automated
  └─ Manual approval gate: requires 1 approval

Gates execute automatically
Manual approvals requested
Once all pass: promotion status = approved
Execute: POST /promotions/:id/promote
```

### Rollback Procedure

1. Create new promotion from prod -> previous version
2. Follow same gate process
3. Automatic gates should pass for rollback (no new code)
4. Require expedited approval for rollback

---

## Integration with Alert System

All four features integrate with Bridge Watch's alert system:

- Slow Query Alerts are routed through alert_rules and escalation
- Rollback blockers trigger high-priority incidents
- Canary anomalies create incidents for investigation
- Promotion denials create audit log entries

## Authorization

All endpoints enforce role-based access control:

- **viewer**: Can read all data
- **operator**: Can record observations and mark alerts resolved
- **admin**: Can create/modify baselines, gates, and approve promotions
- **automator**: Can execute gate checks and record metrics

## Retention Policies

- Observations and metrics: 90 days
- Alerts and comparisons: 1 year
- Rollback execution history: 2 years
- Promotions and approvals: Indefinite (audit trail)
