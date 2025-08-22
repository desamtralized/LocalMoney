#![deny(arithmetic_overflow)]
#![deny(unused_must_use)]
#![deny(clippy::arithmetic_side_effects)]
#![forbid(unsafe_code)]
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use hub::{require_not_paused, Operation};
use localmoney_shared::{
    calculate_rent_with_margin, BoundedString, FiatCurrency, OfferState, OfferType, RentError,
    RentValidation, ValidatedCpiContext, OfferCreatedEvent,
};

declare_id!("DYJ8EBmhRJdKRg3wgapwX4ssTHRMwQd263hebwcsautj");

#[program]
pub mod offer {
    use super::*;

    pub fn create_offer(ctx: Context<CreateOffer>, offer_id: u64, params: CreateOfferParams) -> Result<()> {
        // CIRCUIT BREAKER: Check if offer creation is paused
        require_not_paused!(ctx.accounts.hub_config, Operation::CreateOffer);

        // Validate rent exemption before creation
        ctx.accounts.validate_rent_exemption()?;

        // Debug account order
        msg!("DEBUG: owner={}", ctx.accounts.owner.key());
        msg!("DEBUG: offer={}", ctx.accounts.offer.key());
        msg!("DEBUG: profile_program={}", ctx.accounts.profile_program.key());
        msg!("DEBUG: user_profile={}", ctx.accounts.user_profile.key());

        // Validate profile PDA
        let (expected_profile_pda, _profile_bump) = Pubkey::find_program_address(
            &[b"profile".as_ref(), ctx.accounts.owner.key().as_ref()],
            &ctx.accounts.profile_program.key(),
        );
        require!(
            expected_profile_pda == ctx.accounts.user_profile.key(),
            ErrorCode::InvalidOfferParams
        );
        // Validate parameters
        require!(params.min_amount > 0, ErrorCode::InvalidOfferParams);
        require!(
            params.max_amount >= params.min_amount,
            ErrorCode::InvalidOfferParams
        );
        require!(params.rate > 0, ErrorCode::InvalidOfferParams);

        let offer = &mut ctx.accounts.offer;
        let clock = Clock::get()?;

        offer.id = offer_id;
        offer.owner = ctx.accounts.owner.key();
        offer.offer_type = params.offer_type.clone();
        offer.fiat_currency = params.fiat_currency.clone();
        offer.rate = params.rate;
        offer.min_amount = params.min_amount;
        offer.max_amount = params.max_amount;
        offer.description = params.description;
        offer.token_mint = ctx.accounts.token_mint.key();
        offer.state = OfferState::Active;
        offer.created_at = clock.unix_timestamp as u64;
        offer.bump = ctx.bumps.offer;

        // CPI to profile program to update active offers count
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        let cpi_accounts = profile::cpi::accounts::UpdateActiveOffers {
            profile: ctx.accounts.user_profile.clone(),
            user: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = ValidatedCpiContext::new(
            cpi_program,
            cpi_accounts,
            &ctx.accounts.hub_config.profile_program,
        )?;
        profile::cpi::update_active_offers(cpi_ctx.into_inner(), OfferState::Active)?;

        // Emit offer created event
        emit!(OfferCreatedEvent {
            offer_id: offer_id,
            owner: ctx.accounts.owner.key(),
            offer_type: format!("{:?}", params.offer_type),
            token_mint: ctx.accounts.token_mint.key(),
            fiat_currency: format!("{:?}", params.fiat_currency),
            min_amount: params.min_amount,
            max_amount: params.max_amount,
            rate: params.rate,
            timestamp: Clock::get()?.unix_timestamp,
            owner_index: ctx.accounts.owner.key(),
        });

        Ok(())
    }

    pub fn update_offer(ctx: Context<UpdateOffer>, params: UpdateOfferParams) -> Result<()> {
        // CIRCUIT BREAKER: Check if offer updates are paused
        require_not_paused!(ctx.accounts.hub_config, Operation::UpdateOffer);

        // Validate profile PDA
        let (expected_profile_pda, _profile_bump) = Pubkey::find_program_address(
            &[b"profile".as_ref(), ctx.accounts.owner.key().as_ref()],
            &ctx.accounts.profile_program.key(),
        );
        require!(
            expected_profile_pda == ctx.accounts.user_profile.key(),
            ErrorCode::InvalidOfferParams
        );

        // Validate parameters
        require!(params.min_amount > 0, ErrorCode::InvalidOfferParams);
        require!(
            params.max_amount >= params.min_amount,
            ErrorCode::InvalidOfferParams
        );
        require!(params.rate > 0, ErrorCode::InvalidOfferParams);

        let offer = &mut ctx.accounts.offer;
        let old_state = offer.state.clone();
        let new_state = params.state.clone();

        offer.rate = params.rate;
        offer.min_amount = params.min_amount;
        offer.max_amount = params.max_amount;
        offer.state = params.state;
        offer.description = params.description;

        // Update profile active offers if state changed
        if old_state != new_state {
            let cpi_program = ctx.accounts.profile_program.to_account_info();
            let cpi_accounts = profile::cpi::accounts::UpdateActiveOffers {
                profile: ctx.accounts.user_profile.clone(),
                user: ctx.accounts.owner.to_account_info(),
            };
            let cpi_ctx = ValidatedCpiContext::new(
                cpi_program,
                cpi_accounts,
                &ctx.accounts.hub_config.profile_program,
            )?;
            profile::cpi::update_active_offers(cpi_ctx.into_inner(), new_state)?;
        }

        Ok(())
    }

    pub fn close_offer(ctx: Context<CloseOffer>) -> Result<()> {
        // Validate profile PDA
        let (expected_profile_pda, _profile_bump) = Pubkey::find_program_address(
            &[b"profile".as_ref(), ctx.accounts.owner.key().as_ref()],
            &ctx.accounts.profile_program.key(),
        );
        require!(
            expected_profile_pda == ctx.accounts.user_profile.key(),
            ErrorCode::InvalidOfferParams
        );

        // Update profile active offers count
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        let cpi_accounts = profile::cpi::accounts::UpdateActiveOffers {
            profile: ctx.accounts.user_profile.clone(),
            user: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = ValidatedCpiContext::new(
            cpi_program,
            cpi_accounts,
            &ctx.accounts.hub_config.profile_program,
        )?;
        profile::cpi::update_active_offers(cpi_ctx.into_inner(), OfferState::Archive)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(offer_id: u64, params: CreateOfferParams)]
pub struct CreateOffer<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = Offer::SPACE,
        seeds = [b"offer".as_ref(), offer_id.to_le_bytes().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,

    pub profile_program: Program<'info, profile::program::Profile>,

    /// CHECK: Profile PDA will be validated in the instruction
    #[account(mut)]
    pub user_profile: AccountInfo<'info>,

    pub token_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,

    #[account(
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        seeds::program = hub::ID,
        bump
    )]
    pub hub_config: Account<'info, hub::HubConfig>,

    pub system_program: Program<'info, System>,
}

impl<'info> RentValidation for CreateOffer<'info> {
    fn validate_rent_exemption(&self) -> Result<()> {
        // Calculate required rent with 10% margin (1000 basis points)
        let required_rent = calculate_rent_with_margin(Offer::SPACE, 1000)?;

        // Ensure payer has sufficient balance
        require!(
            self.owner.lamports() >= required_rent,
            RentError::InsufficientFunds
        );

        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateOffer<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    pub profile_program: Program<'info, profile::program::Profile>,

    /// CHECK: Profile PDA will be validated in the instruction
    #[account(mut)]
    pub user_profile: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"offer".as_ref(), offer.id.to_le_bytes().as_ref()],
        bump = offer.bump,
        constraint = offer.owner == owner.key() @ ErrorCode::Unauthorized
    )]
    pub offer: Account<'info, Offer>,

    // Hub config for validating program IDs
    #[account(
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        seeds::program = hub::ID,
        bump
    )]
    pub hub_config: Account<'info, hub::HubConfig>,
}

#[derive(Accounts)]
pub struct CloseOffer<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    pub profile_program: Program<'info, profile::program::Profile>,

    /// CHECK: Profile PDA will be validated in the instruction
    #[account(mut)]
    pub user_profile: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"offer".as_ref(), offer.id.to_le_bytes().as_ref()],
        bump = offer.bump,
        constraint = offer.owner == owner.key() @ ErrorCode::Unauthorized,
        close = owner
    )]
    pub offer: Account<'info, Offer>,

    // Hub config for validating program IDs
    #[account(
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        seeds::program = hub::ID,
        bump
    )]
    pub hub_config: Account<'info, hub::HubConfig>,
}

#[account]
#[derive(Debug)]
pub struct Offer {
    pub id: u64,
    pub owner: Pubkey,
    pub offer_type: OfferType,
    pub fiat_currency: FiatCurrency,
    pub rate: u64, // Basis points above/below market price
    pub min_amount: u64,
    pub max_amount: u64,
    pub description: Option<BoundedString>,
    pub token_mint: Pubkey,
    pub state: OfferState,
    pub created_at: u64,
    pub bump: u8,
}

impl Offer {
    pub const SPACE: usize = 8 + // discriminator
        8 + // id
        32 + // owner
        1 + // offer_type
        1 + // fiat_currency
        8 + // rate
        8 + // min_amount
        8 + // max_amount
        BoundedString::option_space() + // description
        32 + // token_mint
        1 + // state
        8 + // created_at
        1; // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateOfferParams {
    pub offer_type: OfferType,
    pub fiat_currency: FiatCurrency,
    pub rate: u64,
    pub min_amount: u64,
    pub max_amount: u64,
    pub description: Option<BoundedString>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateOfferParams {
    pub rate: u64,
    pub min_amount: u64,
    pub max_amount: u64,
    pub state: OfferState,
    pub description: Option<BoundedString>,
}

// Use common types from profile program
// Types are now imported from localmoney_shared

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid offer parameters")]
    InvalidOfferParams,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Arithmetic underflow")]
    ArithmeticUnderflow,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("String exceeds maximum length")]
    StringTooLong,
    #[msg("Collection is full")]
    CollectionFull,
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    #[msg("Page is full")]
    PageFull,
    #[msg("Invalid page number")]
    InvalidPageNumber,
}
