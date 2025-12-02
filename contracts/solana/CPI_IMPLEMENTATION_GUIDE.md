# CPI Implementation Guide for LocalMoney Solana Programs

**Status**: Implementation Required
**Created**: 2025-11-19
**Priority**: HIGH - Blocksintegration testing validation

---

## Overview

This guide provides detailed instructions for implementing Cross-Program Invocations (CPIs) between the LocalMoney Solana programs. Currently, all programs are isolated and do not communicate with each other. Implementing these CPIs is **critical** for:

- Enforcing limits (max active offers/trades)
- Updating statistics (trade counters, volume, reputation)
- Fee distribution
- Circuit breaker checks
- Dynamic configuration from Hub

---

## Table of Contents

1. [CPI Basics](#cpi-basics)
2. [Required CPIs by Program](#required-cpis-by-program)
3. [Implementation Examples](#implementation-examples)
4. [Testing Checklist](#testing-checklist)
5. [Common Pitfalls](#common-pitfalls)

---

## CPI Basics

### What is a CPI?

A Cross-Program Invocation allows one Solana program to call instructions on another program. Anchor provides helpers to make CPIs type-safe and easy to implement.

### CPI Pattern in Anchor

```rust
use anchor_lang::prelude::*;
use other_program::cpi::accounts::InstructionAccounts;
use other_program::cpi::instruction_name;
use other_program::program::OtherProgram;

// 1. Add program account to context
#[derive(Accounts)]
pub struct MyInstruction<'info> {
    // ... existing accounts

    /// The other program
    pub other_program: Program<'info, OtherProgram>,

    // Accounts needed by other program's instruction
    #[account(mut)]
    pub other_program_account: Account<'info, SomeAccount>,
}

// 2. Make CPI call in handler
pub fn handler(ctx: Context<MyInstruction>) -> Result<()> {
    // Prepare CPI accounts
    let cpi_accounts = InstructionAccounts {
        account: ctx.accounts.other_program_account.to_account_info(),
        // ... other accounts
    };

    // Create CPI context
    let cpi_ctx = CpiContext::new(
        ctx.accounts.other_program.to_account_info(),
        cpi_accounts
    );

    // Invoke the instruction
    instruction_name(cpi_ctx, params)?;

    Ok(())
}
```

---

## Required CPIs by Program

### Summary Table

| From Program | To Program | Purpose | Priority |
|--------------|------------|---------|----------|
| Trade | Offer | Verify offer is active | HIGH |
| Trade | Profile | Update counters & stats | HIGH |
| Trade | Hub | Read config | HIGH |
| Trade | Escrow | Fee distribution | HIGH |
| Trade | Arbitrator | Assign arbitrator | MEDIUM |
| Offer | Profile | Update offer counters | HIGH |
| Offer | Hub | Read config | HIGH |

---

## Implementation Examples

### 1. Trade → Offer: Verify Offer Status

**File**: `programs/trade/src/instructions/create_trade.rs`

**Current State** (lines 106-111):
```rust
// TODO: Deserialize and validate offer account
// - Check offer.state == OfferState::Active
// - Check amount within offer.min_amount and offer.max_amount
// - Set trade.token_mint = offer.token_mint
// - Set trade.fiat_currency = offer.fiat_currency
// - Set trade.seller = offer.owner (for validation in accept_trade)
```

**Implementation**:

#### Step 1: Update Account Context

```rust
use anchor_lang::prelude::*;
use offer::state::Offer; // Import Offer state

#[derive(Accounts)]
pub struct CreateTrade<'info> {
    // ... existing accounts

    /// The offer being responded to
    #[account(
        constraint = offer.state == offer::state::OfferState::Active @ TradeError::OfferNotActive
    )]
    pub offer: Account<'info, Offer>, // Changed from UncheckedAccount

    // ... rest of accounts
}
```

#### Step 2: Use Offer Data in Handler

```rust
pub fn handler(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
    let trade = &mut ctx.accounts.trade;
    let offer = &ctx.accounts.offer;

    // Validate amount is within offer range
    require!(
        params.amount >= offer.min_amount && params.amount <= offer.max_amount,
        TradeError::AmountOutOfRange
    );

    // Set trade fields from offer
    trade.token_mint = offer.token_mint;
    trade.fiat_currency = offer.fiat_currency;
    trade.seller = offer.owner; // For validation in accept_trade

    // ... rest of logic

    Ok(())
}
```

#### Step 3: Add Error Code

```rust
// programs/trade/src/errors.rs

#[error_code]
pub enum TradeError {
    // ... existing errors

    #[msg("Offer is not in Active state")]
    OfferNotActive,

    #[msg("Trade amount outside offer's min/max range")]
    AmountOutOfRange,
}
```

---

### 2. Trade → Profile: Update Active Counters

**File**: `programs/trade/src/instructions/create_trade.rs`

#### Step 1: Add Profile Program Dependency

```toml
# programs/trade/Cargo.toml

[dependencies]
# ... existing dependencies
profile = { path = "../profile", features = ["cpi"] }
```

#### Step 2: Update Account Context

```rust
use profile::cpi::accounts::UpdateActiveCounters;
use profile::cpi::update_active_counters;
use profile::program::Profile;

#[derive(Accounts)]
pub struct CreateTrade<'info> {
    // ... existing accounts

    /// Buyer's profile (for limit checking and counter update)
    #[account(
        mut,
        seeds = [b"profile", buyer.key().as_ref()],
        bump,
        seeds::program = profile_program.key()
    )]
    pub buyer_profile: Account<'info, profile::state::UserProfile>,

    /// Profile program
    pub profile_program: Program<'info, Profile>,

    /// Hub config (for max_active_trades limit)
    pub hub_config: Account<'info, hub::state::HubConfig>,

    // ... rest of accounts
}
```

#### Step 3: Check Limit and Increment Counter

```rust
pub fn handler(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
    let buyer_profile = &ctx.accounts.buyer_profile;
    let hub_config = &ctx.accounts.hub_config;

    // Check buyer hasn't exceeded max_active_trades
    require!(
        buyer_profile.active_trades < hub_config.max_active_trades,
        TradeError::MaxActiveTradesReached
    );

    // Increment buyer's active_trades counter via CPI
    let cpi_accounts = UpdateActiveCounters {
        profile: ctx.accounts.buyer_profile.to_account_info(),
        caller_program: ctx.accounts.trade_program.to_account_info(), // Self-reference
    };

    let cpi_ctx = CpiContext::new(
        ctx.accounts.profile_program.to_account_info(),
        cpi_accounts
    );

    update_active_counters(
        cpi_ctx,
        profile::instructions::UpdateActiveCountersParams {
            counter_type: profile::instructions::CounterType::ActiveTrades,
            operation: profile::instructions::CounterOperation::Increment,
        }
    )?;

    // ... rest of logic

    Ok(())
}
```

---

### 3. Trade → Profile: Update Trade Statistics

**File**: `programs/trade/src/instructions/release_escrow.rs`

#### Update Account Context

```rust
#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    // ... existing accounts

    #[account(mut)]
    pub buyer_profile: Account<'info, profile::state::UserProfile>,

    #[account(mut)]
    pub seller_profile: Account<'info, profile::state::UserProfile>,

    pub profile_program: Program<'info, Profile>,

    // ... rest of accounts
}
```

#### Call update_trade_stats

```rust
pub fn handler(ctx: Context<ReleaseEscrow>) -> Result<()> {
    let trade = &ctx.accounts.trade;

    // ... fee distribution logic ...

    // Update buyer statistics
    let buyer_cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
        profile: ctx.accounts.buyer_profile.to_account_info(),
        caller_program: ctx.program_id.to_account_info(),
    };

    let buyer_cpi_ctx = CpiContext::new(
        ctx.accounts.profile_program.to_account_info(),
        buyer_cpi_accounts
    );

    profile::cpi::update_trade_stats(
        buyer_cpi_ctx,
        profile::instructions::UpdateTradeStatsParams {
            increment_total: true,
            increment_completed: true,
            volume_change: trade.fiat_amount,
            is_buy: true, // Buyer perspective
        }
    )?;

    // Update seller statistics
    let seller_cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
        profile: ctx.accounts.seller_profile.to_account_info(),
        caller_program: ctx.program_id.to_account_info(),
    };

    let seller_cpi_ctx = CpiContext::new(
        ctx.accounts.profile_program.to_account_info(),
        seller_cpi_accounts
    );

    profile::cpi::update_trade_stats(
        seller_cpi_ctx,
        profile::instructions::UpdateTradeStatsParams {
            increment_total: true,
            increment_completed: true,
            volume_change: trade.fiat_amount,
            is_buy: false, // Seller perspective
        }
    )?;

    // Decrement active_trades for both
    // (similar pattern to increment above)

    Ok(())
}
```

---

### 4. Trade → Hub: Read Configuration

**File**: Multiple files (create_trade.rs, release_escrow.rs, etc.)

#### Step 1: Add Hub Dependency

```toml
# programs/trade/Cargo.toml

[dependencies]
hub = { path = "../hub", features = ["cpi"] }
```

#### Step 2: Use Hub Config in Instructions

```rust
use hub::state::HubConfig;

#[derive(Accounts)]
pub struct CreateTrade<'info> {
    // ... existing accounts

    /// Hub config for reading limits and timers
    #[account(
        seeds = [b"hub_config"],
        bump,
        seeds::program = hub_program.key()
    )]
    pub hub_config: Account<'info, HubConfig>,

    pub hub_program: Program<'info, hub::program::Hub>,
}
```

#### Step 3: Use Dynamic Values

```rust
pub fn handler(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
    let hub_config = &ctx.accounts.hub_config;
    let clock = Clock::get()?;

    // Check circuit breaker
    require!(
        !hub_config.global_pause && !hub_config.pause_new_trades,
        TradeError::TradesArePaused
    );

    // Use dynamic expiration timer
    trade.expires_at = clock.unix_timestamp
        .checked_add(hub_config.trade_expiration_timer.try_into().unwrap())
        .ok_or(TradeError::NumericalOverflow)?;

    // Validate amount limits
    require!(
        params.fiat_amount >= hub_config.min_trade_amount.into() &&
        params.fiat_amount <= hub_config.max_trade_amount.into(),
        TradeError::TradeAmountOutOfLimits
    );

    Ok(())
}
```

---

### 5. Trade → Escrow: Fee Distribution

**File**: `programs/trade/src/instructions/release_escrow.rs`

#### Step 1: Add Escrow Dependency

```toml
[dependencies]
escrow = { path = "../escrow", features = ["cpi"] }
```

#### Step 2: Update Account Context

```rust
use escrow::cpi::accounts::ReleaseEscrow as EscrowReleaseAccounts;
use escrow::cpi::release_escrow;
use escrow::program::Escrow;

#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    // ... existing accounts

    /// Escrow program
    pub escrow_program: Program<'info, Escrow>,

    /// Escrow vault (PDA of escrow program)
    #[account(
        mut,
        seeds = [b"escrow_vault", trade.id.to_le_bytes().as_ref()],
        bump,
        seeds::program = escrow_program.key()
    )]
    pub escrow_vault: SystemAccount<'info>,

    // Token accounts for fee distribution
    #[account(mut)]
    pub escrow_vault_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub recipient_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub warchest_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub arbitrator_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}
```

#### Step 3: Call Escrow Release with Fees

```rust
pub fn handler(ctx: Context<ReleaseEscrow>) -> Result<()> {
    let trade = &ctx.accounts.trade;
    let hub_config = &ctx.accounts.hub_config;

    // Determine if disputed (for arbitrator fee)
    let is_disputed = trade.is_disputed();

    // Prepare signer seeds for escrow vault PDA
    let trade_id_bytes = trade.id.to_le_bytes();
    let vault_seeds = &[
        b"escrow_vault",
        trade_id_bytes.as_ref(),
        &[ctx.bumps.escrow_vault],
    ];
    let signer_seeds = &[&vault_seeds[..]];

    // Prepare CPI accounts
    let cpi_accounts = EscrowReleaseAccounts {
        vault: ctx.accounts.escrow_vault.to_account_info(),
        vault_token_account: ctx.accounts.escrow_vault_ata.to_account_info(),
        recipient_token_account: ctx.accounts.recipient_token_account.to_account_info(),
        treasury_token_account: ctx.accounts.treasury_token_account.to_account_info(),
        warchest_token_account: ctx.accounts.warchest_token_account.to_account_info(),
        arbitrator_token_account: ctx.accounts.arbitrator_token_account.as_ref().map(|a| a.to_account_info()),
        token_program: ctx.accounts.token_program.to_account_info(),
    };

    // Create CPI context with signer
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.escrow_program.to_account_info(),
        cpi_accounts,
        signer_seeds
    );

    // Call escrow release with fee parameters
    release_escrow(
        cpi_ctx,
        escrow::instructions::ReleaseEscrowParams {
            amount: trade.amount,
            chain_fee_pct: hub_config.chain_fee_pct,
            warchest_fee_pct: hub_config.warchest_fee_pct,
            burn_fee_pct: hub_config.burn_fee_pct,
            arbitrator_fee_pct: if is_disputed { hub_config.arbitrator_fee_pct } else { 0 },
        }
    )?;

    // Update trade state
    trade.transition_to(TradeState::EscrowReleased)?;

    Ok(())
}
```

---

### 6. Offer → Profile: Update Offer Counters

**File**: `programs/offer/src/instructions/create_offer.rs`

#### Implementation

```rust
use profile::cpi::accounts::UpdateActiveCounters;
use profile::cpi::update_active_counters;
use profile::program::Profile;

#[derive(Accounts)]
pub struct CreateOffer<'info> {
    // ... existing accounts

    #[account(
        mut,
        seeds = [b"profile", owner.key().as_ref()],
        bump,
        seeds::program = profile_program.key()
    )]
    pub owner_profile: Account<'info, profile::state::UserProfile>,

    pub profile_program: Program<'info, Profile>,

    pub hub_config: Account<'info, hub::state::HubConfig>,
}

pub fn handler(ctx: Context<CreateOffer>, params: CreateOfferParams) -> Result<()> {
    let owner_profile = &ctx.accounts.owner_profile;
    let hub_config = &ctx.accounts.hub_config;

    // Check limit
    require!(
        owner_profile.active_offers < hub_config.max_active_offers,
        OfferError::MaxActiveOffersReached
    );

    // Increment counter
    let cpi_accounts = UpdateActiveCounters {
        profile: ctx.accounts.owner_profile.to_account_info(),
        caller_program: ctx.program_id.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(
        ctx.accounts.profile_program.to_account_info(),
        cpi_accounts
    );

    update_active_counters(
        cpi_ctx,
        profile::instructions::UpdateActiveCountersParams {
            counter_type: profile::instructions::CounterType::ActiveOffers,
            operation: profile::instructions::CounterOperation::Increment,
        }
    )?;

    // ... rest of offer creation logic

    Ok(())
}
```

#### Similar for delete_offer.rs (Decrement)

```rust
// In delete_offer.rs

// After marking offer as deleted, decrement counter
update_active_counters(
    cpi_ctx,
    profile::instructions::UpdateActiveCountersParams {
        counter_type: profile::instructions::CounterType::ActiveOffers,
        operation: profile::instructions::CounterOperation::Decrement,
    }
)?;
```

---

### 7. Offer → Hub: Check Circuit Breakers

**File**: `programs/offer/src/instructions/create_offer.rs`

```rust
#[derive(Accounts)]
pub struct CreateOffer<'info> {
    // ... existing accounts

    pub hub_config: Account<'info, hub::state::HubConfig>,
}

pub fn handler(ctx: Context<CreateOffer>, params: CreateOfferParams) -> Result<()> {
    let hub_config = &ctx.accounts.hub_config;

    // Check circuit breakers
    require!(
        !hub_config.global_pause && !hub_config.pause_new_offers,
        OfferError::NewOffersPaused
    );

    // ... rest of logic

    Ok(())
}
```

---

## Testing Checklist

After implementing CPIs, verify:

### Unit Tests
- [ ] CPI account contexts validate correctly
- [ ] Error cases handled (unauthorized caller, invalid state, etc.)
- [ ] Signer seeds work for PDA signing

### Integration Tests
- [ ] Run all 8 integration test suites
- [ ] Verify counters increment/decrement correctly
- [ ] Verify statistics update accurately
- [ ] Verify fees distribute correctly
- [ ] Verify circuit breakers block operations
- [ ] Verify limits are enforced

### Compute Unit Tests
- [ ] Measure compute units for each instruction
- [ ] Ensure all instructions < 200k CU limit
- [ ] Optimize if any exceed limits

### Build Tests
```bash
cd contracts/solana
anchor build
# Should build without errors

anchor test
# All tests should pass
```

---

## Common Pitfalls

### 1. Missing PDA Bumps

**Problem**: Forgetting to pass PDA bumps in account constraints

**Solution**:
```rust
#[account(
    seeds = [b"profile", user.key().as_ref()],
    bump = profile.bump, // ← Don't forget!
    seeds::program = profile_program.key()
)]
pub profile: Account<'info, UserProfile>,
```

### 2. Incorrect Signer Seeds for CPIs

**Problem**: CPI fails with "missing signature" when PDA needs to sign

**Solution**:
```rust
let seeds = &[
    b"vault",
    id.to_le_bytes().as_ref(),
    &[bump], // ← Must be reference to array
];
let signer_seeds = &[&seeds[..]]; // ← Double reference

let cpi_ctx = CpiContext::new_with_signer(
    program.to_account_info(),
    accounts,
    signer_seeds // ← Pass signer_seeds
);
```

### 3. Feature Flag Not Enabled

**Problem**: CPI types not available

**Solution**:
```toml
# In Cargo.toml of calling program

[dependencies]
other_program = { path = "../other_program", features = ["cpi"] }
# ← Must include features = ["cpi"]
```

### 4. Circular Dependencies

**Problem**: Program A depends on Program B, and B depends on A

**Solution**: Use `#[interface]` or restructure to avoid circular deps. In our case:
- Trade → Profile (OK)
- Trade → Offer (OK)
- Profile does NOT call Trade (OK)

Our architecture avoids circular dependencies.

### 5. Account Ownership Validation

**Problem**: CPI succeeds but with wrong account owner

**Solution**:
```rust
#[account(
    constraint = profile.owner == profile_program.key() @ ErrorCode::InvalidProfileOwner
)]
pub profile: Account<'info, UserProfile>,
```

---

## Implementation Order

Recommended order to avoid blockers:

1. **Hub Config Reading** (all programs)
   - Easiest: just read data, no state changes
   - Enables circuit breakers, limits, timers

2. **Profile Counter Updates** (Offer and Trade)
   - Medium complexity
   - Enables limit enforcement

3. **Offer Validation** (Trade program)
   - Simple deserialization
   - No CPI needed, just account reading

4. **Profile Statistics** (Trade program)
   - Similar to counter updates
   - Enables reputation system

5. **Escrow Fee Distribution** (Trade program)
   - Most complex: multiple token transfers
   - Requires careful testing

6. **Arbitrator Assignment** (Trade program)
   - Medium complexity
   - Needed for disputes

---

## Additional Resources

- [Anchor CPI Documentation](https://www.anchor-lang.com/docs/basics/cpi)
- [Solana CPI Guide](https://solana.com/docs/core/cpi)
- [Mastering CPIs Article](https://medium.com/@ancilartech/mastering-cross-program-invocations-in-anchor-a-developers-guide-to-solana-s-cpi-patterns-0f29a5734a3e)
- [TASK_9_INTEGRATION_TESTING.md](./TASK_9_INTEGRATION_TESTING.md) - Detailed CPI requirements

---

## Summary

**Total CPIs to Implement**: 7 major integration points

**Estimated Implementation Time**: 3-5 days

**Critical Path**:
1. Hub config integration (all programs)
2. Profile counter updates (Offer, Trade)
3. Escrow fee distribution (Trade)

Once these CPIs are implemented, all 8 integration test suites can be validated and the protocol will be fully functional.

---

**Last Updated**: 2025-11-19
**Next Steps**: Begin implementation starting with Hub config reading
