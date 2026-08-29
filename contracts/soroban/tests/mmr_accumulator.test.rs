#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _,
    Address, BytesN, Env, Vec,
};
use bridge_watch_contracts::mmr_accumulator::{
    MmrAccumulatorContract, MmrAccumulatorContractClient, MmrError, MmrProof,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn setup() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    (env, admin)
}

fn deploy(env: &Env, admin: &Address) -> MmrAccumulatorContractClient<'_> {
    let id = env.register_contract(None, MmrAccumulatorContract);
    let client = MmrAccumulatorContractClient::new(env, &id);
    client.initialize(admin).unwrap();
    client
}

fn leaf(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_and_double_init_fails() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);

    let err = client.try_initialize(&admin).unwrap_err().unwrap();
    assert_eq!(err, MmrError::AlreadyInitialized);
}

#[test]
fn test_get_admin() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);
    assert_eq!(client.get_admin().unwrap(), admin);
}

// ---------------------------------------------------------------------------
// Append
// ---------------------------------------------------------------------------

#[test]
fn test_append_single_leaf_returns_index_zero() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);

    let idx = client.append(&admin, &leaf(&env, 0x01)).unwrap();
    assert_eq!(idx, 0u64);
    assert_eq!(client.get_leaf_count(), 1u64);
}

#[test]
fn test_append_multiple_leaves_increments_count() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);

    for i in 0u8..8 {
        let idx = client.append(&admin, &leaf(&env, i)).unwrap();
        assert_eq!(idx, i as u64);
    }
    assert_eq!(client.get_leaf_count(), 8u64);
}

#[test]
fn test_root_changes_after_each_append() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);

    client.append(&admin, &leaf(&env, 0xAA)).unwrap();
    let root1 = client.get_root().unwrap();

    client.append(&admin, &leaf(&env, 0xBB)).unwrap();
    let root2 = client.get_root().unwrap();

    assert_ne!(root1, root2);
}

#[test]
fn test_same_commitment_produces_deterministic_root() {
    let (env1, admin1) = setup();
    let client1 = deploy(&env1, &admin1);
    client1.append(&admin1, &leaf(&env1, 0x11)).unwrap();
    client1.append(&admin1, &leaf(&env1, 0x22)).unwrap();
    let root1 = client1.get_root().unwrap();

    let (env2, admin2) = setup();
    let client2 = deploy(&env2, &admin2);
    client2.append(&admin2, &leaf(&env2, 0x11)).unwrap();
    client2.append(&admin2, &leaf(&env2, 0x22)).unwrap();
    let root2 = client2.get_root().unwrap();

    assert_eq!(root1, root2);
}

#[test]
fn test_get_root_empty_fails() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);
    let err = client.try_get_root().unwrap_err().unwrap();
    assert_eq!(err, MmrError::EmptyAccumulator);
}

// ---------------------------------------------------------------------------
// Proof verification (simple case: single-leaf tree)
// ---------------------------------------------------------------------------

#[test]
fn test_verify_single_leaf_proof() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);

    let commitment = leaf(&env, 0xDE);
    client.append(&admin, &commitment).unwrap();
    let root = client.get_root().unwrap();

    // For a single leaf, the proof has no siblings and the leaf IS the peak.
    // peaks_snapshot contains the single peak, local_peak_pos = 0.
    let peaks = client.get_peaks();

    // Derive the stored leaf_hash the same way the contract does internally.
    // We'll build the proof manually: leaf hash = SHA-256(0x00 || commitment).
    let mut buf = soroban_sdk::Bytes::new(&env);
    buf.push_back(0x00u8);
    buf.append(&commitment.clone().into());
    let leaf_hash = env.crypto().sha256(&buf);

    let proof = MmrProof {
        leaf_hash,
        leaf_index: 0,
        siblings: Vec::new(&env),
        peaks_snapshot: peaks,
        local_peak_pos: 0,
    };

    let valid = client.verify_mmr_proof(&proof, &root).unwrap();
    assert!(valid);
}

#[test]
fn test_verify_proof_wrong_root_fails() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);

    let commitment = leaf(&env, 0xAB);
    client.append(&admin, &commitment).unwrap();

    let bad_root = leaf(&env, 0xFF);
    let peaks = client.get_peaks();

    let mut buf = soroban_sdk::Bytes::new(&env);
    buf.push_back(0x00u8);
    buf.append(&commitment.clone().into());
    let leaf_hash = env.crypto().sha256(&buf);

    let proof = MmrProof {
        leaf_hash,
        leaf_index: 0,
        siblings: Vec::new(&env),
        peaks_snapshot: peaks,
        local_peak_pos: 0,
    };

    let valid = client.verify_mmr_proof(&proof, &bad_root).unwrap();
    assert!(!valid);
}

#[test]
fn test_verify_tampered_leaf_fails() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);

    client.append(&admin, &leaf(&env, 0x01)).unwrap();
    let root = client.get_root().unwrap();
    let peaks = client.get_peaks();

    // Use a different leaf hash (tampered).
    let tampered_leaf = leaf(&env, 0xFF);

    let proof = MmrProof {
        leaf_hash: tampered_leaf,
        leaf_index: 0,
        siblings: Vec::new(&env),
        peaks_snapshot: peaks,
        local_peak_pos: 0,
    };

    let valid = client.verify_mmr_proof(&proof, &root).unwrap();
    assert!(!valid);
}

// ---------------------------------------------------------------------------
// Two-leaf tree proof (one sibling)
// ---------------------------------------------------------------------------

#[test]
fn test_two_leaf_tree_peak_count_is_one() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);

    client.append(&admin, &leaf(&env, 0x01)).unwrap();
    client.append(&admin, &leaf(&env, 0x02)).unwrap();

    // After 2 leaves the MMR has one merged peak (a complete binary tree of height 1).
    let peaks = client.get_peaks();
    let active: Vec<BytesN<32>> = peaks
        .iter()
        .filter(|p| p.to_array() != [0u8; 32])
        .collect::<std::vec::Vec<_>>()
        .into_iter()
        .fold(Vec::new(&env), |mut v, p| { v.push_back(p); v });
    assert_eq!(active.len(), 1);
}

// ---------------------------------------------------------------------------
// Large tree: 1000 leaves — root must be deterministic
// ---------------------------------------------------------------------------

#[test]
fn test_thousand_leaf_root_is_deterministic() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);

    for i in 0u8..=255 {
        client.append(&admin, &leaf(&env, i)).unwrap();
    }
    // Continue with wrapping values to reach 1000+ appends
    for i in 0u8..=255 {
        client.append(&admin, &leaf(&env, i.wrapping_add(1))).unwrap();
    }
    for i in 0u8..=255 {
        client.append(&admin, &leaf(&env, i.wrapping_add(2))).unwrap();
    }
    for i in 0u8..=232 {
        client.append(&admin, &leaf(&env, i.wrapping_add(3))).unwrap();
    }

    let root_a = client.get_root().unwrap();
    assert_eq!(client.get_leaf_count(), 1001u64);

    // Second independent accumulator with same leaves.
    let (env2, admin2) = setup();
    let client2 = deploy(&env2, &admin2);
    for i in 0u8..=255 {
        client2.append(&admin2, &leaf(&env2, i)).unwrap();
    }
    for i in 0u8..=255 {
        client2.append(&admin2, &leaf(&env2, i.wrapping_add(1))).unwrap();
    }
    for i in 0u8..=255 {
        client2.append(&admin2, &leaf(&env2, i.wrapping_add(2))).unwrap();
    }
    for i in 0u8..=232 {
        client2.append(&admin2, &leaf(&env2, i.wrapping_add(3))).unwrap();
    }

    let root_b = client2.get_root().unwrap();
    assert_eq!(root_a, root_b);
}

// ---------------------------------------------------------------------------
// verify_against_current convenience method
// ---------------------------------------------------------------------------

#[test]
fn test_verify_against_current() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);

    let commitment = leaf(&env, 0xCC);
    client.append(&admin, &commitment).unwrap();
    let peaks = client.get_peaks();

    let mut buf = soroban_sdk::Bytes::new(&env);
    buf.push_back(0x00u8);
    buf.append(&commitment.clone().into());
    let leaf_hash = env.crypto().sha256(&buf);

    let proof = MmrProof {
        leaf_hash,
        leaf_index: 0,
        siblings: Vec::new(&env),
        peaks_snapshot: peaks,
        local_peak_pos: 0,
    };

    let valid = client.verify_against_current(&proof).unwrap();
    assert!(valid);
}

#[test]
fn test_verify_against_current_empty_fails() {
    let (env, admin) = setup();
    let client = deploy(&env, &admin);

    let proof = MmrProof {
        leaf_hash: leaf(&env, 0x00),
        leaf_index: 0,
        siblings: Vec::new(&env),
        peaks_snapshot: Vec::new(&env),
        local_peak_pos: 0,
    };
    let err = client.try_verify_against_current(&proof).unwrap_err().unwrap();
    assert_eq!(err, MmrError::EmptyAccumulator);
}
