#![allow(unexpected_cfgs)]
#![allow(deprecated)]
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

declare_id!("E5L14TfijKrxBPWz9FMGDLTmPuyWBxxdoXd1K2M2TyUJ");

#[program]
pub mod offer {
    use super::*;

    pub fn create_offer(ctx: Context<CreateOffer>, params: CreateOfferParams) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        let clock = Clock::get()?;

        offer.id = params.offer_id;
        offer.owner = ctx.accounts.owner.key();
        offer.offer_type = params.offer_type;
        offer.fiat_currency = params.fiat_currency;
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
            profile: ctx.accounts.user_profile.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        profile::cpi::update_active_offers(cpi_ctx, OfferState::Active)?;

        Ok(())
    }

    pub fn update_offer(ctx: Context<UpdateOffer>, params: UpdateOfferParams) -> Result<()> {
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
                profile: ctx.accounts.user_profile.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            profile::cpi::update_active_offers(cpi_ctx, new_state)?;
        }

        Ok(())
    }

    pub fn close_offer(ctx: Context<CloseOffer>) -> Result<()> {
        // Update profile active offers count
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        let cpi_accounts = profile::cpi::accounts::UpdateActiveOffers {
            profile: ctx.accounts.user_profile.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        profile::cpi::update_active_offers(cpi_ctx, OfferState::Archive)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(params: CreateOfferParams)]
pub struct CreateOffer<'info> {
    #[account(
        init,
        payer = owner,
        space = Offer::SPACE,
        seeds = [b"offer".as_ref(), params.offer_id.to_le_bytes().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [b"profile".as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub user_profile: Account<'info, profile::Profile>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Profile program for CPI call
    pub profile_program: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOffer<'info> {
    #[account(
        mut,
        seeds = [b"offer".as_ref(), offer.id.to_le_bytes().as_ref()],
        bump = offer.bump,
        constraint = offer.owner == owner.key() @ ErrorCode::Unauthorized
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [b"profile".as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub user_profile: Account<'info, profile::Profile>,

    pub owner: Signer<'info>,

    /// CHECK: Profile program for CPI call
    pub profile_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseOffer<'info> {
    #[account(
        mut,
        seeds = [b"offer".as_ref(), offer.id.to_le_bytes().as_ref()],
        bump = offer.bump,
        constraint = offer.owner == owner.key() @ ErrorCode::Unauthorized,
        close = owner
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [b"profile".as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub user_profile: Account<'info, profile::Profile>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Profile program for CPI call
    pub profile_program: UncheckedAccount<'info>,
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
    pub description: Option<String>,
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
        1 + 4 + 200 + // description (Option<String> with max 200 chars)
        32 + // token_mint
        1 + // state
        8 + // created_at
        1; // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateOfferParams {
    pub offer_id: u64,
    pub offer_type: OfferType,
    pub fiat_currency: FiatCurrency,
    pub rate: u64,
    pub min_amount: u64,
    pub max_amount: u64,
    pub description: Option<String>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateOfferParams {
    pub rate: u64,
    pub min_amount: u64,
    pub max_amount: u64,
    pub state: OfferState,
    pub description: Option<String>,
}

// Use common types from profile program
pub use profile::{FiatCurrency, OfferState, OfferType};

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid offer parameters")]
    InvalidOfferParams,
}
