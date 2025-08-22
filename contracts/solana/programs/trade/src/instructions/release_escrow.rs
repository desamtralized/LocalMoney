use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, burn, Mint, TokenAccount, TokenInterface, 
    TransferChecked, Burn,
};
use localmoney_shared::{
    TradeState, FeeDistributionEvent, TradeCompletedEvent,
    validate_token_interface_program, SafeMath,
};
use hub::{require_not_paused, Operation};
use crate::state::{Trade, transitions::AuthorizationRole, fees::calculate_standard_fees};
use crate::errors::ErrorCode;
use crate::utils::validation::{
    validate_comprehensive_authorization,
    validate_state_transition,
};

#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    #[account(mut)]
    pub trade: Account<'info, Trade>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    /// CHECK: Buyer account from trade
    pub buyer: UncheckedAccount<'info>,
    
    #[account(
        mut,
        token::mint = token_mint,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = token_mint,
    )]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = token_mint,
    )]
    pub chain_fee_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = token_mint,
    )]
    pub warchest_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_mint: InterfaceAccount<'info, Mint>,
    
    /// CHECK: Escrow authority PDA
    pub escrow_authority: UncheckedAccount<'info>,
    
    /// CHECK: Hub config for circuit breaker and fee destinations
    pub hub_config: UncheckedAccount<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<ReleaseEscrow>) -> Result<()> {
    // Circuit breaker check
    require_not_paused!(&ctx.accounts.hub_config, Operation::ReleaseEscrow);
    
    let trade = &mut ctx.accounts.trade;
    let clock = Clock::get()?;
    
    // Validate seller authorization
    validate_comprehensive_authorization(
        &ctx.accounts.seller.key(),
        trade,
        AuthorizationRole::Seller,
    )?;
    
    // Validate state transition
    validate_state_transition(
        &trade.state,
        &TradeState::EscrowReleased,
        &ctx.accounts.seller.key(),
        trade,
        clock.unix_timestamp as u64,
    )?;
    
    // Validate token program
    validate_token_interface_program(&ctx.accounts.token_program.to_account_info())?;
    
    // Calculate fees
    let fee_info = calculate_standard_fees(trade.amount)?;
    
    // Transfer to buyer (amount minus fees)
    let buyer_amount = fee_info.net_amount();
    if buyer_amount > 0 {
        let seeds = &[
            b"localmoney",
            b"trade",
            trade.id.to_le_bytes().as_ref(),
            b"escrow",
            &[ctx.bumps.escrow_authority],
        ];
        let signer_seeds = &[&seeds[..]];
        
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        
        transfer_checked(cpi_ctx, buyer_amount, ctx.accounts.token_mint.decimals)?;
    }
    
    // Burn fees
    if fee_info.burn_amount > 0 {
        let seeds = &[
            b"localmoney",
            b"trade",
            trade.id.to_le_bytes().as_ref(),
            b"escrow",
            &[ctx.bumps.escrow_authority],
        ];
        let signer_seeds = &[&seeds[..]];
        
        let cpi_accounts = Burn {
            mint: ctx.accounts.token_mint.to_account_info(),
            from: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        
        burn(cpi_ctx, fee_info.burn_amount)?;
    }
    
    // Transfer chain fees
    if fee_info.chain_amount > 0 {
        let seeds = &[
            b"localmoney",
            b"trade",
            trade.id.to_le_bytes().as_ref(),
            b"escrow",
            &[ctx.bumps.escrow_authority],
        ];
        let signer_seeds = &[&seeds[..]];
        
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.chain_fee_token_account.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        
        transfer_checked(cpi_ctx, fee_info.chain_amount, ctx.accounts.token_mint.decimals)?;
    }
    
    // Transfer warchest fees
    if fee_info.warchest_amount > 0 {
        let seeds = &[
            b"localmoney",
            b"trade",
            trade.id.to_le_bytes().as_ref(),
            b"escrow",
            &[ctx.bumps.escrow_authority],
        ];
        let signer_seeds = &[&seeds[..]];
        
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.warchest_token_account.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        
        transfer_checked(cpi_ctx, fee_info.warchest_amount, ctx.accounts.token_mint.decimals)?;
    }
    
    // Update trade state
    trade.transition_state(
        TradeState::EscrowReleased,
        ctx.accounts.seller.key(),
        clock.unix_timestamp,
    )?;
    
    // Emit events
    emit!(FeeDistributionEvent {
        trade_id: trade.id,
        burn_amount: fee_info.burn_amount,
        chain_amount: fee_info.chain_amount,
        warchest_amount: fee_info.warchest_amount,
        total_fees: fee_info.total_fees(),
        timestamp: clock.unix_timestamp,
    });
    
    emit!(TradeCompletedEvent {
        trade_id: trade.id,
        buyer: trade.buyer,
        seller: trade.seller,
        amount_transferred: buyer_amount,
        total_fees: fee_info.total_fees(),
        completion_type: "Normal".to_string(),
        timestamp: clock.unix_timestamp,
        trade_index: trade.id,
    });
    
    Ok(())
}