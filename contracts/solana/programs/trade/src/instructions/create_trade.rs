use anchor_lang::prelude::*;
use anchor_lang::AccountDeserialize;
use localmoney_shared::{
    BoundedString, TradeState, TradeStateItem, SafeMath,
    TradeCreatedEvent, ValidatedCpiContext,
};
use hub::{require_not_paused, Operation};
use crate::state::{Trade, seeds};
use crate::errors::ErrorCode;
use crate::utils::validation::{
    validate_trade_amount_with_usd_conversion,
    validate_account_security,
    validate_cpi_call_security,
};

#[derive(Accounts)]
#[instruction(params: CreateTradeParams)]
pub struct CreateTrade<'info> {
    #[account(
        init,
        payer = buyer,
        space = Trade::SPACE,
        seeds = [
            seeds::SEED_PREFIX,
            seeds::SEED_TRADE,
            params.trade_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub trade: Account<'info, Trade>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    /// CHECK: Validated in handler
    pub offer: UncheckedAccount<'info>,
    
    /// CHECK: Seller account from offer
    pub seller: UncheckedAccount<'info>,
    
    /// CHECK: Buyer profile for stats update
    pub buyer_profile: UncheckedAccount<'info>,
    
    pub token_mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,
    
    /// CHECK: Hub config for circuit breaker
    pub hub_config: UncheckedAccount<'info>,
    
    /// CHECK: Profile program for CPI
    pub profile_program: UncheckedAccount<'info>,
    
    /// CHECK: Price program for validation
    pub price_program: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateTradeParams {
    pub trade_id: u64,
    pub offer_id: u64,
    pub amount: u64,
    pub locked_price: u64,
    pub expiry_duration: u64,
    pub arbitrator: Pubkey,
    pub buyer_contact: String,
}

pub fn handler(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
    // Circuit breaker check
    require_not_paused!(&ctx.accounts.hub_config, Operation::CreateTrade);
    
    // Validate rent exemption
    ctx.accounts.validate_rent_exemption()?;
    
    let trade = &mut ctx.accounts.trade;
    let clock = Clock::get()?;
    
    // Deserialize offer account
    let mut offer_data_slice: &[u8] = &ctx.accounts.offer.data.borrow();
    let offer_acc: offer::Offer = offer::Offer::try_deserialize(&mut offer_data_slice)?;
    
    // Validate trade amount with USD conversion
    validate_trade_amount_with_usd_conversion(
        params.amount,
        ctx.accounts.token_mint.decimals,
        params.locked_price,
        &offer_acc.fiat_currency,
        &ctx.accounts.hub_config,
        &ctx.accounts.price_program.to_account_info(),
    )?;
    
    // Security validation
    let temp_trade = Box::new(Trade {
        id: params.trade_id,
        offer_id: params.offer_id,
        buyer: ctx.accounts.buyer.key(),
        seller: offer_acc.owner,
        arbitrator: params.arbitrator,
        token_mint: ctx.accounts.token_mint.key(),
        amount: params.amount,
        fiat_currency: offer_acc.fiat_currency.clone(),
        locked_price: params.locked_price,
        state: TradeState::RequestCreated,
        created_at: clock.unix_timestamp as u64,
        expires_at: (clock.unix_timestamp as u64).safe_add(params.expiry_duration)?,
        dispute_window_at: None,
        state_history: localmoney_shared::BoundedStateHistory::new(),
        buyer_contact: BoundedString::from_option(Some(params.buyer_contact.clone()))?,
        seller_contact: None,
        bump: ctx.bumps.trade,
    });
    
    validate_account_security(&ctx.accounts.buyer.key(), &temp_trade)?;
    
    // Ensure buyer is not the offer owner
    require!(
        ctx.accounts.buyer.key() != offer_acc.owner,
        ErrorCode::SelfTradeNotAllowed
    );
    
    // Initialize trade
    trade.initialize(
        params.trade_id,
        params.offer_id,
        ctx.accounts.buyer.key(),
        offer_acc.owner,
        params.arbitrator,
        ctx.accounts.token_mint.key(),
        params.amount,
        offer_acc.fiat_currency,
        params.locked_price,
        params.expiry_duration,
        params.buyer_contact,
        ctx.bumps.trade,
    )?;
    
    // Update profile statistics via CPI
    validate_cpi_call_security(
        &ctx.accounts.profile_program.key(),
        &offer_acc.owner, // Using seller as expected program for validation
        &[0u8], // Basic non-empty check
    )?;
    
    let cpi_program = ctx.accounts.profile_program.to_account_info();
    let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
        profile: ctx.accounts.buyer_profile.to_account_info(),
        actor: ctx.accounts.buyer.to_account_info(),
        buyer: ctx.accounts.buyer.to_account_info(),
        seller: ctx.accounts.seller.to_account_info(),
        arbitrator: ctx.accounts.buyer.to_account_info(), // not used in this transition
    };
    
    let cpi_ctx = ValidatedCpiContext::new(
        cpi_program,
        cpi_accounts,
        &ctx.accounts.profile_program.key(),
    )?;
    
    profile::cpi::update_trade_stats(cpi_ctx.into_inner(), TradeState::RequestCreated)?;
    
    // Emit event
    emit!(TradeCreatedEvent {
        trade_id: params.trade_id,
        offer_id: params.offer_id,
        buyer: ctx.accounts.buyer.key(),
        seller: offer_acc.owner,
        amount: params.amount,
        token_mint: ctx.accounts.token_mint.key(),
        fiat_currency: format!("{:?}", offer_acc.fiat_currency),
        locked_price: params.locked_price,
        timestamp: clock.unix_timestamp,
        buyer_index: ctx.accounts.buyer.key(),
        seller_index: offer_acc.owner,
    });
    
    Ok(())
}

impl<'info> CreateTrade<'info> {
    fn validate_rent_exemption(&self) -> Result<()> {
        let rent = Rent::get()?;
        let lamports = self.trade.to_account_info().lamports();
        let data_len = self.trade.to_account_info().data_len();
        let required = rent.minimum_balance(data_len);
        
        require!(
            lamports >= required,
            ErrorCode::InsufficientRentExemption
        );
        
        Ok(())
    }
}