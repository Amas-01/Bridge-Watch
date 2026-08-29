#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, vec, Address, Env, Vec,
};
use bridge_watch_contracts::fee_distribution::{
    DistributionRatios, FeeDistributionContract, FeeDistributionContractClient,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn setup() -> (
    Env,
    FeeDistributionContractClient<'static>,
    Address, // admin
    Address, // treasury
    Address, // staking_token address
    Address, // fee_token address
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let contract_id = env.register_contract(None, FeeDistributionContract);
    let client = FeeDistributionContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    let staking_token = env.register_stellar_asset_contract(admin.clone());
    let fee_token = env.register_stellar_asset_contract(admin.clone());

    let ratios = DistributionRatios {
        stakers_bps: 7000,    // 70%
        governance_bps: 2000, // 20%
        treasury_bps: 1000,   // 10%
    };

    client.initialize(
        &admin,
        &treasury,
        &staking_token,
        &ratios,
        &0u64, // no auto-distribution interval
    );

    client.add_fee_token(&fee_token);

    (env, client, admin, treasury, staking_token, fee_token)
}

fn mint(env: &Env, token: &Address, admin: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token).mint(to, &amount);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

/// Two stakers with equal stakes receive equal shares of the stakers' portion.
#[test]
fn test_equal_stakes_receive_equal_rewards() {
    let (env, client, admin, treasury, staking_token, fee_token) = setup();
    let staker_a = Address::generate(&env);
    let staker_b = Address::generate(&env);
    let collector = Address::generate(&env);

    // Mint staking tokens and stake equal amounts
    mint(&env, &staking_token, &admin, &staker_a, 1_000);
    mint(&env, &staking_token, &admin, &staker_b, 1_000);
    client.stake_for_fees(&staker_a, &1_000, &false);
    client.stake_for_fees(&staker_b, &1_000, &false);

    // Collect 10_000 fee tokens
    client.add_collector(&collector);
    mint(&env, &fee_token, &admin, &collector, 10_000);
    client.collect_fees(&collector, &fee_token, &10_000);

    // Distribute
    client.distribute_fees(&vec![&env]);

    // stakers_bps = 7000 → 7_000 tokens for stakers total
    // Each staker gets 3_500 (50/50 split)
    let pending_a = client.get_pending_rewards(&staker_a, &fee_token);
    let pending_b = client.get_pending_rewards(&staker_b, &fee_token);
    assert_eq!(pending_a, 3_500);
    assert_eq!(pending_b, 3_500);

    // Treasury slice = 10% = 1_000
    let treasury_client = token::Client::new(&env, &fee_token);
    assert_eq!(treasury_client.balance(&treasury), 1_000);

    // Governance pool = 20% = 2_000
    let pool = client.get_fee_pool(&fee_token).unwrap();
    assert_eq!(pool.governance_pool, 2_000);
}

/// Proportional stake weighting: a 3:1 stake ratio produces a 3:1 reward ratio.
#[test]
fn test_proportional_reward_split_by_stake_weight() {
    let (env, client, admin, _treasury, staking_token, fee_token) = setup();
    let staker_a = Address::generate(&env);
    let staker_b = Address::generate(&env);
    let collector = Address::generate(&env);

    mint(&env, &staking_token, &admin, &staker_a, 3_000);
    mint(&env, &staking_token, &admin, &staker_b, 1_000);
    client.stake_for_fees(&staker_a, &3_000, &false);
    client.stake_for_fees(&staker_b, &1_000, &false);

    client.add_collector(&collector);
    mint(&env, &fee_token, &admin, &collector, 8_000);
    client.collect_fees(&collector, &fee_token, &8_000);
    client.distribute_fees(&vec![&env]);

    // stakers_bps = 70% → 5_600 for stakers
    // staker_a stake = 3/4 → 4_200; staker_b = 1/4 → 1_400
    let pending_a = client.get_pending_rewards(&staker_a, &fee_token);
    let pending_b = client.get_pending_rewards(&staker_b, &fee_token);
    assert_eq!(pending_a, 4_200);
    assert_eq!(pending_b, 1_400);
    assert_eq!(pending_a, pending_b * 3);
}

/// When no one is staked, the staker portion overflows to the governance pool.
#[test]
fn test_no_stakers_routes_orphan_fees_to_governance() {
    let (env, client, admin, _treasury, _staking_token, fee_token) = setup();
    let collector = Address::generate(&env);

    client.add_collector(&collector);
    mint(&env, &fee_token, &admin, &collector, 10_000);
    client.collect_fees(&collector, &fee_token, &10_000);
    client.distribute_fees(&vec![&env]);

    let pool = client.get_fee_pool(&fee_token).unwrap();
    // governance gets its own 20% + orphan staker 70% = 90%
    assert_eq!(pool.governance_pool, 9_000);
    assert_eq!(pool.acc_fee_per_share, 0);
}

/// A staker with zero balance gets zero rewards.
#[test]
fn test_zero_stake_yields_zero_rewards() {
    let (env, client, admin, _treasury, staking_token, fee_token) = setup();
    let staker = Address::generate(&env);
    let real_staker = Address::generate(&env);
    let collector = Address::generate(&env);

    // Only real_staker stakes; `staker` never stakes.
    mint(&env, &staking_token, &admin, &real_staker, 500);
    client.stake_for_fees(&real_staker, &500, &false);

    client.add_collector(&collector);
    mint(&env, &fee_token, &admin, &collector, 5_000);
    client.collect_fees(&collector, &fee_token, &5_000);
    client.distribute_fees(&vec![&env]);

    let pending = client.get_pending_rewards(&staker, &fee_token);
    assert_eq!(pending, 0, "unstaked address should receive no rewards");
}

/// Late stakers do not receive fees distributed before their entry.
#[test]
fn test_late_staker_excluded_from_past_distribution() {
    let (env, client, admin, _treasury, staking_token, fee_token) = setup();
    let early = Address::generate(&env);
    let late = Address::generate(&env);
    let collector = Address::generate(&env);

    mint(&env, &staking_token, &admin, &early, 1_000);
    client.stake_for_fees(&early, &1_000, &false);

    client.add_collector(&collector);
    mint(&env, &fee_token, &admin, &collector, 10_000);
    client.collect_fees(&collector, &fee_token, &10_000);

    // Distribute before late staker joins
    client.distribute_fees(&vec![&env]);

    // Late staker joins after distribution
    mint(&env, &staking_token, &admin, &late, 1_000);
    client.stake_for_fees(&late, &1_000, &false);

    let pending_early = client.get_pending_rewards(&early, &fee_token);
    let pending_late = client.get_pending_rewards(&late, &fee_token);

    assert_eq!(pending_early, 7_000, "early staker gets full staker slice");
    assert_eq!(pending_late, 0, "late staker excluded from past round");
}

/// Claiming rewards resets pending balance to zero.
#[test]
fn test_claim_fees_clears_pending_balance() {
    let (env, client, admin, _treasury, staking_token, fee_token) = setup();
    let staker = Address::generate(&env);
    let collector = Address::generate(&env);

    mint(&env, &staking_token, &admin, &staker, 1_000);
    client.stake_for_fees(&staker, &1_000, &false);

    client.add_collector(&collector);
    mint(&env, &fee_token, &admin, &collector, 10_000);
    client.collect_fees(&collector, &fee_token, &10_000);
    client.distribute_fees(&vec![&env]);

    assert!(client.get_pending_rewards(&staker, &fee_token) > 0);

    client.claim_fees(&staker, &fee_token);

    assert_eq!(
        client.get_pending_rewards(&staker, &fee_token),
        0,
        "pending balance should be zero after claim"
    );
}

/// Multiple consecutive distributions accumulate correctly.
#[test]
fn test_multiple_distributions_accumulate() {
    let (env, client, admin, _treasury, staking_token, fee_token) = setup();
    let staker = Address::generate(&env);
    let collector = Address::generate(&env);

    mint(&env, &staking_token, &admin, &staker, 1_000);
    client.stake_for_fees(&staker, &1_000, &false);
    client.add_collector(&collector);

    for _ in 0..3u32 {
        mint(&env, &fee_token, &admin, &collector, 1_000);
        client.collect_fees(&collector, &fee_token, &1_000);
        client.distribute_fees(&vec![&env]);
    }

    // 3 rounds × 1_000 fees × 70% staker share = 2_100
    let pending = client.get_pending_rewards(&staker, &fee_token);
    assert_eq!(pending, 2_100);
}

/// Ratios must sum to 10000 bps; invalid ratios panic.
#[test]
#[should_panic(expected = "ratios must sum to 10000")]
fn test_invalid_ratios_panic() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, FeeDistributionContract);
    let client = FeeDistributionContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let staking_token = env.register_stellar_asset_contract(admin.clone());

    // stakers_bps + governance_bps + treasury_bps = 11000, not 10000
    let bad_ratios = DistributionRatios {
        stakers_bps: 5000,
        governance_bps: 4000,
        treasury_bps: 2000,
    };

    client.initialize(&admin, &treasury, &staking_token, &bad_ratios, &0u64);
}

/// Emergency mode blocks fee collection and distribution.
#[test]
#[should_panic(expected = "contract is in emergency mode")]
fn test_emergency_mode_blocks_collect_fees() {
    let (env, client, admin, _treasury, _staking_token, fee_token) = setup();
    let collector = Address::generate(&env);

    client.add_collector(&collector);
    client.set_emergency(&true);

    mint(&env, &fee_token, &admin, &collector, 1_000);
    client.collect_fees(&collector, &fee_token, &1_000);
}

/// get_pending_rewards returns zero for an address that has never staked,
/// regardless of how many distributions have occurred.
#[test]
fn test_pending_rewards_for_never_staked_address_is_zero() {
    let (env, client, admin, _treasury, staking_token, fee_token) = setup();
    let staker = Address::generate(&env);
    let outsider = Address::generate(&env);
    let collector = Address::generate(&env);

    mint(&env, &staking_token, &admin, &staker, 500);
    client.stake_for_fees(&staker, &500, &false);
    client.add_collector(&collector);
    mint(&env, &fee_token, &admin, &collector, 10_000);
    client.collect_fees(&collector, &fee_token, &10_000);
    client.distribute_fees(&vec![&env]);

    assert_eq!(client.get_pending_rewards(&outsider, &fee_token), 0);
}
