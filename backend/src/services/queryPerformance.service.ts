import { db } from "../database/db.js";
import type { PoolClient } from "pg";

export interface QueryPerformanceLog {
  id: string;
  queryHash: string;
  queryText: string;
  databaseName: string;
  executionTimeMs: number;
  rowsAffected: number;
  rowsScanned: number;
  status: "success" | "failed" | "timeout" | "slow";
  errorMessage?: string;
  executionTimestamp: Date;
}

export interface QueryAnalysis {
  id: string;
  queryHash: string;
  avgExecutionTimeMs: number;
  maxExecutionTimeMs: number;
  minExecutionTimeMs: number;
  executionCount: number;
  failureCount: number;
  slowQueryCount: number;
  percentile95Ms: number;
  percentile99Ms: number;
  recommendations: string[];
}

export interface SlowQueryAlert {
  id: string;
  queryHash: string;
  alertType: "performance_degradation" | "threshold_breach" | "regression_detected";
  severity: "low" | "medium" | "high" | "critical";
  thresholdMs: number;
  currentMs: number;
  description: string;
  resolved: boolean;
}

export const queryPerformanceService = {
  async logQueryExecution(
    queryHash: string,
    queryText: string,
    databaseName: string,
    executionTimeMs: number,
    rowsAffected: number = 0,
    rowsScanned: number = 0,
    status: "success" | "failed" | "timeout" | "slow" = "success",
    errorMessage?: string,
    client?: PoolClient
  ): Promise<QueryPerformanceLog> {
    const query = client || db;

    try {
      const result = await query.query(
        `INSERT INTO query_performance_logs
         (query_hash, query_text, database_name, execution_time_ms, rows_affected, rows_scanned, status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, query_hash, query_text, database_name, execution_time_ms, rows_affected, rows_scanned, status, error_message, execution_timestamp`,
        [queryHash, queryText, databaseName, executionTimeMs, rowsAffected, rowsScanned, status, errorMessage]
      );

      return {
        id: result.rows[0].id,
        queryHash: result.rows[0].query_hash,
        queryText: result.rows[0].query_text,
        databaseName: result.rows[0].database_name,
        executionTimeMs: result.rows[0].execution_time_ms,
        rowsAffected: result.rows[0].rows_affected,
        rowsScanned: result.rows[0].rows_scanned,
        status: result.rows[0].status,
        errorMessage: result.rows[0].error_message,
        executionTimestamp: result.rows[0].execution_timestamp,
      };
    } catch (error) {
      throw new Error(`Failed to log query execution: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async analyzeQuery(queryHash: string, client?: PoolClient): Promise<QueryAnalysis> {
    const query = client || db;

    try {
      const stats = await query.query(
        `SELECT
         AVG(execution_time_ms) as avg_time,
         MAX(execution_time_ms) as max_time,
         MIN(execution_time_ms) as min_time,
         COUNT(*) as exec_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failure_count,
         SUM(CASE WHEN status = 'slow' THEN 1 ELSE 0 END) as slow_count,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95,
         PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time_ms) as p99
         FROM query_performance_logs
         WHERE query_hash = $1`,
        [queryHash]
      );

      const row = stats.rows[0];
      const recommendations: string[] = [];

      if (row.avg_time > 1000) {
        recommendations.push("Query takes over 1 second on average - consider adding indexes");
      }
      if (row.failure_count > 0) {
        recommendations.push(`Query has failed ${row.failure_count} times - review error logs`);
      }
      if (row.slow_count / row.exec_count > 0.1) {
        recommendations.push("Over 10% of executions are slow - optimize query or indexes");
      }

      // Update or insert analysis record
      const result = await query.query(
        `INSERT INTO query_analysis
         (query_hash, avg_execution_time_ms, max_execution_time_ms, min_execution_time_ms,
          execution_count, failure_count, slow_query_count, percentile_95_ms, percentile_99_ms, recommendations)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (query_hash) DO UPDATE SET
         avg_execution_time_ms = $2, max_execution_time_ms = $3, min_execution_time_ms = $4,
         execution_count = $5, failure_count = $6, slow_query_count = $7,
         percentile_95_ms = $8, percentile_99_ms = $9, recommendations = $10,
         last_analyzed = NOW()
         RETURNING id, query_hash, avg_execution_time_ms, max_execution_time_ms, min_execution_time_ms,
                   execution_count, failure_count, slow_query_count, percentile_95_ms, percentile_99_ms, recommendations`,
        [
          queryHash,
          row.avg_time,
          row.max_time,
          row.min_time,
          row.exec_count,
          row.failure_count,
          row.slow_count,
          row.p95,
          row.p99,
          recommendations,
        ]
      );

      return {
        id: result.rows[0].id,
        queryHash: result.rows[0].query_hash,
        avgExecutionTimeMs: result.rows[0].avg_execution_time_ms,
        maxExecutionTimeMs: result.rows[0].max_execution_time_ms,
        minExecutionTimeMs: result.rows[0].min_execution_time_ms,
        executionCount: result.rows[0].execution_count,
        failureCount: result.rows[0].failure_count,
        slowQueryCount: result.rows[0].slow_query_count,
        percentile95Ms: result.rows[0].percentile_95_ms,
        percentile99Ms: result.rows[0].percentile_99_ms,
        recommendations: result.rows[0].recommendations,
      };
    } catch (error) {
      throw new Error(`Failed to analyze query: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getSlowQueries(limit: number = 50, offset: number = 0, client?: PoolClient): Promise<QueryAnalysis[]> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, query_hash, avg_execution_time_ms, max_execution_time_ms, min_execution_time_ms,
                execution_count, failure_count, slow_query_count, percentile_95_ms, percentile_99_ms, recommendations
         FROM query_analysis
         ORDER BY avg_execution_time_ms DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return result.rows.map((row) => ({
        id: row.id,
        queryHash: row.query_hash,
        avgExecutionTimeMs: row.avg_execution_time_ms,
        maxExecutionTimeMs: row.max_execution_time_ms,
        minExecutionTimeMs: row.min_execution_time_ms,
        executionCount: row.execution_count,
        failureCount: row.failure_count,
        slowQueryCount: row.slow_query_count,
        percentile95Ms: row.percentile_95_ms,
        percentile99Ms: row.percentile_99_ms,
        recommendations: row.recommendations,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch slow queries: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async createSlowQueryAlert(
    queryHash: string,
    alertType: "performance_degradation" | "threshold_breach" | "regression_detected",
    severity: "low" | "medium" | "high" | "critical",
    thresholdMs: number,
    currentMs: number,
    description: string,
    client?: PoolClient
  ): Promise<SlowQueryAlert> {
    const query = client || db;

    try {
      const result = await query.query(
        `INSERT INTO slow_query_alerts
         (query_hash, alert_type, severity, threshold_ms, current_ms, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, query_hash, alert_type, severity, threshold_ms, current_ms, description, resolved`,
        [queryHash, alertType, severity, thresholdMs, currentMs, description]
      );

      return {
        id: result.rows[0].id,
        queryHash: result.rows[0].query_hash,
        alertType: result.rows[0].alert_type,
        severity: result.rows[0].severity,
        thresholdMs: result.rows[0].threshold_ms,
        currentMs: result.rows[0].current_ms,
        description: result.rows[0].description,
        resolved: result.rows[0].resolved,
      };
    } catch (error) {
      throw new Error(`Failed to create slow query alert: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async resolveAlert(alertId: string, client?: PoolClient): Promise<void> {
    const query = client || db;

    try {
      await query.query(
        `UPDATE slow_query_alerts
         SET resolved = true, resolved_at = NOW()
         WHERE id = $1`,
        [alertId]
      );
    } catch (error) {
      throw new Error(`Failed to resolve alert: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getActiveAlerts(limit: number = 50, offset: number = 0, client?: PoolClient): Promise<SlowQueryAlert[]> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, query_hash, alert_type, severity, threshold_ms, current_ms, description, resolved
         FROM slow_query_alerts
         WHERE resolved = false
         ORDER BY severity DESC, created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return result.rows.map((row) => ({
        id: row.id,
        queryHash: row.query_hash,
        alertType: row.alert_type,
        severity: row.severity,
        thresholdMs: row.threshold_ms,
        currentMs: row.current_ms,
        description: row.description,
        resolved: row.resolved,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch active alerts: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
