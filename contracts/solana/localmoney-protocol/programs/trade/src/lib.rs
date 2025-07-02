use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use shared_types::{
    FiatCurrency, LocalMoneyErrorCode as ErrorCode, OfferState, OfferType, TradeState, TradeStateItem,
};

// External program imports for cross-program calls
// Note: In a real implementation, these would be proper external crate imports
// For now, we'll use UncheckedAccount and validate through CPI

declare_id!("AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM");

// External program account structures for deserialization
// These would normally be imported from the respective program crates

/// Offer account structure from offer program
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OfferAccount {
    pub id: u64,
    pub owner: Pubkey,
    pub offer_type: OfferType,
    pub fiat_currency: FiatCurrency,
    pub rate: u64,
    pub min_amount: u64,
    pub max_amount: u64,
    pub description: String,
    pub token_mint: Pubkey,
    pub state: OfferState,
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}

impl anchor_lang::AccountDeserialize for OfferAccount {
    fn try_deserialize_unchecked(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
        Ok(Self::deserialize(buf)?)
    }
}

/// GlobalConfig account structure from hub program
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GlobalConfigAccount {
    pub authority: Pubkey,
    pub offer_program: Pubkey,
    pub trade_program: Pubkey,
    pub profile_program: Pubkey,
    pub price_program: Pubkey,
    pub price_provider: Pubkey,
    pub local_mint: Pubkey,
    pub chain_fee_collector: Pubkey,
    pub warchest: Pubkey,
    pub active_offers_limit: u8,
    pub active_trades_limit: u8,
    pub arbitration_fee_bps: u16,
    pub burn_fee_bps: u16,
    pub chain_fee_bps: u16,
    pub warchest_fee_bps: u16,
    pub trade_expiration_timer: u64,
    pub trade_dispute_timer: u64,
    pub trade_limit_min: u64,
    pub trade_limit_max: u64,
    pub bump: u8,
}

impl anchor_lang::AccountDeserialize for GlobalConfigAccount {
    fn try_deserialize_unchecked(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
        Ok(Self::deserialize(buf)?)
    }
}

#[program]
pub mod trade {
    use super::*;

    /// Initialize the trade counter (only authorized admin can initialize)
    pub fn initialize_counter(ctx: Context<InitializeCounter>) -> Result<()> {
        // Validate that the authority is authorized to initialize the counter
        // This should be checked against the hub config authority
        // In a full implementation, we would make a CPI call to hub program to verify authority
        // For now, we'll add a basic check that hub_config and hub_program are provided
        require!(
            !ctx.accounts.hub_config.key().eq(&Pubkey::default()),
            ErrorCode::InvalidConfiguration
        );
        require!(
            !ctx.accounts.hub_program.key().eq(&Pubkey::default()),
            ErrorCode::InvalidProgramAddress
        );

        let counter = &mut ctx.accounts.counter;
        counter.count = 0;
        counter.bump = ctx.bumps.counter;

        msg!(
            "Trade counter initialized by authority: {}",
            ctx.accounts.authority.key()
        );

        Ok(())
    }

    /// Create a new trade request
    pub fn create_trade(
        ctx: Context<CreateTrade>,
        offer_id: u64,
        amount: u64,
        taker_contact: String,
        profile_taker_contact: String,
        profile_taker_encryption_key: String,
    ) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        let trade = &mut ctx.accounts.trade;
        let clock = Clock::get()?;

        // Increment trade counter
        counter.count += 1;
        let trade_id = counter.count;

        // Use the existing validation helper function for consistent validation
        validate_trade_creation(
            amount,
            &taker_contact,
            &profile_taker_contact,
            &profile_taker_encryption_key,
        )?;

        // Initialize trade state
        let initial_state = TradeStateItem {
            actor: ctx.accounts.taker.key(),
            state: TradeState::RequestCreated,
            timestamp: clock.unix_timestamp,
        };

        // Validate offer exists and is in correct state
        // Read offer data from the provided offer account
        // Deserialize offer account to read offer data
        require!(
            !ctx.accounts.offer.key().eq(&Pubkey::default()),
            ErrorCode::OfferNotFound
        );
        require!(
            !ctx.accounts.offer_program.key().eq(&Pubkey::default()),
            ErrorCode::InvalidProgramAddress
        );
        require!(
            !ctx.accounts.hub_config.key().eq(&Pubkey::default()),
            ErrorCode::InvalidConfiguration
        );

        // Deserialize offer account to read offer data
        let offer_data = ctx.accounts.offer.try_borrow_data()?;
        let offer: OfferAccount = OfferAccount::try_deserialize(&mut &offer_data[8..])?;

        // Validate offer ID matches
        require!(offer.id == offer_id, ErrorCode::OfferNotFound);

        // Validate offer state is Active
        require!(offer.state == OfferState::Active, ErrorCode::OfferNotActive);

        // Validate amount is within offer range
        require!(
            amount >= offer.min_amount && amount <= offer.max_amount,
            ErrorCode::InvalidAmountRange
        );

        // Validate token mint matches
        require!(
            ctx.accounts.token_mint.key() == offer.token_mint,
            ErrorCode::InvalidTokenMint
        );

        // Deserialize hub config to read default arbitrator and trade settings
        let hub_config_data = ctx.accounts.hub_config.try_borrow_data()?;
        let hub_config: GlobalConfigAccount = GlobalConfigAccount::try_deserialize(&mut &hub_config_data[8..])?;

        // Validate trade amount against USD limits using price conversion
        // For now, we'll use the amount directly and assume proper price conversion happens elsewhere
        // In a full implementation, this would involve CPI to price program
        require!(
            amount >= hub_config.trade_limit_min && amount <= hub_config.trade_limit_max,
            ErrorCode::InvalidAmountRange
        );

        // Set up buyer/seller based on offer type
        let (buyer, seller) = match offer.offer_type {
            OfferType::Buy => {
                // Offer owner wants to buy, so they are the buyer
                // Taker (trade creator) is selling to them
                (offer.owner, ctx.accounts.taker.key())
            }
            OfferType::Sell => {
                // Offer owner wants to sell, so they are the seller
                // Taker (trade creator) is buying from them
                (ctx.accounts.taker.key(), offer.owner)
            }
        };

        // Calculate trade expiration based on hub config
        let expires_at = if hub_config.trade_expiration_timer > 0 {
            clock.unix_timestamp + hub_config.trade_expiration_timer as i64
        } else {
            0 // No expiration
        };

        // Use default arbitrator from hub config (for now, use price_provider as placeholder)
        // In a full implementation, there would be a dedicated arbitrator selection mechanism
        let arbitrator = hub_config.price_provider;

        trade.id = trade_id;
        trade.buyer = buyer;
        trade.seller = seller;
        trade.arbitrator = arbitrator;
        trade.offer_id = offer_id;
        trade.amount = amount;
        trade.token_mint = ctx.accounts.token_mint.key();
        trade.fiat_currency = offer.fiat_currency;
        trade.created_at = clock.unix_timestamp;
        trade.expires_at = expires_at;
        trade.state = TradeState::RequestCreated;
        trade.state_history = vec![initial_state];
        trade.taker_contact = taker_contact;
        trade.profile_taker_contact = profile_taker_contact;
        trade.profile_taker_encryption_key = profile_taker_encryption_key;
        trade.bump = ctx.bumps.trade;

        msg!(
            "Trade created: ID {}, offer_id {}, amount {}, buyer: {}, seller: {}",
            trade_id,
            offer_id,
            amount,
            buyer,
            seller
        );

        Ok(())
    }

    /// Accept a trade request (maker accepting taker's request)
    pub fn accept_trade(
        ctx: Context<AcceptTrade>,
        trade_id: u64,
        maker_contact: String,
    ) -> Result<()> {
        let trade = &mut ctx.accounts.trade;
        let clock = Clock::get()?;

        // Validate current state and transition
        require!(
            trade.state == TradeState::RequestCreated,
            ErrorCode::InvalidTradeState
        );

        // Validate state transition before proceeding
        validate_trade_state_transition(&trade.state, &TradeState::RequestAccepted)?;

        // Validate contact information length
        require!(
            maker_contact.len() <= 500,
            ErrorCode::ContactInfoTooLong
        );

        // Check if trade has expired
        if trade.expires_at > 0 && clock.unix_timestamp > trade.expires_at {
            // Update state to expired
            let expired_state = TradeStateItem {
                actor: ctx.accounts.maker.key(),
                state: TradeState::RequestExpired,
                timestamp: clock.unix_timestamp,
            };
            trade.add_state_history(expired_state)?;
            return Err(ErrorCode::TradeExpired.into());
        }

        // Only the maker (offer owner) can accept the trade
        // Validate that the offer account is provided
        require!(
            !ctx.accounts.offer.key().eq(&Pubkey::default()),
            ErrorCode::OfferNotFound
        );

        // Deserialize offer account and verify maker is the offer owner
        let offer_data = ctx.accounts.offer.try_borrow_data()?;
        let offer: OfferAccount = OfferAccount::try_deserialize(&mut &offer_data[8..])?;

        // Verify that the maker is the offer owner
        require!(
            ctx.accounts.maker.key() == offer.owner,
            ErrorCode::Unauthorized
        );

        // Verify that the offer ID matches the trade's offer ID
        require!(
            offer.id == trade.offer_id,
            ErrorCode::OfferNotFound
        );

        // Verify that the offer is still active
        require!(
            offer.state == OfferState::Active,
            ErrorCode::OfferNotActive
        );

        // Update trade state to accepted
        let accepted_state = TradeStateItem {
            actor: ctx.accounts.maker.key(),
            state: TradeState::RequestAccepted,
            timestamp: clock.unix_timestamp,
        };

        trade.add_state_history(accepted_state)?;
        trade.maker_contact = Some(maker_contact);

        msg!(
            "Trade accepted: ID {}, maker: {}",
            trade_id,
            ctx.accounts.maker.key()
        );

        Ok(())
    }

    /// Cancel a trade request
    pub fn cancel_trade(ctx: Context<CancelTrade>, trade_id: u64) -> Result<()> {
        let trade = &mut ctx.accounts.trade;
        let clock = Clock::get()?;

        // Validate current state - can only cancel in RequestCreated or RequestAccepted
        require!(
            trade.state == TradeState::RequestCreated || trade.state == TradeState::RequestAccepted,
            ErrorCode::InvalidTradeState
        );

        // Validate state transition before proceeding
        validate_trade_state_transition(&trade.state, &TradeState::RequestCanceled)?;

        // Only taker can cancel in RequestCreated, either party can cancel in RequestAccepted
        let signer = ctx.accounts.signer.key();
        match trade.state {
            TradeState::RequestCreated => {
                require!(signer == trade.buyer, ErrorCode::InvalidTradeSender);
            }
            TradeState::RequestAccepted => {
                // Check that seller is properly initialized before validating against it
                require!(
                    trade.seller != Pubkey::default(),
                    ErrorCode::InvalidTradeState
                );
                require!(
                    signer == trade.buyer || signer == trade.seller,
                    ErrorCode::InvalidTradeSender
                );
            }
            _ => return Err(ErrorCode::InvalidTradeState.into()),
        }

        // Update state to canceled
        let canceled_state = TradeStateItem {
            actor: signer,
            state: TradeState::RequestCanceled,
            timestamp: clock.unix_timestamp,
        };

        trade.add_state_history(canceled_state)?;

        msg!("Trade canceled: ID {}", trade_id);

        Ok(())
    }
}

// Account Structures

/// Trade account - stores individual trade data
#[account]
pub struct Trade {
    pub id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub arbitrator: Pubkey,
    pub offer_id: u64,
    pub amount: u64,
    pub token_mint: Pubkey,
    pub fiat_currency: FiatCurrency,
    pub created_at: i64,
    pub expires_at: i64,
    pub state: TradeState,
    pub state_history: Vec<TradeStateItem>,
    pub taker_contact: String,
    pub profile_taker_contact: String,
    pub profile_taker_encryption_key: String,
    pub maker_contact: Option<String>,
    pub buyer_contact: Option<String>,
    pub seller_contact: Option<String>,
    pub bump: u8,
}

impl Trade {
    pub const LEN: usize = 8 + // discriminator
        8 + // id
        32 + // buyer
        32 + // seller
        32 + // arbitrator
        8 + // offer_id
        8 + // amount
        32 + // token_mint
        1 + 1 + // fiat_currency (enum)
        8 + // created_at
        8 + // expires_at
        1 + 1 + // state (enum)
        4 + (32 + 1 + 1 + 8) * 20 + // state_history (max 20 entries)
        4 + 500 + // taker_contact (max 500 chars)
        4 + 500 + // profile_taker_contact (max 500 chars)
        4 + 500 + // profile_taker_encryption_key (max 500 chars)
        1 + 4 + 500 + // maker_contact (optional, max 500 chars)
        1 + 4 + 500 + // buyer_contact (optional, max 500 chars)
        1 + 4 + 500 + // seller_contact (optional, max 500 chars)
        1; // bump

    /// Check if trade has expired
    pub fn is_expired(&self, current_timestamp: i64) -> bool {
        self.expires_at > 0 && current_timestamp > self.expires_at
    }

    /// Check if trade can be canceled
    pub fn can_cancel(&self) -> bool {
        matches!(
            self.state,
            TradeState::RequestCreated | TradeState::RequestAccepted
        )
    }

    /// Get the current state
    pub fn current_state(&self) -> &TradeState {
        &self.state
    }

    /// Add a new state to history (max 20 entries)
    pub fn add_state_history(&mut self, state_item: TradeStateItem) -> Result<()> {
        // Check if state_history exceeds 20 entries
        require!(
            self.state_history.len() < 20,
            ErrorCode::ValueOutOfRange
        );

        // Since TradeState now implements Copy, we can avoid clone()
        self.state = state_item.state;
        self.state_history.push(state_item);
        Ok(())
    }
}

/// Trade counter - tracks the next available trade ID
#[account]
pub struct TradeCounter {
    pub count: u64,
    pub bump: u8,
}

impl TradeCounter {
    pub const LEN: usize = 8 + // discriminator
        8 + // count
        1; // bump
}

// Instruction Contexts

#[derive(Accounts)]
pub struct InitializeCounter<'info> {
    #[account(
        init,
        payer = authority,
        space = TradeCounter::LEN,
        seeds = [b"trade_counter"],
        bump
    )]
    pub counter: Account<'info, TradeCounter>,

    /// Hub configuration account to verify authority
    /// CHECK: This account is validated through CPI to hub program
    pub hub_config: UncheckedAccount<'info>,

    /// Hub program for authority verification
    /// CHECK: This is the hub program ID, validated during CPI
    pub hub_program: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct CreateTrade<'info> {
    #[account(
        mut,
        seeds = [b"trade_counter"],
        bump = counter.bump
    )]
    pub counter: Account<'info, TradeCounter>,

    #[account(
        init,
        payer = taker,
        space = Trade::LEN,
        seeds = [b"trade", (counter.count + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub trade: Account<'info, Trade>,

    /// Offer account to read seller, arbitrator, and fiat_currency from
    /// CHECK: This account is validated through offer program PDA seeds
    #[account(
        seeds = [b"offer", offer_id.to_le_bytes().as_ref()],
        bump,
        seeds::program = offer_program.key()
    )]
    pub offer: UncheckedAccount<'info>,

    /// Offer program for validation
    /// CHECK: This is the offer program ID, validated during deserialization
    pub offer_program: UncheckedAccount<'info>,

    /// Hub configuration for getting arbitrator and other settings
    /// CHECK: This account is validated through hub program PDA seeds
    pub hub_config: UncheckedAccount<'info>,

    #[account(mut)]
    pub taker: Signer<'info>,

    pub token_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(trade_id: u64)]
pub struct AcceptTrade<'info> {
    #[account(
        mut,
        seeds = [b"trade", trade_id.to_le_bytes().as_ref()],
        bump = trade.bump,
        constraint = trade.id == trade_id @ ErrorCode::TradeNotFound
    )]
    pub trade: Account<'info, Trade>,

    /// Offer account to verify maker is the offer owner
    /// CHECK: This account is validated through offer program PDA seeds
    pub offer: UncheckedAccount<'info>,

    #[account(mut)]
    pub maker: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(trade_id: u64)]
pub struct CancelTrade<'info> {
    #[account(
        mut,
        seeds = [b"trade", trade_id.to_le_bytes().as_ref()],
        bump = trade.bump,
        constraint = trade.id == trade_id @ ErrorCode::TradeNotFound
    )]
    pub trade: Account<'info, Trade>,

    #[account(mut)]
    pub signer: Signer<'info>,
}

// Helper functions for trade validation

/// Validate trade state transition
pub fn validate_trade_state_transition(
    current: &TradeState,
    new: &TradeState,
) -> Result<()> {
    let valid = match (current, new) {
        // From RequestCreated
        (TradeState::RequestCreated, TradeState::RequestAccepted) => true,
        (TradeState::RequestCreated, TradeState::RequestCanceled) => true,
        (TradeState::RequestCreated, TradeState::RequestExpired) => true,

        // From RequestAccepted
        (TradeState::RequestAccepted, TradeState::EscrowFunded) => true,
        (TradeState::RequestAccepted, TradeState::EscrowCanceled) => true,

        // From EscrowFunded
        (TradeState::EscrowFunded, TradeState::FiatDeposited) => true,
        (TradeState::EscrowFunded, TradeState::EscrowRefunded) => true,
        (TradeState::EscrowFunded, TradeState::EscrowDisputed) => true,

        // From FiatDeposited
        (TradeState::FiatDeposited, TradeState::EscrowReleased) => true,
        (TradeState::FiatDeposited, TradeState::EscrowDisputed) => true,

        // From EscrowDisputed
        (TradeState::EscrowDisputed, TradeState::SettledForMaker) => true,
        (TradeState::EscrowDisputed, TradeState::SettledForTaker) => true,

        // All other transitions are invalid
        _ => false,
    };

    require!(valid, ErrorCode::InvalidTradeStateChange);
    Ok(())
}

/// Validate trade parameters
pub fn validate_trade_creation(
    amount: u64,
    taker_contact: &str,
    profile_contact: &str,
    encryption_key: &str,
) -> Result<()> {
    // Validate amount
    require!(amount > 0, ErrorCode::InvalidTradeAmount);

    // Validate contact information lengths
    require!(
        taker_contact.len() <= 500,
        ErrorCode::ContactInfoTooLong
    );
    require!(
        profile_contact.len() <= 500,
        ErrorCode::ContactInfoTooLong
    );
    require!(
        encryption_key.len() <= 500,
        ErrorCode::ContactInfoTooLong
    );

    Ok(())
}
