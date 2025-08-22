# PRP: Comprehensive Event Emission Implementation

## Context
Implementing comprehensive event emission for a Solana P2P trading platform with 5 programs (hub, offer, price, profile, trade). Currently, there are no events being emitted in any of the programs. Events are critical for observability, debugging, compliance, and analytics.

## Goal
Add structured event emission across all programs with consistent schemas, indexing support, and security monitoring capabilities.

## Architecture Overview

### Programs Structure
- **Hub**: Configuration and program registry
- **Offer**: Buy/sell offer management  
- **Price**: Oracle price feeds
- **Profile**: User profiles and reputation
- **Trade**: Trade lifecycle and escrow management

### Shared Types Location
Currently in `contracts/solana/programs/profile/src/lib.rs`:
- TradeState enum (lines 214-231)
- OfferState enum (lines 234-238)
- OfferType enum (lines 241-244)
- FiatCurrency enum (lines 247-250+)

## Implementation Blueprint

### 1. Create Shared Events Module

**File**: `contracts/solana/programs/shared-types/Cargo.toml`
```toml
[package]
name = "shared-types"
version = "0.1.0"
edition = "2021"

[dependencies]
anchor-lang = { workspace = true }
```

**File**: `contracts/solana/programs/shared-types/src/lib.rs`
```rust
pub mod events;
pub use events::*;

// Re-export common types from profile program
pub use profile::{TradeState, OfferState, OfferType, FiatCurrency};
```

**File**: `contracts/solana/programs/shared-types/src/events.rs`
```rust
use anchor_lang::prelude::*;

// Base trait for consistency
pub trait LocalMoneyEvent {
    fn event_type(&self) -> &'static str;
    fn timestamp(&self) -> i64;
    fn version(&self) -> u8 { 1 }
}

// Trade events
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
    pub buyer_index: Pubkey,
    #[index]
    pub seller_index: Pubkey,
}

// Add all events from FIX_08_EVENT_EMISSION.md examples
```

### 2. Update Workspace Configuration

**File**: `contracts/solana/Cargo.toml`
```toml
[workspace]
members = ["programs/*", "programs/shared-types"]
resolver = "2"
```

### 3. Add Events to Each Program

#### Trade Program Events
**Location**: `contracts/solana/programs/trade/src/lib.rs`

**After line 16 (before create_trade function):**
```rust
use shared_types::*;
```

**In create_trade (after line 82):**
```rust
// Emit trade creation event
emit!(TradeCreatedEvent {
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
});
```

**In fund_escrow (after line 189):**
```rust
emit!(EscrowFundedEvent {
    trade_id: ctx.accounts.trade.id,
    seller: ctx.accounts.seller.key(),
    amount: transfer_amount,
    escrow_account: ctx.accounts.escrow_account.key(),
    timestamp: clock.unix_timestamp,
    trade_index: ctx.accounts.trade.id,
});
```

**In release_escrow (after line 329):**
```rust
// Emit fee distribution event
emit!(FeeDistributionEvent {
    trade_id: ctx.accounts.trade.id,
    total_amount: ctx.accounts.trade.amount,
    treasury_fee: treasury_fee,
    chain_fee: chain_fee,
    warchest_fee: warchest_fee,
    burn_amount: burn_amount,
    net_to_recipient: net_amount,
    timestamp: clock.unix_timestamp,
});

// Emit trade completion event
emit!(TradeCompletedEvent {
    trade_id: ctx.accounts.trade.id,
    buyer: ctx.accounts.trade.buyer,
    seller: ctx.accounts.trade.seller,
    final_amount: net_amount,
    fees_collected: total_fees,
    completion_type: "normal".to_string(),
    timestamp: clock.unix_timestamp,
    trade_index: ctx.accounts.trade.id,
});
```

**In settle_dispute (after line 700):**
```rust
emit!(DisputeResolvedEvent {
    trade_id: ctx.accounts.trade.id,
    arbitrator: ctx.accounts.arbitrator.key(),
    winner: winner,
    resolution_reason: format!("{:?}", final_state),
    fee_to_arbitrator: arbitrator_fee,
    timestamp: clock.unix_timestamp,
    arbitrator_index: ctx.accounts.arbitrator.key(),
});
```

#### Profile Program Events
**Location**: `contracts/solana/programs/profile/src/lib.rs`

**After line 10 (in create_profile):**
```rust
use shared_types::*;
```

**After line 27 (end of create_profile):**
```rust
emit!(ProfileCreatedEvent {
    user: ctx.accounts.user.key(),
    username: username,
    timestamp: clock.unix_timestamp,
    user_index: ctx.accounts.user.key(),
});
```

#### Hub Program Events
**Location**: `contracts/solana/programs/hub/src/lib.rs`

**In update_config (after line 107):**
```rust
emit!(ConfigUpdateEvent {
    updater: ctx.accounts.authority.key(),
    config_type: "hub".to_string(),
    old_value: format!("{:?}", old_config),
    new_value: format!("{:?}", ctx.accounts.config),
    timestamp: Clock::get()?.unix_timestamp,
});
```

#### Offer Program Events
**Location**: `contracts/solana/programs/offer/src/lib.rs`

**After line 49 (end of create_offer):**
```rust
emit!(OfferCreatedEvent {
    offer_id: params.offer_id,
    owner: ctx.accounts.owner.key(),
    offer_type: format!("{:?}", params.offer_type),
    token_mint: ctx.accounts.token_mint.key(),
    fiat_currency: format!("{:?}", params.fiat_currency),
    min_amount: params.min_amount,
    max_amount: params.max_amount,
    rate: params.rate,
    timestamp: Clock::get()?.unix_timestamp,
    owner_index: ctx.accounts.owner.key(),
});
```

### 4. Add Security Event Emission

**File**: `contracts/solana/programs/trade/src/lib.rs`

**In validate_account_security function (after line 3280):**
```rust
// Check for suspicious patterns
if is_suspicious_pattern(actor) {
    emit!(SecurityAlertEvent {
        alert_type: "suspicious_account".to_string(),
        severity: 3,
        actor: *actor,
        details: format!("Suspicious activity detected for trade {}", trade.id),
        timestamp: Clock::get()?.unix_timestamp,
        alert_index: "suspicious_account".to_string(),
    });
}

fn is_suspicious_pattern(account: &Pubkey) -> bool {
    // Check for known attack patterns
    let account_bytes = account.to_bytes();
    
    // Pattern 1: All zeros except last few bytes (common in generated attacks)
    let zero_count = account_bytes.iter().filter(|&&b| b == 0).count();
    if zero_count > 28 { return true; }
    
    // Pattern 2: Sequential bytes (could indicate programmatic generation)
    let mut sequential = true;
    for i in 1..account_bytes.len() {
        if account_bytes[i] != account_bytes[i-1] + 1 {
            sequential = false;
            break;
        }
    }
    if sequential { return true; }
    
    false
}
```

### 5. Add Circuit Breaker Events

**In hub program when pausing/resuming:**
```rust
emit!(CircuitBreakerEvent {
    action: "pause".to_string(),
    scope: "trading".to_string(),
    triggered_by: ctx.accounts.authority.key(),
    reason: params.reason,
    auto_resume_at: params.auto_resume_at,
    timestamp: Clock::get()?.unix_timestamp,
});
```

## Task Implementation Order

1. Create shared-types module structure
2. Define all event structs in shared-types/src/events.rs
3. Update Cargo.toml workspace configuration
4. Add shared-types dependency to each program's Cargo.toml
5. Import events in trade program and add emission points
6. Import events in profile program and add emission points
7. Import events in hub program and add emission points
8. Import events in offer program and add emission points
9. Import events in price program and add emission points (if needed)
10. Add security event emissions in validation functions
11. Add circuit breaker event emissions
12. Test event emission with SDK integration tests

## Dependencies to Add

**Each program's Cargo.toml:**
```toml
[dependencies]
shared-types = { path = "../shared-types" }
```

## Validation Gates

```bash
# Build all programs
cd contracts/solana
anchor build

# Run existing tests to ensure no breaking changes
anchor test

# Check for event emission in logs
RUST_LOG=solana_runtime::system_instruction_processor=trace,solana_runtime::message_processor=trace,solana_bpf_loader=debug,solana_rbpf=debug anchor test 2>&1 | grep -i "event"

# Verify IDL generation includes events
anchor idl parse -f programs/trade/src/lib.rs | jq '.events'
anchor idl parse -f programs/profile/src/lib.rs | jq '.events'
anchor idl parse -f programs/hub/src/lib.rs | jq '.events'
anchor idl parse -f programs/offer/src/lib.rs | jq '.events'

# SDK integration test
cd sdk
npm test -- --testPathPattern=events
```

## Error Handling Patterns

When emitting events, always use safe error handling:
```rust
// Pattern 1: Emit after state changes succeed
trade.state = new_state;
emit!(StateChangeEvent { ... });

// Pattern 2: Use Clock::get()? for timestamps
let clock = Clock::get()?;
emit!(EventWithTimestamp { 
    timestamp: clock.unix_timestamp,
    ...
});

// Pattern 3: Format enums safely
fiat_currency: format!("{:?}", trade.fiat_currency)
```

## Known Gotchas

1. **Event Size Limits**: Anchor events are limited to ~1000 bytes. Keep event data concise.
2. **Index Performance**: Only index fields that will be queried. Each index adds overhead.
3. **Clock Access**: Always use `Clock::get()?` at function start, not inside events.
4. **Enum Formatting**: Use `format!("{:?}", enum_value)` for string representation.
5. **Event Order**: Emit events after state changes to ensure consistency.

## Documentation References

- Anchor Events: https://www.anchor-lang.com/docs/events
- Event Indexing: https://docs.solana.com/developing/programming-model/transactions#events  
- Anchor Event Attributes: https://docs.rs/anchor-lang/latest/anchor_lang/attr.event.html
- Best Practices: https://book.anchor-lang.com/anchor_in_depth/events.html

## Testing Strategy

1. Unit tests for event emission in each instruction
2. Integration tests verifying event data accuracy
3. SDK tests for event subscription and parsing
4. Performance tests for event overhead

## Success Metrics

- All critical operations emit events
- Events are indexed and queryable
- Security events trigger monitoring alerts
- Event data is consistent and accurate
- Performance impact < 5% on transaction costs

## Files to Reference

- Trade program: `contracts/solana/programs/trade/src/lib.rs`
- Profile program: `contracts/solana/programs/profile/src/lib.rs`
- Hub program: `contracts/solana/programs/hub/src/lib.rs`
- Offer program: `contracts/solana/programs/offer/src/lib.rs`
- Price program: `contracts/solana/programs/price/src/lib.rs`
- SDK types: `contracts/solana/sdk/src/types/*.ts`

## Confidence Score: 8/10

The implementation path is clear with specific locations and code snippets. The main complexity is ensuring consistent event emission across all state transitions and proper error handling. The shared-types module approach provides good separation of concerns while maintaining type safety.