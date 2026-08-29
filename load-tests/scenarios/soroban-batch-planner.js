import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";
import { buildThresholds, getProfile } from "../config/profiles.js";

// Requires SOROBAN_RPC_URL on the backend to point at a reachable Soroban RPC
// (the repo's local sandbox from docker-compose.sandbox.yml is intended for
// this) since each planned item is simulated for a real resource estimate.

const profile = __ENV.PROFILE || "smoke";
const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3001";
const apiKey = __ENV.API_KEY || "test-key-123";
// Backlog size per request: large enough that items can't all fit in one
// batch under typical Soroban ledger footprint/CPU ceilings, forcing the
// planner to actually pack multiple budget-respecting batches per call.
const backlogSize = Number(__ENV.BACKLOG_SIZE || 150);

const profileConfig = getProfile(profile);

const planLatency = new Trend("soroban_batch_plan_latency", true);
const planFailures = new Counter("soroban_batch_plan_failures");
const itemsPlannedPerRequest = new Trend("soroban_batch_items_planned");
const batchesPerRequest = new Trend("soroban_batch_batches_per_request");
const rejectionRate = new Rate("soroban_batch_rejection_rate");

export const options = {
  scenarios: profileConfig.scenarios,
  thresholds: {
    ...buildThresholds(profile),
    "soroban_batch_plan_latency{quantile:0.95}": ["p(95) < 5000"],
    "soroban_batch_plan_failures": ["count < 20"],
    "soroban_batch_rejection_rate": ["rate < 0.05"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

function buildBacklog(vu, iter, count) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const id = `vu${vu}-iter${iter}-${i}`;
    items.push({
      id,
      idempotencyKey: id,
      contractId: __ENV.CONTRACT_ID || "CBRIDGEWATCHHEALTHORACLE0000000000000000000000000000",
      functionName: "submit_health_batch",
      args: [],
    });
  }
  return items;
}

export default function () {
  const items = buildBacklog(__VU, __ITER, backlogSize);

  const planResponse = http.post(
    `${baseUrl}/api/v1/soroban/batch-planner/plan`,
    JSON.stringify({ items }),
    {
      tags: { endpoint: "soroban_batch_plan", profile },
      timeout: "20s",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    }
  );

  planLatency.add(planResponse.timings.duration, { endpoint: "soroban_batch_plan" });

  const planOk = check(planResponse, {
    "plan status is 200": (r) => r.status === 200,
    "plan response time under 10s": (r) => r.timings.duration < 10000,
    "plan has content-type": (r) => r.headers["Content-Type"]?.includes("application/json"),
  });

  if (!planOk) {
    planFailures.add(1, { endpoint: "soroban_batch_plan" });
  } else {
    try {
      const report = JSON.parse(planResponse.body);
      itemsPlannedPerRequest.add(report.plannedItems ?? 0);
      batchesPerRequest.add(report.plannedBatches ?? 0);
      rejectionRate.add((report.rejectedItems?.length ?? 0) > 0);

      check(report, {
        "no batch exceeded resource ceilings": () => report.rejectedItems?.every((r) => typeof r.reason === "string") ?? true,
      });
    } catch (e) {
      console.error("Failed to parse plan response:", e);
    }
  }

  const statusResponse = http.get(`${baseUrl}/api/v1/soroban/batch-planner/status`, {
    tags: { endpoint: "soroban_batch_status", profile },
    timeout: "10s",
    headers: { "x-api-key": apiKey },
  });

  planLatency.add(statusResponse.timings.duration, { endpoint: "soroban_batch_status" });
  check(statusResponse, { "status endpoint is 200": (r) => r.status === 200 });

  sleep(Math.random() * 0.4 + 0.1);
}

export function handleSummary(data) {
  const summaryJson = __ENV.SUMMARY_JSON || "load-tests/results/soroban-batch-planner-summary.json";
  const summaryTxt = __ENV.SUMMARY_TXT || "load-tests/results/soroban-batch-planner-summary.txt";

  const report = {
    profile,
    baseUrl,
    backlogSize,
    testType: "soroban-batch-planner",
    generatedAt: new Date().toISOString(),
    metrics: data.metrics,
  };

  const latency = data.metrics.soroban_batch_plan_latency?.values || {};
  const failures = data.metrics.soroban_batch_plan_failures?.values || {};
  const avgItems = data.metrics.soroban_batch_items_planned?.values?.avg || 0;
  const avgBatches = data.metrics.soroban_batch_batches_per_request?.values?.avg || 0;
  const rejectionRateValue = data.metrics.soroban_batch_rejection_rate?.values?.rate || 0;

  const textSummary = [
    "Soroban Batch Planner Load Test Report",
    `Profile: ${profile}`,
    `Base URL: ${baseUrl}`,
    `Backlog size per request: ${backlogSize}`,
    `Generated At: ${report.generatedAt}`,
    "",
    "Plan Endpoint Metrics:",
    `- Latency p50: ${latency["p(50)"] ?? "n/a"} ms`,
    `- Latency p95: ${latency["p(95)"] ?? "n/a"} ms`,
    `- Latency p99: ${latency["p(99)"] ?? "n/a"} ms`,
    `- Failures: ${Math.round(failures.value ?? 0)}`,
    `- Avg items planned/request: ${avgItems.toFixed(2)}`,
    `- Avg batches/request: ${avgBatches.toFixed(2)}`,
    `- Item rejection rate: ${(rejectionRateValue * 100).toFixed(2)}%`,
    "",
    "Analysis:",
    "- Throughput under ledger budget pressure = items planned per second across all batches.",
    "- A rejection rate above threshold means the configured ceilings are too tight for the offered load.",
  ].join("\n");

  return {
    [summaryJson]: JSON.stringify(report, null, 2),
    [summaryTxt]: textSummary,
    stdout: `${textSummary}\n`,
  };
}
