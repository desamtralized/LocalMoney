use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use shared_types::{
    FiatCurrency, LocalMoneyErrorCode as ErrorCode, TradeState, TradeStateItem,
};

declare_id!("AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM");

#[program]
pub mod trade {
    use super::*;

    /// Initialize the trade counter
    pub fn initialize_counter(ctx: Context<InitializeCounter>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = 0;
        counter.bump = ctx.bumps.counter;
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

        // Validate contact information length
        require!(
            taker_contact.len() <= 500,
            ErrorCode::ContactInfoTooLong
        );
        require!(
            profile_taker_contact.len() <= 500,
            ErrorCode::ContactInfoTooLong
        );

        // Validate amount is not zero
        require!(amount > 0, ErrorCode::InvalidTradeAmount);

        // Initialize trade state
        let initial_state = TradeStateItem {
            actor: ctx.accounts.taker.key(),
            state: TradeState::RequestCreated,
            timestamp: clock.unix_timestamp,
        };

        // Set up buyer/seller based on offer type (will be determined from offer data)
        // For now, we'll set taker as buyer (this will be updated when we integrate with offer)
        trade.id = trade_id;
        trade.buyer = ctx.accounts.taker.key();
        trade.seller = Pubkey::default(); // Will be set from offer data
        trade.arbitrator = Pubkey::default(); // Will be assigned
        trade.offer_id = offer_id;
        trade.amount = amount;
        trade.token_mint = ctx.accounts.token_mint.key();
        trade.fiat_currency = FiatCurrency::USD; // Will be set from offer data
        trade.created_at = clock.unix_timestamp;
        trade.expires_at = 0; // Will be set based on hub config
        trade.state = TradeState::RequestCreated;
        trade.state_history = vec![initial_state];
        trade.taker_contact = taker_contact;
        trade.profile_taker_contact = profile_taker_contact;
        trade.profile_taker_encryption_key = profile_taker_encryption_key;
        trade.bump = ctx.bumps.trade;

        msg!(
            "Trade created: ID {}, offer_id {}, amount {}",
            trade_id,
            offer_id,
            amount
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

        // Validate current state
        require!(
            trade.state == TradeState::RequestCreated,
            ErrorCode::InvalidTradeState
        );

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
            trade.state = TradeState::RequestExpired;
            trade.state_history.push(expired_state);
            return Err(ErrorCode::TradeExpired.into());
        }

        // Only the maker (offer owner) can accept the trade
        // This validation will be enhanced when we integrate with offer program

        // Update trade state to accepted
        let accepted_state = TradeStateItem {
            actor: ctx.accounts.maker.key(),
            state: TradeState::RequestAccepted,
            timestamp: clock.unix_timestamp,
        };

        trade.state = TradeState::RequestAccepted;
        trade.state_history.push(accepted_state);
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

        // Only taker can cancel in RequestCreated, either party can cancel in RequestAccepted
        let signer = ctx.accounts.signer.key();
        match trade.state {
            TradeState::RequestCreated => {
                require!(signer == trade.buyer, ErrorCode::InvalidTradeSender);
            }
            TradeState::RequestAccepted => {
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

        trade.state = TradeState::RequestCanceled;
        trade.state_history.push(canceled_state);

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

    /// Add a new state to history
    pub fn add_state_history(&mut self, state_item: TradeStateItem) {
        self.state = state_item.state.clone();
        self.state_history.push(state_item);
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
