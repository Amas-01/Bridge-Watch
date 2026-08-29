import { describe, expect, it } from "vitest";
import {
  createMockEvent,
  createMockScValString,
  createMockScValU64,
  createMockWatchSubscription,
} from "./testing";

describe("SDK testing helpers", () => {
  it("creates mock string ScVal", () => {
    const value = createMockScValString("USDC");
    expect(value.switch().name).toContain("scv");
  });

  it("creates mock numeric ScVal", () => {
    const value = createMockScValU64(42);
    expect(value).toBeTruthy();
  });

  it("creates mock events", () => {
    const event = createMockEvent({ contractId: "abc" });
    expect(event.contractId).toBe("abc");
  });

  it("creates unsubscribe test stub", () => {
    const subscription = createMockWatchSubscription();
    expect(subscription.isClosed()).toBe(false);
    subscription.unsubscribe();
    expect(subscription.isClosed()).toBe(true);
  });
});
