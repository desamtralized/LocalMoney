# PRP: Phase 1 - Critical Security Improvements

## Objective
Immediately address critical security vulnerabilities in the local-money protocol by removing temporary workarounds, implementing arithmetic overflow protection, adding CPI validation, and ensuring proper rent exemption validation across all programs.

## Context and Research Findings

### Current Critical Issues
Based on analysis of `/contracts/solana/programs/trade/src/lib.rs`:
- **Lines 27-30**: SKIP flags set to `true` bypassing critical validations
  - `SKIP_HEAVY_VALIDATIONS = true` 
  - `SKIP_PROFILE_CPI_UPDATES = true`
  - `CREATE_TRADE_EARLY_RETURN = true`
  - `CREATE_TRADE_RETURN_IMMEDIATELY = true`
- **Lines 1-2**: Missing arithmetic overflow protection (`#![allow(unexpected_cfgs)]`, `#![allow(deprecated)]`)
- **Line 103**: Direct CPI without validation (profile::cpi calls throughout)
- Rent exemption validation exists but may be incomplete

### Squads Protocol Best Practices to Adopt
From `SQUADS_PROTOCOL_ANALYSIS.md`:
- **Security declarations** (line 9): `#![deny(arithmetic_overflow)]`
- **ValidatedCpiContext pattern** (lines 108-128): Validates program ID before CPI
- **Protected account validation** (lines 131-139): Prevents reentrancy attacks
- **Comprehensive rent validation** (lines 105-108): Includes margin for growth

### Existing Infrastructure
- Trade program already has `validation.rs` and `vrf.rs` modules
- `localmoney_shared` crate exists with some types (line 11-17 of trade/lib.rs)
- Programs use Anchor framework with `#[error_code]` attributes
- Hub program has `require_not_paused!` macro for circuit breaker

## Implementation Blueprint

### Task Order
1. Add security compiler directives to all programs
2. Remove all SKIP flags and early returns in trade program
3. Implement ValidatedCpiContext in shared crate
4. Update all CPI calls to use ValidatedCpiContext
5. Enhance rent exemption validation
6. Add protected account checks for reentrancy prevention
7. Update error enums with security-specific variants
8. Run comprehensive tests to ensure no regressions
9. Document security changes and migration notes

### Pseudocode Approach

```rust
// Step 1: Add to each program's lib.rs (hub, offer, price, profile, trade)
#![deny(arithmetic_overflow)]
#![deny(unused_must_use)]
#![deny(clippy::arithmetic_side_effects)]

// Step 2: In trade/lib.rs, change lines 27-30
const SKIP_HEAVY_VALIDATIONS: bool = false;
const SKIP_PROFILE_CPI_UPDATES: bool = false;
const CREATE_TRADE_EARLY_RETURN: bool = false;
const CREATE_TRADE_RETURN_IMMEDIATELY: bool = false;

// Step 3: Add to localmoney_shared crate
pub struct ValidatedCpiContext<'info, T> {
    inner: CpiContext<'info, T>,
}

impl ValidatedCpiContext {
    pub fn new(program, accounts, expected_program) -> Result<Self> {
        require_keys_eq!(program.key(), expected_program);
        Ok(Self { inner: CpiContext::new(program, accounts) })
    }
}

// Step 4: Replace all CPI calls
// BEFORE: profile::cpi::update_trade_stats(cpi_ctx, state)?;
// AFTER: 
let validated_ctx = ValidatedCpiContext::new(
    ctx.accounts.profile_program.to_account_info(),
    cpi_accounts,
    &profile::ID
)?;
profile::cpi::update_trade_stats(validated_ctx.inner, state)?;

// Step 5: Enhanced rent validation
fn validate_rent_exemption_with_margin(account, expected_size, margin_percent) {
    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(expected_size);
    let required_with_margin = min_balance * (100 + margin_percent) / 100;
    require!(account.lamports() >= required_with_margin);
}
```

## Specific Implementation Details

### 1. Security Compiler Directives
Add to the top of each program's `lib.rs` file:
- `/contracts/solana/programs/hub/src/lib.rs`
- `/contracts/solana/programs/offer/src/lib.rs`
- `/contracts/solana/programs/price/src/lib.rs`
- `/contracts/solana/programs/profile/src/lib.rs`
- `/contracts/solana/programs/trade/src/lib.rs`

```rust
#![deny(arithmetic_overflow)]
#![deny(unused_must_use)]
#![deny(clippy::arithmetic_side_effects)]
#![forbid(unsafe_code)]
```

### 2. Remove Skip Flags
In `/contracts/solana/programs/trade/src/lib.rs`, update lines 27-30:
```rust
const SKIP_HEAVY_VALIDATIONS: bool = false;
const SKIP_PROFILE_CPI_UPDATES: bool = false;
const CREATE_TRADE_EARLY_RETURN: bool = false;
const CREATE_TRADE_RETURN_IMMEDIATELY: bool = false;
```

Remove conditional blocks:
- Line 44-46: Remove `if CREATE_TRADE_RETURN_IMMEDIATELY` block
- Line 57: Change `if !SKIP_HEAVY_VALIDATIONS` to always execute
- Line 69: Change `if !SKIP_HEAVY_VALIDATIONS` to always execute

### 3. ValidatedCpiContext Implementation
Create in `/contracts/solana/shared-types/src/cpi_validation.rs`:
```rust
use anchor_lang::prelude::*;
use anchor_lang::context::CpiContext;

pub struct ValidatedCpiContext<'info, T> {
    inner: CpiContext<'info, T>,
}

impl<'info, T> ValidatedCpiContext<'info, T> {
    pub fn new(
        program: AccountInfo<'info>,
        accounts: T,
        expected_program: &Pubkey,
    ) -> Result<Self> {
        require_keys_eq!(
            program.key(),
            *expected_program,
            ErrorCode::InvalidCpiProgram
        );
        
        // Additional validation can be added here
        Ok(Self {
            inner: CpiContext::new(program, accounts),
        })
    }
    
    pub fn with_signer_seeds(mut self, seeds: &[&[&[u8]]]) -> Self {
        self.inner = self.inner.with_signer_seeds(seeds);
        self
    }
    
    pub fn inner(self) -> CpiContext<'info, T> {
        self.inner
    }
}

// Protected account validation helper
pub fn validate_protected_accounts(
    instruction_accounts: &[AccountMeta],
    protected: &[Pubkey],
) -> Result<()> {
    for account in instruction_accounts.iter().filter(|a| a.is_writable) {
        require!(
            !protected.contains(&account.pubkey),
            ErrorCode::ProtectedAccount
        );
    }
    Ok(())
}
```

### 4. Update CPI Calls
Search for all CPI calls across programs using pattern: `::cpi::`

Example transformation in trade program:
```rust
// BEFORE (around line 103 in trade/lib.rs)
profile::cpi::update_trade_stats(cpi_ctx, TradeState::RequestCreated)?;

// AFTER
let validated_ctx = ValidatedCpiContext::new(
    ctx.accounts.profile_program.to_account_info(),
    profile::cpi::accounts::UpdateTradeStats {
        profile: ctx.accounts.seller_profile.to_account_info(),
        authority: ctx.accounts.seller.to_account_info(),
    },
    &profile::ID,
)?;
profile::cpi::update_trade_stats(validated_ctx.inner(), TradeState::RequestCreated)?;
```

### 5. Rent Exemption Enhancement
Update validation in `/contracts/solana/shared-types/src/rent_validation.rs`:
```rust
pub trait RentValidation {
    fn validate_rent_exemption(&self) -> Result<()>;
    fn validate_rent_with_margin(&self, margin_percent: u8) -> Result<()>;
}

impl<'info> RentValidation for CreateTrade<'info> {
    fn validate_rent_exemption(&self) -> Result<()> {
        self.validate_rent_with_margin(10) // 10% margin
    }
    
    fn validate_rent_with_margin(&self, margin_percent: u8) -> Result<()> {
        let rent = Rent::get()?;
        let expected_size = 8 + std::mem::size_of::<Trade>();
        let min_balance = rent.minimum_balance(expected_size);
        let required_with_margin = min_balance
            .checked_mul(100 + margin_percent as u64)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(100)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
            
        require!(
            self.trade.lamports() >= required_with_margin,
            ErrorCode::InsufficientRentExemption
        );
        
        Ok(())
    }
}
```

### 6. Error Enum Updates
Add to each program's error enum:
```rust
#[error_code]
pub enum ErrorCode {
    // ... existing errors
    
    #[msg("Invalid CPI program")]
    InvalidCpiProgram,
    
    #[msg("Protected account cannot be modified")]
    ProtectedAccount,
    
    #[msg("Insufficient rent exemption with safety margin")]
    InsufficientRentExemption,
    
    #[msg("Arithmetic overflow detected")]
    ArithmeticOverflow,
    
    #[msg("Reentrancy detected")]
    ReentrancyDetected,
}
```

## Validation Gates

### Pre-Implementation Checks
```bash
# Ensure clean working directory
git status

# Run existing tests to establish baseline
cd contracts/solana
anchor test
```

### Post-Implementation Validation
```bash
# 1. Build all programs with security flags
cd contracts/solana
anchor build

# 2. Run unit tests
anchor test

# 3. Check for arithmetic overflow protection
grep -r "deny(arithmetic_overflow)" programs/*/src/lib.rs

# 4. Verify no SKIP flags remain
grep -r "SKIP_.*true" programs/

# 5. Verify ValidatedCpiContext usage
grep -r "ValidatedCpiContext::new" programs/

# 6. Run SDK tests
cd sdk
npm test

# 7. Deploy to devnet and test
anchor deploy --provider.cluster devnet
npm run test:e2e
```

## Error Handling Strategy

1. **Arithmetic Errors**: All arithmetic operations must use checked variants
2. **CPI Errors**: Wrap all CPI calls with ValidatedCpiContext
3. **Rent Errors**: Validate with margin before account creation
4. **Reentrancy**: Check protected accounts in CPI validation

## Known Gotchas

1. **Stack Size**: After removing early returns, stack usage increases. Monitor for stack overflow
2. **Test Data**: Some tests may rely on SKIP flags being true - update test data accordingly
3. **CPI Account Order**: ValidatedCpiContext requires exact account ordering
4. **Rent Calculation**: Different account types need different size calculations

## Documentation Requirements

Create `SECURITY_IMPROVEMENTS.md` documenting:
- All security flags added
- CPI validation pattern usage
- Rent exemption requirements
- Migration guide for existing deployments

## Success Metrics

- [ ] All SKIP flags set to false
- [ ] Zero arithmetic overflow possibilities
- [ ] All CPIs use ValidatedCpiContext
- [ ] Rent validation includes 10% margin
- [ ] All tests pass with security enabled
- [ ] No performance regression > 10%

## References

- Squads Protocol Security: https://github.com/squads-protocol/v4/blob/main/programs/squads_multisig_program/src/lib.rs
- Anchor CPI Security: https://www.anchor-lang.com/docs/cross-program-invocations
- Solana Rent: https://docs.solana.com/developing/programming-model/accounts#rent
- Arithmetic Safety: https://doc.rust-lang.org/std/primitive.u64.html#method.checked_add

## Confidence Score: 8/10

High confidence due to:
- Clear identification of issues in codebase
- Well-documented patterns from Squads Protocol
- Existing infrastructure (shared crate, validation module)
- Straightforward transformation of CPI calls

Points deducted for:
- Potential test breakage requiring updates
- Stack size concerns after removing early returns