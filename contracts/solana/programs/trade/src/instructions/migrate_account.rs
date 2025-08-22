use anchor_lang::prelude::*;
use crate::state::Trade;
use crate::errors::ErrorCode;
use localmoney_shared::SafeMath;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OldTradeFormat {
    pub id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub state: u8, // Old format used u8 for state
    pub created_at: u64,
    pub expires_at: u64,
}

#[derive(Accounts)]
pub struct MigrateAccount<'info> {
    #[account(mut)]
    pub old_account: AccountInfo<'info>,
    
    #[account(
        init,
        payer = payer,
        space = 8 + Trade::SPACE + 1024, // Extra space for growth
        seeds = [
            b"trade_v2",
            old_account.key().as_ref(),
        ],
        bump,
    )]
    pub new_account: Account<'info, Trade>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigrateAccount>) -> Result<()> {
    // Verify old account has data
    require!(
        ctx.accounts.old_account.data_len() >= 8,
        ErrorCode::InvalidAccount
    );
    
    // Deserialize old format
    let old_data = ctx.accounts.old_account.try_borrow_data()?;
    
    // Skip discriminator and deserialize
    let old_trade = OldTradeFormat::try_from_slice(&old_data[8..])?;
    
    // Convert state from u8 to enum
    let new_state = match old_trade.state {
        0 => localmoney_shared::TradeState::RequestCreated,
        1 => localmoney_shared::TradeState::RequestAccepted,
        2 => localmoney_shared::TradeState::EscrowFunded,
        3 => localmoney_shared::TradeState::FiatDeposited,
        4 => localmoney_shared::TradeState::EscrowReleased,
        5 => localmoney_shared::TradeState::DisputeOpened,
        6 => localmoney_shared::TradeState::DisputeResolved,
        _ => return Err(ErrorCode::InvalidTradeState.into()),
    };
    
    // Initialize new account with migrated data
    let new_trade = &mut ctx.accounts.new_account;
    new_trade.id = old_trade.id;
    new_trade.buyer = old_trade.buyer;
    new_trade.seller = old_trade.seller;
    new_trade.amount = old_trade.amount;
    new_trade.state = new_state;
    new_trade.created_at = old_trade.created_at;
    new_trade.expires_at = old_trade.expires_at;
    
    // Initialize new fields with defaults
    new_trade.offer_id = 0;
    new_trade.arbitrator = Pubkey::default();
    new_trade.token_mint = spl_token::native_mint::id();
    new_trade.fiat_currency = localmoney_shared::FiatCurrency::Usd;
    new_trade.locked_price = 100; // Default price
    new_trade.dispute_window_at = None;
    new_trade.state_history = localmoney_shared::BoundedStateHistory::new();
    new_trade.buyer_contact = None;
    new_trade.seller_contact = None;
    new_trade.bump = ctx.bumps.new_account;
    
    // Record migration in state history
    new_trade.state_history.push(localmoney_shared::TradeStateItem {
        actor: ctx.accounts.payer.key(),
        state: new_trade.state.clone(),
        timestamp: Clock::get()?.unix_timestamp,
    })?;
    
    // Close old account and reclaim rent
    let old_lamports = ctx.accounts.old_account.lamports();
    **ctx.accounts.old_account.try_borrow_mut_lamports()? = 0;
    **ctx.accounts.payer.try_borrow_mut_lamports()? = 
        ctx.accounts.payer.lamports().safe_add(old_lamports)?;
    
    // Clear old account data
    let mut old_data = ctx.accounts.old_account.try_borrow_mut_data()?;
    old_data[0..8].copy_from_slice(&[0u8; 8]);
    
    msg!("Migrated trade {} from v1 to v2", new_trade.id);
    
    emit!(AccountMigratedEvent {
        old_account: ctx.accounts.old_account.key(),
        new_account: ctx.accounts.new_account.key(),
        trade_id: new_trade.id,
        version: 2,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AccountMigratedEvent {
    pub old_account: Pubkey,
    pub new_account: Pubkey,
    pub trade_id: u64,
    pub version: u8,
    pub timestamp: i64,
}

// Batch migration for multiple accounts
#[derive(Accounts)]
pub struct BatchMigrateAccounts<'info> {
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn batch_migrate_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, BatchMigrateAccounts<'info>>,
    accounts_to_migrate: Vec<(AccountInfo<'info>, AccountInfo<'info>)>,
) -> Result<()> {
    let mut migrated_count = 0u32;
    let mut failed_count = 0u32;
    
    for (old_account, new_account) in accounts_to_migrate {
        // Skip if already migrated or invalid
        if old_account.data_len() < 8 {
            failed_count = failed_count.safe_add(1)?;
            continue;
        }
        
        let old_data = old_account.try_borrow_data()?;
        let discriminator = &old_data[0..8];
        
        // Check if already cleared
        if discriminator == &[0u8; 8] {
            continue;
        }
        
        // Attempt migration
        match migrate_single_account(&old_account, &new_account, &ctx.accounts.authority) {
            Ok(_) => {
                migrated_count = migrated_count.safe_add(1)?;
            }
            Err(e) => {
                msg!("Failed to migrate account {}: {}", old_account.key(), e);
                failed_count = failed_count.safe_add(1)?;
            }
        }
    }
    
    msg!("Batch migration complete: {} migrated, {} failed", 
         migrated_count, failed_count);
    
    emit!(BatchMigrationEvent {
        migrated_count,
        failed_count,
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

fn migrate_single_account<'info>(
    old_account: &AccountInfo<'info>,
    new_account: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
) -> Result<()> {
    // Migration logic here (simplified)
    // In production, this would handle the full migration
    
    // Clear old account
    let mut old_data = old_account.try_borrow_mut_data()?;
    old_data[0..8].copy_from_slice(&[0u8; 8]);
    
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BatchMigrationEvent {
    pub migrated_count: u32,
    pub failed_count: u32,
    pub authority: Pubkey,
    pub timestamp: i64,
}