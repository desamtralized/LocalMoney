use anchor_lang::prelude::*;
use localmoney_shared::{constants::*, errors::LocalMoneyError, hub::*};

declare_id!("FHVko2rGMf6x2Tw6WSCbJBY8wLNymfSFqjtgESmvivwG");

#[program]
pub mod hub {
    use super::*;

    // Initialize the hub program
    pub fn initialize(ctx: Context<Initialize>, config: HubConfig) -> Result<()> {
        // Validate configuration
        validate_config(&config)?;

        // Set the admin and config in the hub account
        let hub = &mut ctx.accounts.hub;
        hub.admin = ctx.accounts.admin.key();
        hub.config = config;
        hub.bump = ctx.bumps.hub;

        msg!("Hub initialized with admin: {}", hub.admin);
        Ok(())
    }

    // Update the hub configuration
    pub fn update_config(ctx: Context<UpdateConfig>, config: HubConfig) -> Result<()> {
        // Validate configuration
        validate_config(&config)?;

        // Update the configuration in the hub account
        let hub = &mut ctx.accounts.hub;
        hub.config = config;

        msg!("Hub configuration updated");
        Ok(())
    }

    // Update the admin of the hub
    pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
        let hub = &mut ctx.accounts.hub;
        let old_admin = hub.admin;
        hub.admin = new_admin;

        msg!("Admin updated from {} to {}", old_admin, new_admin);
        Ok(())
    }
}

// Validate hub configuration
fn validate_config(config: &HubConfig) -> Result<()> {
    // Check platform fee (sum of fees must be <= MAX_PLATFORM_FEE)
    let total_platform_fee = config.chain_fee_pct as u8 + 
                             config.burn_fee_pct as u8 + 
                             config.warchest_fee_pct as u8;
    
    if total_platform_fee > MAX_PLATFORM_FEE {
        return Err(LocalMoneyError::InvalidPlatformFee.into());
    }

    // Check trade timers
    if config.trade_expiration_timer == 0 || 
       config.trade_expiration_timer > MAX_TRADE_EXPIRATION_TIMER {
        return Err(LocalMoneyError::InvalidParameter.into());
    }

    if config.trade_dispute_timer == 0 || 
       config.trade_dispute_timer > MAX_TRADE_DISPUTE_TIMER {
        return Err(LocalMoneyError::InvalidParameter.into());
    }

    Ok(())
}

// Context for initializing the hub
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + std::mem::size_of::<Hub>(),
        seeds = [b"hub"],
        bump
    )]
    pub hub: Account<'info, Hub>,
    
    pub system_program: Program<'info, System>,
}

// Context for updating the hub config
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        constraint = hub.admin == admin.key() @ LocalMoneyError::Unauthorized
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"hub"],
        bump = hub.bump
    )]
    pub hub: Account<'info, Hub>,
}

// Context for updating the admin
#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    #[account(
        constraint = hub.admin == admin.key() @ LocalMoneyError::Unauthorized
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"hub"],
        bump = hub.bump
    )]
    pub hub: Account<'info, Hub>,
} 