use borsh::BorshDeserialize;
use anchor_lang::prelude::*;

use solana_program::{
    account_info::AccountInfo,
    msg,
    pubkey::Pubkey,
    sysvar::{Sysvar},
    instruction::AccountMeta,
};

// Add CPI imports
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::instruction::Instruction;

// Declare program ID
declare_id!("9iWg8Fhoh9Z5zo9rhgD3Z2FS46ggUwRnRwdKHtB92w74");

#[program]
pub mod hub {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        price_program: Pubkey,
        trade_program: Pubkey,
        profile_program: Pubkey,
        offer_program: Pubkey,
        fee_account: Pubkey,
        fee_basis_points: u16,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.price_program = price_program;
        config.trade_program = trade_program;
        config.profile_program = profile_program;
        config.offer_program = offer_program;
        config.fee_account = fee_account;
        config.fee_basis_points = fee_basis_points;
        config.is_paused = false;
        config.created_at = Clock::get()?.unix_timestamp;
        config.updated_at = Clock::get()?.unix_timestamp;

        msg!("Hub initialized successfully");
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        fee_basis_points: Option<u16>,
        fee_account: Option<Pubkey>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;

        if let Some(new_fee_basis_points) = fee_basis_points {
            config.fee_basis_points = new_fee_basis_points;
        }

        if let Some(new_fee_account) = fee_account {
            config.fee_account = new_fee_account;
        }

        config.updated_at = Clock::get()?.unix_timestamp;
        msg!("Hub config updated successfully");
        Ok(())
    }

    pub fn pause_operations(ctx: Context<AdminOperation>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.is_paused = true;
        config.updated_at = Clock::get()?.unix_timestamp;
        msg!("Operations paused successfully");
        Ok(())
    }

    pub fn resume_operations(ctx: Context<AdminOperation>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.is_paused = false;
        config.updated_at = Clock::get()?.unix_timestamp;
        msg!("Operations resumed successfully");
        Ok(())
    }

    pub fn transfer_admin(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(new_admin == ctx.accounts.new_admin.key(), HubError::InvalidNewAdmin);
        
        config.admin = new_admin;
        config.updated_at = Clock::get()?.unix_timestamp;
        msg!("Admin transferred successfully");
        Ok(())
    }

    pub fn collect_fees(_ctx: Context<CollectFees>) -> Result<()> {
        // TODO: Implement fee collection logic
        msg!("Fees collected successfully");
        Ok(())
    }

    pub fn create_trade_with_offer(
        ctx: Context<CreateTradeWithOffer>,
        amount: u64,
        price: u64,
    ) -> Result<()> {
        // First verify the offer through CPI to offer program
        let offer_accounts = vec![
            AccountMeta::new(ctx.accounts.offer.key(), false),
        ];

        // Verify offer is valid
        invoke(
            &Instruction {
                program_id: ctx.accounts.offer_program.key(),
                accounts: offer_accounts,
                data: vec![], // Add proper offer verification instruction data
            },
            &[ctx.accounts.offer.to_account_info()],
        )?;

        // Then create trade through CPI to trade program
        let trade_accounts = vec![
            AccountMeta::new(ctx.accounts.trade.key(), true),
            AccountMeta::new(ctx.accounts.buyer.key(), true),
            AccountMeta::new_readonly(ctx.accounts.token_mint.key(), false),
            AccountMeta::new(ctx.accounts.buyer_token_account.key(), false),
            AccountMeta::new(ctx.accounts.escrow_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ];

        invoke(
            &Instruction {
                program_id: ctx.accounts.trade_program.key(),
                accounts: trade_accounts,
                data: vec![], // Add proper trade creation instruction data
            },
            &[
                ctx.accounts.trade.to_account_info(),
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.token_mint.to_account_info(),
                ctx.accounts.buyer_token_account.to_account_info(),
                ctx.accounts.escrow_account.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Update profile stats through CPI to profile program
        let profile_accounts = vec![
            AccountMeta::new(ctx.accounts.buyer_profile.key(), false),
            AccountMeta::new(ctx.accounts.seller_profile.key(), false),
        ];

        invoke(
            &Instruction {
                program_id: ctx.accounts.profile_program.key(),
                accounts: profile_accounts,
                data: vec![], // Add proper profile update instruction data
            },
            &[
                ctx.accounts.buyer_profile.to_account_info(),
                ctx.accounts.seller_profile.to_account_info(),
            ],
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + std::mem::size_of::<HubConfig>())]
    pub config: Account<'info, HubConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, has_one = admin)]
    pub config: Account<'info, HubConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminOperation<'info> {
    #[account(mut, has_one = admin)]
    pub config: Account<'info, HubConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(mut, has_one = admin)]
    pub config: Account<'info, HubConfig>,
    pub admin: Signer<'info>,
    /// CHECK: New admin pubkey, validated in instruction
    pub new_admin: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CollectFees<'info> {
    #[account(mut, has_one = admin)]
    pub config: Account<'info, HubConfig>,
    pub admin: Signer<'info>,
    #[account(mut, constraint = fee_account.key() == config.fee_account)]
    /// CHECK: Fee account validated in constraint
    pub fee_account: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CreateTradeWithOffer<'info> {
    pub config: Account<'info, HubConfig>,
    /// CHECK: Trade account that will be initialized by the trade program
    #[account(mut)]
    pub trade: AccountInfo<'info>,
    /// CHECK: Offer account that will be verified by the offer program
    #[account(mut)]
    pub offer: AccountInfo<'info>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Buyer's profile account that will be updated by the profile program
    #[account(mut)]
    pub buyer_profile: AccountInfo<'info>,
    /// CHECK: Seller's profile account that will be updated by the profile program
    #[account(mut)]
    pub seller_profile: AccountInfo<'info>,
    /// CHECK: Token mint account verified by the token program
    pub token_mint: AccountInfo<'info>,
    /// CHECK: Buyer's token account verified by the token program
    #[account(mut)]
    pub buyer_token_account: AccountInfo<'info>,
    /// CHECK: Escrow token account verified by the token program
    #[account(mut)]
    pub escrow_account: AccountInfo<'info>,
    /// CHECK: Token program used for token operations
    pub token_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: Trade program that will handle the trade creation
    pub trade_program: AccountInfo<'info>,
    /// CHECK: Offer program that will verify the offer
    pub offer_program: AccountInfo<'info>,
    /// CHECK: Profile program that will update user profiles
    pub profile_program: AccountInfo<'info>,
}

#[account]
pub struct HubConfig {
    pub admin: Pubkey,
    pub price_program: Pubkey,
    pub trade_program: Pubkey,
    pub profile_program: Pubkey,
    pub offer_program: Pubkey,
    pub fee_account: Pubkey,
    pub fee_basis_points: u16,
    pub is_paused: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[error_code]
pub enum HubError {
    #[msg("The provided new admin account does not match the new admin pubkey")]
    InvalidNewAdmin,
}

#[cfg(test)]
mod tests {
    // Add tests here
}
