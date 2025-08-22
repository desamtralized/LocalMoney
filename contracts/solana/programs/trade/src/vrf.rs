use anchor_lang::prelude::*;

// VRF-based arbitrator selection account
#[account]
pub struct VrfArbitratorSelection {
    pub trade_id: u64,
    pub vrf_account: Pubkey,
    pub randomness_request: Option<[u8; 32]>,
    pub randomness_result: Option<[u8; 32]>,
    pub selected_arbitrator: Option<Pubkey>,
    pub request_timestamp: i64,
    pub selection_status: SelectionStatus,
    pub bump: u8,
}

impl VrfArbitratorSelection {
    pub const INIT_SPACE: usize = 8 + // discriminator
        8 + // trade_id
        32 + // vrf_account
        (1 + 32) + // randomness_request (Option<[u8; 32]>)
        (1 + 32) + // randomness_result (Option<[u8; 32]>)
        (1 + 32) + // selected_arbitrator (Option<Pubkey>)
        8 + // request_timestamp
        1 + // selection_status enum
        1; // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Debug)]
pub enum SelectionStatus {
    Pending,
    RandomnessRequested,
    RandomnessReceived,
    ArbitratorSelected,
    Failed,
}

// Import ArbitratorInfo from lib.rs (we'll need to reference it)
use crate::ArbitratorInfo;

// Weighted selection implementation based on actual ArbitratorInfo structure
pub fn calculate_arbitrator_weight(info: &ArbitratorInfo) -> u64 {
    let mut weight = 1000u64; // Base weight
    
    // Reputation multiplier (0-10000 basis points)
    weight = weight
        .saturating_mul(info.reputation_score as u64)
        .saturating_div(10000);
    
    // Experience bonus based on resolved cases (capped at 100 cases)
    let experience_bonus = info.resolved_cases.min(100).saturating_mul(10);
    weight = weight.saturating_add(experience_bonus);
    
    // Active arbitrator bonus
    if info.is_active {
        weight = weight.saturating_add(500); // Active arbitrator bonus
    }
    
    // Prevent zero weight
    if weight == 0 {
        weight = 1;
    }
    
    weight
}

// Commit-reveal fallback
#[account]
pub struct CommitRevealRandomness {
    pub trade_id: u64,
    pub commits: Vec<CommitData>,
    pub reveals: Vec<RevealData>,
    pub final_seed: Option<[u8; 32]>,
    pub reveal_deadline: i64,
    pub bump: u8,
}

impl CommitRevealRandomness {
    pub const INIT_SPACE: usize = 8 + // discriminator
        8 + // trade_id
        4 + (10 * CommitData::INIT_SPACE) + // commits vec (assume max 10)
        4 + (10 * RevealData::INIT_SPACE) + // reveals vec (assume max 10)
        (1 + 32) + // final_seed (Option<[u8; 32]>)
        8 + // reveal_deadline
        1; // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CommitData {
    pub committer: Pubkey,
    pub commitment: [u8; 32],
    pub timestamp: i64,
}

impl CommitData {
    pub const INIT_SPACE: usize = 32 + // committer
        32 + // commitment
        8; // timestamp
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RevealData {
    pub revealer: Pubkey,
    pub value: [u8; 32],
    pub nonce: [u8; 32],
}

impl RevealData {
    pub const INIT_SPACE: usize = 32 + // revealer
        32 + // value
        32; // nonce
}