import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { buildThresholds, getProfile } from "../config/profiles.js";

const profile = __ENV.PROFILE || "smoke";
const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3001";
const apiKey = __ENV.API_KEY || "test-key-123";

const profileConfig = getProfile(profile);

const batchReconciliationLatency = new Trend("batch_reconciliation_latency", true);
const batchReconciliationFailures = new Counter("batch_reconciliation_failures");
const runsConcurrent = new Trend("batch_reconciliation_runs_concurrent", true);

export const options = {
  scenarios: profileConfig.scenarios,
  thresholds: {
    ...buildThresholds(profile),
    "batch_reconciliation_latency{quantile:0.95}": ["p(95) < 5000"],
    "batch_reconciliation_latency{quantile:0.99}": ["p(99) < 8000"],
    "batch_reconciliation_failures": ["count < 50"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

export default function () {
  // Test GET reconciliation runs with pagination
  const runsResponse = http.get(
    `${baseUrl}/api/v1/reconciliation/runs?limit=100&offset=0`,
    {
      tags: { endpoint: "reconciliation_runs", profile },
      timeout: "10s",
      headers: { "x-api-key": apiKey },
    }
  );

  batchReconciliationLatency.add(runsResponse.timings.duration, {
    endpoint: "reconciliation_runs",
  });

  const runsOk = check(runsResponse, {
    "runs status is 200": (r) => r.status === 200,
    "runs response time under 5s": (r) => r.timings.duration < 5000,
    "runs has content-type": (r) =>
      r.headers["Content-Type"]?.includes("application/json"),
  });

  if (!runsOk) {
    batchReconciliationFailures.add(1, { endpoint: "reconciliation_runs" });
  }

  // Parse response and extract run IDs for detailed queries
  let runIds = [];
  if (runsResponse.status === 200) {
    try {
      const data = JSON.parse(runsResponse.body);
      runIds = (data.runs || []).slice(0, 5).map((r) => r.id);
    } catch (e) {
      console.error("Failed to parse runs response:", e);
    }
  }

  // Test batch operation: retrieve multiple reconciliation run details
  if (runIds.length > 0) {
    const batchParams = runIds.map((id) => `id=${id}`).join("&");
    const batchResponse = http.get(
      `${baseUrl}/api/v1/reconciliation/runs/batch?${batchParams}`,
      {
        tags: { endpoint: "reconciliation_batch_details", profile },
        timeout: "10s",
        headers: { "x-api-key": apiKey },
      }
    );

    batchReconciliationLatency.add(batchResponse.timings.duration, {
      endpoint: "reconciliation_batch_details",
    });
    runsConcurrent.add(runIds.length);

    const batchOk = check(batchResponse, {
      "batch status is 200": (r) => r.status === 200,
      "batch response time under 5s": (r) => r.timings.duration < 5000,
      "batch has results": (r) => {
        try {
          const data = JSON.parse(r.body);
          return data.runs && data.runs.length > 0;
        } catch {
          return false;
        }
      },
    });

    if (!batchOk) {
      batchReconciliationFailures.add(1, { endpoint: "reconciliation_batch_details" });
    }

    sleep(Math.random() * 0.5 + 0.1);
  }

  // Test stream endpoint for real-time reconciliation data
  if (profile !== "smoke" && __ITER % 2 === 0) {
    const streamResponse = http.get(
      `${baseUrl}/api/v1/reconciliation/runs?stream=true&limit=50`,
      {
        tags: { endpoint: "reconciliation_stream", profile },
        timeout: "10s",
        headers: { "x-api-key": apiKey },
      }
    );

    batchReconciliationLatency.add(streamResponse.timings.duration, {
      endpoint: "reconciliation_stream",
    });

    const streamOk = check(streamResponse, {
      "stream status is 200": (r) => r.status === 200,
      "stream response time under 5s": (r) => r.timings.duration < 5000,
    });

    if (!streamOk) {
      batchReconciliationFailures.add(1, { endpoint: "reconciliation_stream" });
    }
  }

  sleep(Math.random() * 0.4 + 0.1);
}

export function handleSummary(data) {
  const summaryJson =
    __ENV.SUMMARY_JSON || "load-tests/results/batch-reconciliation-summary.json";
  const summaryTxt =
    __ENV.SUMMARY_TXT || "load-tests/results/batch-reconciliation-summary.txt";

  const report = {
    profile,
    baseUrl,
    testType: "batch-reconciliation",
    generatedAt: new Date().toISOString(),
    metrics: data.metrics,
  };

  const batchLatency = data.metrics.batch_reconciliation_latency?.values || {};
  const batchFailures = data.metrics.batch_reconciliation_failures?.values || {};
  const avgConcurrent = data.metrics.batch_reconciliation_runs_concurrent?.values?.value || 0;

  const textSummary = [
    `Batch Reconciliation Load Test Report`,
    `Profile: ${profile}`,
    `Base URL: ${baseUrl}`,
    `Generated At: ${report.generatedAt}`,
    "",
    "Batch Reconciliation Endpoint Metrics:",
    `- Latency p50: ${batchLatency["p(50)"] ?? "n/a"} ms`,
    `- Latency p95: ${batchLatency["p(95)"] ?? "n/a"} ms`,
    `- Latency p99: ${batchLatency["p(99)"] ?? "n/a"} ms`,
    `- Max latency: ${batchLatency.max ?? "n/a"} ms`,
    `- Failures: ${Math.round(batchFailures.value ?? 0)}`,
    `- Avg concurrent runs: ${Math.round(avgConcurrent)}`,
    "",
    "Analysis:",
    "✓ Batch reconciliation endpoints should handle 95th percentile < 5s",
    "✓ Monitor concurrent batch operation performance for high-load scenarios",
  ].join("\n");

  return {
    [summaryJson]: JSON.stringify(report, null, 2),
    [summaryTxt]: textSummary,
    stdout: `${textSummary}\n`,
  };
}
