## FEATURE:

- Replace predictable arbitrator selection with Verifiable Random Function (VRF)
- Integrate Switchboard VRF or Chainlink VRF for true randomness
- Implement commit-reveal scheme as fallback for randomness
- Add arbitrator availability and reputation weighting
- Create transparent and verifiable selection process

## EXAMPLES:

```rust
// trade/src/vrf.rs
use anchor_lang::prelude::*;
use switchboard_v2::{VrfAccountData, VrfRequestRandomness};

// VRF-based arbitrator selection
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum SelectionStatus {
    Pending,
    RandomnessRequested,
    RandomnessReceived,
    ArbitratorSelected,
    Failed,
}

// Request VRF randomness for arbitrator selection
pub fn request_arbitrator_randomness(
    ctx: Context<RequestArbitratorRandomness>,
    trade_id: u64,
) -> Result<()> {
    let selection = &mut ctx.accounts.selection;
    let clock = Clock::get()?;
    
    // Initialize selection account
    selection.trade_id = trade_id;
    selection.vrf_account = ctx.accounts.vrf.key();
    selection.request_timestamp = clock.unix_timestamp;
    selection.selection_status = SelectionStatus::Pending;
    selection.bump = ctx.bumps.selection;
    
    // Request randomness from Switchboard VRF
    let vrf_request = VrfRequestRandomness {
        authority: ctx.accounts.vrf_authority.to_account_info(),
        vrf: ctx.accounts.vrf.to_account_info(),
        oracle_queue: ctx.accounts.oracle_queue.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        data_buffer: ctx.accounts.data_buffer.to_account_info(),
        permission: ctx.accounts.permission.to_account_info(),
        escrow: ctx.accounts.escrow.to_account_info(),
        payer_wallet: ctx.accounts.payer_wallet.to_account_info(),
        payer_authority: ctx.accounts.payer_authority.to_account_info(),
        recent_blockhashes: ctx.accounts.recent_blockhashes.to_account_info(),
        program_state: ctx.accounts.program_state.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
    };
    
    vrf_request.invoke()?;
    
    selection.selection_status = SelectionStatus::RandomnessRequested;
    
    emit!(VrfRequestedEvent {
        trade_id,
        vrf_account: ctx.accounts.vrf.key(),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

// Process VRF result and select arbitrator
pub fn process_vrf_result(
    ctx: Context<ProcessVrfResult>,
) -> Result<()> {
    let selection = &mut ctx.accounts.selection;
    let arbitrator_pool = &ctx.accounts.arbitrator_pool;
    let clock = Clock::get()?;
    
    // Verify VRF account has new randomness
    let vrf = ctx.accounts.vrf.load()?;
    require!(
        vrf.num_callbacks_processed > 0,
        ErrorCode::NoRandomnessAvailable
    );
    
    // Get the randomness result
    let randomness = vrf.get_result()?;
    selection.randomness_result = Some(randomness);
    selection.selection_status = SelectionStatus::RandomnessReceived;
    
    // Use randomness to select arbitrator with reputation weighting
    let selected = select_weighted_arbitrator(
        &randomness,
        arbitrator_pool,
        &ctx.remaining_accounts, // Arbitrator info accounts
    )?;
    
    selection.selected_arbitrator = Some(selected);
    selection.selection_status = SelectionStatus::ArbitratorSelected;
    
    // Update trade with selected arbitrator
    let trade = &mut ctx.accounts.trade;
    trade.arbitrator = selected;
    
    emit!(ArbitratorSelectedEvent {
        trade_id: selection.trade_id,
        arbitrator: selected,
        randomness: hex::encode(&randomness),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

// Weighted selection based on reputation and availability
fn select_weighted_arbitrator(
    randomness: &[u8; 32],
    pool: &ArbitratorPool,
    arbitrator_infos: &[AccountInfo],
) -> Result<Pubkey> {
    require!(!pool.arbitrators.is_empty(), ErrorCode::NoArbitratorsAvailable);
    
    // Calculate total weight based on reputation scores
    let mut weights = Vec::new();
    let mut total_weight = 0u64;
    
    for (i, arbitrator_pubkey) in pool.arbitrators.iter().enumerate() {
        if i < arbitrator_infos.len() {
            let info_account = &arbitrator_infos[i];
            let info = ArbitratorInfo::try_from_slice(&info_account.data.borrow())?;
            
            // Only include active and available arbitrators
            if info.is_active && info.current_cases < info.max_concurrent_cases {
                // Weight based on reputation (higher score = higher weight)
                let weight = calculate_arbitrator_weight(&info);
                weights.push((arbitrator_pubkey, weight));
                total_weight = total_weight.saturating_add(weight);
            }
        }
    }
    
    require!(total_weight > 0, ErrorCode::NoEligibleArbitrators);
    
    // Convert randomness to selection value
    let random_value = u64::from_le_bytes(randomness[0..8].try_into().unwrap());
    let selection_point = random_value % total_weight;
    
    // Select arbitrator based on weighted distribution
    let mut cumulative = 0u64;
    for (arbitrator, weight) in weights {
        cumulative = cumulative.saturating_add(weight);
        if selection_point < cumulative {
            return Ok(*arbitrator);
        }
    }
    
    // Fallback to last arbitrator (should never reach here)
    Ok(*pool.arbitrators.last().unwrap())
}

fn calculate_arbitrator_weight(info: &ArbitratorInfo) -> u64 {
    // Base weight
    let mut weight = 1000u64;
    
    // Reputation multiplier (0-10000 basis points)
    weight = weight
        .saturating_mul(info.reputation_score as u64)
        .saturating_div(10000);
    
    // Availability bonus (fewer active cases = higher weight)
    let availability_ratio = (info.max_concurrent_cases - info.current_cases) as u64;
    weight = weight.saturating_add(availability_ratio * 100);
    
    // Experience bonus (more resolved cases = higher weight)
    let experience_bonus = info.resolved_cases.min(100) * 10;
    weight = weight.saturating_add(experience_bonus);
    
    weight
}

// Fallback: Commit-reveal scheme if VRF unavailable
#[account]
pub struct CommitRevealRandomness {
    pub trade_id: u64,
    pub commits: Vec<CommitData>,
    pub reveals: Vec<RevealData>,
    pub final_seed: Option<[u8; 32]>,
    pub reveal_deadline: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CommitData {
    pub committer: Pubkey,
    pub commitment: [u8; 32],
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RevealData {
    pub revealer: Pubkey,
    pub value: [u8; 32],
    pub nonce: [u8; 32],
}

// Commit phase for randomness generation
pub fn commit_randomness(
    ctx: Context<CommitRandomness>,
    commitment: [u8; 32],
) -> Result<()> {
    let commit_reveal = &mut ctx.accounts.commit_reveal;
    let clock = Clock::get()?;
    
    // Check commit phase is active
    require!(
        clock.unix_timestamp < commit_reveal.reveal_deadline - 3600, // 1 hour before reveal
        ErrorCode::CommitPhaseEnded
    );
    
    // Check user hasn't already committed
    require!(
        !commit_reveal.commits.iter().any(|c| c.committer == ctx.accounts.committer.key()),
        ErrorCode::AlreadyCommitted
    );
    
    // Add commitment
    commit_reveal.commits.push(CommitData {
        committer: ctx.accounts.committer.key(),
        commitment,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

// Reveal phase for randomness generation
pub fn reveal_randomness(
    ctx: Context<RevealRandomness>,
    value: [u8; 32],
    nonce: [u8; 32],
) -> Result<()> {
    let commit_reveal = &mut ctx.accounts.commit_reveal;
    let clock = Clock::get()?;
    
    // Check reveal phase is active
    require!(
        clock.unix_timestamp >= commit_reveal.reveal_deadline - 3600 &&
        clock.unix_timestamp < commit_reveal.reveal_deadline,
        ErrorCode::NotInRevealPhase
    );
    
    // Verify commitment matches
    let commitment = hash(&[&value, &nonce].concat());
    let commit = commit_reveal.commits
        .iter()
        .find(|c| c.committer == ctx.accounts.revealer.key())
        .ok_or(ErrorCode::NoCommitmentFound)?;
    
    require!(
        commit.commitment == commitment.to_bytes(),
        ErrorCode::InvalidReveal
    );
    
    // Add reveal
    commit_reveal.reveals.push(RevealData {
        revealer: ctx.accounts.revealer.key(),
        value,
        nonce,
    });
    
    // If all reveals received, compute final randomness
    if commit_reveal.reveals.len() == commit_reveal.commits.len() {
        let mut combined = [0u8; 32];
        for reveal in &commit_reveal.reveals {
            for i in 0..32 {
                combined[i] ^= reveal.value[i];
            }
        }
        commit_reveal.final_seed = Some(combined);
    }
    
    Ok(())
}

// Hash function for commit-reveal
fn hash(data: &[u8]) -> solana_program::hash::Hash {
    solana_program::hash::hash(data)
}
```

## DOCUMENTATION:

- Switchboard VRF: https://docs.switchboard.xyz/solana/vrf
- Chainlink VRF: https://docs.chain.link/vrf/v2/introduction
- Commit-reveal schemes: https://en.wikipedia.org/wiki/Commitment_scheme
- Weighted random selection algorithms

## OTHER CONSIDERATIONS:

- **VRF Costs**: VRF oracle calls have costs - budget appropriately
- **Latency**: VRF responses may take time - design UX accordingly
- **Fallback**: Always have fallback mechanism if VRF fails
- **Transparency**: Make selection process auditable
- **Gaming Prevention**: Ensure arbitrators can't influence their selection
- **Reputation System**: Implement fair reputation scoring
- **Availability**: Track arbitrator availability in real-time
- **Testing**: Test with various randomness distributions

## RELATED ISSUES:

- Prerequisites: FIX_01-08 (foundation and events)
- Next: FIX_10_PRICE_ORACLE (price manipulation prevention)
- Critical for: Fair and unpredictable arbitrator assignment