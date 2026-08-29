/// # Merkle Mountain Range (MMR) Accumulator Contract
///
/// An append-only, log-space proof system for historical reserve commitment
/// verification. Each bridge operator commitment is a leaf; the MMR produces
/// a compact "bagged peaks" root that covers all historical leaves with
/// O(log N) proof paths.
///
/// ## Algorithm
/// - Peaks list: one peak per height of a complete binary subtree that has
///   been fully filled.  When a new leaf is appended at height 0, it merges
///   with existing same-height peaks until it reaches a unique height.
/// - Root derivation: peaks are sequentially hashed right-to-left
///   (`bag_peaks`) to produce a single 32-byte root commitment.
/// - Proof verification: the verifier re-derives the local subtree root from
///   the leaf + sibling path, then re-derives the final root from the peaks
///   (with the local subtree replacing its position), and compares.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short,
    Address, BytesN, Env, Vec,
};


// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MmrError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InvalidProof = 4,
    InvalidLeafIndex = 5,
    EmptyAccumulator = 6,
    InvalidInput = 7,
}

// ---------------------------------------------------------------------------
// Storage types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MmrState {
    /// Number of leaves ever appended (monotonically increasing).
    pub leaf_count: u64,
    /// One peak per height of a filled complete binary subtree.
    /// peaks[0] is the peak of a tree of height 0 (single node), etc.
    /// A height slot is None if no subtree of that height is complete yet.
    pub peaks: Vec<BytesN<32>>,
    /// Number of active peaks (mirrors peaks.len() but stored for O(1) access).
    pub peak_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MmrProof {
    /// Hash of the leaf being proven.
    pub leaf_hash: BytesN<32>,
    /// 0-indexed position of this leaf in the overall leaf sequence.
    pub leaf_index: u64,
    /// Sibling hashes along the path from leaf to its local subtree peak.
    pub siblings: Vec<BytesN<32>>,
    /// Snapshot of all MMR peaks at the time this proof was generated,
    /// with the proven leaf's local tree root replaced by `None` (represented
    /// as a sentinel zero hash placeholder — the verifier reconstructs it).
    /// Stored left-to-right; the prover's local root sits at `local_peak_pos`.
    pub peaks_snapshot: Vec<BytesN<32>>,
    /// Index into `peaks_snapshot` where the local subtree peak lives.
    pub local_peak_pos: u32,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const KEY_ADMIN: soroban_sdk::Symbol = symbol_short!("ADMIN");
const KEY_STATE: soroban_sdk::Symbol = symbol_short!("STATE");

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

/// SHA-256 of `left || right` — used for all internal node derivations.
fn merge(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let mut buf = soroban_sdk::Bytes::new(env);
    buf.append(&left.clone().into());
    buf.append(&right.clone().into());
    env.crypto().sha256(&buf).into()
}

/// Hash a raw leaf value to produce the leaf node hash.
/// Domain-separated with a 0x00 prefix to prevent second-preimage attacks.
fn hash_leaf(env: &Env, data: &BytesN<32>) -> BytesN<32> {
    let mut buf = soroban_sdk::Bytes::new(env);
    buf.push_back(0x00u8);
    buf.append(&data.clone().into());
    env.crypto().sha256(&buf).into()
}

/// Hash an internal node: domain-separated with 0x01 prefix.
fn hash_node(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let mut buf = soroban_sdk::Bytes::new(env);
    buf.push_back(0x01u8);
    buf.append(&left.clone().into());
    buf.append(&right.clone().into());
    env.crypto().sha256(&buf).into()
}


/// Bag all peaks right-to-left into a single 32-byte root.
/// With a single peak, the root equals that peak.
fn bag_peaks(env: &Env, peaks: &Vec<BytesN<32>>) -> BytesN<32> {
    let n = peaks.len();
    if n == 0 {
        // All-zero sentinel — accumulator is empty.
        return BytesN::from_array(env, &[0u8; 32]);
    }
    let mut acc = peaks.get(n - 1).unwrap();
    let mut i = n - 1;
    while i > 0 {
        i -= 1;
        acc = merge(env, &peaks.get(i).unwrap(), &acc);
    }
    acc
}

fn load_state(env: &Env) -> MmrState {
    env.storage()
        .persistent()
        .get(&KEY_STATE)
        .unwrap_or_else(|| MmrState {
            leaf_count: 0,
            peaks: Vec::new(env),
            peak_count: 0,
        })
}

fn save_state(env: &Env, state: &MmrState) {
    env.storage().persistent().set(&KEY_STATE, state);
    // Extend TTL: ~90 days at ~7 s/ledger.
    env.storage()
        .persistent()
        .extend_ttl(&KEY_STATE, 17_280 * 30, 17_280 * 90);
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct MmrAccumulatorContract;

#[contractimpl]
impl MmrAccumulatorContract {
    // ── Admin ────────────────────────────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address) -> Result<(), MmrError> {
        if env.storage().persistent().has(&KEY_ADMIN) {
            return Err(MmrError::AlreadyInitialized);
        }
        env.storage().persistent().set(&KEY_ADMIN, &admin);
        env.storage()
            .persistent()
            .extend_ttl(&KEY_ADMIN, 17_280 * 30, 17_280 * 90);
        Ok(())
    }

    pub fn get_admin(env: Env) -> Result<Address, MmrError> {
        env.storage()
            .persistent()
            .get(&KEY_ADMIN)
            .ok_or(MmrError::NotInitialized)
    }

    // ── Write ─────────────────────────────────────────────────────────────

    /// Appends a new commitment leaf to the MMR.
    /// `raw_commitment` is the 32-byte hash of the reserve commitment data.
    /// Returns the new leaf index (0-indexed).
    pub fn append(env: Env, caller: Address, raw_commitment: BytesN<32>) -> Result<u64, MmrError> {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&KEY_ADMIN)
            .ok_or(MmrError::NotInitialized)?;
        // Admin or any approved caller can append; require explicit auth.
        if caller != admin {
            caller.require_auth();
        } else {
            admin.require_auth();
        }

        let mut state = load_state(&env);
        let leaf_index = state.leaf_count;

        // Compute leaf node hash (domain-separated).
        let mut current = hash_leaf(&env, &raw_commitment);

        // Merge upward: if peaks already contains a peak at height h, merge
        // with it to form a peak at height h+1.
        let mut h: u32 = 0;
        while (h as usize) < (state.peaks.len() as usize)
            && !is_zero(&state.peaks.get(h).unwrap())
        {
            let left_peak = state.peaks.get(h).unwrap();
            current = hash_node(&env, &left_peak, &current);
            // Vacate slot h (mark as zero).
            state.peaks.set(h, BytesN::from_array(&env, &[0u8; 32]));
            h += 1;
        }

        // Place the merged node at height h.
        if (h as usize) < (state.peaks.len() as usize) {
            state.peaks.set(h, current);
        } else {
            state.peaks.push_back(current);
        }

        state.leaf_count += 1;
        // Re-compute peak_count (non-zero slots).
        state.peak_count = count_active_peaks(&state.peaks);
        save_state(&env, &state);

        env.events().publish(
            (symbol_short!("mmr"), symbol_short!("appended")),
            (leaf_index, raw_commitment, state.leaf_count),
        );

        Ok(leaf_index)
    }

    // ── Read ──────────────────────────────────────────────────────────────

    /// Returns the current MMR root (bagged peaks).
    pub fn get_root(env: Env) -> Result<BytesN<32>, MmrError> {
        let state = load_state(&env);
        if state.leaf_count == 0 {
            return Err(MmrError::EmptyAccumulator);
        }
        let active = active_peaks(&env, &state.peaks);
        Ok(bag_peaks(&env, &active))
    }

    /// Returns the current leaf count.
    pub fn get_leaf_count(env: Env) -> u64 {
        load_state(&env).leaf_count
    }

    /// Returns the raw peaks vector (some slots may be zero/inactive).
    pub fn get_peaks(env: Env) -> Vec<BytesN<32>> {
        load_state(&env).peaks
    }

    // ── Verification ──────────────────────────────────────────────────────

    /// Verifies an MMR inclusion proof.
    ///
    /// The verifier:
    ///  1. Re-derives the local subtree root from `leaf_hash` + `siblings`.
    ///  2. Reconstructs the full bagged root by substituting the local root
    ///     into `peaks_snapshot` at `local_peak_pos` and bagging.
    ///  3. Compares the reconstructed root against `expected_root`.
    pub fn verify_mmr_proof(
        env: Env,
        proof: MmrProof,
        expected_root: BytesN<32>,
    ) -> Result<bool, MmrError> {
        if proof.peaks_snapshot.len() == 0 {
            return Err(MmrError::InvalidInput);
        }

        // Step 1: walk the sibling path to reconstruct the local subtree root.
        let mut current = proof.leaf_hash.clone();
        let mut pos = proof.leaf_index;

        for sib in proof.siblings.iter() {
            if pos % 2 == 0 {
                // current is a left child → merge(current, sibling)
                current = hash_node(&env, &current, &sib);
            } else {
                // current is a right child → merge(sibling, current)
                current = hash_node(&env, &sib, &current);
            }
            pos /= 2;
        }

        // Step 2: substitute local root into peaks snapshot at local_peak_pos.
        let mut peaks_for_bag: Vec<BytesN<32>> = Vec::new(&env);
        for (i, p) in proof.peaks_snapshot.iter().enumerate() {
            if i as u32 == proof.local_peak_pos {
                peaks_for_bag.push_back(current.clone());
            } else {
                peaks_for_bag.push_back(p);
            }
        }

        // Filter out zero-sentinels (inactive peaks).
        let active = active_peaks(&env, &peaks_for_bag);
        let reconstructed = bag_peaks(&env, &active);

        // Step 3: compare.
        let valid = reconstructed == expected_root;

        env.events().publish(
            (symbol_short!("mmr"), symbol_short!("verified")),
            (proof.leaf_index, expected_root, valid),
        );

        Ok(valid)
    }

    /// Convenience method: verify using the accumulator's current stored root.
    /// Useful when the verifier trusts the on-chain state as the source of truth.
    pub fn verify_against_current(
        env: Env,
        proof: MmrProof,
    ) -> Result<bool, MmrError> {
        let state = load_state(&env);
        if state.leaf_count == 0 {
            return Err(MmrError::EmptyAccumulator);
        }
        let active = active_peaks(&env, &state.peaks);
        let current_root = bag_peaks(&env, &active);
        Self::verify_mmr_proof(env, proof, current_root)
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn is_zero(h: &BytesN<32>) -> bool {
    h.to_array() == [0u8; 32]
}

fn count_active_peaks(peaks: &Vec<BytesN<32>>) -> u32 {
    let mut count = 0u32;
    for p in peaks.iter() {
        if !is_zero(&p) {
            count += 1;
        }
    }
    count
}

fn active_peaks(env: &Env, peaks: &Vec<BytesN<32>>) -> Vec<BytesN<32>> {
    let mut out: Vec<BytesN<32>> = Vec::new(env);
    for p in peaks.iter() {
        if !is_zero(&p) {
            out.push_back(p);
        }
    }
    out
}
