import { describe, it, expect } from "vitest";

import {
  ALLOWED_TRANSITIONS,
  type InvestigationStatus,
  TERMINAL_STATUSES,
  canReplay,
  canTransition,
  isTerminal,
  validateResolution,
  validateTransition,
} from "../../src/services/deadLetterInvestigation.service.js";

/**
 * Investigation lifecycle.
 *
 * The rules worth pinning: closed cases stay closed, and replay is gated on a
 * conclusion — replaying a poison message before anyone established why it
 * failed just re-parks it and burns another retry budget.
 */

describe("isTerminal", () => {
  it("treats resolved and discarded as closed", () => {
    expect(isTerminal("resolved")).toBe(true);
    expect(isTerminal("discarded")).toBe(true);
  });

  it("treats the working states as open", () => {
    expect(isTerminal("open")).toBe(false);
    expect(isTerminal("investigating")).toBe(false);
    expect(isTerminal("awaiting_fix")).toBe(false);
  });
});

describe("canTransition", () => {
  it("allows an open case to be picked up", () => {
    expect(canTransition("open", "investigating")).toBe(true);
  });

  it("allows a case to park while waiting on a fix and come back", () => {
    expect(canTransition("investigating", "awaiting_fix")).toBe(true);
    expect(canTransition("awaiting_fix", "investigating")).toBe(true);
  });

  it("refuses to skip straight from open to resolved", () => {
    // Closing without anyone having looked is the outcome the workspace exists
    // to prevent.
    expect(canTransition("open", "resolved")).toBe(false);
  });

  it("allows discarding from any working state", () => {
    for (const from of ["open", "investigating", "awaiting_fix"] as InvestigationStatus[]) {
      expect(canTransition(from, "discarded")).toBe(true);
    }
  });

  it("refuses every transition out of a terminal state", () => {
    for (const from of TERMINAL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[from]).toEqual([]);
    }
  });
});

describe("validateTransition", () => {
  it("accepts a legal move", () => {
    expect(validateTransition("open", "investigating")).toEqual({ ok: true });
  });

  it("rejects a no-op with a clear reason", () => {
    const result = validateTransition("investigating", "investigating");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/already investigating/);
  });

  it("points at opening a new case rather than reopening a closed one", () => {
    // Reopening in place would overwrite the first decision; the guidance in
    // the message is the whole reason the state is terminal.
    const result = validateTransition("resolved", "investigating");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/open a new one/);
  });

  it("rejects an illegal move between working states", () => {
    const result = validateTransition("open", "awaiting_fix");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cannot move from open to awaiting_fix/);
  });
});

describe("canReplay", () => {
  it("allows replay once a case concluded the message should be replayed", () => {
    expect(canReplay({ status: "resolved", resolution: "replayed" })).toBe(true);
  });

  it("allows replay when the upstream cause was fixed", () => {
    expect(canReplay({ status: "resolved", resolution: "fixed_upstream" })).toBe(true);
  });

  it("blocks replay while the case is still open", () => {
    expect(canReplay({ status: "investigating", resolution: null })).toBe(false);
  });

  it("blocks replay of a discarded case", () => {
    // A discarded message must not be resurrected by an automated retry.
    expect(canReplay({ status: "discarded", resolution: "discarded" })).toBe(false);
  });

  it("blocks replay of a duplicate", () => {
    expect(canReplay({ status: "resolved", resolution: "duplicate" })).toBe(false);
  });

  it("blocks replay when the failure could not be reproduced", () => {
    expect(canReplay({ status: "resolved", resolution: "not_reproducible" })).toBe(false);
  });
});

describe("validateResolution", () => {
  it("requires a note when discarding", () => {
    // Discarding drops a message permanently; the reason has to be on the
    // record.
    const result = validateResolution("discarded", null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/note is required/);
  });

  it("requires a note when closing as not reproducible", () => {
    expect(validateResolution("not_reproducible", "   ").ok).toBe(false);
  });

  it("accepts a discard with a note", () => {
    expect(validateResolution("discarded", "Superseded by event 4711")).toEqual({ ok: true });
  });

  it("does not demand a note for a self-explanatory resolution", () => {
    expect(validateResolution("replayed", null)).toEqual({ ok: true });
    expect(validateResolution("duplicate", null)).toEqual({ ok: true });
  });
});
