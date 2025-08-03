#![allow(unexpected_cfgs)]
#![allow(deprecated)]
use anchor_lang::prelude::*;

declare_id!("6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC");

#[program]
pub mod profile {
    use super::*;

    pub fn create_profile(ctx: Context<CreateProfile>, username: String) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        let clock = Clock::get()?;

        profile.owner = ctx.accounts.user.key();
        profile.username = username;
        profile.created_at = clock.unix_timestamp as u64;
        profile.requested_trades_count = 0;
        profile.active_trades_count = 0;
        profile.released_trades_count = 0;
        profile.last_trade = 0;
        profile.contact = None;
        profile.encryption_key = None;
        profile.active_offers_count = 0;
        profile.bump = ctx.bumps.profile;

        Ok(())
    }

    pub fn update_contact(
        ctx: Context<UpdateContact>,
        contact: String,
        encryption_key: String,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.contact = Some(contact);
        profile.encryption_key = Some(encryption_key);
        Ok(())
    }

    pub fn update_active_offers(
        ctx: Context<UpdateActiveOffers>,
        offer_state: OfferState,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;

        match offer_state {
            OfferState::Active => profile.active_offers_count += 1,
            OfferState::Paused | OfferState::Archive => {
                if profile.active_offers_count > 0 {
                    profile.active_offers_count -= 1;
                }
            }
        }

        Ok(())
    }

    pub fn update_trade_stats(
        ctx: Context<UpdateTradeStats>,
        trade_state: TradeState,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        let clock = Clock::get()?;

        match trade_state {
            TradeState::RequestCreated => {
                profile.requested_trades_count += 1;
                profile.active_trades_count += 1;
            }
            TradeState::EscrowReleased => {
                if profile.active_trades_count > 0 {
                    profile.active_trades_count -= 1;
                }
                profile.released_trades_count += 1;
                profile.last_trade = clock.unix_timestamp as u64;
            }
            TradeState::RequestCanceled
            | TradeState::EscrowCanceled
            | TradeState::EscrowRefunded
            | TradeState::SettledForMaker
            | TradeState::SettledForTaker => {
                if profile.active_trades_count > 0 {
                    profile.active_trades_count -= 1;
                }
            }
            _ => {} // No change for other states
        }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(username: String)]
pub struct CreateProfile<'info> {
    #[account(
        init,
        payer = user,
        space = Profile::SPACE,
        seeds = [b"profile".as_ref(), user.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, Profile>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateContact<'info> {
    #[account(
        mut,
        seeds = [b"profile".as_ref(), user.key().as_ref()],
        bump = profile.bump,
        constraint = profile.owner == user.key() @ ErrorCode::Unauthorized
    )]
    pub profile: Account<'info, Profile>,

    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateActiveOffers<'info> {
    #[account(
        mut,
        seeds = [b"profile".as_ref(), profile.owner.as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
}

#[derive(Accounts)]
pub struct UpdateTradeStats<'info> {
    #[account(
        mut,
        seeds = [b"profile".as_ref(), profile.owner.as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
}

#[account]
#[derive(Debug)]
pub struct Profile {
    pub owner: Pubkey,
    pub username: String,
    pub created_at: u64,
    pub requested_trades_count: u64,
    pub active_trades_count: u8,
    pub released_trades_count: u64,
    pub last_trade: u64,
    pub contact: Option<String>,
    pub encryption_key: Option<String>,
    pub active_offers_count: u8,
    pub bump: u8,
}

impl Profile {
    pub const SPACE: usize = 8 + // discriminator
        32 + // owner
        4 + 50 + // username (String with max 50 chars)
        8 + // created_at
        8 + // requested_trades_count
        1 + // active_trades_count
        8 + // released_trades_count
        8 + // last_trade
        1 + 4 + 200 + // contact (Option<String> with max 200 chars)
        1 + 4 + 100 + // encryption_key (Option<String> with max 100 chars)
        1 + // active_offers_count
        1; // bump
}

// Common types used across programs
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum TradeState {
    RequestCreated,
    RequestCanceled,
    RequestExpired,
    RequestAccepted,
    EscrowFunded,
    EscrowCanceled,
    EscrowRefunded,
    FiatDeposited,
    EscrowReleased,
    EscrowDisputed,
    DisputeOpened,
    DisputeResolved,
    Released,
    SettledForMaker,
    SettledForTaker,
    Refunded,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum OfferState {
    Active,
    Paused,
    Archive,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum OfferType {
    Buy,
    Sell,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Hash, Debug)]
pub enum FiatCurrency {
    Usd,
    Eur,
    Gbp,
    Cad,
    Aud,
    Jpy,
    Brl,
    Mxn,
    Ars,
    Clp,
    Cop,
    Ngn,
    Thb,
    Ves,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
}
