import * as StellarSdk from "@stellar/stellar-sdk";

export function createMockScValString(value: string): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvString(value);
}

export function createMockScValU64(value: number): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvU64(
    StellarSdk.xdr.Uint64.fromString(String(value))
  );
}

export function createMockEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: `evt_${Date.now()}`,
    type: "contract",
    contractId: "mock-contract-id",
    ledger: 0,
    value: {},
    ...overrides,
  };
}

export function createMockWatchSubscription() {
  let closed = false;

  return {
    isClosed: () => closed,
    unsubscribe: () => {
      closed = true;
    },
  };
}
