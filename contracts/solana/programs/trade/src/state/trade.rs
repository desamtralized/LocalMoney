use anchor_lang::prelude::*;
use localmoney_shared::{
    BoundedStateHistory, BoundedString, FiatCurrency, TradeState, TradeStateItem, SafeMath,
    Reallocatable,
};
use crate::errors::ErrorCode;

#[account]
#[derive(Debug)]
pub struct Trade {
    pub id: u64,
    pub offer_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub arbitrator: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub fiat_currency: FiatCurrency,
    pub locked_price: u64,
    pub state: TradeState,
    pub created_at: u64,
    pub expires_at: u64,
    pub dispute_window_at: Option<u64>,
    pub state_history: BoundedStateHistory,
    pub buyer_contact: Option<BoundedString>,
    pub seller_contact: Option<BoundedString>,
    pub bump: u8,
}

impl Trade {
    pub const SPACE: usize = 8 + // discriminator
        8 + // id
        8 + // offer_id
        32 + // buyer
        32 + // seller
        32 + // arbitrator
        32 + // token_mint
        8 + // amount
        1 + // fiat_currency
        8 + // locked_price
        1 + // state
        8 + // created_at
        8 + // expires_at
        9 + // dispute_window_at (Option<u64>)
        BoundedStateHistory::space() + // state_history with circular buffer
        BoundedString::option_space() + // buyer_contact
        BoundedString::option_space() + // seller_contact
        1; // bump
        
    pub fn initialize(
        &mut self,
        id: u64,
        offer_id: u64,
        buyer: Pubkey,
        seller: Pubkey,
        arbitrator: Pubkey,
        token_mint: Pubkey,
        amount: u64,
        fiat_currency: FiatCurrency,
        locked_price: u64,
        expiry_duration: u64,
        buyer_contact: String,
        bump: u8,
    ) -> Result<()> {
        let clock = Clock::get()?;
        
        self.id = id;
        self.offer_id = offer_id;
        self.buyer = buyer;
        self.seller = seller;
        self.arbitrator = arbitrator;
        self.token_mint = token_mint;
        self.amount = amount;
        self.fiat_currency = fiat_currency;
        self.locked_price = locked_price;
        self.state = TradeState::RequestCreated;
        self.created_at = clock.unix_timestamp as u64;
        self.expires_at = self.created_at.safe_add(expiry_duration)?;
        self.dispute_window_at = None;
        self.state_history = BoundedStateHistory::new();
        self.buyer_contact = BoundedString::from_option(Some(buyer_contact))?;
        self.seller_contact = None;
        self.bump = bump;
        
        // Record initial state in history
        self.state_history.push(TradeStateItem {
            actor: buyer,
            state: TradeState::RequestCreated,
            timestamp: clock.unix_timestamp,
        })?;
        
        Ok(())
    }
    
    pub fn transition_state(
        &mut self,
        new_state: TradeState,
        actor: Pubkey,
        timestamp: i64,
    ) -> Result<()> {
        // Validate transition
        self.validate_transition(&new_state)?;
        
        // Update state
        let old_state = self.state.clone();
        self.state = new_state.clone();
        
        // Record history
        self.state_history.push(TradeStateItem {
            actor,
            state: new_state,
            timestamp,
        })?;
        
        // Check invariants
        self.check_invariants()?;
        
        msg!("State transition: {:?} -> {:?}", old_state, self.state);
        Ok(())
    }
    
    fn validate_transition(&self, new_state: &TradeState) -> Result<()> {
        use TradeState::*;
        
        let valid = match (&self.state, new_state) {
            (RequestCreated, RequestAccepted) => true,
            (RequestCreated, RequestCancelled) => true,
            (RequestAccepted, EscrowFunded) => true,
            (RequestAccepted, RequestCancelled) => true,
            (EscrowFunded, FiatDeposited) => true,
            (EscrowFunded, DisputeOpened) => true,
            (FiatDeposited, EscrowReleased) => true,
            (FiatDeposited, DisputeOpened) => true,
            (DisputeOpened, DisputeResolved) => true,
            (DisputeResolved, EscrowReleased) => true,
            (DisputeResolved, EscrowRefunded) => true,
            _ => false,
        };
        
        require!(
            valid,
            ErrorCode::InvalidStateTransition
        );
        
        Ok(())
    }
    
    pub fn check_invariants(&self) -> Result<()> {
        // Invariant: Trade amount must be positive
        require!(
            self.amount > 0,
            ErrorCode::InvalidTradeAmount
        );
        
        // Invariant: Expiry must be in future for active trades
        if !self.is_terminal_state() {
            let now = Clock::get()?.unix_timestamp as u64;
            require!(
                self.expires_at > now,
                ErrorCode::TradeExpired
            );
        }
        
        // State-specific invariants
        match self.state {
            TradeState::RequestCreated | TradeState::RequestAccepted => {
                // No dispute window should be set
                require!(
                    self.dispute_window_at.is_none(),
                    ErrorCode::InvalidTradeState
                );
            }
            TradeState::EscrowFunded | TradeState::FiatDeposited => {
                // Dispute window should be set
                require!(
                    self.dispute_window_at.is_some(),
                    ErrorCode::InvalidTradeState
                );
            }
            TradeState::EscrowReleased | TradeState::EscrowRefunded => {
                // Trade should be marked as terminal
                require!(
                    self.is_terminal_state(),
                    ErrorCode::InvalidTradeState
                );
            }
            _ => {}
        }
        
        Ok(())
    }
    
    pub fn is_terminal_state(&self) -> bool {
        matches!(
            self.state,
            TradeState::EscrowReleased 
            | TradeState::EscrowRefunded 
            | TradeState::RequestCancelled
        )
    }
    
    pub fn is_disputable(&self) -> bool {
        matches!(
            self.state,
            TradeState::EscrowFunded | TradeState::FiatDeposited
        )
    }
    
    pub fn can_refund(&self) -> bool {
        // Can refund if in appropriate state and past dispute window
        if !matches!(self.state, TradeState::EscrowFunded | TradeState::FiatDeposited) {
            return false;
        }
        
        if let Some(dispute_window) = self.dispute_window_at {
            let now = Clock::get().map(|c| c.unix_timestamp as u64).unwrap_or(0);
            now > dispute_window
        } else {
            false
        }
    }
    
    pub fn current_size(&self) -> usize {
        // Calculate actual size based on current data
        let base_size = Self::SPACE;
        let history_size = self.state_history.len() * std::mem::size_of::<TradeStateItem>();
        let contact_size = self.buyer_contact.as_ref().map_or(0, |c| c.len()) + 
                          self.seller_contact.as_ref().map_or(0, |c| c.len());
        
        base_size + history_size + contact_size
    }
}

impl Reallocatable for Trade {
    const MIN_SIZE: usize = 8 + Trade::SPACE;
    const GROWTH_FACTOR: usize = 512; // Grow by 512 bytes at a time
    
    fn required_size(&self) -> usize {
        self.current_size()
    }
    
    fn can_reallocate(&self) -> bool {
        !self.is_terminal_state()
    }
}