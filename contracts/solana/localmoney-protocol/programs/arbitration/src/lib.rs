use anchor_lang::prelude::*;
use shared_types::*;

declare_id!("8X9QeHbXRLzKJ4R1WfZhKz8Wn3Rj2MKHvQiVfJYJGqNp");

#[program]
pub mod arbitration {
    use super::*;

    /// Initialize arbitration program configuration
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.arbitrator_count = 0;
        config.active_arbitrators = 0;
        config.total_disputes = 0;
        config.resolved_disputes = 0;
        config.bump = ctx.bumps.config;
        
        Ok(())
    }

    /// Register a new arbitrator
    pub fn register_arbitrator(
        ctx: Context<RegisterArbitrator>,
        params: RegisterArbitratorParams,
    ) -> Result<()> {
        // Validate authority
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            LocalMoneyErrorCode::Unauthorized
        );

        // Validate arbitrator parameters
        validate_arbitrator_params(&params)?;

        // Update counter first
        let counter = &mut ctx.accounts.counter;
        let arbitrator_id = counter.count;
        counter.count += 1;
        counter.bump = ctx.bumps.counter;

        let arbitrator = &mut ctx.accounts.arbitrator;
        arbitrator.id = arbitrator_id;
        arbitrator.authority = params.arbitrator_authority;
        arbitrator.status = ArbitratorStatus::Active;
        arbitrator.reputation_score = 0;
        arbitrator.total_disputes = 0;
        arbitrator.resolved_disputes = 0;
        arbitrator.active_disputes = 0;
        arbitrator.registration_timestamp = Clock::get()?.unix_timestamp;
        arbitrator.last_activity = Clock::get()?.unix_timestamp;
        arbitrator.fee_bps = params.fee_bps;
        arbitrator.languages = params.languages;
        arbitrator.specializations = params.specializations;
        arbitrator.bump = ctx.bumps.arbitrator;

        // Update config
        let config = &mut ctx.accounts.config;
        config.arbitrator_count += 1;
        config.active_arbitrators += 1;

        Ok(())
    }

    /// Remove an arbitrator
    pub fn remove_arbitrator(ctx: Context<RemoveArbitrator>) -> Result<()> {
        // Validate authority
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            LocalMoneyErrorCode::Unauthorized
        );

        let arbitrator = &mut ctx.accounts.arbitrator;
        
        // Check if arbitrator has pending disputes
        require!(
            arbitrator.active_disputes == 0,
            LocalMoneyErrorCode::ArbitratorUnavailable
        );

        arbitrator.status = ArbitratorStatus::Inactive;

        // Update config
        let config = &mut ctx.accounts.config;
        config.active_arbitrators -= 1;

        Ok(())
    }

    /// Update arbitrator status
    pub fn update_arbitrator_status(
        ctx: Context<UpdateArbitratorStatus>,
        new_status: ArbitratorStatus,
    ) -> Result<()> {
        // Validate authority (only arbitrator can update their own status)
        require!(
            ctx.accounts.authority.key() == ctx.accounts.arbitrator.authority,
            LocalMoneyErrorCode::Unauthorized
        );

        let arbitrator = &mut ctx.accounts.arbitrator;
        let old_status = arbitrator.status.clone();
        arbitrator.status = new_status.clone();
        arbitrator.last_activity = Clock::get()?.unix_timestamp;

        // Update active arbitrators count
        let config = &mut ctx.accounts.config;
        match (old_status, new_status) {
            (ArbitratorStatus::Inactive, ArbitratorStatus::Active) 
            | (ArbitratorStatus::Suspended, ArbitratorStatus::Active) => {
                config.active_arbitrators += 1;
            }
            (ArbitratorStatus::Active, ArbitratorStatus::Inactive) 
            | (ArbitratorStatus::Active, ArbitratorStatus::Suspended) => {
                config.active_arbitrators -= 1;
            }
            _ => {} // No change needed
        }

        Ok(())
    }

    /// Select arbitrator for a dispute
    pub fn select_arbitrator(ctx: Context<SelectArbitrator>, trade_id: u64) -> Result<()> {
        let arbitrator = &mut ctx.accounts.arbitrator;
        
        // Validate arbitrator is active
        require!(
            arbitrator.status == ArbitratorStatus::Active,
            LocalMoneyErrorCode::ArbitratorUnavailable
        );

        // Check arbitrator availability
        require!(
            arbitrator.active_disputes < MAX_ACTIVE_DISPUTES_PER_ARBITRATOR,
            LocalMoneyErrorCode::ArbitratorUnavailable
        );

        // Update arbitrator
        arbitrator.active_disputes += 1;
        arbitrator.last_activity = Clock::get()?.unix_timestamp;

        // Create assignment
        let assignment = &mut ctx.accounts.assignment;
        assignment.arbitrator = ctx.accounts.arbitrator.key();
        assignment.trade_id = trade_id;
        assignment.assignment_timestamp = Clock::get()?.unix_timestamp;
        assignment.status = DisputeStatus::Open;
        assignment.bump = ctx.bumps.assignment;

        Ok(())
    }

    /// Update arbitrator reputation
    pub fn update_reputation(
        ctx: Context<UpdateReputation>,
        reputation_change: i32,
    ) -> Result<()> {
        let arbitrator = &mut ctx.accounts.arbitrator;
        
        // Calculate new reputation score
        let new_score = if reputation_change >= 0 {
            arbitrator.reputation_score.saturating_add(reputation_change as u32)
        } else {
            arbitrator.reputation_score.saturating_sub((-reputation_change) as u32)
        };
        arbitrator.reputation_score = new_score;
        arbitrator.last_activity = Clock::get()?.unix_timestamp;

        Ok(())
    }

    /// Get arbitrator selection score
    pub fn get_selection_score(ctx: Context<GetSelectionScore>) -> Result<u32> {
        let arbitrator = &ctx.accounts.arbitrator;
        
        // Calculate selection score based on multiple factors
        let score = calculate_selection_score(arbitrator);
        
        Ok(score)
    }
}

// Account structures
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ArbitrationConfig::INIT_SPACE,
        seeds = [b"arbitration_config"],
        bump
    )]
    pub config: Account<'info, ArbitrationConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterArbitrator<'info> {
    #[account(
        mut,
        seeds = [b"arbitration_config"],
        bump = config.bump
    )]
    pub config: Account<'info, ArbitrationConfig>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + Arbitrator::INIT_SPACE,
        seeds = [b"arbitrator", arbitrator_authority.key().as_ref()],
        bump
    )]
    pub arbitrator: Account<'info, Arbitrator>,
    
    /// The authority that will be assigned to the arbitrator
    pub arbitrator_authority: SystemAccount<'info>,
    
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + ArbitratorCounter::INIT_SPACE,
        seeds = [b"arbitrator_counter"],
        bump
    )]
    pub counter: Account<'info, ArbitratorCounter>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveArbitrator<'info> {
    #[account(
        mut,
        seeds = [b"arbitration_config"],
        bump = config.bump
    )]
    pub config: Account<'info, ArbitrationConfig>,
    
    #[account(
        mut,
        seeds = [b"arbitrator", arbitrator.authority.as_ref()],
        bump = arbitrator.bump
    )]
    pub arbitrator: Account<'info, Arbitrator>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateArbitratorStatus<'info> {
    #[account(
        mut,
        seeds = [b"arbitration_config"],
        bump = config.bump
    )]
    pub config: Account<'info, ArbitrationConfig>,
    
    #[account(
        mut,
        seeds = [b"arbitrator", arbitrator.authority.as_ref()],
        bump = arbitrator.bump
    )]
    pub arbitrator: Account<'info, Arbitrator>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(trade_id: u64)]
pub struct SelectArbitrator<'info> {
    #[account(
        mut,
        seeds = [b"arbitrator", arbitrator.authority.as_ref()],
        bump = arbitrator.bump
    )]
    pub arbitrator: Account<'info, Arbitrator>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + ArbitratorAssignment::INIT_SPACE,
        seeds = [b"assignment", arbitrator.key().as_ref(), trade_id.to_le_bytes().as_ref()],
        bump
    )]
    pub assignment: Account<'info, ArbitratorAssignment>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    #[account(
        mut,
        seeds = [b"arbitrator", arbitrator.authority.as_ref()],
        bump = arbitrator.bump
    )]
    pub arbitrator: Account<'info, Arbitrator>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetSelectionScore<'info> {
    #[account(
        seeds = [b"arbitrator", arbitrator.authority.as_ref()],
        bump = arbitrator.bump
    )]
    pub arbitrator: Account<'info, Arbitrator>,
}

// Data structures
#[account]
#[derive(InitSpace)]
pub struct ArbitrationConfig {
    pub authority: Pubkey,
    pub arbitrator_count: u32,
    pub active_arbitrators: u32,
    pub total_disputes: u64,
    pub resolved_disputes: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Arbitrator {
    pub id: u32,
    pub authority: Pubkey,
    pub status: ArbitratorStatus,
    pub reputation_score: u32,
    pub total_disputes: u32,
    pub resolved_disputes: u32,
    pub active_disputes: u32,
    pub registration_timestamp: i64,
    pub last_activity: i64,
    pub fee_bps: u16,
    #[max_len(5, 32)]
    pub languages: Vec<String>,
    #[max_len(10, 64)]
    pub specializations: Vec<String>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ArbitratorCounter {
    pub count: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ArbitratorAssignment {
    pub arbitrator: Pubkey,
    pub trade_id: u64,
    pub assignment_timestamp: i64,
    pub status: DisputeStatus,
    pub bump: u8,
}

// Parameter structures
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterArbitratorParams {
    pub arbitrator_authority: Pubkey,
    pub fee_bps: u16,
    pub languages: Vec<String>,
    pub specializations: Vec<String>,
}

// Validation functions
fn validate_arbitrator_params(params: &RegisterArbitratorParams) -> Result<()> {
    // Validate fee percentage
    require!(
        params.fee_bps <= MAX_ARBITRATION_FEE_BPS,
        LocalMoneyErrorCode::InvalidFeePercentage
    );

    // Validate languages
    require!(
        !params.languages.is_empty() && params.languages.len() <= 5,
        LocalMoneyErrorCode::InvalidParameter
    );

    // Validate specializations
    require!(
        !params.specializations.is_empty() && params.specializations.len() <= 10,
        LocalMoneyErrorCode::InvalidParameter
    );

    Ok(())
}

// Selection algorithm
fn calculate_selection_score(arbitrator: &Arbitrator) -> u32 {
    let mut score = 0u32;
    
    // Base score from reputation
    score += arbitrator.reputation_score * 10;
    
    // Bonus for experience
    if arbitrator.resolved_disputes > 0 {
        score += (arbitrator.resolved_disputes * 5).min(100);
    }
    
    // Penalty for high workload
    if arbitrator.active_disputes > 0 {
        score = score.saturating_sub(arbitrator.active_disputes * 20);
    }
    
    // Bonus for recent activity
    let now = Clock::get().unwrap().unix_timestamp;
    let days_since_activity = (now - arbitrator.last_activity) / 86400;
    if days_since_activity < 7 {
        score += 50;
    }
    
    score
}

// Constants
const MAX_ACTIVE_DISPUTES_PER_ARBITRATOR: u32 = 10;
const MAX_ARBITRATION_FEE_BPS: u16 = 500; // 5%