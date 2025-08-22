# PRP: Phase 2 - Architecture Refactor

## Objective
Transform the monolithic program structure into a modular, maintainable architecture following Squads Protocol best practices. This includes reorganizing code into logical modules, centralizing PDA seed definitions, implementing proper state transition logic with invariant checking, and creating comprehensive error enums for better debugging.

## Context and Research Findings

### Current Architecture Issues
Based on codebase analysis:
- **Monolithic Structure**: Programs have all logic in single `lib.rs` files
  - `/contracts/solana/programs/trade/src/lib.rs` - 1000+ lines
  - `/contracts/solana/programs/offer/src/lib.rs` - Large single file
  - Other programs follow similar pattern
- **Scattered PDA Derivation**: No centralized seed constants
- **Limited State Management**: Basic state tracking without transition validation
- **Generic Error Handling**: Insufficient error specificity for debugging

### Squads Protocol Architecture Patterns
From `SQUADS_PROTOCOL_ANALYSIS.md` (lines 14-21, 31-42):
```
pub mod instructions;  // All instruction handlers
pub mod state;         // Account structures  
pub mod utils;         // Shared utilities
pub mod errors;        // Custom error types

// Hierarchical PDA Pattern
Root: [SEED_PREFIX, SEED_MULTISIG, create_key]
Child: [SEED_PREFIX, multisig_key, SEED_VAULT, index]
```

### Existing Infrastructure to Build Upon
- Trade program has `validation.rs` and `vrf.rs` modules started
- `localmoney_shared` crate exists for shared types
- Programs use Anchor's `#[program]` and `#[derive(Accounts)]` macros
- Error enums with `#[error_code]` attribute established

## Implementation Blueprint

### Task Order
1. Create module structure for trade program (most complex)
2. Extract and organize instruction handlers
3. Centralize PDA seed definitions
4. Implement state transition validation system
5. Create comprehensive error enums
6. Refactor remaining programs (offer, profile, hub, price)
7. Update shared types with common patterns
8. Add invariant checking to all state changes
9. Create integration tests for new architecture

### Target Architecture
```
contracts/solana/programs/trade/src/
├── lib.rs                    // Program entry, imports only
├── instructions/
│   ├── mod.rs               // Public exports
│   ├── create_trade.rs      // CreateTrade context & handler
│   ├── accept_request.rs    // AcceptRequest context & handler
│   ├── fund_escrow.rs       // FundEscrow context & handler
│   ├── release_escrow.rs    // ReleaseEscrow context & handler
│   ├── dispute.rs           // Dispute-related instructions
│   └── admin.rs             // Admin instructions
├── state/
│   ├── mod.rs               // Public exports
│   ├── trade.rs             // Trade account structure
│   ├── escrow.rs            // Escrow-related state
│   ├── seeds.rs             // PDA seed constants
│   └── transitions.rs       // State transition logic
├── utils/
│   ├── mod.rs               // Public exports
│   ├── validation.rs        // Validation helpers (existing)
│   └── cpi_helpers.rs       // CPI utility functions
├── errors.rs                // Comprehensive error enum
└── events.rs                // Event definitions
```

## Specific Implementation Details

### 1. Module Structure Creation

#### Step 1.1: Create Directory Structure
```bash
cd contracts/solana/programs/trade/src
mkdir instructions state utils
touch instructions/mod.rs state/mod.rs utils/mod.rs errors.rs events.rs
```

#### Step 1.2: Update main lib.rs
```rust
// /contracts/solana/programs/trade/src/lib.rs
#![deny(arithmetic_overflow)]
#![deny(unused_must_use)]
#![deny(clippy::arithmetic_side_effects)]

use anchor_lang::prelude::*;

declare_id!("5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM");

pub mod instructions;
pub mod state;
pub mod utils;
pub mod errors;
pub mod events;

pub use instructions::*;
pub use state::*;
pub use errors::ErrorCode;
pub use events::*;

#[program]
pub mod trade {
    use super::*;

    pub fn create_trade(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
        instructions::create_trade::handler(ctx, params)
    }

    pub fn accept_request(ctx: Context<AcceptRequest>, trade_id: u64) -> Result<()> {
        instructions::accept_request::handler(ctx, trade_id)
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>, trade_id: u64) -> Result<()> {
        instructions::fund_escrow::handler(ctx, trade_id)
    }

    pub fn release_escrow(ctx: Context<ReleaseEscrow>, trade_id: u64) -> Result<()> {
        instructions::release_escrow::handler(ctx, trade_id)
    }
    
    // Additional instructions...
}
```

### 2. Instruction Handler Extraction

#### Example: create_trade.rs
```rust
// /contracts/solana/programs/trade/src/instructions/create_trade.rs
use anchor_lang::prelude::*;
use crate::state::{Trade, TradeState, seeds};
use crate::errors::ErrorCode;
use crate::events::TradeCreatedEvent;
use crate::utils::validation::*;

#[derive(Accounts)]
#[instruction(params: CreateTradeParams)]
pub struct CreateTrade<'info> {
    #[account(
        init,
        payer = buyer,
        space = 8 + Trade::INIT_SPACE,
        seeds = [
            seeds::SEED_PREFIX,
            seeds::SEED_TRADE,
            params.trade_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub trade: Account<'info, Trade>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    /// CHECK: Validated in handler
    pub offer: UncheckedAccount<'info>,
    
    // Additional accounts...
    
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateTradeParams {
    pub trade_id: u64,
    pub offer_id: u64,
    pub amount: u64,
    pub locked_price: u64,
    pub expiry_duration: u64,
    pub buyer_contact: String,
    pub arbitrator: Pubkey,
}

pub fn handler(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
    // Validate inputs
    ctx.accounts.validate()?;
    validate_trade_params(&params)?;
    
    // Initialize trade state
    let trade = &mut ctx.accounts.trade;
    trade.initialize(
        params.trade_id,
        params.offer_id,
        ctx.accounts.buyer.key(),
        params.amount,
        params.locked_price,
        params.expiry_duration,
        ctx.bumps.trade,
    )?;
    
    // Transition to initial state
    trade.transition_state(
        TradeState::RequestCreated,
        ctx.accounts.buyer.key(),
        Clock::get()?.unix_timestamp,
    )?;
    
    // Emit event
    emit!(TradeCreatedEvent {
        trade_id: params.trade_id,
        offer_id: params.offer_id,
        buyer: ctx.accounts.buyer.key(),
        amount: params.amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

impl<'info> CreateTrade<'info> {
    fn validate(&self) -> Result<()> {
        // Account validation logic
        Ok(())
    }
}
```

### 3. Centralized PDA Seeds

```rust
// /contracts/solana/programs/trade/src/state/seeds.rs
pub const SEED_PREFIX: &[u8] = b"localmoney";
pub const SEED_TRADE: &[u8] = b"trade";
pub const SEED_ESCROW: &[u8] = b"escrow";
pub const SEED_HISTORY: &[u8] = b"history";
pub const SEED_VRF: &[u8] = b"vrf";

// Helper functions for PDA derivation
pub fn derive_trade_pda(trade_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            SEED_PREFIX,
            SEED_TRADE,
            trade_id.to_le_bytes().as_ref(),
        ],
        &crate::ID,
    )
}

pub fn derive_escrow_pda(trade_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            SEED_PREFIX,
            SEED_TRADE,
            trade_id.to_le_bytes().as_ref(),
            SEED_ESCROW,
        ],
        &crate::ID,
    )
}
```

### 4. State Transition System

```rust
// /contracts/solana/programs/trade/src/state/transitions.rs
use anchor_lang::prelude::*;
use crate::state::{Trade, TradeState};
use crate::errors::ErrorCode;

impl Trade {
    pub fn transition_state(
        &mut self,
        new_state: TradeState,
        actor: Pubkey,
        timestamp: i64,
    ) -> Result<()> {
        // Validate transition
        self.validate_transition(&new_state)?;
        
        // Record history
        self.record_state_change(self.state.clone(), new_state.clone(), actor, timestamp)?;
        
        // Update state
        let old_state = self.state.clone();
        self.state = new_state;
        self.last_state_change = timestamp;
        self.state_change_actor = actor;
        self.state_transition_count += 1;
        
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
            ErrorCode::InvalidStateTransition {
                from: format!("{:?}", self.state),
                to: format!("{:?}", new_state),
            }
        );
        
        Ok(())
    }
    
    pub fn check_invariants(&self) -> Result<()> {
        // Invariant: Trade amount must be positive
        require!(
            self.amount > 0,
            ErrorCode::InvariantViolation
        );
        
        // Invariant: Expiry must be in future for active trades
        if !self.is_terminal_state() {
            let now = Clock::get()?.unix_timestamp as u64;
            require!(
                self.expires_at > now,
                ErrorCode::TradeExpired { expired_at: self.expires_at as i64 }
            );
        }
        
        // State-specific invariants
        match self.state {
            TradeState::RequestCreated => {
                // No escrow should be funded
                require!(
                    self.escrow_amount == 0,
                    ErrorCode::InvariantViolation
                );
            }
            TradeState::EscrowFunded | TradeState::FiatDeposited => {
                // Escrow must be funded
                require!(
                    self.escrow_amount > 0,
                    ErrorCode::InvariantViolation
                );
            }
            TradeState::EscrowReleased | TradeState::EscrowRefunded => {
                // Trade should be marked complete
                require!(
                    self.is_terminal_state(),
                    ErrorCode::InvariantViolation
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
}
```

### 5. Comprehensive Error System

```rust
// /contracts/solana/programs/trade/src/errors.rs
use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    // Trade Creation Errors (6000-6099)
    #[msg("Trade amount below minimum limit of {min} tokens")]
    TradeBelowMinimum { min: u64 },
    
    #[msg("Trade amount exceeds maximum limit of {max} tokens")]
    TradeExceedsMaximum { max: u64 },
    
    #[msg("Offer has expired at timestamp {expired_at}")]
    OfferExpired { expired_at: i64 },
    
    #[msg("Insufficient offer balance: required {required}, available {available}")]
    InsufficientOfferBalance { required: u64, available: u64 },
    
    #[msg("Cannot trade with yourself")]
    SelfTradeNotAllowed,
    
    // State Transition Errors (6100-6199)
    #[msg("Invalid state transition from {from} to {to}")]
    InvalidStateTransition { from: String, to: String },
    
    #[msg("Trade has expired at {expired_at}")]
    TradeExpired { expired_at: i64 },
    
    #[msg("Trade is not in expected state: expected {expected}, found {found}")]
    UnexpectedState { expected: String, found: String },
    
    #[msg("State invariant violation detected")]
    InvariantViolation,
    
    // Authorization Errors (6200-6299)
    #[msg("Only buyer can perform this action")]
    BuyerOnly,
    
    #[msg("Only seller can perform this action")]
    SellerOnly,
    
    #[msg("Only arbitrator can perform this action")]
    ArbitratorOnly,
    
    #[msg("Unauthorized: signer {signer} not authorized for this action")]
    Unauthorized { signer: Pubkey },
    
    // Escrow Errors (6300-6399)
    #[msg("Escrow already funded with {amount} tokens")]
    EscrowAlreadyFunded { amount: u64 },
    
    #[msg("Escrow not yet funded")]
    EscrowNotFunded,
    
    #[msg("Escrow amount mismatch: expected {expected}, received {received}")]
    EscrowAmountMismatch { expected: u64, received: u64 },
    
    // Validation Errors (6400-6499)
    #[msg("Invalid PDA derivation for {account_type}")]
    InvalidPda { account_type: String },
    
    #[msg("Account owner mismatch: expected {expected}, found {found}")]
    InvalidAccountOwner { expected: Pubkey, found: Pubkey },
    
    #[msg("Invalid token mint: expected {expected}, found {found}")]
    InvalidTokenMint { expected: Pubkey, found: Pubkey },
    
    // Arithmetic Errors (6500-6599)
    #[msg("Arithmetic overflow in {operation}")]
    ArithmeticOverflow { operation: String },
    
    #[msg("Division by zero in {operation}")]
    DivisionByZero { operation: String },
    
    // CPI Errors (6600-6699)
    #[msg("Invalid CPI program: expected {expected}, found {found}")]
    InvalidCpiProgram { expected: Pubkey, found: Pubkey },
    
    #[msg("CPI to protected account {account} not allowed")]
    ProtectedAccount { account: Pubkey },
    
    // System Errors (6700-6799)
    #[msg("Insufficient rent exemption: required {required}, available {available}")]
    InsufficientRentExemption { required: u64, available: u64 },
    
    #[msg("System is currently paused for maintenance")]
    SystemPaused,
}
```

### 6. State Account Structure

```rust
// /contracts/solana/programs/trade/src/state/trade.rs
use anchor_lang::prelude::*;
use crate::state::TradeState;

#[account]
#[derive(InitSpace)]
pub struct Trade {
    pub id: u64,
    pub offer_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub arbitrator: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub escrow_amount: u64,
    pub fiat_currency: FiatCurrency,
    pub locked_price: u64,
    pub state: TradeState,
    pub created_at: u64,
    pub expires_at: u64,
    pub dispute_window_at: Option<u64>,
    pub state_history: StateHistory<10>,  // Fixed-size history
    pub state_transition_count: u32,
    pub last_state_change: i64,
    pub state_change_actor: Pubkey,
    pub buyer_contact: BoundedString<100>,
    pub seller_contact: Option<BoundedString<100>>,
    pub bump: u8,
}

impl Trade {
    pub const INIT_SPACE: usize = 8 + // discriminator
        8 + // id
        8 + // offer_id
        32 + // buyer
        32 + // seller
        32 + // arbitrator
        32 + // token_mint
        8 + // amount
        8 + // escrow_amount
        33 + // fiat_currency (enum with max variant size)
        8 + // locked_price
        33 + // state (enum)
        8 + // created_at
        8 + // expires_at
        9 + // dispute_window_at (Option<u64>)
        (10 * 50) + // state_history (10 items × ~50 bytes each)
        4 + // state_transition_count
        8 + // last_state_change
        32 + // state_change_actor
        104 + // buyer_contact (100 chars + length)
        105 + // seller_contact (Option + 100 chars + length)
        1; // bump
        
    pub fn initialize(
        &mut self,
        id: u64,
        offer_id: u64,
        buyer: Pubkey,
        amount: u64,
        locked_price: u64,
        expiry_duration: u64,
        bump: u8,
    ) -> Result<()> {
        self.id = id;
        self.offer_id = offer_id;
        self.buyer = buyer;
        self.amount = amount;
        self.locked_price = locked_price;
        self.created_at = Clock::get()?.unix_timestamp as u64;
        self.expires_at = self.created_at.checked_add(expiry_duration)
            .ok_or(ErrorCode::ArithmeticOverflow { operation: "expiry calculation".to_string() })?;
        self.bump = bump;
        self.state_history = StateHistory::new();
        self.state_transition_count = 0;
        
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct StateHistory<const N: usize> {
    pub entries: [StateHistoryEntry; N],
    pub len: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct StateHistoryEntry {
    pub from_state: TradeState,
    pub to_state: TradeState,
    pub actor: Pubkey,
    pub timestamp: i64,
}
```

### 7. Apply Pattern to Other Programs

Follow same structure for:
- `/contracts/solana/programs/offer/`
- `/contracts/solana/programs/profile/`
- `/contracts/solana/programs/hub/`
- `/contracts/solana/programs/price/`

Each gets:
- `instructions/` directory with handlers
- `state/` directory with account structures and seeds
- `utils/` for program-specific utilities
- `errors.rs` with specific error codes
- `events.rs` for event definitions

## Validation Gates

```bash
# 1. Verify module structure created
find contracts/solana/programs/*/src -type d -name "instructions" | wc -l
# Expected: 5

# 2. Check centralized seeds
grep -r "SEED_PREFIX" contracts/solana/programs/*/src/state/seeds.rs

# 3. Verify state transition logic
grep -r "transition_state" contracts/solana/programs/*/src/state/

# 4. Check comprehensive errors
grep -r "#\[error_code\]" contracts/solana/programs/*/src/errors.rs

# 5. Build all programs
cd contracts/solana
anchor build

# 6. Run tests with new structure
anchor test

# 7. Verify invariant checking
grep -r "check_invariants" contracts/solana/programs/*/src/

# 8. Test state transitions
npm run test:state-transitions
```

## Error Handling Strategy

1. **Specific Errors**: Each failure case has unique error with context
2. **Error Ranges**: Group errors by category (6000s, 6100s, etc.)
3. **Context in Errors**: Include actual vs expected values
4. **Invariant Violations**: Explicit checks after state changes

## Known Gotchas

1. **Import Paths**: Update all internal imports after restructuring
2. **Anchor Macros**: `#[program]` must be in lib.rs
3. **Account Size**: Recalculate INIT_SPACE after adding fields
4. **Module Visibility**: Ensure proper pub/pub(crate) usage
5. **Circular Dependencies**: Avoid state depending on instructions

## Migration Notes

1. **Gradual Migration**: Start with trade program, then others
2. **Test Coverage**: Add tests for each extracted module
3. **Documentation**: Update inline docs for new structure
4. **CI/CD**: Update build scripts for new paths

## Success Metrics

- [ ] All programs follow modular structure
- [ ] Zero monolithic files > 500 lines
- [ ] All PDAs use centralized seeds
- [ ] State transitions validated with invariants
- [ ] Error messages provide debugging context
- [ ] Test coverage > 80%
- [ ] Build time < 2 minutes

## References

- Squads v4 Structure: https://github.com/squads-protocol/v4/tree/main/programs/squads_multisig_program/src
- Anchor Best Practices: https://www.anchor-lang.com/docs/the-program-module
- Solana Program Architecture: https://docs.solana.com/developing/on-chain-programs/developing-rust
- State Machine Patterns: https://solanacookbook.com/references/programs.html#state-management

## Confidence Score: 9/10

Very high confidence due to:
- Clear architectural pattern from Squads
- Existing module structure started (validation.rs, vrf.rs)
- Well-defined file organization
- Straightforward refactoring process

Points deducted for:
- Large scope requiring careful coordination
- Potential for import path issues during migration