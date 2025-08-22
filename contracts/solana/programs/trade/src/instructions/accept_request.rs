use anchor_lang::prelude::*;
use localmoney_shared::{BoundedString, TradeState, TradeStateItem, TradeStateChangeEvent};
use crate::state::{Trade, transitions::AuthorizationRole};
use crate::errors::ErrorCode;
use crate::utils::validation::{
    validate_comprehensive_authorization,
    validate_state_transition,
};

#[derive(Accounts)]
pub struct AcceptRequest<'info> {
    #[account(mut)]
    pub trade: Account<'info, Trade>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
}

pub fn handler(ctx: Context<AcceptRequest>, seller_contact: String) -> Result<()> {
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
        &TradeState::RequestAccepted,
        &ctx.accounts.seller.key(),
        trade,
        clock.unix_timestamp as u64,
    )?;
    
    // Validate input
    require!(
        !seller_contact.trim().is_empty(),
        ErrorCode::InvalidParameter
    );
    require!(seller_contact.len() <= 200, ErrorCode::InvalidParameter);
    
    // Update trade state
    trade.seller_contact = BoundedString::from_option(Some(seller_contact))?;
    trade.transition_state(
        TradeState::RequestAccepted,
        ctx.accounts.seller.key(),
        clock.unix_timestamp,
    )?;
    
    // Emit event
    emit!(TradeStateChangeEvent {
        trade_id: trade.id,
        old_state: "RequestCreated".to_string(),
        new_state: format!("{:?}", TradeState::RequestAccepted),
        actor: ctx.accounts.seller.key(),
        timestamp: clock.unix_timestamp,
        trade_index: trade.id,
    });
    
    Ok(())
}