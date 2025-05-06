use anchor_lang::prelude::*;

declare_id!("9n9sytEuPVqw9dCCdAVb5R47hXFpyyNC3Xo4aFSDdSYx");

pub mod cpi;

#[program]
pub mod localmoney_hub {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey) -> Result<()> {
        msg!("Initializing LocalMoney Hub with admin: {}", admin);
        let hub_config = &mut ctx.accounts.hub_config;
        hub_config.admin = admin;
        hub_config.bump = ctx.bumps.hub_config;

        // Set default values for timers and limits
        hub_config.active_offers_limit = 10;
        hub_config.active_trades_limit = 10;
        hub_config.trade_expiration_timer = 86400; // 24 hours in seconds
        hub_config.trade_dispute_timer = 43200; // 12 hours in seconds
        hub_config.trade_limit_min = 10; // $10 USD minimum
        hub_config.trade_limit_max = 1000; // $1000 USD maximum

        // Set default fee structure
        hub_config.arbitration_fee_pct = 100; // 1% (using basis points)
        hub_config.burn_fee_pct = 50; // 0.5%
        hub_config.chain_fee_pct = 150; // 1.5%
        hub_config.warchest_fee_pct = 200; // 2%

        // Mark as not fully configured yet
        hub_config.is_fully_configured = false;

        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        offer_addr: Pubkey,
        trade_addr: Pubkey,
        profile_addr: Pubkey,
        price_addr: Pubkey,
        price_provider_addr: Pubkey,
        local_market_addr: Pubkey,
        local_denom: String,
        chain_fee_collector_addr: Pubkey,
        warchest_addr: Pubkey,
        active_offers_limit: u8,
        active_trades_limit: u8,
        arbitration_fee_pct: u16,
        burn_fee_pct: u16,
        chain_fee_pct: u16,
        warchest_fee_pct: u16,
        trade_expiration_timer: u64,
        trade_dispute_timer: u64,
        trade_limit_min: u64,
        trade_limit_max: u64,
    ) -> Result<()> {
        let hub_config = &mut ctx.accounts.hub_config;

        // Fee validation - total fees cannot exceed 10% (1000 basis points)
        let total_fee_pct = arbitration_fee_pct + burn_fee_pct + chain_fee_pct + warchest_fee_pct;
        require!(total_fee_pct <= 1000, HubError::FeeTooHigh);

        // Timer validations
        require!(
            trade_expiration_timer >= 3600 && trade_expiration_timer <= 2592000, // 1 hour to 30 days
            HubError::InvalidTimer
        );
        require!(
            trade_dispute_timer >= 1800 && trade_dispute_timer <= 1209600, // 30 minutes to 14 days
            HubError::InvalidTimer
        );

        // Trade limit validations
        require!(
            trade_limit_min < trade_limit_max,
            HubError::InvalidTradeLimits
        );

        // Update all fields
        hub_config.offer_addr = offer_addr;
        hub_config.trade_addr = trade_addr;
        hub_config.profile_addr = profile_addr;
        hub_config.price_addr = price_addr;
        hub_config.price_provider_addr = price_provider_addr;
        hub_config.local_market_addr = local_market_addr;
        hub_config.local_denom = local_denom;
        hub_config.chain_fee_collector_addr = chain_fee_collector_addr;
        hub_config.warchest_addr = warchest_addr;
        hub_config.active_offers_limit = active_offers_limit;
        hub_config.active_trades_limit = active_trades_limit;
        hub_config.arbitration_fee_pct = arbitration_fee_pct;
        hub_config.burn_fee_pct = burn_fee_pct;
        hub_config.chain_fee_pct = chain_fee_pct;
        hub_config.warchest_fee_pct = warchest_fee_pct;
        hub_config.trade_expiration_timer = trade_expiration_timer;
        hub_config.trade_dispute_timer = trade_dispute_timer;
        hub_config.trade_limit_min = trade_limit_min;
        hub_config.trade_limit_max = trade_limit_max;

        // Mark as fully configured
        hub_config.is_fully_configured = true;

        msg!("Hub config updated successfully");

        // CPI calls to register hub with other modules
        // Note: These would normally be actual CPI calls, but we're stubbing them here
        // as we'll implement the full communication when all modules are complete

        // Register Hub with Offer program
        msg!("Registering Hub with Offer program");
        // TODO: implement CPI call to offer_addr.register_hub()

        // Register Hub with Profile program
        msg!("Registering Hub with Profile program");
        // TODO: implement CPI call to profile_addr.register_hub()

        // Register Hub with Price program
        msg!("Registering Hub with Price program");
        // TODO: implement CPI call to price_addr.register_hub()

        // Register Hub with Trade program
        msg!("Registering Hub with Trade program");
        // TODO: implement CPI call to trade_addr.register_hub()

        Ok(())
    }

    pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
        msg!(
            "Updating Hub admin from: {} to: {}",
            ctx.accounts.hub_config.admin,
            new_admin
        );

        ctx.accounts.hub_config.admin = new_admin;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = HubConfig::SPACE,
        seeds = [b"hub"],
        bump
    )]
    pub hub_config: Account<'info, HubConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"hub"],
        bump = hub_config.bump,
        constraint = hub_config.admin == admin.key() @ HubError::Unauthorized
    )]
    pub hub_config: Account<'info, HubConfig>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"hub"],
        bump = hub_config.bump,
        constraint = hub_config.admin == admin.key() @ HubError::Unauthorized
    )]
    pub hub_config: Account<'info, HubConfig>,
}

#[account]
#[derive(Default)]
pub struct HubConfig {
    // Admin authority
    pub admin: Pubkey,

    // Module addresses
    pub offer_addr: Pubkey,
    pub trade_addr: Pubkey,
    pub profile_addr: Pubkey,
    pub price_addr: Pubkey,
    pub price_provider_addr: Pubkey,
    pub local_market_addr: Pubkey,

    // System configuration
    pub local_denom: String, // max 20 chars
    pub chain_fee_collector_addr: Pubkey,
    pub warchest_addr: Pubkey,
    pub active_offers_limit: u8,
    pub active_trades_limit: u8,

    // Fee structure (in basis points, 100 = 1%)
    pub arbitration_fee_pct: u16,
    pub burn_fee_pct: u16,
    pub chain_fee_pct: u16,
    pub warchest_fee_pct: u16,

    // Timers (in seconds)
    pub trade_expiration_timer: u64,
    pub trade_dispute_timer: u64,

    // Trade limits (in USD)
    pub trade_limit_min: u64,
    pub trade_limit_max: u64,

    // Configuration state
    pub is_fully_configured: bool,

    // PDA bump
    pub bump: u8,
}

impl HubConfig {
    pub const SPACE: usize = 8 +  // discriminator
        32 +                      // admin
        32 +                      // offer_addr
        32 +                      // trade_addr
        32 +                      // profile_addr
        32 +                      // price_addr
        32 +                      // price_provider_addr
        32 +                      // local_market_addr
        4 + 20 +                  // local_denom (String with max 20 chars)
        32 +                      // chain_fee_collector_addr
        32 +                      // warchest_addr
        1 +                       // active_offers_limit
        1 +                       // active_trades_limit
        2 +                       // arbitration_fee_pct
        2 +                       // burn_fee_pct
        2 +                       // chain_fee_pct
        2 +                       // warchest_fee_pct
        8 +                       // trade_expiration_timer
        8 +                       // trade_dispute_timer
        8 +                       // trade_limit_min
        8 +                       // trade_limit_max
        1 +                       // is_fully_configured
        1; // bump
}

#[error_code]
pub enum HubError {
    #[msg("Unauthorized access")]
    Unauthorized,

    #[msg("Total fees exceed maximum of 10%")]
    FeeTooHigh,

    #[msg("Invalid timer values")]
    InvalidTimer,

    #[msg("Invalid trade limits")]
    InvalidTradeLimits,

    #[msg("Invalid hub address for cross-program invocation")]
    InvalidHubAddress,
}
