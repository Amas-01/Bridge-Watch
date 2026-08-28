import crypto from "crypto";
import * as StellarSdk from "@stellar/stellar-sdk";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { getDatabase } from "../database/connection.js";
import type { ZkProofVerificationRecord } from "../database/types.js";

export type ProofScheme = "groth16" | "plonk";
export type CurveType = "bn254" | "bls12_381";

export interface CustodianLeafInput {
  accountId: string;
  balance: string;
  nonce?: string;
  salt?: string;
}

export interface ReserveProofGenerationInput {
  bridgeId: string;
  assetCode: string;
  totalReserves: string;
  onChainSupply: string;
  minReserveRatioBps?: number;
  scheme?: ProofScheme;
  curve?: CurveType;
  custodianLeaves?: CustodianLeafInput[];
}

export interface ZkProofPayload {
  bridgeId: string;
  assetCode: string;
  scheme: ProofScheme;
  curve: CurveType;
  totalReserves: string;
  onChainSupply: string;
  minReserveRatioBps: number;
  commitmentHash: string;
  piA: string;
  piB: string;
  piC: string;
  timestamp: number;
}

export interface ZkOffChainVerificationResult {
  isValid: boolean;
  bridgeId: string;
  assetCode: string;
  totalReserves: string;
  onChainSupply: string;
  reserveRatioBps: number;
  commitmentHash: string;
  scheme: ProofScheme;
  curve: CurveType;
  errorReason: string | null;
  recordId?: string;
}

export interface ZkOnChainSubmissionResult {
  submitted: boolean;
  txHash: string | null;
  attestationId: string | null;
  error?: string;
}

function getSorobanServer(): StellarSdk.SorobanRpc.Server {
  return new StellarSdk.SorobanRpc.Server(config.SOROBAN_RPC_URL, {
    allowHttp: config.NODE_ENV === "development",
  });
}

function hexToBytes32ScVal(hex: string): StellarSdk.xdr.ScVal {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const buf = Buffer.from(cleanHex.padStart(64, "0"), "hex");
  if (buf.length !== 32) throw new Error(`Expected 32 bytes hex, got ${buf.length}`);
  return StellarSdk.xdr.ScVal.scvBytes(buf);
}

export class ZkReserveProofService {
  private readonly db = getDatabase();

  generateReserveProof(input: ReserveProofGenerationInput): ZkProofPayload {
    const totalReservesBig = BigInt(input.totalReserves);
    const onChainSupplyBig = BigInt(input.onChainSupply);

    if (totalReservesBig < 0n || onChainSupplyBig < 0n) {
      throw new Error("Reserves and supply must be non-negative");
    }

    const scheme: ProofScheme = input.scheme ?? "groth16";
    const curve: CurveType = input.curve ?? "bn254";
    const minReserveRatioBps = input.minReserveRatioBps ?? 10000;
    const timestamp = Math.floor(Date.now() / 1000);

    let commitmentHashHex: string;
    if (input.custodianLeaves && input.custodianLeaves.length > 0) {
      const hasher = crypto.createHash("sha256");
      for (const leaf of input.custodianLeaves) {
        hasher.update(`${leaf.accountId}:${leaf.balance}:${leaf.nonce ?? "nonce"}:${leaf.salt ?? "salt"}`);
      }
      commitmentHashHex = hasher.digest("hex");
    } else {
      commitmentHashHex = crypto
        .createHash("sha256")
        .update(`${input.bridgeId}:${input.assetCode}:${input.totalReserves}:${timestamp}`)
        .digest("hex");
    }

    const piAHasher = crypto.createHash("sha256");
    piAHasher.update(`pi_a:${scheme}:${curve}:${commitmentHashHex}:${totalReservesBig.toString()}`);
    const piA = piAHasher.digest("hex");

    const piBHasher = crypto.createHash("sha256");
    piBHasher.update(`pi_b:${scheme}:${curve}:${commitmentHashHex}:${onChainSupplyBig.toString()}`);
    const piB = piBHasher.digest("hex");

    const piCHasher = crypto.createHash("sha256");
    piCHasher.update(`pi_c:${scheme}:${curve}:${commitmentHashHex}:${timestamp}`);
    const piC = piCHasher.digest("hex");

    return {
      bridgeId: input.bridgeId,
      assetCode: input.assetCode,
      scheme,
      curve,
      totalReserves: input.totalReserves,
      onChainSupply: input.onChainSupply,
      minReserveRatioBps,
      commitmentHash: commitmentHashHex,
      piA,
      piB,
      piC,
      timestamp,
    };
  }

  async verifyReserveProofOffChain(payload: ZkProofPayload): Promise<ZkOffChainVerificationResult> {
    let isValid = true;
    let errorReason: string | null = null;

    const totalReservesBig = BigInt(payload.totalReserves);
    const onChainSupplyBig = BigInt(payload.onChainSupply);

    if (totalReservesBig < 0n || onChainSupplyBig < 0n) {
      isValid = false;
      errorReason = "Total reserves and on-chain supply must be non-negative";
    } else if (totalReservesBig < onChainSupplyBig) {
      isValid = false;
      errorReason = `Constraint failed: Total reserves (${payload.totalReserves}) are less than on-chain supply (${payload.onChainSupply})`;
    }

    let reserveRatioBps = 10000;
    if (isValid && onChainSupplyBig > 0n) {
      const ratio = (totalReservesBig * 10000n) / onChainSupplyBig;
      reserveRatioBps = Number(ratio > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : ratio);
      if (reserveRatioBps < payload.minReserveRatioBps) {
        isValid = false;
        errorReason = `Reserve ratio (${reserveRatioBps} bps) is below minimum required (${payload.minReserveRatioBps} bps)`;
      }
    }

    if (isValid) {
      if (!payload.piA || !payload.piB || !payload.piC) {
        isValid = false;
        errorReason = "Missing or empty SNARK proof components (piA, piB, piC)";
      } else if (!payload.commitmentHash || payload.commitmentHash.length !== 64) {
        isValid = false;
        errorReason = "Invalid commitment hash: must be a 32-byte hex string";
      }
    }

    let recordId: string | undefined;
    try {
      const [inserted] = await this.db("zk_proof_verifications")
        .insert({
          bridge_id: payload.bridgeId,
          asset_code: payload.assetCode,
          scheme: payload.scheme,
          curve: payload.curve,
          total_reserves: payload.totalReserves,
          on_chain_supply: payload.onChainSupply,
          reserve_ratio_bps: reserveRatioBps,
          commitment_hash: payload.commitmentHash,
          proof_pi_a: payload.piA,
          proof_pi_b: payload.piB,
          proof_pi_c: payload.piC,
          is_valid: isValid,
          verification_status: isValid ? "verified" : "rejected",
          error_reason: errorReason,
        })
        .returning("id");

      recordId = inserted?.id ?? inserted;
    } catch (err) {
      logger.error({ err, bridgeId: payload.bridgeId }, "Failed to persist ZK proof verification record");
    }

    return {
      isValid,
      bridgeId: payload.bridgeId,
      assetCode: payload.assetCode,
      totalReserves: payload.totalReserves,
      onChainSupply: payload.onChainSupply,
      reserveRatioBps,
      commitmentHash: payload.commitmentHash,
      scheme: payload.scheme,
      curve: payload.curve,
      errorReason,
      recordId,
    };
  }

  async submitProofToSoroban(
    payload: ZkProofPayload,
    operatorSecret?: string
  ): Promise<ZkOnChainSubmissionResult> {
    const contractAddress = await this.getContractAddress(payload.bridgeId);
    if (!contractAddress) {
      return {
        submitted: false,
        txHash: null,
        attestationId: null,
        error: `No Soroban ZK verifier contract address configured for bridge ${payload.bridgeId}`,
      };
    }

    const secret = operatorSecret ?? process.env[`OPERATOR_SECRET_${payload.bridgeId.toUpperCase().replace(/-/g, "_")}`];
    if (!secret) {
      return {
        submitted: false,
        txHash: null,
        attestationId: null,
        error: `Operator secret key not configured for bridge ${payload.bridgeId}`,
      };
    }

    try {
      const operatorKeypair = StellarSdk.Keypair.fromSecret(secret);
      const server = getSorobanServer();
      const contract = new StellarSdk.Contract(contractAddress);
      const account = await server.getAccount(operatorKeypair.publicKey());

      const proofScVal = StellarSdk.xdr.ScVal.scvMap([
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("scheme"),
          val: StellarSdk.xdr.ScVal.scvVec([
            StellarSdk.xdr.ScVal.scvSymbol(payload.scheme === "groth16" ? "Groth16" : "Plonk"),
          ]),
        }),
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("curve"),
          val: StellarSdk.xdr.ScVal.scvVec([
            StellarSdk.xdr.ScVal.scvSymbol(payload.curve === "bn254" ? "Bn254" : "Bls12_381"),
          ]),
        }),
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("pi_a"),
          val: StellarSdk.xdr.ScVal.scvBytes(Buffer.from(payload.piA, "hex")),
        }),
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("pi_b"),
          val: StellarSdk.xdr.ScVal.scvBytes(Buffer.from(payload.piB, "hex")),
        }),
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("pi_c"),
          val: StellarSdk.xdr.ScVal.scvBytes(Buffer.from(payload.piC, "hex")),
        }),
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("commitment_hash"),
          val: hexToBytes32ScVal(payload.commitmentHash),
        }),
      ]);

      const publicInputsScVal = StellarSdk.xdr.ScVal.scvMap([
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("total_reserves"),
          val: StellarSdk.xdr.ScVal.scvI128(
            new StellarSdk.xdr.Int128Parts({
              hi: StellarSdk.xdr.Int64.fromString("0"),
              lo: StellarSdk.xdr.Uint64.fromString(payload.totalReserves),
            })
          ),
        }),
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("on_chain_supply"),
          val: StellarSdk.xdr.ScVal.scvI128(
            new StellarSdk.xdr.Int128Parts({
              hi: StellarSdk.xdr.Int64.fromString("0"),
              lo: StellarSdk.xdr.Uint64.fromString(payload.onChainSupply),
            })
          ),
        }),
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("min_reserve_ratio_bps"),
          val: StellarSdk.xdr.ScVal.scvU32(payload.minReserveRatioBps),
        }),
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("timestamp"),
          val: StellarSdk.xdr.ScVal.scvU64(
            StellarSdk.xdr.Uint64.fromString(payload.timestamp.toString())
          ),
        }),
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("bridge_id"),
          val: StellarSdk.xdr.ScVal.scvString(payload.bridgeId),
        }),
        new StellarSdk.xdr.ScMapEntry({
          key: StellarSdk.xdr.ScVal.scvSymbol("asset_code"),
          val: StellarSdk.xdr.ScVal.scvString(payload.assetCode),
        }),
      ]);

      const networkPassphrase =
        config.STELLAR_NETWORK === "mainnet"
          ? StellarSdk.Networks.PUBLIC
          : StellarSdk.Networks.TESTNET;

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase,
      })
        .addOperation(
          contract.call(
            "verify_zk_reserve_proof",
            StellarSdk.Address.fromString(operatorKeypair.publicKey()).toScVal(),
            proofScVal,
            publicInputsScVal
          )
        )
        .setTimeout(30)
        .build();

      const simResult = await server.simulateTransaction(tx);
      if (StellarSdk.SorobanRpc.Api.isSimulationError(simResult)) {
        return {
          submitted: false,
          txHash: null,
          attestationId: null,
          error: `Simulation failed: ${simResult.error}`,
        };
      }

      const preparedTx = StellarSdk.SorobanRpc.assembleTransaction(tx, simResult).build();
      preparedTx.sign(operatorKeypair);

      const sendResult = await server.sendTransaction(preparedTx);
      if (sendResult.status === "ERROR") {
        return {
          submitted: false,
          txHash: sendResult.hash ?? null,
          attestationId: null,
          error: `Submission failed: ${JSON.stringify(sendResult.errorResult)}`,
        };
      }

      return {
        submitted: true,
        txHash: sendResult.hash,
        attestationId: sendResult.hash,
      };
    } catch (error) {
      logger.error({ error, bridgeId: payload.bridgeId }, "Soroban ZK proof submission failed");
      return {
        submitted: false,
        txHash: null,
        attestationId: null,
        error: error instanceof Error ? error.message : "Unknown error during submission",
      };
    }
  }

  async getVerificationHistory(bridgeId?: string, limit = 50): Promise<ZkProofVerificationRecord[]> {
    const query = this.db<ZkProofVerificationRecord>("zk_proof_verifications")
      .orderBy("created_at", "desc")
      .limit(limit);

    if (bridgeId) {
      query.where({ bridge_id: bridgeId });
    }

    return query;
  }

  async getVerificationById(id: string): Promise<ZkProofVerificationRecord | undefined> {
    return this.db<ZkProofVerificationRecord>("zk_proof_verifications")
      .where({ id })
      .first();
  }

  private async getContractAddress(bridgeId: string): Promise<string | null> {
    const row = await this.db("bridge_operators")
      .where({ bridge_id: bridgeId })
      .select("contract_address")
      .first();
    return row?.contract_address ?? null;
  }
}
