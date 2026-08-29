# Bridge Watch Contract Integration SDK

TypeScript SDK for integrating external apps with BridgeWatch Soroban contracts.

## Features

- Contract method wrappers
- Connection management
- Transaction build/simulate/send flow
- Query helpers
- Event subscription polling
- Strong TypeScript type definitions
- Structured SDK errors
- Testing utilities
- NPM publication-ready package metadata

## Install

```bash
npm install @bridge-watch/contract-sdk
```

## Quick start

```ts
import { Networks, xdr } from "@stellar/stellar-sdk";
import { BridgeWatchContractSdk } from "@bridge-watch/contract-sdk";

const sdk = new BridgeWatchContractSdk({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "CCONTRACTID",
  networkPassphrase: Networks.TESTNET,
});

await sdk.connect();

const result = await sdk.queryMethod({
  method: "get_health",
  args: [xdr.ScVal.scvString("USDC")],
});
```

## API surface

- `BridgeWatchContractSdk`
  - `connect()`
  - `disconnect()`
  - `getHealth()`
  - `buildInvokeTransaction()`
  - `simulateTransaction()`
  - `sendTransaction()`
  - `invokeAndSend()`
  - `queryMethod()`
  - `subscribeToEvents()`

## Errors

- `BridgeWatchSdkError`
- `BridgeWatchConnectionError`
- `BridgeWatchTransactionError`
- `BridgeWatchQueryError`

## Testing utilities

- `createMockScValString()`
- `createMockScValU64()`
- `createMockEvent()`
- `createMockWatchSubscription()`

## Example

See `sdk/examples/basic-usage.ts`.
