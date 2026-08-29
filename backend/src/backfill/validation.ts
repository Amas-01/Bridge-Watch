import type { CompletenessReport, OutputVerification } from "./types.js";

/**
 * Validates that a backfill has covered all expected ranges.
 */
export function validateCompleteness(
  expectedRanges: Array<{ from: number; to: number }>,
  completedRanges: Array<{ from: number; to: number }>
): CompletenessReport {
  if (expectedRanges.length === 0) {
    return {
      totalExpected: 0,
      totalCompleted: 0,
      missingRanges: [],
      isComplete: true,
    };
  }

  const sorted = [...expectedRanges].sort((a, b) => a.from - b.from);
  const completed = [...completedRanges].sort((a, b) => a.from - b.from);

  const totalExpected = sorted.reduce(
    (sum, r) => sum + (r.to - r.from),
    0
  );
  const totalCompleted = completed.reduce(
    (sum, r) => sum + (r.to - r.from),
    0
  );

  const missingRanges = findMissingRanges(sorted, completed);

  return {
    totalExpected,
    totalCompleted,
    missingRanges,
    isComplete: missingRanges.length === 0,
  };
}

function findMissingRanges(
  expected: Array<{ from: number; to: number }>,
  completed: Array<{ from: number; to: number }>
): Array<{ from: number; to: number }> {
  const missing: Array<{ from: number; to: number }> = [];

  for (const exp of expected) {
    let current = exp.from;

    for (const comp of completed) {
      if (comp.to <= current) continue;
      if (comp.from >= exp.to) break;

      if (comp.from > current) {
        missing.push({ from: current, to: comp.from });
      }

      current = Math.max(current, comp.to);
    }

    if (current < exp.to) {
      missing.push({ from: current, to: exp.to });
    }
  }

  return missing;
}

/**
 * Verifies that backfill output matches live data for a given range.
 * Both checksums should be computed over the same data schema.
 */
export function verifyOutput(
  taskId: string,
  liveChecksum: string,
  backfillChecksum: string
): OutputVerification {
  const match = liveChecksum === backfillChecksum;

  return {
    taskId,
    liveChecksum,
    backfillChecksum,
    match,
    differences: match
      ? undefined
      : [`Checksum mismatch: live=${liveChecksum} vs backfill=${backfillChecksum}`],
  };
}

/**
 * Detects provider limits by checking which ranges were successfully
 * fetched versus which failed with rate-limit errors.
 */
export function detectProviderLimits(
  results: Array<{ from: number; to: number; success: boolean; error?: string }>
): {
  effectiveRatePerSecond: number;
  failurePatterns: string[];
  recommendedDelay: number;
} {
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  const rateLimitFailures = failures.filter(
    (r) => r.error?.includes("rate") || r.error?.includes("429")
  );

  const failurePatterns = [
    ...new Set(rateLimitFailures.map((r) => r.error ?? "unknown")),
  ];

  const effectiveRate =
    successes.length > 0
      ? successes.length / Math.max(
          1,
          successes.reduce((max, r) => Math.max(max, r.to - r.from), 0) / 1000
        )
      : 0;

  const recommendedDelay =
    rateLimitFailures.length > successes.length * 0.1
      ? Math.min(5000, rateLimitFailures.length * 500)
      : 0;

  return {
    effectiveRatePerSecond: effectiveRate,
    failurePatterns,
    recommendedDelay,
  };
}
