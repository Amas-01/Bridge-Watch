/**
 * Versioned Chain Adapter & ABI Compatibility Registry (#1015).
 *
 * ABIs, event layouts, proxy implementations and chain-specific semantics evolve.
 * A changed decoder can silently reinterpret historical logs or accept an
 * incompatible contract as the configured bridge. This service keeps a signed,
 * versioned registry of chain adapters and routes historical data through the
 * decoder *epoch* that was in force at the log's block height.
 *
 * Guarantees:
 *  - Unknown bytecode / unexpected ABI hashes quarantine ingestion instead of
 *    being decoded against a stale adapter.
 *  - Proxy upgrades create an explicit new adapter epoch.
 *  - Decoding is reproducible from `registryVersion` + raw log alone.
 *  - Adapters can be staged and rolled back without touching historical data.
 */

import { createHash, createPublicKey, createVerify, verify as cryptoVerify } from "crypto";
import { ethers } from "ethers";
import { db } from "../database/db.js";
import type { PoolClient } from "pg";
import { logger } from "../utils/logger.js";

export type SignerAlgorithm = "ed25519" | "secp256k1" | "p256";
export type AdapterStatus = "staged" | "active" | "superseded" | "rolled_back" | "quarantined";
export type QuarantineReason =
  | "unknown_bytecode"
  | "abi_change"
  | "no_active_adapter"
  | "out_of_range"
  | "decode_failure"
  | "unsigned_adapter";

/**
 * Supported EVM chains for the ABI decoder. CI verifies the bundled fixtures
 * across every entry (see chainAdapterRegistry.fixtures.test.ts).
 */
export const SUPPORTED_CHAINS = ["ethereum", "polygon", "base"] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export interface ProxyUpgradeRecord {
  implementation: string;
  fromBlock: number;
  txHash?: string;
}

export interface AdapterDefinition {
  chainId: string;
  contractIdentity: string;
  contractAlias?: string;
  abi: ReadonlyArray<string | Record<string, unknown>>;
  bytecodeHash?: string;
  decimals?: number;
  deploymentFromBlock: number;
  deploymentToBlock?: number | null;
  proxyImplementation?: string;
  proxyHistory?: ProxyUpgradeRecord[];
  eventSchemas?: Record<string, unknown>;
  migrationHandler?: string;
}

export interface StageAdapterInput extends AdapterDefinition {
  /** Hex signature over `adapterFingerprint(...)`. Required unless allowUnsigned. */
  signature?: string;
  signerKeyId?: string;
  createdBy?: string;
  /** Escape hatch for local/dev registries with no configured signer. */
  allowUnsigned?: boolean;
}

export interface ChainAdapter {
  id: string;
  chainId: string;
  contractIdentity: string;
  contractAlias: string | null;
  epoch: number;
  registryVersion: string;
  abiJson: Array<string | Record<string, unknown>>;
  abiHash: string;
  bytecodeHash: string | null;
  decimals: number | null;
  deploymentFromBlock: number;
  deploymentToBlock: number | null;
  proxyImplementation: string | null;
  proxyHistory: ProxyUpgradeRecord[];
  eventSchemas: Record<string, unknown>;
  migrationHandler: string | null;
  signature: string | null;
  signerKeyId: string | null;
  status: AdapterStatus;
  createdBy: string;
  createdAt: Date;
  activatedAt: Date | null;
  rolledBackAt: Date | null;
}

export interface RawLog {
  topics: string[];
  data: string;
  blockNumber?: number;
  logIndex?: number;
  transactionHash?: string;
}

export interface DecodedLog {
  registryVersion: string;
  epoch: number;
  eventName: string;
  signature: string;
  args: Record<string, unknown>;
}

export interface IngestionRouteResult {
  quarantined: boolean;
  registryVersion?: string;
  decoded?: DecodedLog;
  reason?: QuarantineReason;
  detail?: string;
}

// ─── Pure helpers (reproducible, no I/O) ──────────────────────────────────────

/** Canonicalise an ABI so semantically-identical ABIs hash identically. */
export function canonicalizeAbi(abi: ReadonlyArray<string | Record<string, unknown>>): string {
  const normalised = abi.map((entry) => {
    if (typeof entry === "string") {
      // Collapse whitespace in human-readable signatures.
      return entry.replace(/\s+/g, " ").trim();
    }
    return stableStringify(entry);
  });
  normalised.sort();
  return JSON.stringify(normalised);
}

export function computeAbiHash(abi: ReadonlyArray<string | Record<string, unknown>>): string {
  return createHash("sha256").update(canonicalizeAbi(abi)).digest("hex");
}

export function buildRegistryVersion(chainId: string, contractIdentity: string, epoch: number): string {
  return `${chainId}:${contractIdentity.toLowerCase()}:${epoch}`;
}

/**
 * Deterministic string identifying everything that makes an adapter epoch what
 * it is. This is the payload operators sign; the signature is verified before an
 * adapter may be activated.
 */
export function adapterFingerprint(def: {
  chainId: string;
  contractIdentity: string;
  epoch: number;
  abiHash: string;
  bytecodeHash?: string | null;
  decimals?: number | null;
  deploymentFromBlock: number;
  deploymentToBlock?: number | null;
  proxyImplementation?: string | null;
}): string {
  return stableStringify({
    chainId: def.chainId,
    contractIdentity: def.contractIdentity.toLowerCase(),
    epoch: def.epoch,
    abiHash: def.abiHash,
    bytecodeHash: def.bytecodeHash ?? null,
    decimals: def.decimals ?? null,
    deploymentFromBlock: def.deploymentFromBlock,
    deploymentToBlock: def.deploymentToBlock ?? null,
    proxyImplementation: def.proxyImplementation ?? null,
  });
}

export function verifyAdapterSignature(
  fingerprint: string,
  signatureHex: string,
  publicKeyPem: string,
  algorithm: SignerAlgorithm = "ed25519"
): boolean {
  try {
    const keyObj = createPublicKey(publicKeyPem);
    const sig = Buffer.from(signatureHex, "hex");
    if (sig.length === 0) return false;

    if (algorithm === "ed25519") {
      // Ed25519 uses the one-shot API — createVerify() does not support it.
      return cryptoVerify(null, Buffer.from(fingerprint), keyObj, sig);
    }
    const verifier = createVerify("sha256");
    verifier.update(fingerprint);
    verifier.end();
    return verifier.verify(keyObj, sig);
  } catch {
    return false;
  }
}

/** Decode a single log against an explicit ABI. Deterministic. */
export function decodeLogWithAbi(
  abi: ReadonlyArray<string | Record<string, unknown>>,
  rawLog: RawLog
): { eventName: string; signature: string; args: Record<string, unknown> } {
  const iface = new ethers.Interface(abi as unknown as ethers.InterfaceAbi);
  const parsed = iface.parseLog({ topics: [...rawLog.topics], data: rawLog.data });
  if (!parsed) {
    throw new Error("no matching event in ABI");
  }
  const args: Record<string, unknown> = {};
  parsed.fragment.inputs.forEach((input, i) => {
    args[input.name || `arg${i}`] = normaliseArg(parsed.args[i]);
  });
  return { eventName: parsed.name, signature: parsed.signature, args };
}

/** Pick the epoch whose deployment range contains `blockNumber`. */
export function resolveEpochForBlock<T extends { deploymentFromBlock: number; deploymentToBlock: number | null }>(
  epochs: T[],
  blockNumber: number
): T | null {
  const candidates = epochs.filter(
    (e) =>
      blockNumber >= e.deploymentFromBlock &&
      (e.deploymentToBlock == null || blockNumber <= e.deploymentToBlock)
  );
  if (candidates.length === 0) return null;
  // Most specific (latest starting) epoch wins.
  candidates.sort((a, b) => b.deploymentFromBlock - a.deploymentFromBlock);
  return candidates[0];
}

function normaliseArg(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normaliseArg);
  return value;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

// ─── Row mapping ──────────────────────────────────────────────────────────────

function mapRow(row: Record<string, any>): ChainAdapter {
  return {
    id: row.id,
    chainId: row.chain_id,
    contractIdentity: row.contract_identity,
    contractAlias: row.contract_alias,
    epoch: Number(row.epoch),
    registryVersion: row.registry_version,
    abiJson: row.abi_json,
    abiHash: row.abi_hash,
    bytecodeHash: row.bytecode_hash,
    decimals: row.decimals == null ? null : Number(row.decimals),
    deploymentFromBlock: Number(row.deployment_from_block),
    deploymentToBlock: row.deployment_to_block == null ? null : Number(row.deployment_to_block),
    proxyImplementation: row.proxy_implementation,
    proxyHistory: row.proxy_history ?? [],
    eventSchemas: row.event_schemas ?? {},
    migrationHandler: row.migration_handler,
    signature: row.signature,
    signerKeyId: row.signer_key_id,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    rolledBackAt: row.rolled_back_at,
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const chainAdapterRegistryService = {
  canonicalizeAbi,
  computeAbiHash,
  buildRegistryVersion,
  adapterFingerprint,
  verifyAdapterSignature,
  decodeLogWithAbi,
  resolveEpochForBlock,

  async registerSigner(
    keyId: string,
    algorithm: SignerAlgorithm,
    publicKeyPem: string,
    description?: string,
    client?: PoolClient
  ): Promise<void> {
    const q = client || db;
    await q.query(
      `INSERT INTO chain_adapter_signers (key_id, algorithm, public_key_pem, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key_id) DO UPDATE SET
         algorithm = EXCLUDED.algorithm,
         public_key_pem = EXCLUDED.public_key_pem,
         description = EXCLUDED.description,
         is_active = true,
         revoked_at = NULL`,
      [keyId, algorithm, publicKeyPem, description ?? null]
    );
    logger.info({ keyId, algorithm }, "Registered chain-adapter signer");
  },

  async listEpochs(chainId: string, contractIdentity: string, client?: PoolClient): Promise<ChainAdapter[]> {
    const q = client || db;
    const res = await q.query(
      `SELECT * FROM chain_adapters
       WHERE chain_id = $1 AND lower(contract_identity) = lower($2)
       ORDER BY epoch ASC`,
      [chainId, contractIdentity]
    );
    return res.rows.map(mapRow);
  },

  async getActiveAdapter(
    chainId: string,
    contractIdentity: string,
    client?: PoolClient
  ): Promise<ChainAdapter | null> {
    const q = client || db;
    const res = await q.query(
      `SELECT * FROM chain_adapters
       WHERE chain_id = $1 AND lower(contract_identity) = lower($2) AND status = 'active'`,
      [chainId, contractIdentity]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  },

  async getByRegistryVersion(registryVersion: string, client?: PoolClient): Promise<ChainAdapter | null> {
    const q = client || db;
    const res = await q.query(`SELECT * FROM chain_adapters WHERE registry_version = $1`, [registryVersion]);
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  },

  /**
   * Stage (but do not activate) a new adapter epoch. The adapter signature is
   * verified against a registered, active signer before the row is written —
   * an unsigned or badly-signed adapter is rejected here, never activated.
   */
  async stageAdapter(input: StageAdapterInput, client?: PoolClient): Promise<ChainAdapter> {
    const q = client || db;
    const abiHash = computeAbiHash(input.abi);

    const existing = await this.listEpochs(input.chainId, input.contractIdentity, client);
    const epoch = existing.length === 0 ? 1 : Math.max(...existing.map((e) => e.epoch)) + 1;
    const registryVersion = buildRegistryVersion(input.chainId, input.contractIdentity, epoch);

    const fingerprint = adapterFingerprint({
      chainId: input.chainId,
      contractIdentity: input.contractIdentity,
      epoch,
      abiHash,
      bytecodeHash: input.bytecodeHash,
      decimals: input.decimals,
      deploymentFromBlock: input.deploymentFromBlock,
      deploymentToBlock: input.deploymentToBlock,
      proxyImplementation: input.proxyImplementation,
    });

    if (!input.allowUnsigned) {
      if (!input.signature || !input.signerKeyId) {
        throw new Error("Adapter must be signed by a registered signer before staging");
      }
      const signerRes = await q.query(
        `SELECT algorithm, public_key_pem FROM chain_adapter_signers
         WHERE key_id = $1 AND is_active = true`,
        [input.signerKeyId]
      );
      const signer = signerRes.rows[0];
      if (!signer) {
        throw new Error(`Unknown or revoked signer key: ${input.signerKeyId}`);
      }
      const ok = verifyAdapterSignature(
        fingerprint,
        input.signature,
        signer.public_key_pem,
        signer.algorithm as SignerAlgorithm
      );
      if (!ok) {
        throw new Error("Adapter signature verification failed");
      }
    }

    const proxyHistory = input.proxyHistory ?? [];
    const res = await q.query(
      `INSERT INTO chain_adapters
         (chain_id, contract_identity, contract_alias, epoch, registry_version,
          abi_json, abi_hash, bytecode_hash, decimals,
          deployment_from_block, deployment_to_block,
          proxy_implementation, proxy_history, event_schemas, migration_handler,
          signature, signer_key_id, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'staged',$18)
       RETURNING *`,
      [
        input.chainId,
        input.contractIdentity,
        input.contractAlias ?? null,
        epoch,
        registryVersion,
        JSON.stringify(input.abi),
        abiHash,
        input.bytecodeHash ?? null,
        input.decimals ?? null,
        input.deploymentFromBlock,
        input.deploymentToBlock ?? null,
        input.proxyImplementation ?? null,
        JSON.stringify(proxyHistory),
        JSON.stringify(input.eventSchemas ?? {}),
        input.migrationHandler ?? null,
        input.signature ?? null,
        input.signerKeyId ?? null,
        input.createdBy ?? "system",
      ]
    );
    logger.info({ registryVersion, abiHash }, "Staged chain adapter epoch");
    return mapRow(res.rows[0]);
  },

  /**
   * Activate a staged adapter. The currently-active epoch for the same contract
   * (if any) is closed at `deployment_from_block - 1` and marked `superseded`.
   * Historical rows are untouched — they remain decodable via their own
   * `registryVersion`.
   */
  async activateAdapter(adapterId: string, activatedBy = "system"): Promise<ChainAdapter> {
    const conn = await db.connect();
    try {
      await conn.query("BEGIN");
      const staged = (await conn.query(`SELECT * FROM chain_adapters WHERE id = $1 FOR UPDATE`, [adapterId]))
        .rows[0];
      if (!staged) throw new Error("Adapter not found");
      if (staged.status !== "staged") {
        throw new Error(`Adapter is ${staged.status}, only staged adapters can be activated`);
      }

      const current = (
        await conn.query(
          `SELECT * FROM chain_adapters
           WHERE chain_id = $1 AND lower(contract_identity) = lower($2) AND status = 'active'
           FOR UPDATE`,
          [staged.chain_id, staged.contract_identity]
        )
      ).rows[0];

      if (current) {
        const closeAt = Number(staged.deployment_from_block) - 1;
        await conn.query(
          `UPDATE chain_adapters
           SET status = 'superseded',
               deployment_to_block = COALESCE(deployment_to_block, $2)
           WHERE id = $1`,
          [current.id, closeAt]
        );
      }

      const res = await conn.query(
        `UPDATE chain_adapters
         SET status = 'active', activated_at = NOW(), created_by = $2
         WHERE id = $1
         RETURNING *`,
        [adapterId, activatedBy]
      );
      await conn.query("COMMIT");
      logger.info(
        { registryVersion: staged.registry_version, supersededId: current?.id ?? null },
        "Activated chain adapter epoch"
      );
      return mapRow(res.rows[0]);
    } catch (err) {
      await conn.query("ROLLBACK");
      throw err;
    } finally {
      conn.release();
    }
  },

  /**
   * Roll an adapter back. The rolled-back epoch is marked `rolled_back` and the
   * previous (superseded) epoch is re-opened as `active`. No historical data is
   * deleted or rewritten — only the pointer to "current decoder" moves.
   */
  async rollbackAdapter(adapterId: string, reason = "operator rollback"): Promise<ChainAdapter | null> {
    const conn = await db.connect();
    try {
      await conn.query("BEGIN");
      const target = (await conn.query(`SELECT * FROM chain_adapters WHERE id = $1 FOR UPDATE`, [adapterId]))
        .rows[0];
      if (!target) throw new Error("Adapter not found");
      if (target.status !== "active" && target.status !== "staged") {
        throw new Error(`Adapter is ${target.status}, cannot roll back`);
      }

      await conn.query(
        `UPDATE chain_adapters SET status = 'rolled_back', rolled_back_at = NOW() WHERE id = $1`,
        [adapterId]
      );

      let restored: Record<string, any> | undefined;
      if (target.status === "active") {
        restored = (
          await conn.query(
            `SELECT * FROM chain_adapters
             WHERE chain_id = $1 AND lower(contract_identity) = lower($2)
               AND status = 'superseded' AND epoch < $3
             ORDER BY epoch DESC
             LIMIT 1
             FOR UPDATE`,
            [target.chain_id, target.contract_identity, target.epoch]
          )
        ).rows[0];
        if (restored) {
          await conn.query(
            `UPDATE chain_adapters
             SET status = 'active', deployment_to_block = NULL, rolled_back_at = NULL
             WHERE id = $1`,
            [restored.id]
          );
        }
      }

      await conn.query("COMMIT");
      logger.warn(
        { registryVersion: target.registry_version, restored: restored?.registry_version ?? null, reason },
        "Rolled back chain adapter epoch"
      );
      return restored ? mapRow(restored) : null;
    } catch (err) {
      await conn.query("ROLLBACK");
      throw err;
    } finally {
      conn.release();
    }
  },

  /**
   * Record a proxy implementation upgrade. Proxy upgrades always create an
   * explicit new adapter epoch (staged) — the caller activates it once verified.
   */
  async recordProxyUpgrade(
    chainId: string,
    contractIdentity: string,
    upgrade: {
      newImplementation: string;
      atBlock: number;
      txHash?: string;
      abi?: ReadonlyArray<string | Record<string, unknown>>;
      bytecodeHash?: string;
      decimals?: number;
      signature?: string;
      signerKeyId?: string;
      createdBy?: string;
      allowUnsigned?: boolean;
    }
  ): Promise<ChainAdapter> {
    const epochs = await this.listEpochs(chainId, contractIdentity);
    const latest = epochs[epochs.length - 1];
    if (!latest) {
      throw new Error("No existing adapter for contract; stage a base adapter first");
    }
    const proxyHistory: ProxyUpgradeRecord[] = [
      ...(latest.proxyHistory ?? []),
      { implementation: upgrade.newImplementation, fromBlock: upgrade.atBlock, txHash: upgrade.txHash },
    ];
    return this.stageAdapter({
      chainId,
      contractIdentity,
      contractAlias: latest.contractAlias ?? undefined,
      abi: upgrade.abi ?? latest.abiJson,
      bytecodeHash: upgrade.bytecodeHash,
      decimals: upgrade.decimals ?? latest.decimals ?? undefined,
      deploymentFromBlock: upgrade.atBlock,
      deploymentToBlock: null,
      proxyImplementation: upgrade.newImplementation,
      proxyHistory,
      eventSchemas: latest.eventSchemas,
      migrationHandler: latest.migrationHandler ?? undefined,
      signature: upgrade.signature,
      signerKeyId: upgrade.signerKeyId,
      createdBy: upgrade.createdBy,
      allowUnsigned: upgrade.allowUnsigned,
    });
  },

  /** Reproducible: decode a historical log from a registry version + raw log. */
  async decodeHistoricalLog(registryVersion: string, rawLog: RawLog): Promise<DecodedLog> {
    const adapter = await this.getByRegistryVersion(registryVersion);
    if (!adapter) throw new Error(`Unknown registry version: ${registryVersion}`);
    const decoded = decodeLogWithAbi(adapter.abiJson, rawLog);
    return {
      registryVersion,
      epoch: adapter.epoch,
      eventName: decoded.eventName,
      signature: decoded.signature,
      args: decoded.args,
    };
  },

  async quarantine(
    entry: {
      chainId: string;
      contractIdentity: string;
      reason: QuarantineReason;
      expectedAbiHash?: string | null;
      observedAbiHash?: string | null;
      expectedBytecodeHash?: string | null;
      observedBytecodeHash?: string | null;
      blockNumber?: number | null;
      rawLog?: unknown;
      detail?: string;
    },
    client?: PoolClient
  ): Promise<void> {
    const q = client || db;
    await q.query(
      `INSERT INTO chain_adapter_quarantine
         (chain_id, contract_identity, reason, expected_abi_hash, observed_abi_hash,
          expected_bytecode_hash, observed_bytecode_hash, block_number, raw_log, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        entry.chainId,
        entry.contractIdentity,
        entry.reason,
        entry.expectedAbiHash ?? null,
        entry.observedAbiHash ?? null,
        entry.expectedBytecodeHash ?? null,
        entry.observedBytecodeHash ?? null,
        entry.blockNumber ?? null,
        JSON.stringify(entry.rawLog ?? {}),
        entry.detail ?? null,
      ]
    );
    logger.warn(
      { chainId: entry.chainId, contractIdentity: entry.contractIdentity, reason: entry.reason },
      "Quarantined chain-adapter ingestion"
    );
  },

  /**
   * Validate an incoming log against the registry and route it to the correct
   * decoder epoch. Unknown bytecode, unexpected ABI hashes, out-of-range blocks
   * and decode failures all quarantine ingestion rather than producing a
   * possibly-wrong decode.
   */
  async validateAndRouteIngestion(params: {
    chainId: string;
    contractIdentity: string;
    blockNumber: number;
    observedAbiHash?: string;
    observedBytecodeHash?: string;
    rawLog: RawLog;
  }): Promise<IngestionRouteResult> {
    const epochs = await this.listEpochs(params.chainId, params.contractIdentity);
    const usable = epochs.filter((e) => e.status === "active" || e.status === "superseded");

    if (usable.length === 0) {
      await this.quarantine({
        chainId: params.chainId,
        contractIdentity: params.contractIdentity,
        reason: "no_active_adapter",
        blockNumber: params.blockNumber,
        rawLog: params.rawLog,
        detail: "No active or superseded adapter epoch for this contract",
      });
      return { quarantined: true, reason: "no_active_adapter" };
    }

    const epoch = resolveEpochForBlock(usable, params.blockNumber);
    if (!epoch) {
      await this.quarantine({
        chainId: params.chainId,
        contractIdentity: params.contractIdentity,
        reason: "out_of_range",
        blockNumber: params.blockNumber,
        rawLog: params.rawLog,
        detail: `Block ${params.blockNumber} outside every known adapter deployment range`,
      });
      return { quarantined: true, reason: "out_of_range" };
    }

    if (
      params.observedBytecodeHash &&
      epoch.bytecodeHash &&
      params.observedBytecodeHash.toLowerCase() !== epoch.bytecodeHash.toLowerCase()
    ) {
      await this.quarantine({
        chainId: params.chainId,
        contractIdentity: params.contractIdentity,
        reason: "unknown_bytecode",
        expectedBytecodeHash: epoch.bytecodeHash,
        observedBytecodeHash: params.observedBytecodeHash,
        blockNumber: params.blockNumber,
        rawLog: params.rawLog,
      });
      return { quarantined: true, reason: "unknown_bytecode", registryVersion: epoch.registryVersion };
    }

    if (params.observedAbiHash && params.observedAbiHash !== epoch.abiHash) {
      await this.quarantine({
        chainId: params.chainId,
        contractIdentity: params.contractIdentity,
        reason: "abi_change",
        expectedAbiHash: epoch.abiHash,
        observedAbiHash: params.observedAbiHash,
        blockNumber: params.blockNumber,
        rawLog: params.rawLog,
      });
      return { quarantined: true, reason: "abi_change", registryVersion: epoch.registryVersion };
    }

    try {
      const decoded = decodeLogWithAbi(epoch.abiJson, params.rawLog);
      return {
        quarantined: false,
        registryVersion: epoch.registryVersion,
        decoded: {
          registryVersion: epoch.registryVersion,
          epoch: epoch.epoch,
          eventName: decoded.eventName,
          signature: decoded.signature,
          args: decoded.args,
        },
      };
    } catch (err) {
      await this.quarantine({
        chainId: params.chainId,
        contractIdentity: params.contractIdentity,
        reason: "decode_failure",
        expectedAbiHash: epoch.abiHash,
        blockNumber: params.blockNumber,
        rawLog: params.rawLog,
        detail: err instanceof Error ? err.message : String(err),
      });
      return { quarantined: true, reason: "decode_failure", registryVersion: epoch.registryVersion };
    }
  },

  async listQuarantine(
    filter: { chainId?: string; resolved?: boolean; limit?: number; offset?: number } = {},
    client?: PoolClient
  ) {
    const q = client || db;
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filter.chainId) {
      values.push(filter.chainId);
      conditions.push(`chain_id = $${values.length}`);
    }
    if (typeof filter.resolved === "boolean") {
      values.push(filter.resolved);
      conditions.push(`resolved = $${values.length}`);
    }
    values.push(filter.limit ?? 50, filter.offset ?? 0);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const res = await q.query(
      `SELECT * FROM chain_adapter_quarantine ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    return res.rows;
  },
};

export type ChainAdapterRegistryService = typeof chainAdapterRegistryService;
