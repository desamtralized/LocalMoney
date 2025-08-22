use anchor_lang::prelude::*;
use localmoney_shared::{TradeState, TradeStateItem};
use crate::state::Trade;
use crate::errors::ErrorCode;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AuthorizationRole {
    Buyer,
    Seller,
    Arbitrator,
    System,
}

impl Trade {
    /// Validate comprehensive authorization for state transitions
    pub fn validate_authorization(
        &self,
        actor: &Pubkey,
        role: AuthorizationRole,
    ) -> Result<()> {
        let authorized = match role {
            AuthorizationRole::Buyer => *actor == self.buyer,
            AuthorizationRole::Seller => *actor == self.seller,
            AuthorizationRole::Arbitrator => *actor == self.arbitrator,
            AuthorizationRole::System => true, // System operations always authorized
        };
        
        require!(authorized, ErrorCode::Unauthorized);
        Ok(())
    }
    
    /// Validate timing constraints for state transitions
    pub fn validate_timing_constraints(&self) -> Result<()> {
        let clock = Clock::get()?;
        let now = clock.unix_timestamp as u64;
        
        // Check if trade has expired
        if !self.is_terminal_state() {
            require!(
                now <= self.expires_at,
                ErrorCode::TradeExpired
            );
        }
        
        // Check dispute window if applicable
        if let Some(dispute_window) = self.dispute_window_at {
            if self.state == TradeState::DisputeOpened {
                require!(
                    now <= dispute_window,
                    ErrorCode::DisputeWindowNotOpen
                );
            }
        }
        
        Ok(())
    }
    
    /// Advanced state transition with comprehensive validation
    pub fn transition_state_advanced(
        &mut self,
        new_state: TradeState,
        actor: Pubkey,
        role: AuthorizationRole,
    ) -> Result<()> {
        // Validate authorization
        self.validate_authorization(&actor, role)?;
        
        // Validate timing
        self.validate_timing_constraints()?;
        
        // Validate transition
        self.validate_transition(&new_state)?;
        
        // Perform transition
        let clock = Clock::get()?;
        self.transition_state(new_state, actor, clock.unix_timestamp)?;
        
        Ok(())
    }
    
    /// Set dispute window when escrow is funded
    pub fn set_dispute_window(&mut self, duration: u64) -> Result<()> {
        require!(
            self.state == TradeState::EscrowFunded,
            ErrorCode::InvalidTradeState
        );
        
        let clock = Clock::get()?;
        let dispute_window = clock.unix_timestamp as u64 + duration;
        
        // Ensure dispute window doesn't exceed trade expiry
        let effective_window = dispute_window.min(self.expires_at);
        self.dispute_window_at = Some(effective_window);
        
        Ok(())
    }
    
    /// Check if trade can be disputed
    pub fn can_open_dispute(&self, actor: &Pubkey) -> bool {
        // Must be in disputable state
        if !self.is_disputable() {
            return false;
        }
        
        // Must be buyer or seller
        if *actor != self.buyer && *actor != self.seller {
            return false;
        }
        
        // Must be within dispute window if set
        if let Some(dispute_window) = self.dispute_window_at {
            let now = Clock::get()
                .map(|c| c.unix_timestamp as u64)
                .unwrap_or(0);
            if now > dispute_window {
                return false;
            }
        }
        
        true
    }
    
    /// Calculate refund eligibility
    pub fn calculate_refund_eligibility(&self) -> Result<(bool, u64)> {
        if !self.can_refund() {
            return Ok((false, 0));
        }
        
        let clock = Clock::get()?;
        let now = clock.unix_timestamp as u64;
        
        // Check if past dispute window
        if let Some(dispute_window) = self.dispute_window_at {
            if now > dispute_window {
                // Eligible for automatic refund
                return Ok((true, self.amount));
            }
        }
        
        Ok((false, 0))
    }
}

/// State transition validation rules
pub fn validate_state_transition_rules(
    from_state: &TradeState,
    to_state: &TradeState,
    actor: &Pubkey,
    trade: &Trade,
) -> Result<()> {
    use TradeState::*;
    
    // Define role requirements for each transition
    let required_role = match (from_state, to_state) {
        (RequestCreated, RequestAccepted) => {
            // Seller accepts the trade request
            require!(*actor == trade.seller, ErrorCode::Unauthorized);
            AuthorizationRole::Seller
        }
        (RequestCreated, RequestCancelled) => {
            // Buyer can cancel their own request
            require!(*actor == trade.buyer, ErrorCode::Unauthorized);
            AuthorizationRole::Buyer
        }
        (RequestAccepted, EscrowFunded) => {
            // Seller funds the escrow
            require!(*actor == trade.seller, ErrorCode::Unauthorized);
            AuthorizationRole::Seller
        }
        (RequestAccepted, RequestCancelled) => {
            // Either party can cancel before escrow
            require!(
                *actor == trade.buyer || *actor == trade.seller,
                ErrorCode::Unauthorized
            );
            if *actor == trade.buyer {
                AuthorizationRole::Buyer
            } else {
                AuthorizationRole::Seller
            }
        }
        (EscrowFunded, FiatDeposited) => {
            // Buyer marks fiat as deposited
            require!(*actor == trade.buyer, ErrorCode::Unauthorized);
            AuthorizationRole::Buyer
        }
        (FiatDeposited, EscrowReleased) => {
            // Seller releases escrow
            require!(*actor == trade.seller, ErrorCode::Unauthorized);
            AuthorizationRole::Seller
        }
        (EscrowFunded | FiatDeposited, DisputeOpened) => {
            // Either party can open dispute
            require!(
                *actor == trade.buyer || *actor == trade.seller,
                ErrorCode::Unauthorized
            );
            if *actor == trade.buyer {
                AuthorizationRole::Buyer
            } else {
                AuthorizationRole::Seller
            }
        }
        (DisputeOpened, DisputeResolved) => {
            // Only arbitrator can resolve disputes
            require!(*actor == trade.arbitrator, ErrorCode::Unauthorized);
            AuthorizationRole::Arbitrator
        }
        (DisputeResolved, EscrowReleased) | (DisputeResolved, EscrowRefunded) => {
            // System handles post-resolution transfers
            AuthorizationRole::System
        }
        _ => {
            msg!("Invalid state transition: {:?} -> {:?}", from_state, to_state);
            return Err(ErrorCode::InvalidStateTransition.into());
        }
    };
    
    // Additional validation for specific transitions
    match to_state {
        DisputeOpened => {
            // Ensure trade is within dispute window
            trade.validate_timing_constraints()?;
        }
        EscrowReleased | EscrowRefunded => {
            // Ensure trade is ready for completion
            require!(
                trade.state == DisputeResolved || trade.state == FiatDeposited,
                ErrorCode::InvalidTradeState
            );
        }
        _ => {}
    }
    
    Ok(())
}