#![cfg(test)]

use soroban_sdk::{testutils::Address as _, vec, Address, Env, String};
use bridge_watch_contracts::oracle_hub::{
    calculate_required_quorum, OracleHubContract, OracleHubContractClient,
};

fn setup_client() -> (
    Env,
    OracleHubContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, OracleHubContract);
    let client = OracleHubContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let node1 = Address::generate(&env);
    let node2 = Address::generate(&env);
    let node3 = Address::generate(&env);
    let node4 = Address::generate(&env);

    (env, client, admin, node1, node2, node3, node4)
}

#[test]
fn test_quorum_calculation() {
    assert_eq!(calculate_required_quorum(0), 0);
    assert_eq!(calculate_required_quorum(1), 1);
    assert_eq!(calculate_required_quorum(2), 1);
    assert_eq!(calculate_required_quorum(3), 1);
    assert_eq!(calculate_required_quorum(4), 3); // N=4, f=1, 2f+1=3
    assert_eq!(calculate_required_quorum(7), 5); // N=7, f=2, 2f+1=5
    assert_eq!(calculate_required_quorum(10), 7); // N=10, f=3, 2f+1=7
}

#[test]
fn test_register_and_get_oracle_node() {
    let (_env, client, admin, node1, _, _, _) = setup_client();

    client.register_oracle_node(&admin, &node1, &100);

    let info = client.get_oracle_node(&node1).expect("node should be registered");
    assert_eq!(info.node_address, node1);
    assert_eq!(info.stake_weight, 100);
    assert!(info.is_active);
    assert!(!info.is_slashed);
    assert_eq!(info.slash_count, 0);
}

#[test]
fn test_submit_bft_aggregate_valid_quorum() {
    let (env, client, admin, node1, node2, node3, node4) = setup_client();

    // Register 4 nodes (N=4, f=1, required quorum = 3)
    client.register_oracle_node(&admin, &node1, &10);
    client.register_oracle_node(&admin, &node2, &10);
    client.register_oracle_node(&admin, &node3, &10);
    client.register_oracle_node(&admin, &node4, &10);

    let asset = String::from_str(&env, "USDC");
    let reporting = vec![&env, node1.clone(), node2.clone(), node3.clone()];

    let state = client.submit_bft_aggregate(
        &admin,
        &asset,
        &100_000_000,
        &100_005_000,
        &2_000,
        &reporting,
    );

    assert!(state.is_valid_quorum);
    assert_eq!(state.valid_count, 3);
    assert_eq!(state.required_quorum, 3);

    let stored = client.get_bft_aggregate(&asset).expect("state should be stored");
    assert_eq!(stored.consensus_price, 100_000_000);
}

#[test]
fn test_submit_bft_aggregate_insufficient_quorum() {
    let (env, client, admin, node1, node2, node3, node4) = setup_client();

    // Register 4 nodes (N=4, required quorum = 3)
    client.register_oracle_node(&admin, &node1, &10);
    client.register_oracle_node(&admin, &node2, &10);
    client.register_oracle_node(&admin, &node3, &10);
    client.register_oracle_node(&admin, &node4, &10);

    let asset = String::from_str(&env, "XLM");
    // Only 2 nodes report (below required quorum of 3)
    let reporting = vec![&env, node1, node2];

    let state = client.submit_bft_aggregate(
        &admin,
        &asset,
        &50_000_000,
        &50_000_000,
        &1_000,
        &reporting,
    );

    assert!(!state.is_valid_quorum);
    assert_eq!(state.valid_count, 2);
    assert_eq!(state.required_quorum, 3);
    assert!(client.get_bft_aggregate(&asset).is_none());
}

#[test]
fn test_slash_oracle_node() {
    let (env, client, admin, node1, _, _, _) = setup_client();

    client.register_oracle_node(&admin, &node1, &50);

    let asset = String::from_str(&env, "USDC");
    client.slash_oracle_node(&admin, &node1, &asset, &550, &1);

    let info = client.get_oracle_node(&node1).expect("node should exist");
    assert!(info.is_slashed);
    assert!(!info.is_active);
    assert_eq!(info.slash_count, 1);
}

#[test]
fn test_submit_bft_aggregate_sybil_duplicate_nodes_rejected() {
    let (env, client, admin, node1, node2, node3, node4) = setup_client();

    client.register_oracle_node(&admin, &node1, &10);
    client.register_oracle_node(&admin, &node2, &10);
    client.register_oracle_node(&admin, &node3, &10);
    client.register_oracle_node(&admin, &node4, &10);

    let asset = String::from_str(&env, "USDT");
    let reporting = vec![&env, node1.clone(), node1.clone(), node1.clone()];

    let state = client.submit_bft_aggregate(
        &admin,
        &asset,
        &100_000_000,
        &100_000_000,
        &1_000,
        &reporting,
    );

    assert!(!state.is_valid_quorum);
    assert_eq!(state.valid_count, 1);
    assert_eq!(state.required_quorum, 3);
}

