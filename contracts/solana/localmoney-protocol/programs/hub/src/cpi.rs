use anchor_lang::prelude::*;
use shared_types::*;

use crate::{
    ProtocolFees, TradingLimits, TimerConfig, ProgramAddresses, FeeCollectors, ConfigSnapshot,
    GlobalConfig,
};

/// CPI helper functions for other programs to query Hub configuration
/// 
/// These functions provide convenient interfaces for other programs to
/// extract configuration data from the Hub program's GlobalConfig account.
/// They are designed to be used by other programs when they have access
/// to the Hub's config account.

/// Extract protocol fees from Hub configuration
/// 
/// This function provides a safe interface for other programs to query
/// the current protocol fee configuration from the Hub program.
pub fn get_protocol_fees_from_config(config: &Account<GlobalConfig>) -> ProtocolFees {
    ProtocolFees {
        chain_fee_bps: config.chain_fee_bps,
        burn_fee_bps: config.burn_fee_bps,
        warchest_fee_bps: config.warchest_fee_bps,
        arbitration_fee_bps: config.arbitration_fee_bps,
    }
}

/// Extract trading limits from Hub configuration
/// 
/// Returns the trading limits configuration including min/max amounts
/// and active offer/trade limits per user.
pub fn get_trading_limits_from_config(config: &Account<GlobalConfig>) -> TradingLimits {
    TradingLimits {
        min_amount_usd: config.trade_limit_min,
        max_amount_usd: config.trade_limit_max,
        active_offers_limit: config.active_offers_limit,
        active_trades_limit: config.active_trades_limit,
    }
}

/// Extract timer configuration from Hub configuration
/// 
/// Returns the timer configuration for trade expiration and dispute windows.
pub fn get_timer_config_from_config(config: &Account<GlobalConfig>) -> TimerConfig {
    TimerConfig {
        trade_expiration_timer: config.trade_expiration_timer,
        trade_dispute_timer: config.trade_dispute_timer,
    }
}

/// Extract program addresses from Hub configuration
/// 
/// Returns the registered program addresses for all protocol programs.
pub fn get_program_addresses_from_config(config: &Account<GlobalConfig>) -> ProgramAddresses {
    ProgramAddresses {
        offer_program: config.offer_program,
        trade_program: config.trade_program,
        profile_program: config.profile_program,
        price_program: config.price_program,
    }
}

/// Extract fee collector addresses from Hub configuration
/// 
/// Returns the fee collector addresses for chain fees, warchest, and price provider.
pub fn get_fee_collectors_from_config(config: &Account<GlobalConfig>) -> FeeCollectors {
    FeeCollectors {
        chain_fee_collector: config.chain_fee_collector,
        warchest: config.warchest,
        price_provider: config.price_provider,
    }
}

/// Extract full configuration snapshot from Hub configuration
/// 
/// Returns a complete snapshot of the Hub configuration for detailed analysis.
pub fn get_full_config_from_config(config: &Account<GlobalConfig>) -> ConfigSnapshot {
    ConfigSnapshot {
        authority: config.authority,
        offer_program: config.offer_program,
        trade_program: config.trade_program,
        profile_program: config.profile_program,
        price_program: config.price_program,
        price_provider: config.price_provider,
        local_mint: config.local_mint,
        chain_fee_collector: config.chain_fee_collector,
        warchest: config.warchest,
        active_offers_limit: config.active_offers_limit,
        active_trades_limit: config.active_trades_limit,
        arbitration_fee_bps: config.arbitration_fee_bps,
        burn_fee_bps: config.burn_fee_bps,
        chain_fee_bps: config.chain_fee_bps,
        warchest_fee_bps: config.warchest_fee_bps,
        trade_expiration_timer: config.trade_expiration_timer,
        trade_dispute_timer: config.trade_dispute_timer,
        trade_limit_min: config.trade_limit_min,
        trade_limit_max: config.trade_limit_max,
    }
}

/// Validation helper functions that other programs can use

/// Validate user activity limits against Hub configuration
/// 
/// Checks if the user's current offer and trade counts are within the limits
/// configured in the Hub program.
pub fn validate_user_activity_limits_against_config(
    config: &Account<GlobalConfig>,
    user_offers: u8,
    user_trades: u8,
) -> Result<()> {
    require!(
        user_offers < config.active_offers_limit,
        LocalMoneyErrorCode::ActiveOffersLimitReached
    );

    require!(
        user_trades < config.active_trades_limit,
        LocalMoneyErrorCode::ActiveTradesLimitReached
    );

    Ok(())
}

/// Validate trade amount against Hub configuration
/// 
/// Checks if the trade amount is within the min/max limits configured in the Hub program.
pub fn validate_trade_amount_against_config(
    config: &Account<GlobalConfig>,
    amount_usd: u64,
) -> Result<()> {
    require!(
        amount_usd >= config.trade_limit_min,
        LocalMoneyErrorCode::BelowMinimumAmount
    );

    require!(
        amount_usd <= config.trade_limit_max,
        LocalMoneyErrorCode::AboveMaximumAmount
    );

    Ok(())
}

/// Validate offer amount range against Hub configuration
/// 
/// Checks if the offer's min/max amount range is valid and within protocol limits.
pub fn validate_offer_amount_range_against_config(
    config: &Account<GlobalConfig>,
    min_amount_usd: u64,
    max_amount_usd: u64,
) -> Result<()> {
    // Validate amount range
    require!(
        min_amount_usd < max_amount_usd,
        LocalMoneyErrorCode::InvalidAmountRange
    );

    // Validate against protocol limits
    require!(
        min_amount_usd >= config.trade_limit_min,
        LocalMoneyErrorCode::BelowMinimumAmount
    );

    require!(
        max_amount_usd <= config.trade_limit_max,
        LocalMoneyErrorCode::AboveMaximumAmount
    );

    Ok(())
}

/// Validate trade expiration against Hub configuration
/// 
/// Checks if a trade has expired based on the Hub's expiration timer configuration.
pub fn validate_trade_expiration_against_config(
    config: &Account<GlobalConfig>,
    trade_created_at: i64,
) -> Result<bool> {
    let current_time = Clock::get()?.unix_timestamp;
    let expiration_time = trade_created_at + config.trade_expiration_timer as i64;

    Ok(current_time <= expiration_time)
}

/// Validate dispute window against Hub configuration
/// 
/// Checks if a trade is still within the dispute window based on the Hub's dispute timer.
pub fn validate_dispute_window_against_config(
    config: &Account<GlobalConfig>,
    trade_created_at: i64,
) -> Result<bool> {
    let current_time = Clock::get()?.unix_timestamp;
    let dispute_window_end = trade_created_at + config.trade_dispute_timer as i64;

    Ok(current_time <= dispute_window_end)
}

/// Check if a program is authorized based on Hub configuration
/// 
/// Verifies if the given program ID matches the registered program for the specified type.
pub fn is_program_authorized_by_config(
    config: &Account<GlobalConfig>,
    program_id: &Pubkey,
    program_type: RegisteredProgramType,
) -> bool {
    match program_type {
        RegisteredProgramType::Offer => program_id == &config.offer_program,
        RegisteredProgramType::Trade => program_id == &config.trade_program,
        RegisteredProgramType::Profile => program_id == &config.profile_program,
        RegisteredProgramType::Price => program_id == &config.price_program,
        RegisteredProgramType::Arbitration => {
            // TODO: Add arbitration program field to config
            false
        }
    }
}

/// Higher-level helper functions for common operations

/// Get all trading-related configuration in one call
/// 
/// Returns trading limits, timer configuration, and protocol fees together
/// for convenient access by trading programs.
pub fn get_trading_config_from_config(
    config: &Account<GlobalConfig>,
) -> (TradingLimits, TimerConfig, ProtocolFees) {
    let limits = get_trading_limits_from_config(config);
    let timers = get_timer_config_from_config(config);
    let fees = get_protocol_fees_from_config(config);
    
    (limits, timers, fees)
}

/// Validate complete trade setup against Hub configuration
/// 
/// Performs comprehensive validation of a trade setup including amount limits,
/// user activity limits, and authorization checks.
pub fn validate_trade_setup_against_config(
    config: &Account<GlobalConfig>,
    amount_usd: u64,
    user_offers: u8,
    user_trades: u8,
) -> Result<()> {
    validate_trade_amount_against_config(config, amount_usd)?;
    validate_user_activity_limits_against_config(config, user_offers, user_trades)?;
    
    Ok(())
}

/// Validate complete offer setup against Hub configuration
/// 
/// Performs comprehensive validation of an offer setup including amount range,
/// user activity limits, and authorization checks.
pub fn validate_offer_setup_against_config(
    config: &Account<GlobalConfig>,
    min_amount_usd: u64,
    max_amount_usd: u64,
    user_offers: u8,
    user_trades: u8,
) -> Result<()> {
    validate_offer_amount_range_against_config(config, min_amount_usd, max_amount_usd)?;
    validate_user_activity_limits_against_config(config, user_offers, user_trades)?;
    
    Ok(())
}

/// Get all fee-related configuration in one call
/// 
/// Returns protocol fees and fee collector addresses together for
/// convenient access by programs handling fee distribution.
pub fn get_fee_config_from_config(
    config: &Account<GlobalConfig>,
) -> (ProtocolFees, FeeCollectors) {
    let fees = get_protocol_fees_from_config(config);
    let collectors = get_fee_collectors_from_config(config);
    
    (fees, collectors)
}

/// Validate time-based constraints against Hub configuration
/// 
/// Checks both trade expiration and dispute window status for a trade.
/// Returns (is_not_expired, is_within_dispute_window).
pub fn validate_time_constraints_against_config(
    config: &Account<GlobalConfig>,
    trade_created_at: i64,
) -> Result<(bool, bool)> {
    let is_not_expired = validate_trade_expiration_against_config(config, trade_created_at)?;
    let is_within_dispute_window = validate_dispute_window_against_config(config, trade_created_at)?;
    
    Ok((is_not_expired, is_within_dispute_window))
}

/// Account setup helpers for CPI calls

/// Standard Hub config account constraint
/// 
/// This function provides guidance for other programs on how to set up
/// Hub config access in their account structures.
pub fn hub_config_constraint_example() -> &'static str {
    r#"
    #[account(
        seeds = [b"config"],
        bump,
        seeds::program = hub_program.key()
    )]
    pub hub_config: Account<'info, hub::GlobalConfig>,
    
    /// CHECK: Hub program validation - this should be the Hub program ID  
    pub hub_program: UncheckedAccount<'info>,
    "#
}

/// Comprehensive Hub configuration interface for other programs
/// 
/// This module provides all the functions that other programs need to:
/// 1. Query Hub configuration data
/// 2. Validate parameters against Hub limits
/// 3. Access fee and limit information
/// 
/// Usage example in other programs:
/// ```rust
/// // In your account structure:
/// #[account(
///     seeds = [b"config"],
///     bump,
///     seeds::program = hub_program.key()
/// )]
/// pub hub_config: Account<'info, hub::GlobalConfig>,
/// 
/// // In your instruction:
/// let fees = hub::cpi::get_protocol_fees_from_config(&ctx.accounts.hub_config);
/// hub::cpi::validate_trade_amount_against_config(&ctx.accounts.hub_config, amount)?;
/// ```
pub struct HubConfigInterface;

impl HubConfigInterface {
    /// Example usage documentation for other programs
    pub fn usage_example() -> &'static str {
        r#"
// Add to your program's Cargo.toml:
// hub = { path = "../hub", features = ["cpi"] }

// In your account structure:
#[derive(Accounts)]
pub struct YourInstruction<'info> {
    #[account(
        seeds = [b"config"],
        bump,
        seeds::program = hub_program.key()
    )]
    pub hub_config: Account<'info, hub::GlobalConfig>,
    
    /// CHECK: Hub program validation
    pub hub_program: UncheckedAccount<'info>,
    
    // ... your other accounts
}

// In your instruction handler:
pub fn your_instruction(ctx: Context<YourInstruction>) -> Result<()> {
    // Query configuration
    let fees = hub::cpi::get_protocol_fees_from_config(&ctx.accounts.hub_config);
    let limits = hub::cpi::get_trading_limits_from_config(&ctx.accounts.hub_config);
    
    // Validate parameters
    hub::cpi::validate_trade_amount_against_config(&ctx.accounts.hub_config, amount_usd)?;
    hub::cpi::validate_user_activity_limits_against_config(
        &ctx.accounts.hub_config, 
        user_offers, 
        user_trades
    )?;
    
    // Use the configuration data...
    Ok(())
}
        "#
    }
}