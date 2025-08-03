#![allow(unexpected_cfgs)]
#![allow(deprecated)]
use anchor_lang::prelude::*;

declare_id!("2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2");

#[program]
pub mod hub {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
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
        hub_config.bump = ctx.bumps.hub_config;

        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
        let hub_config = &mut ctx.accounts.hub_config;

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
            hub_config.fee_rate = fee_rate;
        }
        if let Some(burn_rate) = params.burn_rate {
            hub_config.burn_rate = burn_rate;
        }
        if let Some(warchest_rate) = params.warchest_rate {
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
            hub_config.arbitration_fee_rate = arbitration_fee_rate;
        }

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
        1; // bump
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

#[error_code]
pub enum HubError {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid fee rate")]
    InvalidFeeRate,
    #[msg("Invalid program type")]
    InvalidProgramType,
}
