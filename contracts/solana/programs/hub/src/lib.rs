#![deny(arithmetic_overflow)]
#![deny(unused_must_use)]
#![deny(clippy::arithmetic_side_effects)]
#![forbid(unsafe_code)]
use anchor_lang::prelude::*;
use localmoney_shared::{calculate_rent_with_margin, RentError, RentValidation, SafeMath, ConfigUpdateEvent, CircuitBreakerEvent};

declare_id!("2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2");

// CIRCUIT BREAKER MACRO: Checks pause status
#[macro_export]
macro_rules! require_not_paused {
    ($config:expr, $operation:expr) => {{
        use anchor_lang::prelude::*;
        
        // Check for auto-resume window (without modifying state)
        let should_auto_resume = if $config.pause_timestamp > 0 && $config.auto_resume_after > 0 {
            let clock = Clock::get()?;
            clock.unix_timestamp >= $config.pause_timestamp + $config.auto_resume_after
        } else {
            false
        };
        
        // If auto-resume time has passed, consider operations as not paused
        if !should_auto_resume {
            // Check global pause
            require!(!$config.global_pause, $crate::HubError::GlobalPause);
            
            // Check specific operation pause
            match $operation {
                $crate::Operation::CreateTrade => {
                    require!(!$config.pause_new_trades, $crate::HubError::TradingPaused);
                },
                $crate::Operation::FundEscrow => {
                    require!(!$config.pause_deposits, $crate::HubError::DepositsPaused);
                },
                $crate::Operation::Withdraw => {
                    require!(!$config.pause_withdrawals, $crate::HubError::WithdrawalsPaused);
                },
                $crate::Operation::CreateOffer | $crate::Operation::UpdateOffer => {
                    require!(!$config.pause_new_offers, $crate::HubError::OffersPaused);
                },
            }
        }
    }};
}

#[program]
pub mod hub {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        // Validate rent exemption before initialization
        ctx.accounts.validate_rent_exemption()?;

        // Validate fee percentages and totals
        require!(
            params.burn_fee_pct <= 10_000,
            HubError::InvalidFeePercentage
        );
        require!(
            params.chain_fee_pct <= 10_000,
            HubError::InvalidFeePercentage
        );
        require!(
            params.warchest_fee_pct <= 10_000,
            HubError::InvalidFeePercentage
        );
        require!(
            params.conversion_fee_pct <= 10_000,
            HubError::InvalidFeePercentage
        );
        let total_fee_bps = (params.burn_fee_pct as u32)
            .safe_add(params.chain_fee_pct as u32)?
            .safe_add(params.warchest_fee_pct as u32)?
            .safe_add(params.conversion_fee_pct as u32)?;
        require!(total_fee_bps <= 10_000, HubError::ExcessiveFeeTotal);

        // Validate legacy rate fields are within bounds
        require!(params.fee_rate <= 10_000, HubError::InvalidFeeRate);
        require!(params.burn_rate <= 10_000, HubError::InvalidFeeRate);
        require!(params.warchest_rate <= 10_000, HubError::InvalidFeeRate);
        require!(
            params.arbitration_fee_rate <= 10_000,
            HubError::InvalidFeeRate
        );

        let hub_config = &mut ctx.accounts.hub_config;
        hub_config.authority = ctx.accounts.authority.key();
        hub_config.profile_program = params.profile_program;
        hub_config.offer_program = params.offer_program;
        hub_config.trade_program = params.trade_program;
        hub_config.price_program = params.price_program;
        hub_config.treasury = params.treasury;

        // ADVANCED FEE MANAGEMENT: Initialize new fields
        hub_config.local_token_mint = params.local_token_mint;
        hub_config.jupiter_program = params.jupiter_program;
        hub_config.chain_fee_collector = params.chain_fee_collector;
        hub_config.warchest_address = params.warchest_address;

        // ENHANCED FEE STRUCTURE: Initialize fee percentages
        hub_config.burn_fee_pct = params.burn_fee_pct;
        hub_config.chain_fee_pct = params.chain_fee_pct;
        hub_config.warchest_fee_pct = params.warchest_fee_pct;
        hub_config.conversion_fee_pct = params.conversion_fee_pct;

        // DEX INTEGRATION SETTINGS: Initialize conversion parameters
        hub_config.max_slippage_bps = params.max_slippage_bps;
        hub_config.min_conversion_amount = params.min_conversion_amount;
        hub_config.max_conversion_routes = params.max_conversion_routes;

        // LEGACY COMPATIBILITY: Keep existing fields
        hub_config.fee_rate = params.fee_rate;
        hub_config.burn_rate = params.burn_rate;
        hub_config.warchest_rate = params.warchest_rate;

        hub_config.trade_limit_min = params.trade_limit_min;
        hub_config.trade_limit_max = params.trade_limit_max;
        hub_config.trade_expiration_timer = params.trade_expiration_timer;
        hub_config.trade_dispute_timer = params.trade_dispute_timer;
        hub_config.arbitration_fee_rate = params.arbitration_fee_rate;

        // Initialize program version tracking
        hub_config.profile_program_version = params.profile_program_version;
        hub_config.offer_program_version = params.offer_program_version;
        hub_config.trade_program_version = params.trade_program_version;
        hub_config.price_program_version = params.price_program_version;
        hub_config.last_upgrade_timestamp = Clock::get()?.unix_timestamp;
        hub_config.upgrade_authority = params.upgrade_authority;

        // CIRCUIT BREAKER: Initialize emergency pause system
        hub_config.emergency_council = [Pubkey::default(); 5];
        hub_config.guardian_count = 0;
        hub_config.required_signatures = params.required_signatures.unwrap_or(2); // Default 2 of N
        hub_config.global_pause = false;
        hub_config.pause_new_trades = false;
        hub_config.pause_deposits = false;
        hub_config.pause_withdrawals = false;
        hub_config.pause_new_offers = false;
        hub_config.pause_timestamp = 0;
        hub_config.auto_resume_after = 0;
        hub_config.pause_reason = [0u8; 32];
        hub_config.pause_count = 0;
        hub_config.last_pause_by = Pubkey::default();

        hub_config.bump = ctx.bumps.hub_config;

        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
        let hub_config = &mut ctx.accounts.hub_config;

        // Compute effective fee percentages after applying optional updates
        let new_burn_fee_pct = params.burn_fee_pct.unwrap_or(hub_config.burn_fee_pct);
        let new_chain_fee_pct = params.chain_fee_pct.unwrap_or(hub_config.chain_fee_pct);
        let new_warchest_fee_pct = params
            .warchest_fee_pct
            .unwrap_or(hub_config.warchest_fee_pct);
        let new_conversion_fee_pct = params
            .conversion_fee_pct
            .unwrap_or(hub_config.conversion_fee_pct);

        // Validate individual bounds
        require!(new_burn_fee_pct <= 10_000, HubError::InvalidFeePercentage);
        require!(new_chain_fee_pct <= 10_000, HubError::InvalidFeePercentage);
        require!(
            new_warchest_fee_pct <= 10_000,
            HubError::InvalidFeePercentage
        );
        require!(
            new_conversion_fee_pct <= 10_000,
            HubError::InvalidFeePercentage
        );

        // Validate total cap across all destinations
        let total_fee_bps = (new_burn_fee_pct as u32)
            .safe_add(new_chain_fee_pct as u32)?
            .safe_add(new_warchest_fee_pct as u32)?
            .safe_add(new_conversion_fee_pct as u32)?;
        require!(total_fee_bps <= 10_000, HubError::ExcessiveFeeTotal);

        if let Some(treasury) = params.treasury {
            hub_config.treasury = treasury;
        }

        // ADVANCED FEE MANAGEMENT: Update new fields
        if let Some(local_token_mint) = params.local_token_mint {
            hub_config.local_token_mint = local_token_mint;
        }
        if let Some(jupiter_program) = params.jupiter_program {
            hub_config.jupiter_program = jupiter_program;
        }
        if let Some(chain_fee_collector) = params.chain_fee_collector {
            hub_config.chain_fee_collector = chain_fee_collector;
        }
        if let Some(warchest_address) = params.warchest_address {
            hub_config.warchest_address = warchest_address;
        }

        // ENHANCED FEE STRUCTURE: Update fee percentages
        if let Some(burn_fee_pct) = params.burn_fee_pct {
            hub_config.burn_fee_pct = burn_fee_pct;
        }
        if let Some(chain_fee_pct) = params.chain_fee_pct {
            hub_config.chain_fee_pct = chain_fee_pct;
        }
        if let Some(warchest_fee_pct) = params.warchest_fee_pct {
            hub_config.warchest_fee_pct = warchest_fee_pct;
        }
        if let Some(conversion_fee_pct) = params.conversion_fee_pct {
            hub_config.conversion_fee_pct = conversion_fee_pct;
        }

        // DEX INTEGRATION SETTINGS: Update conversion parameters
        if let Some(max_slippage_bps) = params.max_slippage_bps {
            hub_config.max_slippage_bps = max_slippage_bps;
        }
        if let Some(min_conversion_amount) = params.min_conversion_amount {
            hub_config.min_conversion_amount = min_conversion_amount;
        }
        if let Some(max_conversion_routes) = params.max_conversion_routes {
            hub_config.max_conversion_routes = max_conversion_routes;
        }

        // LEGACY COMPATIBILITY: Update existing fields
        if let Some(fee_rate) = params.fee_rate {
            require!(fee_rate <= 10_000, HubError::InvalidFeeRate);
            hub_config.fee_rate = fee_rate;
        }
        if let Some(burn_rate) = params.burn_rate {
            require!(burn_rate <= 10_000, HubError::InvalidFeeRate);
            hub_config.burn_rate = burn_rate;
        }
        if let Some(warchest_rate) = params.warchest_rate {
            require!(warchest_rate <= 10_000, HubError::InvalidFeeRate);
            hub_config.warchest_rate = warchest_rate;
        }
        if let Some(trade_limit_min) = params.trade_limit_min {
            hub_config.trade_limit_min = trade_limit_min;
        }
        if let Some(trade_limit_max) = params.trade_limit_max {
            hub_config.trade_limit_max = trade_limit_max;
        }
        if let Some(trade_expiration_timer) = params.trade_expiration_timer {
            hub_config.trade_expiration_timer = trade_expiration_timer;
        }
        if let Some(trade_dispute_timer) = params.trade_dispute_timer {
            hub_config.trade_dispute_timer = trade_dispute_timer;
        }
        if let Some(arbitration_fee_rate) = params.arbitration_fee_rate {
            require!(arbitration_fee_rate <= 10_000, HubError::InvalidFeeRate);
            hub_config.arbitration_fee_rate = arbitration_fee_rate;
        }

        // Emit config update event
        emit!(ConfigUpdateEvent {
            updater: ctx.accounts.authority.key(),
            config_type: "hub".to_string(),
            old_value: "config_updated".to_string(), // Simplified for event size
            new_value: "config_updated".to_string(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // CIRCUIT BREAKER: Guardian management
    pub fn add_guardian(ctx: Context<ManageGuardian>, guardian: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.hub_config;

        require!(
            config.guardian_count < 5,
            HubError::MaxGuardiansReached
        );

        // Find empty slot and add
        for i in 0..5 {
            if config.emergency_council[i] == Pubkey::default() {
                config.emergency_council[i] = guardian;
                config.guardian_count += 1;
                
                // Emit event
                emit!(GuardianAddedEvent {
                    guardian,
                    added_by: ctx.accounts.authority.key(),
                    guardian_count: config.guardian_count,
                });
                
                break;
            }
        }

        Ok(())
    }

    pub fn remove_guardian(ctx: Context<ManageGuardian>, guardian: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.hub_config;

        // Find and remove guardian
        let mut found = false;
        for i in 0..5 {
            if config.emergency_council[i] == guardian {
                config.emergency_council[i] = Pubkey::default();
                config.guardian_count = config.guardian_count.saturating_sub(1);
                found = true;
                
                // Emit event
                emit!(GuardianRemovedEvent {
                    guardian,
                    removed_by: ctx.accounts.authority.key(),
                    guardian_count: config.guardian_count,
                });
                
                break;
            }
        }

        require!(found, HubError::NotGuardian);

        Ok(())
    }

    pub fn set_guardian_threshold(
        ctx: Context<ManageGuardian>,
        required_signatures: u8,
    ) -> Result<()> {
        let config = &mut ctx.accounts.hub_config;

        require!(
            required_signatures > 0 && required_signatures <= config.guardian_count,
            HubError::InvalidThreshold
        );

        config.required_signatures = required_signatures;

        // Emit event
        emit!(ThresholdUpdatedEvent {
            new_threshold: required_signatures,
            updated_by: ctx.accounts.authority.key(),
        });

        Ok(())
    }

    // CIRCUIT BREAKER: Pause operations
    pub fn initiate_pause(
        ctx: Context<InitiatePause>,
        pause_type: PauseType,
        reason: [u8; 32],
        auto_resume_seconds: i64,
    ) -> Result<()> {
        let config = &ctx.accounts.hub_config;
        let approval = &mut ctx.accounts.pause_approval;

        // Verify guardian
        let mut is_guardian = false;
        for i in 0..config.guardian_count as usize {
            if config.emergency_council[i] == ctx.accounts.guardian.key() {
                is_guardian = true;
                break;
            }
        }
        require!(is_guardian, HubError::NotGuardian);

        // Initialize approval
        let clock = Clock::get()?;
        approval.pause_type = pause_type;
        approval.signatures[0] = ctx.accounts.guardian.key();
        approval.signature_count = 1;
        approval.created_at = clock.unix_timestamp;
        approval.expires_at = clock.unix_timestamp + 3600; // 1 hour expiry
        approval.executed = false;
        approval.bump = ctx.bumps.pause_approval;

        // Check if threshold met
        if approval.signature_count >= config.required_signatures {
            // Execute pause immediately
            execute_pause_internal(
                &mut ctx.accounts.hub_config,
                approval,
                reason,
                auto_resume_seconds,
            )?;
        }

        Ok(())
    }

    pub fn approve_pause(ctx: Context<ApprovePause>) -> Result<()> {
        let config = &ctx.accounts.hub_config;
        let approval = &mut ctx.accounts.pause_approval;

        // Verify guardian
        let mut is_guardian = false;
        for i in 0..config.guardian_count as usize {
            if config.emergency_council[i] == ctx.accounts.guardian.key() {
                is_guardian = true;
                break;
            }
        }
        require!(is_guardian, HubError::NotGuardian);

        // Check if already signed
        for i in 0..approval.signature_count as usize {
            require!(
                approval.signatures[i] != ctx.accounts.guardian.key(),
                HubError::AlreadySigned
            );
        }

        // Check expiry
        let clock = Clock::get()?;
        require!(clock.unix_timestamp <= approval.expires_at, HubError::ApprovalExpired);

        // Check if already executed
        require!(!approval.executed, HubError::PauseAlreadyExecuted);

        // Add signature
        let signature_index = approval.signature_count as usize;
        approval.signatures[signature_index] = ctx.accounts.guardian.key();
        approval.signature_count += 1;

        // Check if threshold met
        if approval.signature_count >= config.required_signatures {
            // Execute pause
            let reason = [0u8; 32]; // TODO: Store reason in approval
            let auto_resume_seconds = 0; // TODO: Store auto_resume in approval
            execute_pause_internal(
                &mut ctx.accounts.hub_config,
                approval,
                reason,
                auto_resume_seconds,
            )?;
        }

        Ok(())
    }

    pub fn resume_protocol(ctx: Context<ResumeProtocol>, pause_type: PauseType) -> Result<()> {
        let config = &mut ctx.accounts.hub_config;
        let clock = Clock::get()?;

        // Check if auto-resume time has been reached
        if config.auto_resume_after > 0 && config.pause_timestamp > 0 {
            require!(
                clock.unix_timestamp >= config.pause_timestamp + config.auto_resume_after,
                HubError::ResumeTooEarly
            );
        }

        // Clear specific pause or all pauses
        match pause_type {
            PauseType::Global => {
                config.global_pause = false;
                config.pause_new_trades = false;
                config.pause_deposits = false;
                config.pause_withdrawals = false;
                config.pause_new_offers = false;
            }
            PauseType::Trading => config.pause_new_trades = false,
            PauseType::Deposits => config.pause_deposits = false,
            PauseType::Withdrawals => config.pause_withdrawals = false,
            PauseType::Offers => config.pause_new_offers = false,
        }

        // Clear timestamp if all pauses removed
        if !config.global_pause
            && !config.pause_new_trades
            && !config.pause_deposits
            && !config.pause_withdrawals
            && !config.pause_new_offers
        {
            config.pause_timestamp = 0;
            config.auto_resume_after = 0;
        }

        // Emit circuit breaker resume event
        emit!(CircuitBreakerEvent {
            action: "resume".to_string(),
            scope: format!("{:?}", pause_type).to_lowercase(),
            triggered_by: ctx.accounts.authority.key(),
            reason: "manual_resume".to_string(),
            auto_resume_at: None,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn register_program(
        ctx: Context<RegisterProgram>,
        program_id: Pubkey,
        program_type: ProgramType,
    ) -> Result<()> {
        let hub_config = &mut ctx.accounts.hub_config;

        match program_type {
            ProgramType::Profile => hub_config.profile_program = program_id,
            ProgramType::Offer => hub_config.offer_program = program_id,
            ProgramType::Trade => hub_config.trade_program = program_id,
            ProgramType::Price => hub_config.price_program = program_id,
        }

        Ok(())
    }

    pub fn update_program_versions(
        ctx: Context<UpdateProgramVersions>,
        params: UpdateProgramVersionsParams,
    ) -> Result<()> {
        let hub_config = &mut ctx.accounts.hub_config;

        // Update program versions if provided
        if let Some(version) = params.profile_program_version {
            hub_config.profile_program_version = version;
        }
        if let Some(version) = params.offer_program_version {
            hub_config.offer_program_version = version;
        }
        if let Some(version) = params.trade_program_version {
            hub_config.trade_program_version = version;
        }
        if let Some(version) = params.price_program_version {
            hub_config.price_program_version = version;
        }

        // Update timestamp
        hub_config.last_upgrade_timestamp = Clock::get()?.unix_timestamp;

        // Log version update for audit
        msg!(
            "Program versions updated: profile={:?}, offer={:?}, trade={:?}, price={:?}",
            params.profile_program_version,
            params.offer_program_version,
            params.trade_program_version,
            params.price_program_version
        );

        Ok(())
    }
}

// Helper function to execute pause
fn execute_pause_internal(
    config: &mut HubConfig,
    approval: &mut PauseApproval,
    reason: [u8; 32],
    auto_resume_seconds: i64,
) -> Result<()> {
    let clock = Clock::get()?;

    // Apply pause based on type
    match approval.pause_type {
        PauseType::Global => {
            config.global_pause = true;
            config.pause_new_trades = true;
            config.pause_deposits = true;
            config.pause_withdrawals = true;
            config.pause_new_offers = true;
        }
        PauseType::Trading => config.pause_new_trades = true,
        PauseType::Deposits => config.pause_deposits = true,
        PauseType::Withdrawals => config.pause_withdrawals = true,
        PauseType::Offers => config.pause_new_offers = true,
    }

    // Set pause metadata
    config.pause_timestamp = clock.unix_timestamp;
    config.auto_resume_after = auto_resume_seconds;
    config.pause_reason = reason;
    config.pause_count += 1;
    config.last_pause_by = approval.signatures[0]; // First signer

    // Mark approval as executed
    approval.executed = true;

    // Emit circuit breaker event
    emit!(CircuitBreakerEvent {
        action: "pause".to_string(),
        scope: format!("{:?}", approval.pause_type).to_lowercase(),
        triggered_by: approval.signatures[0],
        reason: String::from_utf8_lossy(&reason).to_string(),
        auto_resume_at: if auto_resume_seconds > 0 { 
            Some(clock.unix_timestamp + auto_resume_seconds) 
        } else { 
            None 
        },
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = HubConfig::SPACE,
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        bump
    )]
    pub hub_config: Account<'info, HubConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> RentValidation for Initialize<'info> {
    fn validate_rent_exemption(&self) -> Result<()> {
        // Calculate required rent with 10% margin (1000 basis points)
        let required_rent = calculate_rent_with_margin(HubConfig::SPACE, 1000)?;

        // Ensure payer has sufficient balance
        require!(
            self.authority.lamports() >= required_rent,
            RentError::InsufficientFunds
        );

        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        bump = hub_config.bump,
        has_one = authority
    )]
    pub hub_config: Account<'info, HubConfig>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ManageGuardian<'info> {
    #[account(
        mut,
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        bump = hub_config.bump,
        has_one = authority
    )]
    pub hub_config: Account<'info, HubConfig>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(pause_type: PauseType)]
pub struct InitiatePause<'info> {
    #[account(
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        bump = hub_config.bump
    )]
    pub hub_config: Account<'info, HubConfig>,

    #[account(
        init,
        payer = guardian,
        space = PauseApproval::SPACE,
        seeds = [b"pause_approval".as_ref(), pause_type.try_to_vec()?.as_slice()],
        bump
    )]
    pub pause_approval: Account<'info, PauseApproval>,

    #[account(mut)]
    pub guardian: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApprovePause<'info> {
    #[account(
        mut,
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        bump = hub_config.bump
    )]
    pub hub_config: Account<'info, HubConfig>,

    #[account(
        mut,
        seeds = [b"pause_approval".as_ref(), pause_approval.pause_type.try_to_vec()?.as_slice()],
        bump = pause_approval.bump
    )]
    pub pause_approval: Account<'info, PauseApproval>,

    pub guardian: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResumeProtocol<'info> {
    #[account(
        mut,
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        bump = hub_config.bump,
        has_one = authority
    )]
    pub hub_config: Account<'info, HubConfig>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterProgram<'info> {
    #[account(
        mut,
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        bump = hub_config.bump,
        has_one = authority
    )]
    pub hub_config: Account<'info, HubConfig>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateProgramVersions<'info> {
    #[account(
        mut,
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        bump = hub_config.bump,
        constraint = upgrade_authority.key() == hub_config.upgrade_authority @ HubError::UnauthorizedUpgrade
    )]
    pub hub_config: Account<'info, HubConfig>,

    pub upgrade_authority: Signer<'info>,
}

#[account]
pub struct HubConfig {
    pub authority: Pubkey,
    pub profile_program: Pubkey,
    pub offer_program: Pubkey,
    pub trade_program: Pubkey,
    pub price_program: Pubkey,
    pub treasury: Pubkey,

    // ADVANCED FEE MANAGEMENT: Token and DEX Integration
    pub local_token_mint: Pubkey, // LOCAL token mint address for burn mechanism
    pub jupiter_program: Pubkey,  // Jupiter aggregator program for DEX swaps
    pub chain_fee_collector: Pubkey, // Chain fee collector address (separate from treasury)
    pub warchest_address: Pubkey, // Warchest address (separate from treasury)

    // ENHANCED FEE STRUCTURE: Multi-destination fee parameters
    pub burn_fee_pct: u16, // basis points for LOCAL token burn (matches CosmWasm)
    pub chain_fee_pct: u16, // basis points for chain fee sharing
    pub warchest_fee_pct: u16, // basis points for warchest fee
    pub conversion_fee_pct: u16, // basis points for token conversion fee

    // DEX INTEGRATION SETTINGS: Slippage and conversion parameters
    pub max_slippage_bps: u16, // maximum allowed slippage in basis points
    pub min_conversion_amount: u64, // minimum amount required for conversion
    pub max_conversion_routes: u8, // maximum DEX routes for token conversion

    // LEGACY COMPATIBILITY: Keep existing fields for backward compatibility
    pub fee_rate: u16,      // basis points (e.g., 150 = 1.5%) - legacy
    pub burn_rate: u16,     // basis points - legacy
    pub warchest_rate: u16, // basis points - legacy

    pub trade_limit_min: u64,        // Minimum trade amount in USD cents
    pub trade_limit_max: u64,        // Maximum trade amount in USD cents
    pub trade_expiration_timer: u64, // Seconds after which trades expire
    pub trade_dispute_timer: u64,    // Seconds after fiat deposit before dispute is allowed
    pub arbitration_fee_rate: u16,   // basis points for arbitration fee

    // PROGRAM VERSION TRACKING: For secure CPI validation
    pub profile_program_version: u16, // Version number for profile program
    pub offer_program_version: u16,   // Version number for offer program
    pub trade_program_version: u16,   // Version number for trade program
    pub price_program_version: u16,   // Version number for price program
    pub last_upgrade_timestamp: i64,  // Timestamp of last program upgrade
    pub upgrade_authority: Pubkey,    // Authority allowed to upgrade programs

    // CIRCUIT BREAKER: Emergency pause system
    pub emergency_council: [Pubkey; 5],  // Fixed array for guardians
    pub guardian_count: u8,               // Active guardian count (1-5)
    pub required_signatures: u8,          // M of N threshold

    pub global_pause: bool,               // Master switch
    pub pause_new_trades: bool,          // Granular controls
    pub pause_deposits: bool,
    pub pause_withdrawals: bool,
    pub pause_new_offers: bool,

    pub pause_timestamp: i64,            // 0 = not paused
    pub auto_resume_after: i64,          // 0 = no auto-resume
    pub pause_reason: [u8; 32],          // Fixed size for reason

    pub pause_count: u32,                // Audit trail
    pub last_pause_by: Pubkey,           // Zero = never paused

    pub bump: u8,
}

impl HubConfig {
    pub const SPACE: usize = 8 + // discriminator
        32 + // authority
        32 + // profile_program
        32 + // offer_program
        32 + // trade_program
        32 + // price_program
        32 + // treasury

        // ADVANCED FEE MANAGEMENT: New fields
        32 + // local_token_mint
        32 + // jupiter_program
        32 + // chain_fee_collector
        32 + // warchest_address

        // ENHANCED FEE STRUCTURE
        2 +  // burn_fee_pct
        2 +  // chain_fee_pct
        2 +  // warchest_fee_pct
        2 +  // conversion_fee_pct

        // DEX INTEGRATION SETTINGS
        2 +  // max_slippage_bps
        8 +  // min_conversion_amount
        1 +  // max_conversion_routes

        // LEGACY COMPATIBILITY
        2 +  // fee_rate
        2 +  // burn_rate
        2 +  // warchest_rate

        8 +  // trade_limit_min
        8 +  // trade_limit_max
        8 +  // trade_expiration_timer
        8 +  // trade_dispute_timer
        2 +  // arbitration_fee_rate
        
        // PROGRAM VERSION TRACKING
        2 +  // profile_program_version
        2 +  // offer_program_version
        2 +  // trade_program_version
        2 +  // price_program_version
        8 +  // last_upgrade_timestamp
        32 + // upgrade_authority
        
        // CIRCUIT BREAKER
        (32 * 5) + // emergency_council array
        1 +        // guardian_count
        1 +        // required_signatures
        1 +        // global_pause
        1 +        // pause_new_trades
        1 +        // pause_deposits
        1 +        // pause_withdrawals  
        1 +        // pause_new_offers
        8 +        // pause_timestamp
        8 +        // auto_resume_after
        32 +       // pause_reason
        4 +        // pause_count
        32 +       // last_pause_by
        
        1; // bump
}

#[account]
pub struct PauseApproval {
    pub pause_type: PauseType,
    pub signatures: [Pubkey; 5],         // Who signed
    pub signature_count: u8,             // How many signed
    pub created_at: i64,
    pub expires_at: i64,                 // Approval timeout
    pub executed: bool,
    pub bump: u8,
}

impl PauseApproval {
    pub const SPACE: usize = 8 + // discriminator
        1 +        // pause_type enum
        (32 * 5) + // signatures array
        1 +        // signature_count
        8 +        // created_at
        8 +        // expires_at
        1 +        // executed
        1;         // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Debug)]
pub enum PauseType {
    Global,
    Trading,
    Deposits,
    Withdrawals,
    Offers,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum Operation {
    CreateTrade,
    FundEscrow,
    Withdraw,
    CreateOffer,
    UpdateOffer,
}

// CIRCUIT BREAKER EVENTS
#[event]
pub struct EmergencyPauseEvent {
    pub pause_type: PauseType,
    pub guardian: Pubkey,
    pub timestamp: i64,
    pub reason: [u8; 32],
    pub auto_resume_after: i64,
}

#[event]
pub struct ProtocolResumedEvent {
    pub pause_type: PauseType,
    pub resumed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct GuardianAddedEvent {
    pub guardian: Pubkey,
    pub added_by: Pubkey,
    pub guardian_count: u8,
}

#[event]
pub struct GuardianRemovedEvent {
    pub guardian: Pubkey,
    pub removed_by: Pubkey,
    pub guardian_count: u8,
}

#[event]
pub struct ThresholdUpdatedEvent {
    pub new_threshold: u8,
    pub updated_by: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub profile_program: Pubkey,
    pub offer_program: Pubkey,
    pub trade_program: Pubkey,
    pub price_program: Pubkey,
    pub treasury: Pubkey,

    // ADVANCED FEE MANAGEMENT: Token and DEX Integration
    pub local_token_mint: Pubkey,
    pub jupiter_program: Pubkey,
    pub chain_fee_collector: Pubkey,
    pub warchest_address: Pubkey,

    // ENHANCED FEE STRUCTURE
    pub burn_fee_pct: u16,
    pub chain_fee_pct: u16,
    pub warchest_fee_pct: u16,
    pub conversion_fee_pct: u16,

    // DEX INTEGRATION SETTINGS
    pub max_slippage_bps: u16,
    pub min_conversion_amount: u64,
    pub max_conversion_routes: u8,

    // LEGACY COMPATIBILITY
    pub fee_rate: u16,
    pub burn_rate: u16,
    pub warchest_rate: u16,

    pub trade_limit_min: u64,
    pub trade_limit_max: u64,
    pub trade_expiration_timer: u64,
    pub trade_dispute_timer: u64,
    pub arbitration_fee_rate: u16,

    // PROGRAM VERSION TRACKING
    pub profile_program_version: u16,
    pub offer_program_version: u16,
    pub trade_program_version: u16,
    pub price_program_version: u16,
    pub upgrade_authority: Pubkey,

    // CIRCUIT BREAKER
    pub required_signatures: Option<u8>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateConfigParams {
    pub treasury: Option<Pubkey>,

    // ADVANCED FEE MANAGEMENT: Optional updates for new fields
    pub local_token_mint: Option<Pubkey>,
    pub jupiter_program: Option<Pubkey>,
    pub chain_fee_collector: Option<Pubkey>,
    pub warchest_address: Option<Pubkey>,

    // ENHANCED FEE STRUCTURE
    pub burn_fee_pct: Option<u16>,
    pub chain_fee_pct: Option<u16>,
    pub warchest_fee_pct: Option<u16>,
    pub conversion_fee_pct: Option<u16>,

    // DEX INTEGRATION SETTINGS
    pub max_slippage_bps: Option<u16>,
    pub min_conversion_amount: Option<u64>,
    pub max_conversion_routes: Option<u8>,

    // LEGACY COMPATIBILITY
    pub fee_rate: Option<u16>,
    pub burn_rate: Option<u16>,
    pub warchest_rate: Option<u16>,

    pub trade_limit_min: Option<u64>,
    pub trade_limit_max: Option<u64>,
    pub trade_expiration_timer: Option<u64>,
    pub trade_dispute_timer: Option<u64>,
    pub arbitration_fee_rate: Option<u16>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum ProgramType {
    Profile,
    Offer,
    Trade,
    Price,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateProgramVersionsParams {
    pub profile_program_version: Option<u16>,
    pub offer_program_version: Option<u16>,
    pub trade_program_version: Option<u16>,
    pub price_program_version: Option<u16>,
}

#[error_code]
pub enum HubError {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid fee rate")]
    InvalidFeeRate,
    #[msg("Invalid fee percentage (must be <= 10000 bps)")]
    InvalidFeePercentage,
    #[msg("Total fee percentages exceed 10000 bps")]
    ExcessiveFeeTotal,
    #[msg("Invalid program type")]
    InvalidProgramType,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Unauthorized program upgrade attempt")]
    UnauthorizedUpgrade,
    #[msg("Arithmetic underflow")]
    ArithmeticUnderflow,
    #[msg("Division by zero")]
    DivisionByZero,
    
    // CIRCUIT BREAKER ERRORS
    #[msg("Protocol is globally paused")]
    GlobalPause,
    #[msg("Trading is temporarily paused")]
    TradingPaused,
    #[msg("Deposits are temporarily paused")]
    DepositsPaused,
    #[msg("Withdrawals are temporarily paused")]
    WithdrawalsPaused,
    #[msg("Offer creation is temporarily paused")]
    OffersPaused,
    #[msg("Not an authorized guardian")]
    NotGuardian,
    #[msg("Maximum guardians reached")]
    MaxGuardiansReached,
    #[msg("Insufficient guardian signatures")]
    InsufficientSignatures,
    #[msg("Resume time not reached")]
    ResumeTooEarly,
    #[msg("Invalid pause type")]
    InvalidPauseType,
    #[msg("Approval expired")]
    ApprovalExpired,
    #[msg("Already signed this pause approval")]
    AlreadySigned,
    #[msg("Pause approval not found")]
    PauseApprovalNotFound,
    #[msg("Pause already executed")]
    PauseAlreadyExecuted,
    #[msg("Invalid guardian threshold")]
    InvalidThreshold,
    #[msg("String exceeds maximum length")]
    StringTooLong,
    #[msg("Collection is full")]
    CollectionFull,
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    #[msg("Page is full")]
    PageFull,
    #[msg("Invalid page number")]
    InvalidPageNumber,
    
    // Security-specific error codes
    #[msg("Invalid CPI program")]
    InvalidCpiProgram,
    #[msg("Protected account cannot be modified")]
    ProtectedAccount,
    #[msg("Insufficient rent exemption with safety margin")]
    InsufficientRentExemption,
    #[msg("Reentrancy detected")]
    ReentrancyDetected,
}
