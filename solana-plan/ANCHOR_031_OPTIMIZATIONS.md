# Anchor 0.31.0 Optimization Guide for LocalMoney

## LazyAccount: The Game Changer

Anchor 0.31.0 introduces `LazyAccount`, a revolutionary feature for handling large account structures efficiently. This is particularly important for LocalMoney's complex trade and escrow states.

### Traditional Account vs LazyAccount

#### Before (Standard Account - High Stack Usage)
```rust
#[derive(Accounts)]
pub struct ProcessLargeTrade<'info> {
    // This deserializes the ENTIRE 10KB trade account onto the stack
    #[account(mut)]
    pub trade: Account<'info, LargeTrade>,  // ⚠️ Uses ~10KB stack
}

#[account]
pub struct LargeTrade {
    pub id: [u8; 32],
    pub seller_profile: ProfileData,      // 2KB
    pub buyer_profile: ProfileData,       // 2KB
    pub offer_details: OfferData,         // 1KB
    pub escrow_state: EscrowData,         // 1KB
    pub arbitration_data: ArbitrationData, // 2KB
    pub trade_history: Vec<TradeEvent>,   // 2KB
    // Total: ~10KB
}
```

#### After (LazyAccount - Minimal Stack Usage)
```rust
use anchor_lang::accounts::lazy_account::LazyAccount;

#[derive(Accounts)]
pub struct ProcessLargeTrade<'info> {
    // Only uses 24 bytes on stack!
    #[account(mut)]
    pub trade: LazyAccount<'info, LargeTrade>,  // ✅ 24 bytes stack
}

#[program]
pub mod optimized_trade {
    pub fn check_trade_status(ctx: Context<ProcessLargeTrade>) -> Result<()> {
        // Load only the fields you need
        let trade_id = ctx.accounts.trade.load_id()?;
        let status = ctx.accounts.trade.load_status()?;
        
        // Never loads the entire account!
        if *status == TradeStatus::Active {
            // Selectively load more fields only if needed
            let amount = ctx.accounts.trade.load_amount()?;
            process_active_trade(*trade_id, *amount)?;
        }
        
        Ok(())
    }
    
    pub fn update_trade_field(ctx: Context<ProcessLargeTrade>) -> Result<()> {
        // Modify a single field without loading the entire account
        let mut trade = ctx.accounts.trade.load_mut()?;
        trade.last_update = Clock::get()?.unix_timestamp;
        Ok(())
    }
}
```

### Enabling LazyAccount

In `Cargo.toml`:
```toml
[dependencies]
anchor-lang = { version = "0.31.1", features = ["lazy-account"] }
```

## Real-World LocalMoney Examples

### 1. Optimized Trade Processing
```rust
#[account]
pub struct Trade {
    // Core fields (frequently accessed)
    pub id: [u8; 32],
    pub status: TradeStatus,
    pub amount: u64,
    
    // Large nested structures (rarely accessed together)
    pub seller_data: SellerInfo,      // 1KB
    pub buyer_data: BuyerInfo,        // 1KB
    pub payment_methods: PaymentData, // 512B
    pub dispute_info: DisputeData,    // 2KB
    pub metadata: TradeMetadata,      // 1KB
}

#[derive(Accounts)]
pub struct FastTradeCheck<'info> {
    // Use LazyAccount for read-heavy operations
    pub trade: LazyAccount<'info, Trade>,
}

#[derive(Accounts)]
pub struct TradeUpdate<'info> {
    // Use regular Account when you need full access
    #[account(mut)]
    pub trade: Account<'info, Trade>,
}

pub fn quick_status_check(ctx: Context<FastTradeCheck>) -> Result<TradeStatus> {
    // Only loads 1 byte instead of 5.5KB!
    Ok(*ctx.accounts.trade.load_status()?)
}

pub fn process_dispute(ctx: Context<FastTradeCheck>) -> Result<()> {
    let status = ctx.accounts.trade.load_status()?;
    
    if *status == TradeStatus::Disputed {
        // Load dispute data only when needed
        let dispute_info = ctx.accounts.trade.load_dispute_info()?;
        handle_dispute(dispute_info)?;
    }
    
    Ok(())
}
```

### 2. Escrow Optimization
```rust
#[account]
pub struct EscrowState {
    pub trade_id: [u8; 32],
    pub amount: u64,
    pub token: Pubkey,
    pub depositor: Pubkey,
    pub recipient: Pubkey,
    pub status: EscrowStatus,
    
    // Large data structures
    pub transaction_log: Vec<TxEvent>,    // Can be large
    pub fee_breakdown: FeeDetails,        // 256B
    pub release_conditions: ReleaseData,  // 512B
}

pub fn check_escrow_balance(ctx: Context<EscrowCheck>) -> Result<u64> {
    // LazyAccount: Only load the amount field (8 bytes)
    Ok(*ctx.accounts.escrow.load_amount()?)
}

pub fn validate_release_conditions(ctx: Context<EscrowCheck>) -> Result<bool> {
    let status = ctx.accounts.escrow.load_status()?;
    
    if *status == EscrowStatus::ReadyForRelease {
        // Load conditions only when status matches
        let conditions = ctx.accounts.escrow.load_release_conditions()?;
        return validate_conditions(conditions);
    }
    
    Ok(false)
}
```

### 3. Profile Optimization
```rust
#[account]
pub struct UserProfile {
    pub owner: Pubkey,
    pub username: String,
    pub created_at: i64,
    
    // Statistics (frequently read)
    pub total_trades: u32,
    pub success_rate: u16,
    
    // Large data (rarely accessed)
    pub trade_history: Vec<TradeRecord>,  // Can be up to 5KB
    pub reviews: Vec<Review>,             // Can be up to 3KB
    pub contact_info: ContactData,        // 1KB
}

#[derive(Accounts)]
pub struct QuickProfileCheck<'info> {
    pub profile: LazyAccount<'info, UserProfile>,
}

pub fn get_user_stats(ctx: Context<QuickProfileCheck>) -> Result<(u32, u16)> {
    // Load only stats, not the entire 9KB profile
    let total_trades = ctx.accounts.profile.load_total_trades()?;
    let success_rate = ctx.accounts.profile.load_success_rate()?;
    
    Ok((*total_trades, *success_rate))
}
```

## Stack Usage Comparison

| Operation | Standard Account | LazyAccount | Savings |
|-----------|-----------------|-------------|---------|
| Load 10KB Trade | 10,240 bytes | 24 bytes | 99.8% |
| Check Status (1 byte) | 10,240 bytes | 25 bytes | 99.8% |
| Update Single Field | 10,240 bytes | ~100 bytes | 99% |
| Read 3 fields (24 bytes) | 10,240 bytes | 72 bytes | 99.3% |

## Custom Discriminators (Space Optimization)

Anchor 0.31.0 allows custom discriminator sizes to save space:

```rust
// Default: 8-byte discriminator
#[account]
pub struct StandardAccount {
    // Discriminator: 8 bytes (hidden)
    pub data: u64,  // 8 bytes
    // Total: 16 bytes
}

// Optimized: 1-byte discriminator
#[account]
#[discriminator_len(1)]
pub struct CompactAccount {
    // Discriminator: 1 byte (hidden)
    pub data: u64,  // 8 bytes
    // Total: 9 bytes (saved 7 bytes!)
}

// For LocalMoney: Save space in frequently created accounts
#[account]
#[discriminator_len(2)]  // 65,536 unique discriminators
pub struct Trade {
    // Saves 6 bytes per trade
    pub trade_data: TradeInfo,
}
```

## Compute Unit Optimization Strategies

### 1. Batch Operations with LazyAccount
```rust
pub fn batch_check_trades(
    ctx: Context<BatchCheck>,
    trade_ids: Vec<[u8; 32]>,
) -> Result<Vec<TradeStatus>> {
    let mut statuses = Vec::with_capacity(trade_ids.len());
    
    // Each iteration uses minimal CU with LazyAccount
    for (i, trade_account) in ctx.remaining_accounts.iter().enumerate() {
        let trade = LazyAccount::<Trade>::try_from(trade_account)?;
        statuses.push(*trade.load_status()?);
    }
    
    Ok(statuses)
}
```

### 2. Selective Field Updates
```rust
pub fn update_trade_timestamp(ctx: Context<TradeUpdate>) -> Result<()> {
    // Don't use: trade.last_update = timestamp (loads entire account)
    
    // Do use: Direct field mutation with LazyAccount
    let mut trade = ctx.accounts.trade.load_mut()?;
    trade.last_update = Clock::get()?.unix_timestamp;
    
    // Only the modified portion is written back
    Ok(())
}
```

### 3. Conditional Loading Pattern
```rust
pub fn process_trade_with_conditions(
    ctx: Context<ProcessTrade>,
    action: TradeAction,
) -> Result<()> {
    let trade = &ctx.accounts.trade;
    
    // Always load minimal fields first
    let status = trade.load_status()?;
    let amount = trade.load_amount()?;
    
    match action {
        TradeAction::CheckBalance => {
            // Don't load anything else
            msg!("Balance: {}", amount);
        }
        TradeAction::ProcessPayment => {
            // Load payment fields only when needed
            let payment_data = trade.load_payment_methods()?;
            process_payment(payment_data, *amount)?;
        }
        TradeAction::InitiateDispute => {
            // Load multiple fields for dispute
            let seller = trade.load_seller_data()?;
            let buyer = trade.load_buyer_data()?;
            let dispute = trade.load_dispute_info()?;
            handle_dispute(seller, buyer, dispute)?;
        }
    }
    
    Ok(())
}
```

## Migration Checklist for Anchor 0.31.0

### Phase 1: Identify Optimization Targets
- [ ] List all accounts > 1KB
- [ ] Identify read-heavy operations
- [ ] Find partial update patterns
- [ ] Locate batch operations

### Phase 2: Implement LazyAccount
- [ ] Enable `lazy-account` feature
- [ ] Convert large read-only accounts
- [ ] Update instruction handlers
- [ ] Test stack usage reduction

### Phase 3: Apply Custom Discriminators
- [ ] Identify high-frequency accounts
- [ ] Calculate optimal discriminator size
- [ ] Update account definitions
- [ ] Verify space savings

### Phase 4: Optimize Compute Units
- [ ] Profile current CU usage
- [ ] Implement selective loading
- [ ] Batch similar operations
- [ ] Measure improvements

## Performance Metrics

### Expected Improvements with Anchor 0.31.0

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Stack usage (large account) | 10KB | 24B | 99.8% |
| CU for status check | 15,000 | 3,000 | 80% |
| Account size (with discriminator) | 1000B | 994B | 0.6% |
| Batch operation (10 trades) | 150,000 CU | 30,000 CU | 80% |
| Transaction size | 1200B | 1180B | 1.7% |

## Best Practices

1. **Use LazyAccount for**:
   - Read-heavy operations
   - Large account structures (>1KB)
   - Selective field access
   - Batch operations

2. **Use standard Account for**:
   - Small accounts (<500B)
   - Full account modifications
   - Initial account creation
   - Complex validations requiring multiple fields

3. **Combine with other optimizations**:
   - Account compression for historical data
   - Lookup tables for frequent addresses
   - Parallel transaction processing
   - Zero-copy deserialization for ultra-large accounts

## Code Review Checklist

- [ ] All accounts >1KB use LazyAccount where appropriate
- [ ] Custom discriminators applied to high-frequency accounts
- [ ] No unnecessary full account loads
- [ ] Batch operations optimized with selective loading
- [ ] Stack usage verified to be under limits
- [ ] CU usage profiled and optimized
- [ ] Transaction size within 1232 byte limit

---

*This optimization guide leverages Anchor 0.31.0's latest features to ensure LocalMoney achieves maximum performance on Solana.*