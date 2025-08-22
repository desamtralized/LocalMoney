#![deny(arithmetic_overflow)]
#![deny(unused_must_use)]
#![deny(clippy::arithmetic_side_effects)]
#![forbid(unsafe_code)]
use anchor_lang::prelude::*;
use localmoney_shared::{
    calculate_rent_with_margin, BoundedString, OfferState, RentError, RentValidation, SafeMath,
    TradeState, ProfileCreatedEvent, ProfileUpdatedEvent,
};

declare_id!("6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC");

#[program]
pub mod profile {
    use super::*;

    pub fn create_profile(ctx: Context<CreateProfile>, username: String) -> Result<()> {
        // Validate rent exemption before creation
        ctx.accounts.validate_rent_exemption()?;

        let profile = &mut ctx.accounts.profile;
        let clock = Clock::get()?;

        profile.owner = ctx.accounts.user.key();
        profile.username = username.clone();
        profile.created_at = clock.unix_timestamp as u64;
        profile.requested_trades_count = 0;
        profile.active_trades_count = 0;
        profile.released_trades_count = 0;
        profile.last_trade = 0;
        profile.contact = None;
        profile.encryption_key = None;
        profile.active_offers_count = 0;
        profile.bump = ctx.bumps.profile;

        // Emit profile creation event
        emit!(ProfileCreatedEvent {
            user: ctx.accounts.user.key(),
            username: username,
            timestamp: clock.unix_timestamp,
            user_index: ctx.accounts.user.key(),
        });

        Ok(())
    }

    pub fn update_contact(
        ctx: Context<UpdateContact>,
        contact: String,
        encryption_key: String,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        let clock = Clock::get()?;
        
        profile.contact = BoundedString::from_option(Some(contact.clone()))?;
        profile.encryption_key = BoundedString::from_option(Some(encryption_key.clone()))?;
        
        // Emit profile updated event
        emit!(ProfileUpdatedEvent {
            user: ctx.accounts.user.key(),
            field: "contact_info".to_string(),
            old_value: "hidden".to_string(), // Don't expose sensitive contact info
            new_value: "updated".to_string(),
            timestamp: clock.unix_timestamp,
            user_index: ctx.accounts.user.key(),
        });
        
        Ok(())
    }

    pub fn update_active_offers(
        ctx: Context<UpdateActiveOffers>,
        offer_state: OfferState,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;

        // Enforce that the profile owner authorizes this update
        require!(
            profile.owner == ctx.accounts.user.key(),
            ErrorCode::Unauthorized
        );

        match offer_state {
            OfferState::Active => {
                profile.active_offers_count = profile.active_offers_count.safe_add(1)?
            }
            OfferState::Paused | OfferState::Archive => {
                if profile.active_offers_count > 0 {
                    profile.active_offers_count = profile.active_offers_count.safe_sub(1)?;
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

        // Access control: actor must be buyer, seller, or arbitrator
        let actor = ctx.accounts.actor.key();
        let buyer = ctx.accounts.buyer.key();
        let seller = ctx.accounts.seller.key();
        let arbitrator = ctx.accounts.arbitrator.key();

        require!(
            actor == buyer || actor == seller || actor == arbitrator,
            ErrorCode::Unauthorized
        );

        // Ensure the profile being updated belongs to either buyer or seller
        require!(
            profile.owner == buyer || profile.owner == seller,
            ErrorCode::Unauthorized
        );

        match trade_state {
            TradeState::RequestCreated => {
                profile.requested_trades_count = profile.requested_trades_count.safe_add(1)?;
                profile.active_trades_count = profile.active_trades_count.safe_add(1)?;
            }
            TradeState::EscrowReleased => {
                if profile.active_trades_count > 0 {
                    profile.active_trades_count = profile.active_trades_count.safe_sub(1)?;
                }
                profile.released_trades_count = profile.released_trades_count.safe_add(1)?;
                profile.last_trade = clock.unix_timestamp as u64;
            }
            TradeState::RequestCanceled
            | TradeState::EscrowCanceled
            | TradeState::EscrowRefunded
            | TradeState::SettledForMaker
            | TradeState::SettledForTaker => {
                if profile.active_trades_count > 0 {
                    profile.active_trades_count = profile.active_trades_count.safe_sub(1)?;
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

impl<'info> RentValidation for CreateProfile<'info> {
    fn validate_rent_exemption(&self) -> Result<()> {
        // Calculate required rent with 10% margin (1000 basis points)
        let required_rent = calculate_rent_with_margin(Profile::SPACE, 1000)?;

        // Ensure payer has sufficient balance
        require!(
            self.user.lamports() >= required_rent,
            RentError::InsufficientFunds
        );

        Ok(())
    }
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

    // Require the profile owner to authorize offer count changes
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateTradeStats<'info> {
    #[account(
        mut,
        seeds = [b"profile".as_ref(), profile.owner.as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,

    // Actor must be a participant in the trade flow (buyer, seller, or arbitrator)
    pub actor: Signer<'info>,

    /// CHECK: Buyer pubkey participating in the trade
    pub buyer: UncheckedAccount<'info>,
    /// CHECK: Seller pubkey participating in the trade
    pub seller: UncheckedAccount<'info>,
    /// CHECK: Arbitrator pubkey (if applicable in this transition)
    pub arbitrator: UncheckedAccount<'info>,
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
    pub contact: Option<BoundedString>,
    pub encryption_key: Option<BoundedString>,
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
        BoundedString::option_space() + // contact
        BoundedString::option_space() + // encryption_key
        1 + // active_offers_count
        1; // bump
}

// Common types are now imported from localmoney_shared

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
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
