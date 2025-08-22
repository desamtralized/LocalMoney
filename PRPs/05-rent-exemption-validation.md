# PRP: Rent Exemption Validation Implementation

## Overview
Implement comprehensive rent exemption validation for all Solana programs to ensure accounts maintain sufficient lamports to avoid rent collection and prevent data loss.

## Core Requirements
- Add rent exemption validation for all newly created accounts
- Implement minimum balance checks before account initialization
- Add rent reclamation protection for long-lived accounts
- Create helper functions for rent calculations
- Validate existing accounts maintain rent exemption after operations

## Documentation References
- Solana Rent System: https://docs.solana.com/developing/programming-model/accounts#rent
- Rent Exemption Details: https://docs.anza.xyz/implemented-proposals/rent/
- Anchor Space Calculation: https://www.anchor-lang.com/docs/space
- Account Lifecycle: https://solana.com/developers/courses/program-security/closing-accounts
- QuickNode Rent Guide: https://www.quicknode.com/guides/solana-development/getting-started/understanding-rent-on-solana

## Codebase Context

### Current Structure
```
contracts/solana/
├── Cargo.toml (workspace configuration)
├── programs/
│   ├── hub/     (HubConfig with SPACE constant)
│   ├── offer/   (Offer with SPACE constant)
│   ├── profile/ (Profile with SPACE constant)
│   ├── trade/   (Trade with multiple SPACE constants)
│   └── price/   (Price feeds with SPACE constants)
```

### Existing Patterns to Follow
1. **Account Initialization Pattern** (from hub/src/lib.rs:188-195):
```rust
#[account(
    init,
    payer = authority,
    space = HubConfig::SPACE,
    seeds = [b"hub".as_ref(), b"config".as_ref()],
    bump
)]
pub hub_config: Account<'info, HubConfig>,
```

2. **SPACE Constant Pattern** (from profile/src/lib.rs):
```rust
pub const SPACE: usize = 8 + // discriminator
    32 + // owner
    4 + 50 + // username (String with max 50 chars)
    // ... other fields
```

3. **Error Code Pattern** (from hub/src/lib.rs):
```rust
#[error_code]
pub enum HubError {
    #[msg("Invalid fee percentage (must be <= 10000 bps)")]
    InvalidFeePercentage,
    // ... other errors
}
```

## Implementation Blueprint

### Phase 1: Create Shared Types Library

1. **Create shared-types crate structure**:
```bash
mkdir -p contracts/solana/shared-types/src
```

2. **Create Cargo.toml** for shared-types:
```toml
# contracts/solana/shared-types/Cargo.toml
[package]
name = "shared-types"
version = "0.1.0"
edition = "2021"

[dependencies]
anchor-lang = { workspace = true }

[lib]
crate-type = ["cdylib", "lib"]
name = "shared_types"
```

3. **Update workspace Cargo.toml**:
```toml
# contracts/solana/Cargo.toml
[workspace]
members = ["programs/*", "shared-types"]
```

### Phase 2: Implement Rent Management Module

Create `contracts/solana/shared-types/src/rent_management.rs` with:

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent::Rent;

// Error codes specific to rent management
#[error_code]
pub enum RentError {
    #[msg("Account is not rent exempt")]
    NotRentExempt,
    #[msg("Insufficient funds for rent exemption")]
    InsufficientFunds,
    #[msg("Account balance too low (approaching rent collection)")]
    LowAccountBalance,
    #[msg("Invalid margin percentage (must be <= 100)")]
    InvalidMargin,
    #[msg("Arithmetic overflow in rent calculation")]
    ArithmeticOverflow,
}

/// Validates that an account is rent-exempt for its current size
pub fn validate_rent_exemption(
    account: &AccountInfo,
    expected_size: usize,
) -> Result<()> {
    let rent = Rent::get()?;
    let lamports = account.lamports();
    
    require!(
        rent.is_exempt(lamports, expected_size),
        RentError::NotRentExempt
    );
    
    Ok(())
}

/// Calculates the minimum rent exemption for a given size
pub fn calculate_rent_exemption(size: usize) -> Result<u64> {
    let rent = Rent::get()?;
    Ok(rent.minimum_balance(size))
}

/// Calculates rent with a safety margin (in basis points)
pub fn calculate_rent_with_margin(size: usize, margin_bps: u16) -> Result<u64> {
    require!(margin_bps <= 10000, RentError::InvalidMargin);
    
    let base_rent = calculate_rent_exemption(size)?;
    let margin = base_rent
        .checked_mul(margin_bps as u64)
        .ok_or(RentError::ArithmeticOverflow)?
        .checked_div(10000)
        .ok_or(RentError::ArithmeticOverflow)?;
    
    base_rent.checked_add(margin)
        .ok_or(RentError::ArithmeticOverflow)
}

/// Validates account health after operations
pub fn validate_account_health(account: &AccountInfo) -> Result<()> {
    // Ensure account still rent-exempt after operations
    let data_len = account.data_len();
    validate_rent_exemption(account, data_len)?;
    
    // Check account not close to rent collection (10% buffer)
    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(data_len);
    let buffer = min_balance / 10;
    
    require!(
        account.lamports() >= min_balance.saturating_add(buffer),
        RentError::LowAccountBalance
    );
    
    Ok(())
}

/// Safely resizes an account with rent adjustment
pub fn resize_account_safely<'info>(
    account: &AccountInfo<'info>,
    new_size: usize,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
) -> Result<()> {
    let old_size = account.data_len();
    
    if new_size > old_size {
        // Calculate additional rent needed
        let rent = Rent::get()?;
        let new_minimum = rent.minimum_balance(new_size);
        let old_minimum = rent.minimum_balance(old_size);
        let additional_rent = new_minimum.saturating_sub(old_minimum);
        
        // Transfer additional lamports if needed
        if additional_rent > 0 {
            anchor_lang::solana_program::program::invoke(
                &anchor_lang::solana_program::system_instruction::transfer(
                    payer.key,
                    account.key,
                    additional_rent,
                ),
                &[payer.clone(), account.clone(), system_program.clone()],
            )?;
        }
        
        // Realloc account
        account.realloc(new_size, false)?;
    }
    
    // Validate still rent-exempt
    validate_rent_exemption(account, new_size)?;
    
    Ok(())
}

/// Helper trait for account validation in instruction contexts
pub trait RentValidation {
    fn validate_rent_exemption(&self) -> Result<()>;
}
```

### Phase 3: Update Each Program

For each program (hub, offer, profile, trade, price), make these modifications:

1. **Add shared-types dependency to Cargo.toml**:
```toml
[dependencies]
anchor-lang = { workspace = true }
shared-types = { path = "../../shared-types" }
```

2. **Import rent management in lib.rs**:
```rust
use shared_types::rent_management::{
    validate_rent_exemption, 
    calculate_rent_with_margin,
    validate_account_health,
    RentValidation,
    RentError
};
```

3. **Add rent validation to Initialize contexts**:
```rust
impl<'info> RentValidation for Initialize<'info> {
    fn validate_rent_exemption(&self) -> Result<()> {
        // Use 10% margin for safety
        let required_rent = calculate_rent_with_margin(HubConfig::SPACE, 1000)?;
        require!(
            self.authority.lamports() >= required_rent,
            RentError::InsufficientFunds
        );
        Ok(())
    }
}
```

4. **Add validation call in initialize function**:
```rust
pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    // Validate rent exemption first
    ctx.accounts.validate_rent_exemption()?;
    
    // ... rest of initialization logic
}
```

5. **Add post-operation validation where appropriate**:
```rust
// After any operation that might affect account balance
validate_account_health(&ctx.accounts.some_account.to_account_info())?;
```

### Phase 4: Example Integration (Hub Program)

Complete example for `contracts/solana/programs/hub/src/lib.rs`:

```rust
// Add at top with other imports
use shared_types::rent_management::{
    validate_rent_exemption,
    calculate_rent_with_margin,
    validate_account_health,
    RentValidation,
    RentError
};

// Add implementation for Initialize context
impl<'info> RentValidation for Initialize<'info> {
    fn validate_rent_exemption(&self) -> Result<()> {
        // Calculate required rent with 10% margin (1000 basis points)
        let required_rent = calculate_rent_with_margin(HubConfig::SPACE, 1000)?;
        
        // Ensure payer has sufficient balance
        require!(
            self.authority.lamports() >= required_rent,
            RentError::InsufficientFunds
        );
        
        Ok(())
    }
}

// Update initialize function
pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    // Validate rent exemption before initialization
    ctx.accounts.validate_rent_exemption()?;
    
    // Existing validation logic...
    require!(params.burn_fee_pct <= 10_000, HubError::InvalidFeePercentage);
    // ... rest of function
}
```

## Implementation Tasks

1. **Create shared-types crate structure**
   - Create directory structure
   - Create Cargo.toml
   - Create lib.rs with module exports
   - Create rent_management.rs with all helper functions

2. **Update workspace configuration**
   - Add shared-types to workspace members
   - Ensure all dependencies are properly configured

3. **Update Hub program**
   - Add shared-types dependency
   - Import rent management functions
   - Add RentValidation trait implementation
   - Add validation to initialize function

4. **Update Offer program**
   - Same pattern as Hub
   - Pay special attention to account creation in CreateOffer

5. **Update Profile program**
   - Same pattern as Hub
   - Validate in profile creation

6. **Update Trade program**
   - Same pattern as Hub
   - Add validation to CreateTrade
   - Add validation to arbitration accounts
   - Validate token conversion accounts

7. **Update Price program**
   - Same pattern as Hub
   - Validate price feed initialization

8. **Add comprehensive tests**
   - Unit tests for rent calculation functions
   - Integration tests for account initialization
   - Edge case tests

## Validation Gates

Execute these commands to validate the implementation:

```bash
# Build all programs
cd contracts/solana
anchor build

# Run tests
anchor test

# Check for compilation errors
cargo check --workspace

# Run clippy for linting
cargo clippy --workspace -- -D warnings

# Format code
cargo fmt --all

# Verify shared-types is properly linked
cargo tree | grep shared-types

# Test rent calculations specifically
cargo test -p shared-types rent
```

## Success Criteria

- [ ] All programs compile without errors
- [ ] Shared-types crate is properly integrated
- [ ] All account initializations validate rent exemption
- [ ] Helper functions work correctly with tests passing
- [ ] No accounts can be created below rent-exempt threshold
- [ ] Post-operation validations prevent rent collection risk
- [ ] 10% safety margin applied to all calculations
- [ ] Error messages are clear and actionable

## Common Pitfalls to Avoid

1. **Forgetting discriminator space**: Always add 8 bytes for Anchor's discriminator
2. **Not checking payer balance**: Validate payer has enough SOL before init
3. **Missing post-operation checks**: Always validate after balance-affecting operations
4. **Integer overflow**: Use checked arithmetic for all calculations
5. **Hardcoding rent values**: Always use Rent::get() for current values
6. **Not handling account resize**: Use resize_account_safely for dynamic sizing

## Testing Scenarios

1. **Normal case**: Create account with sufficient rent
2. **Edge case**: Create account with exact rent exemption amount
3. **Failure case**: Attempt to create with insufficient rent
4. **Resize case**: Increase account size and validate rent adjustment
5. **Health check**: Validate accounts after operations
6. **Margin calculation**: Verify safety margins work correctly

## Implementation Confidence Score: 9/10

This PRP provides comprehensive context with:
- Complete code examples from the codebase
- Detailed implementation steps in order
- External documentation references
- Clear validation gates
- Common pitfalls identified
- Existing patterns to follow

The implementation should succeed in one pass with all necessary context provided.