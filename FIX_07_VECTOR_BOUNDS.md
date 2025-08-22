## FEATURE:

- Implement strict bounds on all dynamic data structures (vectors, strings, maps)
- Add pagination for large data sets instead of unbounded growth
- Create separate accounts for historical data to avoid account size limits
- Implement circular buffers for state history with fixed capacity
- Add DOS protection through resource limits

## EXAMPLES:

```rust
// shared-types/src/bounded_collections.rs
use anchor_lang::prelude::*;

// Fixed-size circular buffer for state history
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
    
    pub fn get_recent(&self, n: usize) -> Vec<TradeStateItem> {
        let mut result = Vec::new();
        let start = if self.count < Self::MAX_SIZE as u8 {
            0
        } else {
            self.head as usize
        };
        
        for i in 0..n.min(self.count as usize) {
            let idx = (start + Self::MAX_SIZE - 1 - i) % Self::MAX_SIZE;
            if let Some(item) = &self.items[idx] {
                result.push(item.clone());
            }
        }
        result
    }
}

// Bounded string with maximum length
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

// Updated Trade struct with bounded history
#[account]
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
    pub state_history: BoundedStateHistory,  // Fixed size!
    pub buyer_contact: Option<BoundedString>, // Length limited!
    pub seller_contact: Option<BoundedString>,
    pub bump: u8,
}

// Paginated arbitrator pool with separate storage accounts
#[account]
pub struct ArbitratorPool {
    pub fiat_currency: FiatCurrency,
    pub authority: Pubkey,
    pub page_count: u32,           // Number of ArbitratorPage accounts
    pub total_arbitrators: u32,
    pub bump: u8,
}

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
    
    pub fn add_arbitrator(&mut self, arbitrator: Pubkey) -> Result<()> {
        require!(
            self.arbitrators.len() < Self::MAX_ARBITRATORS,
            ErrorCode::PageFull
        );
        
        require!(
            !self.arbitrators.contains(&arbitrator),
            ErrorCode::ArbitratorExists
        );
        
        self.arbitrators.push(arbitrator);
        Ok(())
    }
}

// Rate limiting for DOS protection
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

// Usage in instruction:
pub fn create_trade(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
    // Check rate limit
    ctx.accounts.rate_limiter.check_and_increment(ActionType::CreateTrade)?;
    
    // Validate contact strings
    let buyer_contact = BoundedString::new(params.buyer_contact)?;
    
    let trade = &mut ctx.accounts.trade;
    
    // Use bounded history
    trade.state_history = BoundedStateHistory::new();
    trade.state_history.push(TradeStateItem {
        actor: ctx.accounts.buyer.key(),
        state: TradeState::RequestCreated,
        timestamp: Clock::get()?.unix_timestamp as u64,
    })?;
    
    trade.buyer_contact = Some(buyer_contact);
    
    // ... rest of logic
}
```

## DOCUMENTATION:

- Solana account size limits: https://docs.solana.com/developing/programming-model/accounts#size
- DOS attack prevention: https://docs.solana.com/developing/on-chain-programs/developing-rust#dos
- Circular buffer patterns: https://en.wikipedia.org/wiki/Circular_buffer
- Rate limiting strategies for blockchain

## OTHER CONSIDERATIONS:

- **Migration**: Existing unbounded data needs careful migration
- **User Experience**: Pagination may complicate UX - design carefully
- **Storage Costs**: Multiple accounts increase storage costs
- **Query Complexity**: Paginated data requires multiple fetches
- **Consistency**: Ensure data consistency across multiple accounts
- **Testing**: Test with maximum sizes to ensure bounds work
- **Documentation**: Document all size limits clearly
- **Monitoring**: Track usage against limits

## RELATED ISSUES:

- Prerequisites: FIX_01-06 (security foundations)
- Next: FIX_08_EVENT_EMISSION (observability)
- Critical for: Preventing DOS attacks and transaction failures