use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BftOracleNode {
    pub node_address: Address,
    pub stake_weight: u32,
    pub registered_at: u64,
    pub is_active: bool,
    pub is_slashed: bool,
    pub slash_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BftAggregateState {
    pub asset_code: String,
    pub consensus_price: i128,
    pub mean_price: i128,
    pub std_dev: u64,
    pub reporting_count: u32,
    pub valid_count: u32,
    pub required_quorum: u32,
    pub is_valid_quorum: bool,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SlashingRecord {
    pub node_address: Address,
    pub asset_code: String,
    pub deviation_sigma_bps: u32,
    pub reason_code: u32,
    pub slashed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OracleHubKey {
    Node(Address),
    AllNodes,
    AggregateState(String),
    SlashRecord(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BftAggregateSubmittedEvent {
    pub asset_code: String,
    pub consensus_price: i128,
    pub valid_count: u32,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NodeSlashedEvent {
    pub node_address: Address,
    pub reason_code: u32,
    pub timestamp: u64,
}

pub fn register_oracle_node(
    env: &Env,
    caller: &Address,
    node_address: &Address,
    stake_weight: u32,
) {
    caller.require_auth();

    let now = env.ledger().timestamp();
    let key = OracleHubKey::Node(node_address.clone());

    let existing: Option<BftOracleNode> = env.storage().persistent().get(&key);
    let node = match existing {
        Some(mut existing_node) => {
            existing_node.is_active = true;
            existing_node.is_slashed = false;
            existing_node.stake_weight = stake_weight;
            existing_node
        }
        None => BftOracleNode {
            node_address: node_address.clone(),
            stake_weight,
            registered_at: now,
            is_active: true,
            is_slashed: false,
            slash_count: 0,
        },
    };

    env.storage().persistent().set(&key, &node);

    let all_key = OracleHubKey::AllNodes;
    let mut all_nodes: Vec<Address> = env
        .storage()
        .persistent()
        .get(&all_key)
        .unwrap_or_else(|| Vec::new(env));

    let mut found = false;
    for addr in all_nodes.iter() {
        if &addr == node_address {
            found = true;
            break;
        }
    }

    if !found {
        all_nodes.push_back(node_address.clone());
        env.storage().persistent().set(&all_key, &all_nodes);
    }
}

pub fn slash_oracle_node(
    env: &Env,
    caller: &Address,
    node_address: &Address,
    asset_code: String,
    deviation_sigma_bps: u32,
    reason_code: u32,
) {
    caller.require_auth();

    let key = OracleHubKey::Node(node_address.clone());
    let mut node: BftOracleNode = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic!("oracle node not registered"));

    let now = env.ledger().timestamp();

    node.is_slashed = true;
    node.is_active = false;
    node.slash_count += 1;

    env.storage().persistent().set(&key, &node);

    let slash_key = OracleHubKey::SlashRecord(node_address.clone());
    let record = SlashingRecord {
        node_address: node_address.clone(),
        asset_code,
        deviation_sigma_bps,
        reason_code,
        slashed_at: now,
    };
    env.storage().persistent().set(&slash_key, &record);

    env.events().publish(
        (symbol_short!("node_slsh"),),
        NodeSlashedEvent {
            node_address: node_address.clone(),
            reason_code,
            timestamp: now,
        },
    );
}

pub fn calculate_required_quorum(total_active_nodes: u32) -> u32 {
    if total_active_nodes == 0 {
        return 0;
    }
    let f = (total_active_nodes.saturating_sub(1)) / 3;
    2 * f + 1
}

pub fn submit_bft_aggregate(
    env: &Env,
    caller: &Address,
    asset_code: String,
    consensus_price: i128,
    mean_price: i128,
    std_dev: u64,
    reporting_nodes: Vec<Address>,
) -> BftAggregateState {
    caller.require_auth();

    let all_key = OracleHubKey::AllNodes;
    let all_nodes: Vec<Address> = env
        .storage()
        .persistent()
        .get(&all_key)
        .unwrap_or_else(|| Vec::new(env));

    let mut total_active: u32 = 0;
    for addr in all_nodes.iter() {
        let node_key = OracleHubKey::Node(addr);
        if let Some(node) = env.storage().persistent().get::<_, BftOracleNode>(&node_key) {
            if node.is_active && !node.is_slashed {
                total_active += 1;
            }
        }
    }

    let required_quorum = calculate_required_quorum(total_active);

    let mut valid_count: u32 = 0;
    let mut seen_nodes: Vec<Address> = Vec::new(env);

    for addr in reporting_nodes.iter() {
        let mut is_duplicate = false;
        for seen in seen_nodes.iter() {
            if &seen == &addr {
                is_duplicate = true;
                break;
            }
        }
        if is_duplicate {
            continue;
        }
        seen_nodes.push_back(addr.clone());

        let node_key = OracleHubKey::Node(addr);
        if let Some(node) = env.storage().persistent().get::<_, BftOracleNode>(&node_key) {
            if node.is_active && !node.is_slashed {
                valid_count += 1;
            }
        }
    }


    let is_valid_quorum = valid_count >= required_quorum && required_quorum > 0;
    let now = env.ledger().timestamp();

    let state = BftAggregateState {
        asset_code: asset_code.clone(),
        consensus_price,
        mean_price,
        std_dev,
        reporting_count: reporting_nodes.len(),
        valid_count,
        required_quorum,
        is_valid_quorum,
        timestamp: now,
    };

    if is_valid_quorum {
        let state_key = OracleHubKey::AggregateState(asset_code.clone());
        env.storage().persistent().set(&state_key, &state);

        env.events().publish(
            (symbol_short!("bft_aggr"),),
            BftAggregateSubmittedEvent {
                asset_code,
                consensus_price,
                valid_count,
                timestamp: now,
            },
        );
    }

    state
}

pub fn get_bft_aggregate(env: &Env, asset_code: String) -> Option<BftAggregateState> {
    let key = OracleHubKey::AggregateState(asset_code);
    env.storage().persistent().get(&key)
}

pub fn get_oracle_node(env: &Env, node_address: Address) -> Option<BftOracleNode> {
    let key = OracleHubKey::Node(node_address);
    env.storage().persistent().get(&key)
}

#[contract]
pub struct OracleHubContract;

#[contractimpl]
impl OracleHubContract {
    pub fn register_oracle_node(
        env: Env,
        caller: Address,
        node_address: Address,
        stake_weight: u32,
    ) {
        register_oracle_node(&env, &caller, &node_address, stake_weight);
    }

    pub fn slash_oracle_node(
        env: Env,
        caller: Address,
        node_address: Address,
        asset_code: String,
        deviation_sigma_bps: u32,
        reason_code: u32,
    ) {
        slash_oracle_node(
            &env,
            &caller,
            &node_address,
            asset_code,
            deviation_sigma_bps,
            reason_code,
        );
    }

    pub fn calculate_required_quorum(total_active_nodes: u32) -> u32 {
        calculate_required_quorum(total_active_nodes)
    }

    pub fn submit_bft_aggregate(
        env: Env,
        caller: Address,
        asset_code: String,
        consensus_price: i128,
        mean_price: i128,
        std_dev: u64,
        reporting_nodes: Vec<Address>,
    ) -> BftAggregateState {
        submit_bft_aggregate(
            &env,
            &caller,
            asset_code,
            consensus_price,
            mean_price,
            std_dev,
            reporting_nodes,
        )
    }

    pub fn get_bft_aggregate(env: Env, asset_code: String) -> Option<BftAggregateState> {
        get_bft_aggregate(&env, asset_code)
    }

    pub fn get_oracle_node(env: Env, node_address: Address) -> Option<BftOracleNode> {
        get_oracle_node(&env, node_address)
    }
}
