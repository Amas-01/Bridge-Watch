import type { Knex } from "knex";
import { getDatabase } from "../database/connection.js";

/**
 * Finality-aware observation ledger (foundation).
 *
 * Observations from Stellar, Soroban and EVM sources are currently recorded
 * without modelling how *settled* they are. That matters because the chains do
 * not agree on what "confirmed" means: Stellar closes a ledger and it is final,
 * while an EVM chain's recent blocks can be reorganised away. Mixing the two
 * without labelling them lets supply, health and alert history contradict each
 * other after a reorg.
 *
 * ── The model ───────────────────────────────────────────────────────────────
 *
 * Every observation carries a finality state:
 *
 *   provisional — recorded, not yet past the chain's confirmation threshold.
 *                 Usable, but must be labelled wherever it is aggregated.
 *   finalized   — past the threshold. Treated as settled evidence.
 *   reverted    — the containing block was reorganised away.
 *
 * The original row is never deleted. A reverted observation stays in the ledger
 * with its state changed, and a *compensating* update is emitted to unwind its
 * effect. Deleting it instead would make the metric correct while destroying
 * the ability to explain why it changed — which is the whole point of a ledger.
 *
 * This module is the state machine and the per-chain policy. Propagation into
 * reconciliation, materialised views, alerts, exports and WebSockets is
 * deliberately out of scope here and consumes `deriveCompensation` at those
 * boundaries.
 */

export type FinalityState = "provisional" | "finalized" | "reverted";

export interface FinalityPolicy {
  chain: string;
  /** Confirmations before an observation is treated as final. */
  confirmations: number;
  /**
   * Whether the chain can reorganise at all. Stellar cannot: a closed ledger is
   * final, so an observation is finalized the moment it is seen and `reverted`
   * is unreachable.
   */
  reorgPossible: boolean;
  /** Optional per-bridge override key; null means the chain-wide default. */
  bridgeId: string | null;
}

export interface Observation {
  id: string;
  chain: string;
  bridgeId: string | null;
  blockNumber: number;
  blockHash: string;
  /** Confirmations seen so far. */
  confirmations: number;
  state: FinalityState;
  /** Value the observation contributes to a metric; sign-flipped to compensate. */
  value: string;
  observedAt: string;
}

export interface CompensationEntry {
  observationId: string;
  chain: string;
  bridgeId: string | null;
  /** Negation of the reverted observation's contribution. */
  compensatingValue: string;
  reason: string;
}

/**
 * Defaults per chain family.
 *
 * Stellar and Soroban share a ledger that is final on close, so one
 * confirmation is genuinely final rather than a low threshold. EVM values are
 * conservative starting points and are expected to be overridden per bridge.
 */
export const DEFAULT_FINALITY_POLICIES: Record<string, Omit<FinalityPolicy, "chain" | "bridgeId">> = {
  stellar: { confirmations: 1, reorgPossible: false },
  soroban: { confirmations: 1, reorgPossible: false },
  ethereum: { confirmations: 12, reorgPossible: true },
  polygon: { confirmations: 128, reorgPossible: true },
  arbitrum: { confirmations: 20, reorgPossible: true },
};

// ── Pure state machine ──────────────────────────────────────────────────────

/** Policy for a chain, falling back to a conservative reorg-capable default. */
export function resolvePolicy(
  chain: string,
  bridgeId: string | null = null,
  overrides: FinalityPolicy[] = []
): FinalityPolicy {
  // A bridge-specific override wins over the chain-wide one.
  const bridgeOverride = overrides.find((p) => p.chain === chain && p.bridgeId === bridgeId && bridgeId !== null);
  if (bridgeOverride) return bridgeOverride;

  const chainOverride = overrides.find((p) => p.chain === chain && p.bridgeId === null);
  if (chainOverride) return { ...chainOverride, bridgeId };

  const preset = DEFAULT_FINALITY_POLICIES[chain.toLowerCase()];
  // An unknown chain is assumed reorg-capable: guessing "final" for a chain we
  // do not model would silently mark unsettled data as evidence.
  return preset
    ? { chain, bridgeId, ...preset }
    : { chain, bridgeId, confirmations: 32, reorgPossible: true };
}

/** The state an observation should be in, given its confirmations. */
export function classify(
  observation: Pick<Observation, "confirmations" | "state">,
  policy: FinalityPolicy
): FinalityState {
  // Terminal: a reverted observation never returns to provisional or finalized.
  // The chain reorganised it away; if the same event reappears on the winning
  // fork it is a new observation with its own id.
  if (observation.state === "reverted") return "reverted";

  // Already finalized on a chain that cannot reorg — nothing can move it.
  if (observation.state === "finalized" && !policy.reorgPossible) return "finalized";

  return observation.confirmations >= policy.confirmations ? "finalized" : "provisional";
}

/** Whether a transition is permitted by the state machine. */
export function canTransition(from: FinalityState, to: FinalityState, policy: FinalityPolicy): boolean {
  if (from === to) return true;
  if (from === "reverted") return false; // terminal
  if (to === "reverted") return policy.reorgPossible;
  if (from === "provisional" && to === "finalized") return true;
  // finalized → provisional would mean un-finalising settled evidence.
  return false;
}

/**
 * Promote observations whose confirmations have caught up.
 *
 * Returns only those whose state actually changes, so the caller can emit
 * exactly the events that matter rather than rewriting the whole batch.
 */
export function promotable(observations: Observation[], overrides: FinalityPolicy[] = []): Observation[] {
  return observations
    .map((obs) => {
      const policy = resolvePolicy(obs.chain, obs.bridgeId, overrides);
      const next = classify(obs, policy);
      return next !== obs.state && canTransition(obs.state, next, policy)
        ? { ...obs, state: next }
        : null;
    })
    .filter((obs): obs is Observation => obs !== null);
}

/**
 * The compensating entry for a reverted observation.
 *
 * Negates the original contribution rather than deleting the row, so a metric
 * can be corrected while the history of *why* stays inspectable.
 */
export function deriveCompensation(observation: Observation, reason: string): CompensationEntry {
  // String arithmetic: these are chain amounts and must not go through a float.
  const negated = observation.value.startsWith("-")
    ? observation.value.slice(1)
    : `-${observation.value}`;

  return {
    observationId: observation.id,
    chain: observation.chain,
    bridgeId: observation.bridgeId,
    compensatingValue: observation.value === "0" ? "0" : negated,
    reason,
  };
}

/**
 * Whether a set of observations can be aggregated without a label.
 *
 * Mixing provisional and finalized evidence is permitted, but only when the
 * caller labels the result — an unlabelled mix is what makes supply and health
 * appear to contradict each other.
 */
export function requiresEvidenceLabel(observations: Pick<Observation, "state">[]): boolean {
  const states = new Set(observations.map((o) => o.state));
  states.delete("reverted"); // reverted rows are compensated, not aggregated
  return states.size > 1;
}

/** The weakest evidence level present — what an aggregate should be labelled. */
export function aggregateEvidenceLevel(
  observations: Pick<Observation, "state">[]
): FinalityState | "empty" {
  const usable = observations.filter((o) => o.state !== "reverted");
  if (usable.length === 0) return "empty";
  return usable.some((o) => o.state === "provisional") ? "provisional" : "finalized";
}

const mapPolicy = (r: any): FinalityPolicy => ({
  chain: r.chain,
  bridgeId: r.bridge_id ?? null,
  confirmations: Number(r.confirmations),
  reorgPossible: Boolean(r.reorg_possible),
});

export class FinalityLedgerService {
  constructor(private readonly db: Knex = getDatabase()) {}

  async listPolicies(): Promise<FinalityPolicy[]> {
    const rows = await this.db("chain_finality_policies").select("*");
    return rows.map(mapPolicy);
  }

  async upsertPolicy(policy: FinalityPolicy): Promise<FinalityPolicy> {
    const values = {
      chain: policy.chain,
      bridge_id: policy.bridgeId,
      confirmations: policy.confirmations,
      reorg_possible: policy.reorgPossible,
      updated_at: new Date(),
    };
    const [row] = await this.db("chain_finality_policies")
      .insert(values)
      .onConflict(["chain", "bridge_id"])
      .merge()
      .returning("*");
    return mapPolicy(row);
  }

  /**
   * Mark an observation reverted and record its compensating entry.
   *
   * Both writes happen in one transaction: a revert without its compensation
   * would leave the metric permanently wrong with no record of the discrepancy.
   * Idempotent on the observation id, so replaying a reorg after a restart does
   * not double-compensate.
   */
  async revert(observationId: string, reason: string): Promise<CompensationEntry | null> {
    return this.db.transaction(async (tx) => {
      const row = await tx("finality_observations").where({ id: observationId }).forUpdate().first();
      if (!row) return null;
      if (row.state === "reverted") return null; // already compensated

      const observation: Observation = {
        id: row.id,
        chain: row.chain,
        bridgeId: row.bridge_id ?? null,
        blockNumber: Number(row.block_number),
        blockHash: row.block_hash,
        confirmations: Number(row.confirmations),
        state: row.state,
        value: String(row.value),
        observedAt: new Date(row.observed_at).toISOString(),
      };

      const compensation = deriveCompensation(observation, reason);

      await tx("finality_observations").where({ id: observationId }).update({
        state: "reverted",
        reverted_at: new Date(),
        revert_reason: reason,
        updated_at: new Date(),
      });

      await tx("finality_compensations").insert({
        observation_id: compensation.observationId,
        chain: compensation.chain,
        bridge_id: compensation.bridgeId,
        compensating_value: compensation.compensatingValue,
        reason: compensation.reason,
      });

      return compensation;
    });
  }
}

export const finalityLedgerService = new FinalityLedgerService();
