#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

use bridge_watch_soroban::governance::{
    GovernanceContract, GovernanceContractClient, ProposalStatus, ProposalType, VoteChoice,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn setup() -> (Env, GovernanceContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_000_000);

    let contract_id = env.register_contract(None, GovernanceContract);
    let client = GovernanceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(
        &admin,
        &100,   // timelock_delay
        &200,   // voting_period
        &10,    // voting_delay
        &1_000, // quorum_bps (10 %)
        &5_100, // pass_threshold_bps (51 %)
        &100,   // proposal_deposit
        &false, // use_quadratic
        &2,     // guardian_threshold (2-of-3)
    );

    (env, client, admin)
}

fn advance(env: &Env, secs: u64) {
    env.ledger().with_mut(|li| li.timestamp += secs);
}

fn mk(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

fn create_emergency_proposal(
    env: &Env,
    client: &GovernanceContractClient,
    proposer: &Address,
) -> u32 {
    let target = Address::generate(env);
    client.create_proposal(
        proposer,
        &ProposalType::EmergencyPause,
        &mk(env, "Emergency Halt"),
        &mk(env, "Emergency pause proposal"),
        &target,
        &mk(env, ""),
    )
}

// ── Guardian registration and approval ─────────────────────────────────────────

#[test]
fn test_guardian_can_approve_proposal() {
    let (env, client, _admin) = setup();
    let guardian = Address::generate(&env);
    let proposer = Address::generate(&env);

    // Register guardian
    client.set_guardian(&guardian, &true);

    // Create emergency proposal
    let proposal_id = create_emergency_proposal(&env, &client, &proposer);

    // Activate proposal
    advance(&env, 15);
    client.activate_proposal(&proposal_id);

    // Guardian approves
    client.guardian_approve(&guardian, &proposal_id);

    // Verify proposal still active after approval
    assert_eq!(client.get_proposal(&proposal_id).status, ProposalStatus::Active);
}

#[test]
fn test_non_guardian_cannot_approve_proposal() {
    let (env, client, _admin) = setup();
    let non_guardian = Address::generate(&env);
    let proposer = Address::generate(&env);

    // Create and activate emergency proposal
    let proposal_id = create_emergency_proposal(&env, &client, &proposer);
    advance(&env, 15);
    client.activate_proposal(&proposal_id);

    // Non-guardian tries to approve - should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.guardian_approve(&non_guardian, &proposal_id);
    }));
    assert!(result.is_err());
}

#[test]
fn test_guardian_cannot_approve_same_proposal_twice() {
    let (env, client, _admin) = setup();
    let guardian = Address::generate(&env);
    let proposer = Address::generate(&env);

    client.set_guardian(&guardian, &true);
    let proposal_id = create_emergency_proposal(&env, &client, &proposer);
    advance(&env, 15);
    client.activate_proposal(&proposal_id);

    // First approval succeeds
    client.guardian_approve(&guardian, &proposal_id);

    // Second approval attempt should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.guardian_approve(&guardian, &proposal_id);
    }));
    assert!(result.is_err());
}

// ── Threshold counting ─────────────────────────────────────────────────────────

#[test]
fn test_guardian_execution_requires_threshold() {
    let (env, client, _admin) = setup();
    let guardian1 = Address::generate(&env);
    let guardian2 = Address::generate(&env);
    let guardian3 = Address::generate(&env);
    let proposer = Address::generate(&env);

    // Register three guardians with threshold of 2
    client.set_guardian(&guardian1, &true);
    client.set_guardian(&guardian2, &true);
    client.set_guardian(&guardian3, &true);

    // Create and activate emergency proposal
    let proposal_id = create_emergency_proposal(&env, &client, &proposer);
    advance(&env, 15);
    client.activate_proposal(&proposal_id);

    // Only one guardian approves - insufficient for threshold of 2
    client.guardian_approve(&guardian1, &proposal_id);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.guardian_execute(&guardian1, &proposal_id);
    }));
    assert!(result.is_err());
}

#[test]
fn test_guardian_execution_succeeds_with_threshold() {
    let (env, client, _admin) = setup();
    let guardian1 = Address::generate(&env);
    let guardian2 = Address::generate(&env);
    let guardian3 = Address::generate(&env);
    let proposer = Address::generate(&env);

    // Register three guardians with threshold of 2
    client.set_guardian(&guardian1, &true);
    client.set_guardian(&guardian2, &true);
    client.set_guardian(&guardian3, &true);

    // Create and activate emergency proposal
    let proposal_id = create_emergency_proposal(&env, &client, &proposer);
    advance(&env, 15);
    client.activate_proposal(&proposal_id);

    // Two guardians approve - meets threshold
    client.guardian_approve(&guardian1, &proposal_id);
    client.guardian_approve(&guardian2, &proposal_id);

    // Execution succeeds with threshold met
    client.guardian_execute(&guardian1, &proposal_id);

    // Verify proposal is now executed
    assert_eq!(client.get_proposal(&proposal_id).status, ProposalStatus::Executed);
}

#[test]
fn test_threshold_counting_with_multiple_guardians() {
    let (env, client, _admin) = setup();
    let guardians: Vec<Address> = (0..4)
        .map(|_| Address::generate(&env))
        .collect();
    let proposer = Address::generate(&env);

    // Register all guardians
    for guardian in &guardians {
        client.set_guardian(guardian, &true);
    }

    // Create emergency proposal with threshold still 2
    let proposal_id = create_emergency_proposal(&env, &client, &proposer);
    advance(&env, 15);
    client.activate_proposal(&proposal_id);

    // First guardian approves
    client.guardian_approve(&guardians[0], &proposal_id);

    // Second guardian approves - threshold met
    client.guardian_approve(&guardians[1], &proposal_id);

    // Verify execution succeeds
    client.guardian_execute(&guardians[0], &proposal_id);
    assert_eq!(client.get_proposal(&proposal_id).status, ProposalStatus::Executed);
}

// ── Unauthorized caller rejection ──────────────────────────────────────────────

#[test]
fn test_non_guardian_cannot_execute_proposal() {
    let (env, client, _admin) = setup();
    let guardian = Address::generate(&env);
    let non_guardian = Address::generate(&env);
    let proposer = Address::generate(&env);

    client.set_guardian(&guardian, &true);
    let proposal_id = create_emergency_proposal(&env, &client, &proposer);
    advance(&env, 15);
    client.activate_proposal(&proposal_id);

    // Guardian approves
    client.guardian_approve(&guardian, &proposal_id);

    // Non-guardian tries to execute - should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.guardian_execute(&non_guardian, &proposal_id);
    }));
    assert!(result.is_err());
}

#[test]
fn test_guardian_approval_requires_guardian_auth() {
    let (env, client, _admin) = setup();
    let non_guardian = Address::generate(&env);
    let proposer = Address::generate(&env);

    // Create proposal
    let proposal_id = create_emergency_proposal(&env, &client, &proposer);
    advance(&env, 15);
    client.activate_proposal(&proposal_id);

    // Unauthenticated address tries to approve - should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.guardian_approve(&non_guardian, &proposal_id);
    }));
    assert!(result.is_err());
}

#[test]
fn test_guardian_execution_only_for_emergency_proposals() {
    let (env, client, _admin) = setup();
    let guardian = Address::generate(&env);
    let proposer = Address::generate(&env);

    client.set_guardian(&guardian, &true);

    // Create a non-emergency proposal
    let target = Address::generate(&env);
    let proposal_id = client.create_proposal(
        &proposer,
        &ProposalType::ParameterChange,
        &mk(&env, "Parameter Change"),
        &mk(&env, "description"),
        &target,
        &mk(&env, ""),
    );

    advance(&env, 15);
    client.activate_proposal(&proposal_id);
    client.guardian_approve(&guardian, &proposal_id);

    // Try to execute non-emergency proposal - should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.guardian_execute(&guardian, &proposal_id);
    }));
    assert!(result.is_err());
}

#[test]
fn test_guardian_cannot_execute_uninitialized_proposal() {
    let (env, client, _admin) = setup();
    let guardian = Address::generate(&env);

    client.set_guardian(&guardian, &true);

    // Try to execute non-existent proposal - should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.guardian_execute(&guardian, &999);
    }));
    assert!(result.is_err());
}

// ── Guardian registration ──────────────────────────────────────────────────────

#[test]
fn test_guardian_can_be_registered_and_unregistered() {
    let (env, client, admin) = setup();
    let guardian = Address::generate(&env);
    let proposer = Address::generate(&env);

    // Register guardian
    client.set_guardian(&guardian, &true);

    // Guardian can approve
    let proposal_id = create_emergency_proposal(&env, &client, &proposer);
    advance(&env, 15);
    client.activate_proposal(&proposal_id);
    client.guardian_approve(&guardian, &proposal_id);

    // Unregister guardian
    client.set_guardian(&guardian, &false);

    // Guardian can no longer approve other proposals
    let proposal_id2 = create_emergency_proposal(&env, &client, &proposer);
    advance(&env, 15);
    client.activate_proposal(&proposal_id2);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.guardian_approve(&guardian, &proposal_id2);
    }));
    assert!(result.is_err());
}

// ── Signature validation ────────────────────────────────────────────────────────

#[test]
fn test_guardian_threshold_update() {
    let (env, client, _admin) = setup();
    let guardian1 = Address::generate(&env);
    let guardian2 = Address::generate(&env);

    client.set_guardian(&guardian1, &true);
    client.set_guardian(&guardian2, &true);

    // Update guardian threshold to 2 (already is)
    client.update_config(&100, &200, &10, &1_000, &5_100, &100, &false, &2);

    let proposal_id = create_emergency_proposal(&env, &client, &Address::generate(&env));
    advance(&env, 15);
    client.activate_proposal(&proposal_id);

    // One approval is insufficient
    client.guardian_approve(&guardian1, &proposal_id);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.guardian_execute(&guardian1, &proposal_id);
    }));
    assert!(result.is_err());

    // Two approvals are sufficient
    client.guardian_approve(&guardian2, &proposal_id);
    client.guardian_execute(&guardian1, &proposal_id);

    assert_eq!(client.get_proposal(&proposal_id).status, ProposalStatus::Executed);
}
