#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _, Address, Bytes, BytesN, Env, String, Vec,
};

use bridge_watch_contracts::zk_verifier::{
    CurveType, ProofScheme, ZkProof, ZkPublicInputs, ZkVerificationKey, ZkVerifierContract,
    ZkVerifierContractClient, ZkVerifierError,
};

fn setup_env() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    (env, admin, operator)
}

fn deploy_contract<'a>(env: &'a Env, admin: &Address) -> ZkVerifierContractClient<'a> {
    let contract_id = env.register_contract(None, ZkVerifierContract);
    let client = ZkVerifierContractClient::new(env, &contract_id);
    client.initialize(admin);
    client
}

fn sample_vk(env: &Env, scheme: ProofScheme, curve: CurveType) -> ZkVerificationKey {
    let alpha = Bytes::from_slice(env, b"sample_alpha_g1_key_data_32bytes");
    let beta = Bytes::from_slice(env, b"sample_beta_g2_key_data_64bytes_0123456789abcdef0123456789abcdef");
    let gamma = Bytes::from_slice(env, b"sample_gamma_g2_key_data_64bytes_0123456789abcdef0123456789abcdef");
    let delta = Bytes::from_slice(env, b"sample_delta_g2_key_data_64bytes_0123456789abcdef0123456789abcdef");

    let mut ic = Vec::new(env);
    ic.push_back(Bytes::from_slice(env, b"sample_ic_0_g1_data_32_bytes_12"));

    let vk_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(env, b"test_verification_key_hash"));

    ZkVerificationKey {
        scheme,
        curve,
        vk_alpha_g1: alpha,
        vk_beta_g2: beta,
        vk_gamma_g2: gamma,
        vk_delta_g2: delta,
        vk_ic: ic,
        vk_hash,
    }
}

fn sample_proof(
    env: &Env,
    scheme: ProofScheme,
    curve: CurveType,
    commitment_hash: BytesN<32>,
) -> ZkProof {
    ZkProof {
        scheme,
        curve,
        pi_a: Bytes::from_slice(env, b"mock_groth16_pi_a_proof_component_data"),
        pi_b: Bytes::from_slice(env, b"mock_groth16_pi_b_proof_component_data"),
        pi_c: Bytes::from_slice(env, b"mock_groth16_pi_c_proof_component_data"),
        commitment_hash,
    }
}

#[test]
fn test_initialize_and_get_admin() {
    let (env, admin, _operator) = setup_env();
    let client = deploy_contract(&env, &admin);

    assert_eq!(client.get_admin(), admin);
}

#[test]
#[should_panic]
fn test_double_initialize_panics() {
    let (env, admin, _operator) = setup_env();
    let client = deploy_contract(&env, &admin);
    client.initialize(&admin);
}

#[test]
fn test_register_and_get_verification_key() {
    let (env, admin, _operator) = setup_env();
    let client = deploy_contract(&env, &admin);

    let bridge_id = String::from_str(&env, "usdy-stellar-bridge");
    let vk = sample_vk(&env, ProofScheme::Groth16, CurveType::Bn254);

    client.register_verification_key(&admin, &bridge_id, &vk);

    let fetched_vk = client.get_verification_key(&bridge_id).unwrap();
    assert_eq!(fetched_vk.scheme, ProofScheme::Groth16);
    assert_eq!(fetched_vk.curve, CurveType::Bn254);
    assert_eq!(fetched_vk.vk_hash, vk.vk_hash);
}

#[test]
fn test_verify_zk_reserve_proof_success_groth16() {
    let (env, admin, operator) = setup_env();
    let client = deploy_contract(&env, &admin);

    let bridge_id = String::from_str(&env, "fobxx-treasury-bridge");
    let vk = sample_vk(&env, ProofScheme::Groth16, CurveType::Bn254);
    client.register_verification_key(&admin, &bridge_id, &vk);

    let commitment_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(env, b"offchain_bank_balances_commitment"));
    let proof = sample_proof(&env, ProofScheme::Groth16, CurveType::Bn254, commitment_hash.clone());

    let public_inputs = ZkPublicInputs {
        total_reserves: 15_000_000_000,
        on_chain_supply: 10_000_000_000,
        min_reserve_ratio_bps: 10_000,
        timestamp: 1700000000,
        bridge_id: bridge_id.clone(),
        asset_code: String::from_str(&env, "FOBXX"),
    };

    let attestation_id = client.verify_zk_reserve_proof(&operator, &proof, &public_inputs);
    assert_ne!(attestation_id.to_array(), [0u8; 32]);

    let attestation = client.get_attestation(&attestation_id).unwrap();
    assert_eq!(attestation.bridge_id, bridge_id);
    assert_eq!(attestation.total_reserves, 15_000_000_000);
    assert_eq!(attestation.on_chain_supply, 10_000_000_000);
    assert_eq!(attestation.reserve_ratio_bps, 15_000);
    assert!(attestation.is_valid);

    let latest = client.get_latest_attestation(&bridge_id).unwrap();
    assert_eq!(latest.attestation_id, attestation_id);
}

#[test]
fn test_verify_zk_reserve_proof_success_plonk() {
    let (env, admin, operator) = setup_env();
    let client = deploy_contract(&env, &admin);

    let bridge_id = String::from_str(&env, "ondo-usdy-bridge");
    let vk = sample_vk(&env, ProofScheme::Plonk, CurveType::Bls12_381);
    client.register_verification_key(&admin, &bridge_id, &vk);

    let commitment_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(env, b"ondo_custodian_reserves_hash"));
    let proof = sample_proof(&env, ProofScheme::Plonk, CurveType::Bls12_381, commitment_hash);

    let public_inputs = ZkPublicInputs {
        total_reserves: 25_000_000_000,
        on_chain_supply: 20_000_000_000,
        min_reserve_ratio_bps: 10_000,
        timestamp: 1700000100,
        bridge_id: bridge_id.clone(),
        asset_code: String::from_str(&env, "USDY"),
    };

    let attestation_id = client.verify_zk_reserve_proof(&operator, &proof, &public_inputs);
    let attestation = client.get_attestation(&attestation_id).unwrap();
    assert_eq!(attestation.reserve_ratio_bps, 12_500);
    assert!(attestation.is_valid);
}

#[test]
fn test_verify_zk_reserve_proof_fails_when_reserves_less_than_supply() {
    let (env, admin, operator) = setup_env();
    let client = deploy_contract(&env, &admin);

    let bridge_id = String::from_str(&env, "undercollateralized-bridge");
    let vk = sample_vk(&env, ProofScheme::Groth16, CurveType::Bn254);
    client.register_verification_key(&admin, &bridge_id, &vk);

    let commitment_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(env, b"insufficient_reserve_leaf"));
    let proof = sample_proof(&env, ProofScheme::Groth16, CurveType::Bn254, commitment_hash);

    let public_inputs = ZkPublicInputs {
        total_reserves: 8_000_000_000,
        on_chain_supply: 10_000_000_000,
        min_reserve_ratio_bps: 10_000,
        timestamp: 1700000200,
        bridge_id,
        asset_code: String::from_str(&env, "USDC"),
    };

    let result = client.try_verify_zk_reserve_proof(&operator, &proof, &public_inputs);
    assert_eq!(result, Err(Ok(ZkVerifierError::ConstraintFailed)));
}

#[test]
fn test_verify_zk_reserve_proof_fails_when_below_min_ratio() {
    let (env, admin, operator) = setup_env();
    let client = deploy_contract(&env, &admin);

    let bridge_id = String::from_str(&env, "ratio-test-bridge");
    let vk = sample_vk(&env, ProofScheme::Groth16, CurveType::Bn254);
    client.register_verification_key(&admin, &bridge_id, &vk);

    let commitment_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(env, b"ratio_commitment"));
    let proof = sample_proof(&env, ProofScheme::Groth16, CurveType::Bn254, commitment_hash);

    let public_inputs = ZkPublicInputs {
        total_reserves: 10_500_000_000,
        on_chain_supply: 10_000_000_000,
        min_reserve_ratio_bps: 11_000,
        timestamp: 1700000300,
        bridge_id,
        asset_code: String::from_str(&env, "USDC"),
    };

    let result = client.try_verify_zk_reserve_proof(&operator, &proof, &public_inputs);
    assert_eq!(result, Err(Ok(ZkVerifierError::ConstraintFailed)));
}

#[test]
fn test_verify_zk_reserve_proof_fails_with_empty_proof_components() {
    let (env, admin, operator) = setup_env();
    let client = deploy_contract(&env, &admin);

    let bridge_id = String::from_str(&env, "empty-proof-bridge");
    let vk = sample_vk(&env, ProofScheme::Groth16, CurveType::Bn254);
    client.register_verification_key(&admin, &bridge_id, &vk);

    let commitment_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(env, b"empty_proof_commitment"));
    let empty_proof = ZkProof {
        scheme: ProofScheme::Groth16,
        curve: CurveType::Bn254,
        pi_a: Bytes::new(&env),
        pi_b: Bytes::from_slice(&env, b"b"),
        pi_c: Bytes::from_slice(&env, b"c"),
        commitment_hash,
    };

    let public_inputs = ZkPublicInputs {
        total_reserves: 15_000_000_000,
        on_chain_supply: 10_000_000_000,
        min_reserve_ratio_bps: 10_000,
        timestamp: 1700000400,
        bridge_id,
        asset_code: String::from_str(&env, "USDC"),
    };

    let result = client.try_verify_zk_reserve_proof(&operator, &empty_proof, &public_inputs);
    assert_eq!(result, Err(Ok(ZkVerifierError::InvalidProof)));
}
