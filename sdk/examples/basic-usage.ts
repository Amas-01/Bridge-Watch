import { Networks } from "@stellar/stellar-sdk";
import { TypedBridgeWatchContractSdk } from "../src/contract";

async function run() {
  const sdk = new TypedBridgeWatchContractSdk({
    rpcUrl: "https://soroban-testnet.stellar.org",
    contractId: "CCONTRACTID",
    networkPassphrase: Networks.TESTNET,
  });

  await sdk.connect();

  // Typed query — returns structured AssetHealth | null
  const health = await sdk.getContractHealth("USDC");
  console.log("Health:", health);

  // Typed query — returns structured GlobalPauseState
  const pauseStatus = await sdk.getPauseStatus();
  console.log("Paused:", pauseStatus.is_paused);

  // Typed query — returns string[]
  const assets = await sdk.getMonitoredAssets();
  console.log("Monitored assets:", assets);

  // Typed query — returns boolean
  const paused = await sdk.isPaused();
  console.log("Globally paused:", paused);

  // Typed invoke — submit health data (requires a funded Stellar keypair)
  // const result = await sdk.submitHealth({
  //   caller: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
  //   asset_code: "USDC",
  //   health_score: 85,
  //   liquidity_score: 90,
  //   price_stability_score: 80,
  //   bridge_uptime_score: 95,
  // });
  // console.log("Submit result:", result);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
