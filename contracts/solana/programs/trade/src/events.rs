use anchor_lang::prelude::*;

// Re-export events from shared crate since they're already defined there
pub use localmoney_shared::{
    TradeCreatedEvent,
    TradeStateChangeEvent,
    EscrowFundedEvent,
    FeeDistributionEvent,
    TradeCompletedEvent,
    DisputeResolvedEvent,
    SecurityAlertEvent,
    TradeClosedEvent,
};