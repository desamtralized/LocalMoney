use anchor_lang::prelude::*;

declare_id!("AHS2kqQDh8Zn3YTqsxJxm9X1uadUuuq7kdddH9BvVkMr");

#[program]
pub mod hub {
    use super::*; // Make functions from the outer scope available
    pub fn initialize(
        ctx: Context<InitializeHub>,
        offer_addr: Pubkey,
        trade_addr: Pubkey,
        profile_addr: Pubkey,
        price_addr: Pubkey,
        price_provider_addr: Pubkey,
        local_market_addr: Pubkey,
        local_denom_mint: Pubkey, // Assuming Denom refers to a token mint
        chain_fee_collector_addr: Pubkey,
        warchest_addr: Pubkey,
        active_offers_limit: u8,
        active_trades_limit: u8,
        arbitration_fee_bps: u16, // Basis points (e.g., 100bps = 1%)
        burn_fee_bps: u16,
        chain_fee_bps: u16,
        warchest_fee_bps: u16,
        trade_expiration_timer: u64, // seconds
        trade_dispute_timer: u64,    // seconds
        trade_limit_min_usd: u128,
        trade_limit_max_usd: u128,
    ) -> Result<()> {
        let hub_config = &mut ctx.accounts.hub_config;
        hub_config.admin = *ctx.accounts.admin.key;
        hub_config.offer_addr = offer_addr;
        hub_config.trade_addr = trade_addr;
        hub_config.profile_addr = profile_addr;
        hub_config.price_addr = price_addr;
        hub_config.price_provider_addr = price_provider_addr;
        hub_config.local_market_addr = local_market_addr;
        hub_config.local_denom_mint = local_denom_mint;
        hub_config.chain_fee_collector_addr = chain_fee_collector_addr;
        hub_config.warchest_addr = warchest_addr;
        hub_config.active_offers_limit = active_offers_limit;
        hub_config.active_trades_limit = active_trades_limit;
        hub_config.arbitration_fee_bps = arbitration_fee_bps;
        hub_config.burn_fee_bps = burn_fee_bps;
        hub_config.chain_fee_bps = chain_fee_bps;
        hub_config.warchest_fee_bps = warchest_fee_bps;
        hub_config.trade_expiration_timer = trade_expiration_timer;
        hub_config.trade_dispute_timer = trade_dispute_timer;
        hub_config.trade_limit_min_usd = trade_limit_min_usd;
        hub_config.trade_limit_max_usd = trade_limit_max_usd;

        // Validation: Total fees <= 10% (1000 bps)
        let _total_fees_bps = arbitration_fee_bps
            .saturating_add(burn_fee_bps)
            .saturating_add(chain_fee_bps)
            .saturating_add(warchest_fee_bps);
        // Note: The spec mentions total fees <= 10% for UpdateConfig.
        // Here, arbitration_fee_bps is part of the trade settlement, not necessarily additive to the others for *all* scenarios.
        // For now, let's assume a simpler sum for initial validation, can be refined.
        // The spec says: "Validate total fees ≤ 10%" for UpdateConfig referring to burn, chain, warchest fees.
        // Let's assume the sum of burn_fee_bps, chain_fee_bps, warchest_fee_bps should be <= 1000 bps.
        let platform_fees_bps = burn_fee_bps
            .saturating_add(chain_fee_bps)
            .saturating_add(warchest_fee_bps);
        require!(platform_fees_bps <= 1000, HubError::TotalFeeExceedsLimit);

        // Validate timers (example: not zero, can add more specific bounds later)
        require!(trade_expiration_timer > 0, HubError::InvalidTimerValue);
        require!(trade_dispute_timer > 0, HubError::InvalidTimerValue);

        Ok(())
    }

    pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
        let hub_config = &mut ctx.accounts.hub_config;
        hub_config.admin = new_admin;
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
        local_denom_mint: Pubkey,
        chain_fee_collector_addr: Pubkey,
        warchest_addr: Pubkey,
        active_offers_limit: u8,
        active_trades_limit: u8,
        arbitration_fee_bps: u16,
        burn_fee_bps: u16,
        chain_fee_bps: u16,
        warchest_fee_bps: u16,
        trade_expiration_timer: u64,
        trade_dispute_timer: u64,
        trade_limit_min_usd: u128,
        trade_limit_max_usd: u128,
    ) -> Result<()> {
        let hub_config = &mut ctx.accounts.hub_config;

        // Validation: Total fees <= 10% (1000 bps)
        let platform_fees_bps = burn_fee_bps
            .saturating_add(chain_fee_bps)
            .saturating_add(warchest_fee_bps);
        require!(platform_fees_bps <= 1000, HubError::TotalFeeExceedsLimit);

        // Validate timers (example: not zero, can add more specific bounds later)
        require!(trade_expiration_timer > 0, HubError::InvalidTimerValue);
        require!(trade_dispute_timer > 0, HubError::InvalidTimerValue);
        // Could add validation for trade_limit_min_usd <= trade_limit_max_usd if needed

        hub_config.offer_addr = offer_addr;
        hub_config.trade_addr = trade_addr;
        hub_config.profile_addr = profile_addr;
        hub_config.price_addr = price_addr;
        hub_config.price_provider_addr = price_provider_addr;
        hub_config.local_market_addr = local_market_addr;
        hub_config.local_denom_mint = local_denom_mint;
        hub_config.chain_fee_collector_addr = chain_fee_collector_addr;
        hub_config.warchest_addr = warchest_addr;
        hub_config.active_offers_limit = active_offers_limit;
        hub_config.active_trades_limit = active_trades_limit;
        hub_config.arbitration_fee_bps = arbitration_fee_bps;
        hub_config.burn_fee_bps = burn_fee_bps;
        hub_config.chain_fee_bps = chain_fee_bps;
        hub_config.warchest_fee_bps = warchest_fee_bps;
        hub_config.trade_expiration_timer = trade_expiration_timer;
        hub_config.trade_dispute_timer = trade_dispute_timer;
        hub_config.trade_limit_min_usd = trade_limit_min_usd;
        hub_config.trade_limit_max_usd = trade_limit_max_usd;

        // TODO: CPI calls to OfferRegisterHub, PriceRegisterHub, ProfileRegisterHub, TradeRegisterHub
        // These will require defining these external programs and their instructions.
        // For example:
        // let cpi_program = ctx.accounts.offer_program.to_account_info();
        // let cpi_accounts = offer::cpi::accounts::RegisterHub {
        // hub: ctx.accounts.hub_config.to_account_info(), // The hub account itself
        // };
        // let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        // offer::cpi::register_hub(cpi_ctx)?;

        Ok(())
    }
}

#[account]
#[derive(Default)] // Added Default for potential initialization needs
pub struct HubConfig {
    pub admin: Pubkey,
    pub offer_addr: Pubkey,
    pub trade_addr: Pubkey,
    pub profile_addr: Pubkey,
    pub price_addr: Pubkey,
    pub price_provider_addr: Pubkey,
    pub local_market_addr: Pubkey,
    pub local_denom_mint: Pubkey, // Assuming Denom was a token mint
    pub chain_fee_collector_addr: Pubkey,
    pub warchest_addr: Pubkey,
    pub active_offers_limit: u8,
    pub active_trades_limit: u8,
    pub arbitration_fee_bps: u16, // Basis points (100 bps = 1%)
    pub burn_fee_bps: u16,
    pub chain_fee_bps: u16,
    pub warchest_fee_bps: u16,
    pub trade_expiration_timer: u64, // seconds
    pub trade_dispute_timer: u64,    // seconds
    pub trade_limit_min_usd: u128,
    pub trade_limit_max_usd: u128,
    // pub bump: u8 // Anchor will add this for the PDA
}

#[derive(Accounts)]
pub struct InitializeHub<'info> {
    #[account(
        init,
        payer = admin, // The admin pays for account creation
        space = 8 + 32 * 10 + 1 * 2 + 2 * 4 + 8 * 2 + 16 * 2, // Discriminator + Pubkeys + u8s + u16s + u64s + u128s
        seeds = [b"hub"],
        bump
    )]
    pub hub_config: Account<'info, HubConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    #[account(
        mut,
        has_one = admin @ HubError::UnauthorizedAdmin // Ensures only the current admin can call this
    )]
    pub hub_config: Account<'info, HubConfig>,
    pub admin: Signer<'info>, // The current admin signing the transaction
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        has_one = admin @ HubError::UnauthorizedAdmin
    )]
    pub hub_config: Account<'info, HubConfig>,
    pub admin: Signer<'info>,
    // TODO: Add other program accounts here when CPIs are implemented
    // pub offer_program: Program<'info, offer::program::Offer>,
    // pub price_program: Program<'info, price::program::Price>,
    // pub profile_program: Program<'info, profile::program::Profile>,
    // pub trade_program: Program<'info, trade::program::Trade>,
}

#[error_code]
pub enum HubError {
    #[msg("Total platform fees (burn, chain, warchest) must not exceed 10% (1000 bps).")]
    TotalFeeExceedsLimit,
    #[msg("Timer values must be greater than zero.")]
    InvalidTimerValue,
    #[msg("Unauthorized: Only the current admin can perform this action.")]
    UnauthorizedAdmin,
}
