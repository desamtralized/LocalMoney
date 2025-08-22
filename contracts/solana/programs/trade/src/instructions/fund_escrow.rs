use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};
use localmoney_shared::{
    TradeState, TradeStateItem, EscrowFundedEvent,
    validate_token_interface_program,
};
use hub::{require_not_paused, Operation};
use crate::state::{Trade, transitions::AuthorizationRole};
use crate::errors::ErrorCode;
use crate::utils::validation::{
    validate_comprehensive_authorization,
    validate_state_transition,
};

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(mut)]
    pub trade: Account<'info, Trade>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = seller,
    )]
    pub seller_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = token_mint,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_mint: InterfaceAccount<'info, Mint>,
    
    /// CHECK: Hub config for circuit breaker
    pub hub_config: UncheckedAccount<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<FundEscrow>) -> Result<()> {
    // Circuit breaker check
    require_not_paused!(&ctx.accounts.hub_config, Operation::FundEscrow);
    
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
        &TradeState::EscrowFunded,
        &ctx.accounts.seller.key(),
        trade,
        clock.unix_timestamp as u64,
    )?;
    
    // Validate trade hasn't expired
    require!(
        clock.unix_timestamp as u64 <= trade.expires_at,
        ErrorCode::TradeExpired
    );
    
    // Validate token program
    validate_token_interface_program(&ctx.accounts.token_program.to_account_info())?;
    
    // Transfer tokens to escrow
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.seller_token_account.to_account_info(),
        to: ctx.accounts.escrow_token_account.to_account_info(),
        authority: ctx.accounts.seller.to_account_info(),
        mint: ctx.accounts.token_mint.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    transfer_checked(cpi_ctx, trade.amount, ctx.accounts.token_mint.decimals)?;
    
    // Update trade state
    trade.transition_state(
        TradeState::EscrowFunded,
        ctx.accounts.seller.key(),
        clock.unix_timestamp,
    )?;
    
    // Set dispute window (24 hours from now)
    trade.set_dispute_window(86400)?;
    
    // Emit event
    emit!(EscrowFundedEvent {
        trade_id: trade.id,
        seller: ctx.accounts.seller.key(),
        amount: trade.amount,
        escrow_account: ctx.accounts.escrow_token_account.key(),
        timestamp: clock.unix_timestamp,
        trade_index: trade.id,
    });
    
    Ok(())
}