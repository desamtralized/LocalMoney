# PRP: Vector Bounds and DOS Protection Implementation for Solana Programs

## Objective
Implement strict bounds on all dynamic data structures (vectors, strings, maps) to prevent DOS attacks, transaction failures, and account size overflows. Add pagination for large data sets, implement circular buffers for state history, and create rate limiting mechanisms.

## Context and Research Findings

### Current Codebase State
- **Programs**: 5 Solana programs (hub, offer, price, profile, trade) in `/contracts/solana/programs/`
- **Critical Unbounded Structures Identified**:
  - `Trade.state_history: Vec<TradeStateItem>` at trade/src/lib.rs:1519 - unbounded vector
  - `ArbitratorPool.arbitrators: Vec<Pubkey>` at trade/src/lib.rs:2009 - limited to 32 but needs pagination
  - Multiple `Option<String>` fields for contacts/descriptions - no length validation
  - No rate limiting mechanism exists
  - No shared-types crate for bounded collections

### Solana Platform Constraints
- **Account Size**: Maximum 10MB per account
- **Heap Limit**: 32KB runtime heap (no free/realloc)
- **Stack Frame**: 4KB per function call
- **Transaction Size**: 1232 bytes maximum
- **Reallocation**: 10KB maximum in inner instructions
- **Best Practice**: Use fixed-size arrays with Option<T> for circular buffers
- **Zero-Copy**: Required for very large accounts (>32KB)

### Existing Patterns to Follow
- Trade program already validates sizes at lib.rs:1540 (max 50 state_history entries)
- Hub program uses basis points validation (0-10000)
- Programs use `#[error_code]` attribute for error enums
- Workspace structure configured in `/contracts/solana/Cargo.toml`

## Implementation Blueprint

### Task Order
1. Create shared-types crate with bounded collections module
2. Implement BoundedString with max length validation
3. Implement BoundedStateHistory circular buffer
4. Create ArbitratorPage for pagination pattern
5. Implement RateLimiter account structure
6. Update Trade program with bounded history
7. Update all Option<String> fields to BoundedString
8. Implement arbitrator pool pagination
9. Add rate limiting to critical operations
10. Create comprehensive tests
11. Add integration tests for DOS scenarios

### Pseudocode Approach

```rust
// Step 1: Bounded collections structure
/contracts/solana/shared-types/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── bounded_string.rs
    ├── circular_buffer.rs
    ├── rate_limiter.rs
    └── pagination.rs

// Step 2: Transform unbounded vectors to fixed arrays
// BEFORE:
pub state_history: Vec<TradeStateItem>

// AFTER:
pub state_history: BoundedStateHistory

// Step 3: Circular buffer pattern
struct BoundedStateHistory {
    items: [Option<TradeStateItem>; 20],  // Fixed size
    head: u8,                              // Write position
    count: u8                              // Total items
}

// Step 4: Pagination pattern for arbitrators
struct ArbitratorPage {
    pool: Pubkey,
    page_number: u32,
    arbitrators: Vec<Pubkey>,  // Max 10 per page
}

// Step 5: Rate limiting
struct RateLimiter {
    user: Pubkey,
    action_counts: [u32; 10],
    window_start: i64,
    daily_limits: [u32; 10]
}
```

## Specific Implementation Details

### 1. Create Shared-Types Crate

**Location**: `/contracts/solana/shared-types/`

**Cargo.toml**:
```toml
[package]
name = "shared-types"
version = "0.1.0"
edition = "2021"

[dependencies]
anchor-lang = { workspace = true }

[dev-dependencies]
proptest = "1.0"
```

**BoundedString Implementation**:
```rust
// Based on FIX_07 example, lines 63-78
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BoundedString {
    pub value: String,
}

impl BoundedString {
    pub const MAX_LEN: usize = 200;
    
    pub fn new(s: String) -> Result<Self> {
        require!(
            s.len() <= Self::MAX_LEN,
            ErrorCode::StringTooLong
        );
        Ok(Self { value: s })
    }
}
```

**Circular Buffer Implementation**:
```rust
// Based on FIX_07 example, lines 15-60
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BoundedStateHistory {
    pub items: [Option<TradeStateItem>; 20], // Fixed size array
    pub head: u8,                            // Current write position
    pub count: u8,                           // Total items (max 20)
}

impl BoundedStateHistory {
    pub const MAX_SIZE: usize = 20;
    
    pub fn new() -> Self {
        Self {
            items: [None; 20],
            head: 0,
            count: 0,
        }
    }
    
    pub fn push(&mut self, item: TradeStateItem) -> Result<()> {
        // Circular buffer - overwrites oldest when full
        self.items[self.head as usize] = Some(item);
        self.head = (self.head + 1) % Self::MAX_SIZE as u8;
        if self.count < Self::MAX_SIZE as u8 {
            self.count += 1;
        }
        Ok(())
    }
}
```

### 2. Update Trade Program

**File**: `/contracts/solana/programs/trade/src/lib.rs`

**Changes Required**:
- Line 1519: Replace `Vec<TradeStateItem>` with `BoundedStateHistory`
- Lines 48, 74, 134, 182, 216, 291, 346, 501, 657: Update `state_history.push()` calls
- Line 1540: Update SPACE calculation for fixed array

### 3. Implement Arbitrator Pagination

**New Account Structures**:
```rust
// Update existing ArbitratorPool (line 2007)
#[account]
pub struct ArbitratorPool {
    pub fiat_currency: FiatCurrency,
    pub authority: Pubkey,
    pub page_count: u32,           // Number of ArbitratorPage accounts
    pub total_arbitrators: u32,
    pub bump: u8,
}

// New paginated storage
#[account]
pub struct ArbitratorPage {
    pub pool: Pubkey,               // Parent pool
    pub page_number: u32,
    pub arbitrators: Vec<Pubkey>,   // Max 10 per page
    pub bump: u8,
}

impl ArbitratorPage {
    pub const MAX_ARBITRATORS: usize = 10;
    pub const SPACE: usize = 8 + 32 + 4 + 4 + (32 * Self::MAX_ARBITRATORS) + 1;
}
```

### 4. Rate Limiting Implementation

**File**: Create new instruction context in trade program

```rust
// Based on FIX_07 example, lines 141-170
#[account]
pub struct RateLimiter {
    pub user: Pubkey,
    pub action_counts: [u32; 10],     // Different action types
    pub window_start: i64,            // Current time window
    pub daily_limits: [u32; 10],      // Max actions per day
    pub bump: u8,
}

impl RateLimiter {
    pub fn check_and_increment(&mut self, action: ActionType) -> Result<()> {
        let clock = Clock::get()?;
        let current_window = clock.unix_timestamp / 86400; // Daily windows
        
        // Reset counters if new day
        if current_window != self.window_start {
            self.action_counts = [0; 10];
            self.window_start = current_window;
        }
        
        let action_idx = action as usize;
        require!(
            self.action_counts[action_idx] < self.daily_limits[action_idx],
            ErrorCode::RateLimitExceeded
        );
        
        self.action_counts[action_idx] += 1;
        Ok(())
    }
}
```

### 5. Update String Fields

**Files to Update**:
- `/contracts/solana/programs/profile/src/lib.rs`:
  - Lines 191-192: Change `Option<String>` to `Option<BoundedString>`
  - Lines 206-207: Update SPACE calculation
- `/contracts/solana/programs/offer/src/lib.rs`:
  - Line 190: Change `Option<String>` to `Option<BoundedString>`
  - Line 206: Update SPACE calculation
- `/contracts/solana/programs/trade/src/lib.rs`:
  - Lines 1520-1521: Change `Option<String>` to `Option<BoundedString>`
  - Lines 1541-1542: Update SPACE calculation

### 6. Add Error Variants

Add to each program's error enum:
```rust
#[error_code]
pub enum ErrorCode {
    // ... existing errors
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
```

## Files to Reference

### Existing Files to Modify
1. `/contracts/solana/programs/trade/src/lib.rs` - Primary target for bounded collections
2. `/contracts/solana/programs/profile/src/lib.rs` - Update string fields
3. `/contracts/solana/programs/offer/src/lib.rs` - Update string fields
4. `/contracts/solana/programs/hub/src/lib.rs` - Reference for validation patterns
5. `/contracts/solana/Cargo.toml` - Update workspace members

### New Files to Create
1. `/contracts/solana/shared-types/Cargo.toml`
2. `/contracts/solana/shared-types/src/lib.rs`
3. `/contracts/solana/shared-types/src/bounded_string.rs`
4. `/contracts/solana/shared-types/src/circular_buffer.rs`
5. `/contracts/solana/shared-types/src/rate_limiter.rs`
6. `/contracts/solana/shared-types/src/pagination.rs`
7. `/contracts/solana/shared-types/tests/bounded_collections_tests.rs`

## Documentation References

- **Solana Account Limits**: https://solana.com/docs/programs/limitations
- **Zero-Copy Deserialization**: https://www.anchor-lang.com/docs/zero-copy-deserialization
- **Circular Buffer Pattern**: https://docs.rs/circular-buffer/latest/circular_buffer/
- **Pagination in Solana**: https://lorisleiva.com/paginating-and-ordering-accounts-in-solana
- **DOS Prevention**: https://www.helius.dev/blog/a-hitchhikers-guide-to-solana-program-security
- **Memory Management**: https://medium.com/@whanod/solana-memory-managment-b93c2bd09933

## Common Pitfalls to Avoid

1. **Heap Overflow**: Don't use Vec<T> for large collections - use fixed arrays
2. **Stack Overflow**: Use Box<T> for medium data, zero-copy for large data
3. **Transaction Size**: Keep pagination pages small (max 10 items)
4. **Reallocation Limits**: Can't grow accounts by more than 10KB in CPIs
5. **String Validation**: Always validate string length before storing
6. **Rate Limit Bypass**: Check rate limits before any state changes
7. **Page Consistency**: Ensure atomic operations when updating pages

## Testing Strategy

### Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn test_circular_buffer_overflow() {
        let mut buffer = BoundedStateHistory::new();
        for i in 0..30 {  // Push more than capacity
            let item = TradeStateItem {
                actor: Pubkey::default(),
                state: TradeState::RequestCreated,
                timestamp: i,
            };
            buffer.push(item).unwrap();
        }
        assert_eq!(buffer.count, 20);  // Should be capped
    }

    #[test]
    fn test_bounded_string_limit() {
        let long_string = "x".repeat(201);
        assert!(BoundedString::new(long_string).is_err());
    }

    proptest! {
        #[test]
        fn test_rate_limiter_reset(actions in 0u32..100) {
            // Test that rate limiter resets properly
        }
    }
}
```

### Integration Tests
```typescript
// Test DOS scenarios
describe("DOS Protection", () => {
    it("should reject excessive state history updates", async () => {
        // Try to push 100 state changes
        // Verify only 20 are stored
    });

    it("should enforce rate limits", async () => {
        // Try to create 100 trades rapidly
        // Verify rate limit kicks in
    });

    it("should paginate arbitrators correctly", async () => {
        // Add 50 arbitrators
        // Verify they're split across pages
    });
});
```

## Validation Gates

```bash
# Build all programs with checks
cd /contracts/solana
cargo build --release

# Run shared-types tests
cd /contracts/solana/shared-types
cargo test

# Check for unbounded vectors
rg 'Vec<(?!u8)' --type rust programs/ | grep -v '//' | grep -v 'MAX'

# Check for unbounded strings
rg 'Option<String>' --type rust programs/ | grep -v 'BoundedString'

# Run clippy for safety checks
cargo clippy --all-targets --all-features -- -D warnings

# Run anchor tests
cd /contracts/solana
anchor test

# Verify account sizes don't exceed limits
anchor build
ls -la target/deploy/*.so | awk '{if($5 > 10485760) print $9 " exceeds 10MB"}'
```

## Migration Checklist

- [ ] Create shared-types crate with bounded collections
- [ ] Update workspace Cargo.toml
- [ ] Implement BoundedString wrapper
- [ ] Implement BoundedStateHistory circular buffer
- [ ] Replace Trade.state_history with bounded version
- [ ] Update all Option<String> to Option<BoundedString>
- [ ] Implement ArbitratorPage pagination
- [ ] Add RateLimiter accounts
- [ ] Update all push() calls to handle Result
- [ ] Add error variants to all programs
- [ ] Update SPACE calculations for all accounts
- [ ] Create comprehensive unit tests
- [ ] Add integration tests for DOS scenarios
- [ ] Document all size limits in code
- [ ] Run all validation gates

## Success Criteria

1. No unbounded vectors in production code
2. All strings have maximum length validation
3. State history uses circular buffer (max 20 items)
4. Arbitrators paginated (max 10 per page)
5. Rate limiting prevents DOS attacks
6. All accounts stay under 10MB limit
7. No heap or stack overflows
8. Tests demonstrate DOS protection
9. Zero transaction failures from size limits
10. Clear error messages for limit violations

## Error Handling Strategy

```rust
// For required bounds checking
let contact = BoundedString::new(params.contact)?;

// For circular buffer updates
trade.state_history.push(item)?;

// For rate limiting
ctx.accounts.rate_limiter.check_and_increment(ActionType::CreateTrade)?;

// For pagination
if page.arbitrators.len() >= ArbitratorPage::MAX_ARBITRATORS {
    return err!(ErrorCode::PageFull);
}
```

## Performance Considerations

- **Circular Buffer**: O(1) push operations, automatic oldest eviction
- **Pagination**: O(1) page lookups using PDAs
- **Rate Limiting**: O(1) checks with daily reset
- **Memory Usage**: Fixed, predictable memory allocation
- **Gas Costs**: Slightly higher for multiple page accounts

## Confidence Score: 9/10

High confidence due to:
- Comprehensive research of Solana constraints
- Clear examples from FIX_07_VECTOR_BOUNDS.md
- Well-defined implementation patterns
- Existing partial implementation (50 item limit)
- Detailed migration plan

Minor uncertainty:
- Exact performance impact of pagination
- Migration complexity for existing data

## Implementation Time Estimate

- Shared-types creation: 2 hours
- Bounded collections implementation: 2 hours
- Trade program updates: 2 hours
- Pagination implementation: 3 hours
- Rate limiting: 2 hours
- Testing: 3 hours
- Total: 14 hours