use anchor_lang::prelude::*;
use shared_types::{
    validate_amount_range, FiatCurrency, LocalMoneyErrorCode, OfferState, OfferType,
    MAX_DESCRIPTION_LENGTH, OFFER_COUNTER_SEED, OFFER_SEED, OFFER_SIZE,
};

declare_id!("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");

#[program]
pub mod offer {
    use super::*;

    /// Initialize the offer counter
    pub fn initialize_counter(ctx: Context<InitializeCounter>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = 0;
        msg!("Offer counter initialized");
        Ok(())
    }

    /// Create a new offer
    pub fn create_offer(
        ctx: Context<CreateOffer>,
        offer_type: OfferType,
        fiat_currency: FiatCurrency,
        rate: u64,
        min_amount: u64,
        max_amount: u64,
        description: Option<String>,
    ) -> Result<()> {
        // Validate inputs
        require!(rate > 0, LocalMoneyErrorCode::InvalidRate);
        require!(min_amount > 0, LocalMoneyErrorCode::InvalidMinAmount);
        require!(
            max_amount >= min_amount,
            LocalMoneyErrorCode::InvalidMaxAmount
        );

        if let Some(ref desc) = description {
            require!(
                desc.len() <= MAX_DESCRIPTION_LENGTH,
                LocalMoneyErrorCode::DescriptionTooLong
            );
        }

        // Get current offer ID and increment counter
        let counter = &mut ctx.accounts.counter;
        let offer_id = counter.count;
        counter.count = counter
            .count
            .checked_add(1)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?;

        // Initialize offer account
        let offer = &mut ctx.accounts.offer;
        offer.id = offer_id;
        offer.owner = ctx.accounts.owner.key();
        offer.offer_type = offer_type;
        offer.fiat_currency = fiat_currency;
        offer.rate = rate;
        offer.min_amount = min_amount;
        offer.max_amount = max_amount;
        offer.description = description.unwrap_or_default();
        offer.token_mint = ctx.accounts.token_mint.key();
        offer.state = OfferState::Active;
        offer.created_at = Clock::get()?.unix_timestamp;
        offer.bump = ctx.bumps.offer;

        msg!(
            "Offer created: ID={}, type={}, currency={:?}, rate={}",
            offer_id,
            offer.offer_type,
            offer.fiat_currency,
            rate
        );

        Ok(())
    }

    /// Update an existing offer
    pub fn update_offer(
        ctx: Context<UpdateOffer>,
        rate: Option<u64>,
        min_amount: Option<u64>,
        max_amount: Option<u64>,
        description: Option<String>,
    ) -> Result<()> {
        let offer = &mut ctx.accounts.offer;

        // Validate that offer can be updated (must be Active or Paused)
        require!(
            offer.state == OfferState::Active || offer.state == OfferState::Paused,
            LocalMoneyErrorCode::OfferNotUpdatable
        );

        // Update rate if provided
        if let Some(new_rate) = rate {
            require!(new_rate > 0, LocalMoneyErrorCode::InvalidRate);
            offer.rate = new_rate;
        }

        // Update amounts if provided and validate consistency
        let current_min = min_amount.unwrap_or(offer.min_amount);
        let current_max = max_amount.unwrap_or(offer.max_amount);

        require!(current_min > 0, LocalMoneyErrorCode::InvalidMinAmount);
        require!(
            current_max >= current_min,
            LocalMoneyErrorCode::InvalidMaxAmount
        );

        if let Some(new_min) = min_amount {
            offer.min_amount = new_min;
        }
        if let Some(new_max) = max_amount {
            offer.max_amount = new_max;
        }

        // Update description if provided
        if let Some(new_description) = description {
            require!(
                new_description.len() <= MAX_DESCRIPTION_LENGTH,
                LocalMoneyErrorCode::DescriptionTooLong
            );
            offer.description = new_description;
        }

        msg!("Offer updated: ID={}", offer.id);
        Ok(())
    }

    /// Change offer state (pause, activate, archive)
    pub fn update_offer_state(ctx: Context<UpdateOffer>, new_state: OfferState) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        let current_state = offer.state.clone();

        // Validate state transition
        let valid_transition = match (current_state, new_state.clone()) {
            (OfferState::Active, OfferState::Paused) => true,
            (OfferState::Active, OfferState::Archive) => true,
            (OfferState::Paused, OfferState::Active) => true,
            (OfferState::Paused, OfferState::Archive) => true,
            (OfferState::Archive, _) => false, // Archive is terminal
            _ => false,
        };

        require!(
            valid_transition,
            LocalMoneyErrorCode::InvalidStateTransition
        );

        offer.state = new_state.clone();

        msg!(
            "Offer state updated: ID={}, from={:?} to={:?}",
            offer.id,
            current_state,
            new_state
        );

        Ok(())
    }

    /// Close/archive an offer (convenience function)
    pub fn close_offer(ctx: Context<UpdateOffer>) -> Result<()> {
        let offer = &mut ctx.accounts.offer;

        // Can only close Active or Paused offers
        require!(
            offer.state == OfferState::Active || offer.state == OfferState::Paused,
            LocalMoneyErrorCode::OfferNotClosable
        );

        offer.state = OfferState::Archive;

        msg!("Offer closed: ID={}", offer.id);
        Ok(())
    }
}

/// Offer account - represents a buy or sell offer
#[account]
pub struct Offer {
    /// Unique offer ID
    pub id: u64,
    /// Owner of the offer
    pub owner: Pubkey,
    /// Type of offer (Buy/Sell)
    pub offer_type: OfferType,
    /// Fiat currency for the offer
    pub fiat_currency: FiatCurrency,
    /// Exchange rate (in rate scale units)
    pub rate: u64,
    /// Minimum trade amount
    pub min_amount: u64,
    /// Maximum trade amount
    pub max_amount: u64,
    /// Optional description
    pub description: String,
    /// Token mint for this offer
    pub token_mint: Pubkey,
    /// Current state of the offer
    pub state: OfferState,
    /// Creation timestamp
    pub created_at: i64,
    /// PDA bump
    pub bump: u8,
}

/// Offer counter - tracks the next available offer ID
#[account]
pub struct OfferCounter {
    /// Next available offer ID
    pub count: u64,
}

/// Initialize offer counter context
#[derive(Accounts)]
pub struct InitializeCounter<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 8, // discriminator + u64
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Create offer context
#[derive(Accounts)]
#[instruction(offer_type: OfferType, fiat_currency: FiatCurrency)]
pub struct CreateOffer<'info> {
    #[account(
        init,
        payer = owner,
        space = OFFER_SIZE,
        seeds = [OFFER_SEED, counter.count.to_le_bytes().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// Token mint for the offer
    pub token_mint: Account<'info, anchor_spl::token::Mint>,

    pub system_program: Program<'info, System>,
}

/// Update offer context
#[derive(Accounts)]
pub struct UpdateOffer<'info> {
    #[account(
        mut,
        seeds = [OFFER_SEED, offer.id.to_le_bytes().as_ref()],
        bump = offer.bump,
        has_one = owner @ LocalMoneyErrorCode::Unauthorized
    )]
    pub offer: Account<'info, Offer>,

    pub owner: Signer<'info>,
}

/// Get offers context (for queries)
#[derive(Accounts)]
pub struct GetOffers<'info> {
    #[account(
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,
}

/// Validation helper functions
impl Offer {
    /// Check if offer can accept a trade of given amount
    pub fn can_accept_trade_amount(&self, amount: u64) -> Result<()> {
        require!(
            self.state == OfferState::Active,
            LocalMoneyErrorCode::OfferNotActive
        );
        validate_amount_range(self.min_amount, self.max_amount, amount)
    }

    /// Check if offer is active
    pub fn is_active(&self) -> bool {
        self.state == OfferState::Active
    }

    /// Get total number of offers from counter
    pub fn get_total_offers(counter: &OfferCounter) -> u64 {
        counter.count
    }
}

#[error_code]
pub enum OfferError {
    #[msg("Invalid rate provided")]
    InvalidRate,
    #[msg("Invalid minimum amount")]
    InvalidMinAmount,
    #[msg("Invalid maximum amount")]
    InvalidMaxAmount,
    #[msg("Description too long")]
    DescriptionTooLong,
    #[msg("Offer is not active")]
    OfferNotActive,
    #[msg("Offer cannot be updated in current state")]
    OfferNotUpdatable,
    #[msg("Offer cannot be closed in current state")]
    OfferNotClosable,
    #[msg("Invalid state transition")]
    InvalidStateTransition,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Math overflow")]
    MathOverflow,
}
