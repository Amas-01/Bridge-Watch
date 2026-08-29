-- Migration: Add Stellar Wave Explorers and Verification Tables
-- Version: 1.0.0
-- Description: Adds tables for Database Query Performance Explorer, Deployment Drift Visualization,
--              Artifact Provenance Verification, and Release Compatibility Matrix

-- ============================================================================
-- 1. Database Query Performance Explorer Tables
-- ============================================================================

-- Table for query performance logs
CREATE TABLE IF NOT EXISTS query_performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash VARCHAR(255) NOT NULL,
  query_text TEXT NOT NULL,
  database_name VARCHAR(255) NOT NULL,
  execution_time_ms DECIMAL(10, 2) NOT NULL,
  rows_affected INTEGER DEFAULT 0,
  rows_scanned INTEGER DEFAULT 0,
  query_plan TEXT,
  status VARCHAR(50) DEFAULT 'success' CHECK (status IN ('success', 'failed', 'timeout', 'slow')),
  error_message TEXT,
  execution_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_performance_logs_hash ON query_performance_logs(query_hash);
CREATE INDEX IF NOT EXISTS idx_query_performance_logs_database ON query_performance_logs(database_name);
CREATE INDEX IF NOT EXISTS idx_query_performance_logs_timestamp ON query_performance_logs(execution_timestamp);
CREATE INDEX IF NOT EXISTS idx_query_performance_logs_status ON query_performance_logs(status);

-- Table for query performance analysis results
CREATE TABLE IF NOT EXISTS query_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash VARCHAR(255) NOT NULL UNIQUE,
  avg_execution_time_ms DECIMAL(10, 2),
  max_execution_time_ms DECIMAL(10, 2),
  min_execution_time_ms DECIMAL(10, 2),
  execution_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  slow_query_count INTEGER DEFAULT 0,
  percentile_95_ms DECIMAL(10, 2),
  percentile_99_ms DECIMAL(10, 2),
  recommendations TEXT[],
  last_analyzed TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_analysis_hash ON query_analysis(query_hash);
CREATE INDEX IF NOT EXISTS idx_query_analysis_avg_time ON query_analysis(avg_execution_time_ms DESC);

-- Table for slow query alerts
CREATE TABLE IF NOT EXISTS slow_query_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash VARCHAR(255) NOT NULL,
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('performance_degradation', 'threshold_breach', 'regression_detected')),
  severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  threshold_ms DECIMAL(10, 2),
  current_ms DECIMAL(10, 2),
  description TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slow_query_alerts_hash ON slow_query_alerts(query_hash);
CREATE INDEX IF NOT EXISTS idx_slow_query_alerts_severity ON slow_query_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_slow_query_alerts_resolved ON slow_query_alerts(resolved);

-- ============================================================================
-- 2. Deployment Drift Visualization Tables
-- ============================================================================

-- Table for environment snapshots
CREATE TABLE IF NOT EXISTS environment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_name VARCHAR(255) NOT NULL,
  environment_type VARCHAR(50) NOT NULL CHECK (environment_type IN ('production', 'staging', 'development', 'testing')),
  snapshot_version VARCHAR(50) NOT NULL,
  config_hash VARCHAR(255) NOT NULL,
  config_json JSONB NOT NULL,
  deployed_by VARCHAR(255),
  deployment_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_environment_snapshots_env ON environment_snapshots(environment_name);
CREATE INDEX IF NOT EXISTS idx_environment_snapshots_type ON environment_snapshots(environment_type);
CREATE INDEX IF NOT EXISTS idx_environment_snapshots_timestamp ON environment_snapshots(deployment_timestamp);

-- Table for deployment drift records
CREATE TABLE IF NOT EXISTS deployment_drift_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_environment VARCHAR(255) NOT NULL,
  to_environment VARCHAR(255) NOT NULL,
  from_snapshot_id UUID NOT NULL REFERENCES environment_snapshots(id) ON DELETE CASCADE,
  to_snapshot_id UUID NOT NULL REFERENCES environment_snapshots(id) ON DELETE CASCADE,
  drift_type VARCHAR(50) NOT NULL CHECK (drift_type IN ('version_mismatch', 'config_drift', 'state_drift', 'dependency_drift')),
  drift_score DECIMAL(5, 2) NOT NULL DEFAULT 0.0,
  drift_details JSONB,
  changed_fields TEXT[],
  severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_approved BOOLEAN DEFAULT FALSE,
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployment_drift_environments ON deployment_drift_records(from_environment, to_environment);
CREATE INDEX IF NOT EXISTS idx_deployment_drift_type ON deployment_drift_records(drift_type);
CREATE INDEX IF NOT EXISTS idx_deployment_drift_severity ON deployment_drift_records(severity);
CREATE INDEX IF NOT EXISTS idx_deployment_drift_approved ON deployment_drift_records(is_approved);

-- Table for deployment drift alerts
CREATE TABLE IF NOT EXISTS deployment_drift_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drift_record_id UUID NOT NULL REFERENCES deployment_drift_records(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'ignored')),
  description TEXT,
  remediation_steps TEXT[],
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployment_drift_alerts_drift ON deployment_drift_alerts(drift_record_id);
CREATE INDEX IF NOT EXISTS idx_deployment_drift_alerts_status ON deployment_drift_alerts(status);

-- ============================================================================
-- 3. Artifact Provenance Verification Tables
-- ============================================================================

-- Table for artifact provenance records
CREATE TABLE IF NOT EXISTS artifact_provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id VARCHAR(255) NOT NULL UNIQUE,
  artifact_name VARCHAR(255) NOT NULL,
  artifact_type VARCHAR(50) NOT NULL CHECK (artifact_type IN ('build', 'package', 'image', 'binary', 'config')),
  artifact_hash VARCHAR(255) NOT NULL,
  source_repository VARCHAR(255),
  source_branch VARCHAR(255),
  source_commit VARCHAR(255),
  creator_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  published_at TIMESTAMP,
  expiry_date TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_artifact_provenance_id ON artifact_provenance(artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifact_provenance_hash ON artifact_provenance(artifact_hash);
CREATE INDEX IF NOT EXISTS idx_artifact_provenance_creator ON artifact_provenance(creator_id);
CREATE INDEX IF NOT EXISTS idx_artifact_provenance_type ON artifact_provenance(artifact_type);

-- Table for artifact provenance chain (audit trail)
CREATE TABLE IF NOT EXISTS artifact_chain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES artifact_provenance(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('created', 'verified', 'signed', 'deployed', 'revoked')),
  actor_id VARCHAR(255) NOT NULL,
  action_timestamp TIMESTAMP NOT NULL,
  details JSONB,
  signature VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifact_chain_artifact ON artifact_chain(artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifact_chain_action ON artifact_chain(action);
CREATE INDEX IF NOT EXISTS idx_artifact_chain_actor ON artifact_chain(actor_id);
CREATE INDEX IF NOT EXISTS idx_artifact_chain_timestamp ON artifact_chain(action_timestamp);

-- Table for artifact verification results
CREATE TABLE IF NOT EXISTS artifact_verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES artifact_provenance(id) ON DELETE CASCADE,
  verification_type VARCHAR(50) NOT NULL CHECK (verification_type IN ('hash_verification', 'signature_verification', 'sbom_scan', 'vulnerability_scan', 'license_scan')),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'warning', 'skipped')),
  findings TEXT[],
  risk_level VARCHAR(20) DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  verified_by VARCHAR(255),
  verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifact_verification_artifact ON artifact_verification_results(artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifact_verification_status ON artifact_verification_results(status);
CREATE INDEX IF NOT EXISTS idx_artifact_verification_type ON artifact_verification_results(verification_type);
CREATE INDEX IF NOT EXISTS idx_artifact_verification_risk ON artifact_verification_results(risk_level);

-- ============================================================================
-- 4. Release Compatibility Matrix Tables
-- ============================================================================

-- Table for release compatibility records
CREATE TABLE IF NOT EXISTS release_compatibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_version VARCHAR(50) NOT NULL,
  target_version VARCHAR(50) NOT NULL,
  compatibility_status VARCHAR(50) NOT NULL DEFAULT 'untested' CHECK (compatibility_status IN ('compatible', 'incompatible', 'partial', 'untested', 'deprecated')),
  migration_path_available BOOLEAN DEFAULT FALSE,
  migration_guide_url VARCHAR(255),
  breaking_changes TEXT[],
  deprecations TEXT[],
  test_coverage DECIMAL(5, 2) DEFAULT 0.0,
  verified_by VARCHAR(255),
  verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_release_compatibility_versions ON release_compatibility(source_version, target_version);
CREATE INDEX IF NOT EXISTS idx_release_compatibility_status ON release_compatibility(compatibility_status);

-- Table for compatibility matrix (computed aggregation)
CREATE TABLE IF NOT EXISTS compatibility_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_version VARCHAR(50) NOT NULL,
  compatible_versions VARCHAR(50)[] NOT NULL,
  incompatible_versions VARCHAR(50)[] NOT NULL,
  partial_versions VARCHAR(50)[] NOT NULL,
  deprecated_versions VARCHAR(50)[] NOT NULL,
  overall_score DECIMAL(5, 2) DEFAULT 0.0,
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compatibility_matrix_version ON compatibility_matrix(release_version);

-- Table for compatibility test results
CREATE TABLE IF NOT EXISTS compatibility_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_version VARCHAR(50) NOT NULL,
  target_version VARCHAR(50) NOT NULL,
  test_id VARCHAR(255) NOT NULL,
  test_name VARCHAR(255) NOT NULL,
  test_category VARCHAR(50) NOT NULL CHECK (test_category IN ('migration', 'api', 'performance', 'security', 'functionality')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('passed', 'failed', 'skipped', 'error')),
  execution_time_ms INTEGER,
  error_message TEXT,
  test_details JSONB,
  run_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compatibility_test_versions ON compatibility_test_results(source_version, target_version);
CREATE INDEX IF NOT EXISTS idx_compatibility_test_status ON compatibility_test_results(status);
CREATE INDEX IF NOT EXISTS idx_compatibility_test_category ON compatibility_test_results(test_category);

-- ============================================================================
-- Timestamps and Triggers
-- ============================================================================

-- Ensure updated_at timestamps are automatically updated
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_release_compatibility_updated_at
  BEFORE UPDATE ON release_compatibility
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add any additional permissions for user roles if needed
-- GRANT SELECT ON query_performance_logs TO app_user;
-- GRANT SELECT ON environment_snapshots TO app_user;
-- GRANT SELECT ON artifact_provenance TO app_user;
-- GRANT SELECT ON release_compatibility TO app_user;
