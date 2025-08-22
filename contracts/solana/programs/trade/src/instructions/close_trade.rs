use anchor_lang::prelude::*;
use crate::state::{Trade, seeds};
use crate::errors::ErrorCode;
use crate::events::TradeClosedEvent;
use localmoney_shared::SafeMath;

#[derive(Accounts)]
pub struct CloseTrade<'info> {
    #[account(
        mut,
        seeds = [
            seeds::SEED_PREFIX,
            seeds::SEED_TRADE,
            trade.id.to_le_bytes().as_ref(),
        ],
        bump = trade.bump,
        close = rent_collector,
        constraint = trade.is_terminal_state() @ ErrorCode::CannotCloseActiveTrade,
        constraint = Clock::get()?.unix_timestamp as u64 > 
                    trade.expires_at.safe_add(7 * 24 * 60 * 60)? @ ErrorCode::GracePeriodNotExpired,
    )]
    pub trade: Account<'info, Trade>,
    
    #[account(
        mut,
        constraint = rent_collector.key() == trade.buyer || 
                    rent_collector.key() == trade.seller @ ErrorCode::UnauthorizedRentCollector
    )]
    pub rent_collector: SystemAccount<'info>,
    
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<CloseTrade>) -> Result<()> {
    let trade = &ctx.accounts.trade;
    
    // Log closing event
    msg!("Closing trade {} and reclaiming {} lamports", 
         trade.id, 
         trade.to_account_info().lamports()
    );
    
    // Emit closing event
    emit!(TradeClosedEvent {
        trade_id: trade.id,
        rent_reclaimed: trade.to_account_info().lamports(),
        collector: ctx.accounts.rent_collector.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    // Account closure handled by Anchor's close constraint
    Ok(())
}

// Batch close for multiple trades
#[derive(Accounts)]
pub struct BatchCloseTrades<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub rent_collector: SystemAccount<'info>,
}

pub fn batch_close_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, BatchCloseTrades<'info>>,
    trade_accounts: Vec<AccountInfo<'info>>,
) -> Result<()> {
    let mut total_reclaimed = 0u64;
    let mut closed_count = 0u32;
    
    for trade_account in trade_accounts {
        // Skip if not enough data
        if trade_account.data_len() < 8 {
            continue;
        }
        
        // Deserialize and validate
        let trade_data = trade_account.try_borrow_data()?;
        
        // Check discriminator
        let discriminator = &trade_data[0..8];
        if discriminator != Trade::DISCRIMINATOR {
            continue;
        }
        
        // Deserialize trade
        let trade = Trade::try_deserialize(&mut &trade_data[8..])?;
        
        // Check if can be closed
        if !trade.is_terminal_state() {
            continue;
        }
        
        let clock = Clock::get()?;
        if clock.unix_timestamp as u64 <= trade.expires_at.safe_add(7 * 24 * 60 * 60)? {
            continue;
        }
        
        // Check authorization
        if ctx.accounts.rent_collector.key() != trade.buyer && 
           ctx.accounts.rent_collector.key() != trade.seller {
            continue;
        }
        
        // Reclaim rent
        let rent_amount = trade_account.lamports();
        **trade_account.try_borrow_mut_lamports()? = 0;
        **ctx.accounts.rent_collector.try_borrow_mut_lamports()? = 
            ctx.accounts.rent_collector.lamports().safe_add(rent_amount)?;
        
        total_reclaimed = total_reclaimed.safe_add(rent_amount)?;
        closed_count = closed_count.safe_add(1)?;
        
        // Mark account as closed by clearing discriminator
        drop(trade_data);
        let mut data = trade_account.try_borrow_mut_data()?;
        data[0..8].copy_from_slice(&[0u8; 8]);
    }
    
    msg!("Batch closed {} trades, reclaimed {} lamports", 
         closed_count, total_reclaimed);
    
    emit!(BatchTradeClosedEvent {
        trades_closed: closed_count,
        total_rent_reclaimed: total_reclaimed,
        collector: ctx.accounts.rent_collector.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct BatchTradeClosedEvent {
    pub trades_closed: u32,
    pub total_rent_reclaimed: u64,
    pub collector: Pubkey,
    pub timestamp: i64,
}