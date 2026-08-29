#![cfg(test)]

use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    Address, Env,
};
use bridge_watch_contracts::acl::{
    self, AclKey, Permission, Role,
};

#[contract]
struct TestContract;
#[contractimpl]
impl TestContract {}

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, TestContract);
    env.ledger().set_timestamp(1_000_000);
    (env, admin, contract_id)
}

#[test]
fn test_grant_and_check_role() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::Operator, &admin, 0);
    });

    env.as_contract(&contract_id, || {
        assert!(acl::has_role_internal(&env, &user, &Role::Operator));
        assert!(!acl::has_role_internal(&env, &user, &Role::Admin));
    });
}

#[test]
fn test_revoke_role() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::Operator, &admin, 0);
    });

    env.as_contract(&contract_id, || {
        assert!(acl::has_role_internal(&env, &user, &Role::Operator));
    });

    env.as_contract(&contract_id, || {
        acl::revoke_role_internal(&env, &user, &Role::Operator);
    });

    env.as_contract(&contract_id, || {
        assert!(!acl::has_role_internal(&env, &user, &Role::Operator));
    });
}

#[test]
fn test_expired_role_is_not_active() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::Operator, &admin, 999_999);
    });

    // Advance past expiry
    env.ledger().set_timestamp(2_000_000);

    env.as_contract(&contract_id, || {
        assert!(!acl::has_role_internal(&env, &user, &Role::Operator));
    });
}

#[test]
fn test_role_grant_deduplicates() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::Operator, &admin, 0);
    });
    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::Admin, &admin, 0);
    });

    // Both roles should exist independently
    env.as_contract(&contract_id, || {
        assert!(acl::has_role_internal(&env, &user, &Role::Operator));
        assert!(acl::has_role_internal(&env, &user, &Role::Admin));
    });
}

#[test]
fn test_permission_via_role_inheritance() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    // Operator inherits SubmitHealth
    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::Operator, &admin, 0);
    });

    env.as_contract(&contract_id, || {
        assert!(acl::has_permission_internal(
            &env,
            &user,
            &Permission::SubmitHealth,
        ));
        // Operator does not inherit ManageConfig
        assert!(!acl::has_permission_internal(
            &env,
            &user,
            &Permission::ManageConfig,
        ));
    });
}

#[test]
fn test_superadmin_has_all_permissions() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::SuperAdmin, &admin, 0);
    });

    let all_permissions = [
        Permission::SubmitHealth,
        Permission::SubmitPrice,
        Permission::ManageAssets,
        Permission::ManageAlerts,
        Permission::ManageConfig,
        Permission::ViewAnalytics,
        Permission::ViewHealth,
        Permission::ViewPrice,
        Permission::ManagePermissions,
        Permission::EmergencyPause,
        Permission::ManageUpgrades,
    ];

    env.as_contract(&contract_id, || {
        for perm in all_permissions.iter() {
            assert!(
                acl::has_permission_internal(&env, &user, perm),
                "SuperAdmin should have {:?}",
                perm,
            );
        }
    });
}

#[test]
fn test_readonly_role_permissions() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::ReadOnly, &admin, 0);
    });

    env.as_contract(&contract_id, || {
        assert!(acl::has_permission_internal(&env, &user, &Permission::ViewAnalytics));
        assert!(acl::has_permission_internal(&env, &user, &Permission::ViewHealth));
        assert!(acl::has_permission_internal(&env, &user, &Permission::ViewPrice));
        assert!(!acl::has_permission_internal(&env, &user, &Permission::SubmitHealth));
        assert!(!acl::has_permission_internal(&env, &user, &Permission::ManageAlerts));
    });
}

#[test]
fn test_direct_permission_grant() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_permission_internal(&env, &user, &Permission::EmergencyPause, &admin, 0);
    });

    env.as_contract(&contract_id, || {
        assert!(acl::has_permission_internal(&env, &user, &Permission::EmergencyPause));
        assert!(!acl::has_permission_internal(&env, &user, &Permission::ManageUpgrades));
    });
}

#[test]
fn test_revoke_direct_permission() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_permission_internal(&env, &user, &Permission::EmergencyPause, &admin, 0);
    });

    env.as_contract(&contract_id, || {
        acl::revoke_permission_internal(&env, &user, &Permission::EmergencyPause);
    });

    env.as_contract(&contract_id, || {
        assert!(!acl::has_permission_internal(&env, &user, &Permission::EmergencyPause));
    });
}

#[test]
fn test_expired_permission_grant() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_permission_internal(&env, &user, &Permission::EmergencyPause, &admin, 500_000);
    });

    env.ledger().set_timestamp(1_000_000);

    env.as_contract(&contract_id, || {
        assert!(!acl::has_permission_internal(&env, &user, &Permission::EmergencyPause));
    });
}

#[test]
fn test_permission_deduplicates_on_regrant() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_permission_internal(&env, &user, &Permission::EmergencyPause, &admin, 0);
    });
    env.as_contract(&contract_id, || {
        // Re-grant with a future expiry
        acl::grant_permission_internal(&env, &user, &Permission::EmergencyPause, &admin, 2_000_000);
    });

    env.ledger().set_timestamp(1_500_000);

    env.as_contract(&contract_id, || {
        assert!(acl::has_permission_internal(&env, &user, &Permission::EmergencyPause));
    });
}

#[test]
fn test_no_permissions_for_unknown_address() {
    let (env, admin, contract_id) = setup();
    let stranger = Address::generate(&env);

    env.as_contract(&contract_id, || {
        assert!(!acl::has_role_internal(&env, &stranger, &Role::Operator));
        assert!(!acl::has_permission_internal(&env, &stranger, &Permission::ViewHealth));
    });
}

#[test]
fn test_revoke_nonexistent_role_is_noop() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::revoke_role_internal(&env, &user, &Role::Admin);
    });

    env.as_contract(&contract_id, || {
        assert!(!acl::has_role_internal(&env, &user, &Role::Admin));
    });
}

#[test]
fn test_revoke_nonexistent_permission_is_noop() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::revoke_permission_internal(&env, &user, &Permission::EmergencyPause);
    });

    env.as_contract(&contract_id, || {
        assert!(!acl::has_permission_internal(&env, &user, &Permission::EmergencyPause));
    });
}

#[test]
fn test_multiple_users_with_different_roles() {
    let (env, admin, contract_id) = setup();
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user1, &Role::Admin, &admin, 0);
        acl::grant_role_internal(&env, &user2, &Role::ReadOnly, &admin, 0);
    });

    env.as_contract(&contract_id, || {
        assert!(acl::has_permission_internal(&env, &user1, &Permission::ManageConfig));
        assert!(!acl::has_permission_internal(&env, &user2, &Permission::ManageConfig));
        assert!(acl::has_permission_internal(&env, &user2, &Permission::ViewHealth));
    });
}

#[test]
fn test_role_and_direct_permission_combined() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    // ReadOnly gets ViewHealth, ViewAnalytics, ViewPrice
    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::ReadOnly, &admin, 0);
    });

    // Grant EmergencyPause directly
    env.as_contract(&contract_id, || {
        acl::grant_permission_internal(&env, &user, &Permission::EmergencyPause, &admin, 0);
    });

    env.as_contract(&contract_id, || {
        assert!(acl::has_permission_internal(&env, &user, &Permission::ViewHealth));
        assert!(acl::has_permission_internal(&env, &user, &Permission::EmergencyPause));
        assert!(!acl::has_permission_internal(&env, &user, &Permission::ManageAlerts));
    });
}

#[test]
fn test_role_permissions_mapping() {
    let op_perms = acl::role_permissions(&Role::Operator);
    assert!(op_perms.contains(&Permission::SubmitHealth));
    assert!(op_perms.contains(&Permission::SubmitPrice));
    assert!(op_perms.contains(&Permission::ManageAlerts));
    assert!(op_perms.contains(&Permission::ViewAnalytics));
    assert!(op_perms.contains(&Permission::ViewHealth));
    assert!(op_perms.contains(&Permission::ViewPrice));
    assert!(!op_perms.contains(&Permission::ManageConfig));

    let admin_perms = acl::role_permissions(&Role::Admin);
    assert!(admin_perms.contains(&Permission::ManageConfig));
    assert!(admin_perms.contains(&Permission::ManageAssets));

    let readonly_perms = acl::role_permissions(&Role::ReadOnly);
    assert_eq!(readonly_perms.len(), 3);
    assert!(readonly_perms.contains(&Permission::ViewAnalytics));
}

#[test]
fn test_grant_updates_expiry_for_existing_entry() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    // Grant with no expiry
    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::Operator, &admin, 0);
    });

    // Re-grant with a specific expiry
    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::Operator, &admin, 1_500_000);
    });

    // Before expiry — should be active
    env.ledger().set_timestamp(1_000_000);
    env.as_contract(&contract_id, || {
        assert!(acl::has_role_internal(&env, &user, &Role::Operator));
    });

    // After expiry — should be inactive
    env.ledger().set_timestamp(2_000_000);
    env.as_contract(&contract_id, || {
        assert!(!acl::has_role_internal(&env, &user, &Role::Operator));
    });
}

#[test]
fn test_grant_permission_updates_expiry_for_existing() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_permission_internal(&env, &user, &Permission::EmergencyPause, &admin, 1_200_000);
    });

    env.ledger().set_timestamp(1_300_000);
    env.as_contract(&contract_id, || {
        assert!(!acl::has_permission_internal(&env, &user, &Permission::EmergencyPause));
    });

    // Re-grant with later expiry
    env.ledger().set_timestamp(1_300_000);
    env.as_contract(&contract_id, || {
        acl::grant_permission_internal(&env, &user, &Permission::EmergencyPause, &admin, 2_000_000);
    });

    env.as_contract(&contract_id, || {
        assert!(acl::has_permission_internal(&env, &user, &Permission::EmergencyPause));
    });
}

#[test]
fn test_empty_grants_list_returns_false() {
    let (env, _admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        assert!(!acl::has_role_internal(&env, &user, &Role::Operator));
        assert!(!acl::has_permission_internal(&env, &user, &Permission::SubmitHealth));
    });
}

#[test]
#[should_panic(expected = "unauthorized: caller lacks the required permission")]
fn test_require_permission_panics_for_unauthorized() {
    let (env, _admin, contract_id) = setup();
    let caller = Address::generate(&env);
    let admin = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::require_permission(&env, &caller, &admin, &Permission::SubmitHealth);
    });
}

#[test]
fn test_require_permission_passes_for_admin() {
    let (env, admin, contract_id) = setup();

    env.as_contract(&contract_id, || {
        acl::require_permission(&env, &admin, &admin, &Permission::SubmitHealth);
    });
}

#[test]
fn test_operator_role_covers_expected_permissions() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_role_internal(&env, &user, &Role::Operator, &admin, 0);
    });

    let expected = [
        Permission::SubmitHealth,
        Permission::SubmitPrice,
        Permission::ManageAlerts,
        Permission::ViewAnalytics,
        Permission::ViewHealth,
        Permission::ViewPrice,
    ];

    env.as_contract(&contract_id, || {
        for perm in expected.iter() {
            assert!(
                acl::has_permission_internal(&env, &user, perm),
                "Operator should have {:?}",
                perm,
            );
        }
        assert!(!acl::has_permission_internal(&env, &user, &Permission::ManageConfig));
        assert!(!acl::has_permission_internal(&env, &user, &Permission::ManagePermissions));
    });
}

#[test]
fn test_revoke_one_permission_does_not_affect_others() {
    let (env, admin, contract_id) = setup();
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        acl::grant_permission_internal(&env, &user, &Permission::EmergencyPause, &admin, 0);
        acl::grant_permission_internal(&env, &user, &Permission::ManageUpgrades, &admin, 0);
    });

    env.as_contract(&contract_id, || {
        acl::revoke_permission_internal(&env, &user, &Permission::EmergencyPause);
    });

    env.as_contract(&contract_id, || {
        assert!(!acl::has_permission_internal(&env, &user, &Permission::EmergencyPause));
        assert!(acl::has_permission_internal(&env, &user, &Permission::ManageUpgrades));
    });
}
