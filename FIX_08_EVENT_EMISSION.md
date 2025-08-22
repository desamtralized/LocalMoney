## FEATURE:

- Add comprehensive event emission for all critical operations
- Implement structured event types with consistent schemas
- Add event indexing support for off-chain monitoring
- Create event aggregation for analytics and compliance
- Implement event replay capability for debugging

## EXAMPLES:

```rust
// shared-types/src/events.rs
use anchor_lang::prelude::*;

// Base event trait for common fields
pub trait LocalMoneyEvent {
    fn event_type(&self) -> &'static str;
    fn timestamp(&self) -> i64;
    fn version(&self) -> u8 { 1 }
}

// Trade lifecycle events
#[event]
pub struct TradeCreatedEvent {
    pub trade_id: u64,
    pub offer_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub token_mint: Pubkey,
    pub fiat_currency: String,
    pub locked_price: u64,
    pub timestamp: i64,
    #[index]
    pub buyer_index: Pubkey,  // Indexed for efficient queries
    #[index]
    pub seller_index: Pubkey,
}

#[event]
pub struct EscrowFundedEvent {
    pub trade_id: u64,
    pub seller: Pubkey,
    pub amount: u64,
    pub escrow_account: Pubkey,
    pub timestamp: i64,
    #[index]
    pub trade_index: u64,
}

#[event]
pub struct TradeCompletedEvent {
    pub trade_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub final_amount: u64,
    pub fees_collected: u64,
    pub completion_type: String, // "normal", "disputed", "expired"
    pub timestamp: i64,
    #[index]
    pub trade_index: u64,
}

// Fee distribution events
#[event]
pub struct FeeDistributionEvent {
    pub trade_id: u64,
    pub total_amount: u64,
    pub treasury_fee: u64,
    pub chain_fee: u64,
    pub warchest_fee: u64,
    pub burn_amount: u64,
    pub net_to_recipient: u64,
    pub timestamp: i64,
}

// Security events
#[event]
pub struct SecurityAlertEvent {
    pub alert_type: String, // "suspicious_account", "rate_limit", "validation_failure"
    pub severity: u8,       // 1-5 scale
    pub actor: Pubkey,
    pub details: String,
    pub timestamp: i64,
    #[index]
    pub alert_index: String,
}

// Arbitration events
#[event]
pub struct DisputeOpenedEvent {
    pub trade_id: u64,
    pub initiated_by: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub arbitrator: Pubkey,
    pub reason: String,
    pub timestamp: i64,
    #[index]
    pub arbitrator_index: Pubkey,
}

#[event]
pub struct DisputeResolvedEvent {
    pub trade_id: u64,
    pub arbitrator: Pubkey,
    pub winner: Pubkey,
    pub resolution_reason: String,
    pub fee_to_arbitrator: u64,
    pub timestamp: i64,
    #[index]
    pub arbitrator_index: Pubkey,
}

// Profile events
#[event]
pub struct ProfileCreatedEvent {
    pub user: Pubkey,
    pub username: String,
    pub timestamp: i64,
    #[index]
    pub user_index: Pubkey,
}

#[event]
pub struct ReputationUpdateEvent {
    pub user: Pubkey,
    pub old_score: u32,
    pub new_score: u32,
    pub reason: String, // "trade_completed", "dispute_won", "dispute_lost"
    pub timestamp: i64,
    #[index]
    pub user_index: Pubkey,
}

// System events
#[event]
pub struct ConfigUpdateEvent {
    pub updater: Pubkey,
    pub config_type: String, // "hub", "fees", "limits"
    pub old_value: String,   // JSON encoded
    pub new_value: String,   // JSON encoded
    pub timestamp: i64,
}

#[event]
pub struct CircuitBreakerEvent {
    pub action: String, // "pause", "resume"
    pub scope: String,  // "global", "trading", "deposits", "withdrawals"
    pub triggered_by: Pubkey,
    pub reason: String,
    pub auto_resume_at: Option<i64>,
    pub timestamp: i64,
}

// Event emission helpers
pub struct EventEmitter;

impl EventEmitter {
    pub fn emit_with_metrics<T: anchor_lang::Event + LocalMoneyEvent>(
        event: T,
    ) -> Result<()> {
        // Log for debugging
        msg!("Event: {} at {}", event.event_type(), event.timestamp());
        
        // Emit the actual event
        emit!(event);
        
        Ok(())
    }
    
    pub fn emit_batch<T: anchor_lang::Event + LocalMoneyEvent>(
        events: Vec<T>,
    ) -> Result<()> {
        for event in events {
            Self::emit_with_metrics(event)?;
        }
        Ok(())
    }
}

// Usage in instructions:
pub fn create_trade(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
    let clock = Clock::get()?;
    
    // ... trade creation logic ...
    
    // Emit comprehensive event
    EventEmitter::emit_with_metrics(TradeCreatedEvent {
        trade_id: params.trade_id,
        offer_id: params.offer_id,
        buyer: ctx.accounts.buyer.key(),
        seller: ctx.accounts.offer.owner,
        amount: params.amount,
        token_mint: ctx.accounts.token_mint.key(),
        fiat_currency: format!("{:?}", ctx.accounts.offer.fiat_currency),
        locked_price: params.locked_price,
        timestamp: clock.unix_timestamp,
        buyer_index: ctx.accounts.buyer.key(),
        seller_index: ctx.accounts.offer.owner,
    })?;
    
    Ok(())
}

pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
    let clock = Clock::get()?;
    
    // ... escrow release logic ...
    
    // Emit multiple related events
    let events = vec![
        FeeDistributionEvent {
            trade_id: ctx.accounts.trade.id,
            total_amount: ctx.accounts.trade.amount,
            treasury_fee: fee_info.treasury_amount,
            chain_fee: fee_info.chain_fee_amount,
            warchest_fee: fee_info.warchest_amount,
            burn_amount: fee_info.burn_amount,
            net_to_recipient: net_amount,
            timestamp: clock.unix_timestamp,
        },
        TradeCompletedEvent {
            trade_id: ctx.accounts.trade.id,
            buyer: ctx.accounts.trade.buyer,
            seller: ctx.accounts.trade.seller,
            final_amount: net_amount,
            fees_collected: total_fees,
            completion_type: "normal".to_string(),
            timestamp: clock.unix_timestamp,
            trade_index: ctx.accounts.trade.id,
        },
    ];
    
    // Emit as batch for consistency
    EventEmitter::emit_batch(events)?;
    
    Ok(())
}

// Suspicious activity detection
pub fn validate_and_emit_security_alert(
    account: &Pubkey,
    action: &str,
) -> Result<()> {
    let clock = Clock::get()?;
    
    // Check for suspicious patterns
    if is_suspicious_account(account) {
        EventEmitter::emit_with_metrics(SecurityAlertEvent {
            alert_type: "suspicious_account".to_string(),
            severity: 3,
            actor: *account,
            details: format!("Suspicious activity detected for action: {}", action),
            timestamp: clock.unix_timestamp,
            alert_index: "suspicious_account".to_string(),
        })?;
    }
    
    Ok(())
}
```

## DOCUMENTATION:

- Anchor events: https://www.anchor-lang.com/docs/events
- Event indexing: https://docs.solana.com/developing/programming-model/transactions#events
- Log monitoring best practices
- Event-driven architecture patterns

## OTHER CONSIDERATIONS:

- **Performance**: Events consume compute units - balance detail vs cost
- **Storage**: Events are stored in transaction logs - consider retention
- **Privacy**: Don't emit sensitive personal data in events
- **Indexing**: Design events for efficient off-chain indexing
- **Versioning**: Include version field for schema evolution
- **Compression**: Consider compressing large event data
- **Rate Limiting**: Prevent event spam attacks
- **Monitoring**: Set up real-time event monitoring infrastructure

## RELATED ISSUES:

- Prerequisites: FIX_01-07 (core fixes and bounds)
- Next: FIX_09_ARBITRATOR_VRF (fair randomness)
- Critical for: Observability, debugging, compliance, analytics