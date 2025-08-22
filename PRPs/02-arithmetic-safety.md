# PRP: Arithmetic Safety Implementation for Solana Programs

## Objective
Replace all unchecked arithmetic operations with checked variants throughout all Solana programs to prevent overflow/underflow vulnerabilities and ensure mathematical correctness.

## Context and Research Findings

### Current Codebase State
- **Programs**: 5 Solana programs (hub, offer, price, profile, trade) located in `/contracts/solana/programs/`
- **Existing Issues**:
  - Hub program uses unchecked arithmetic at lib.rs:17-20 and lib.rs:86-89
  - Trade program partially implements checked arithmetic but inconsistently
  - No shared SafeMath utility module exists
  - No shared-types crate for common functionality
  - Error enums exist but lack arithmetic-specific error variants

### Existing Patterns to Follow
- Trade program already uses pattern: `.checked_add().ok_or(ErrorCode::ArithmeticError)?`
- Programs use `#[error_code]` attribute for error enums
- Workspace structure configured in `/contracts/solana/Cargo.toml`
- Release profile already has `overflow-checks = true`
- Basis points validation (0-10000) implemented in hub program

## Implementation Blueprint

### Task Order
1. Create shared-types crate with SafeMath module
2. Update Cargo workspace configuration
3. Add ArithmeticOverflow/Underflow errors to all program error enums
4. Replace unchecked operations in hub program
5. Complete arithmetic safety in trade program
6. Update offer, price, and profile programs
7. Add percentage calculation helpers
8. Create comprehensive unit tests
9. Add integration tests for edge cases

### Pseudocode Approach

```rust
// Step 1: Create shared-types crate structure
/contracts/solana/shared-types/
├── Cargo.toml
└── src/
    ├── lib.rs
    └── safe_math.rs

// Step 2: Implement SafeMath trait
trait SafeMath {
    fn safe_add() -> Result<Self>
    fn safe_sub() -> Result<Self>
    fn safe_mul() -> Result<Self>
    fn safe_div() -> Result<Self>
}

// Step 3: For each program, transform arithmetic
// BEFORE:
let total = a + b + c;

// AFTER:
let total = a.safe_add(b)?.safe_add(c)?;

// Step 4: Add error variants to each program
#[error_code]
pub enum ErrorCode {
    // ... existing errors
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Arithmetic underflow")]
    ArithmeticUnderflow,
    #[msg("Division by zero")]
    DivisionByZero,
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

**SafeMath Implementation** (based on example in FIX_02):
- Implement for u64, u128, i64, i128
- Include percentage calculation helpers
- Add basis points validation (0-10000)

### 2. Update Programs

**Hub Program** (`/contracts/solana/programs/hub/src/lib.rs`):
- Lines 17-20: Replace fee sum with checked arithmetic
- Lines 86-89: Replace config update fee calculation
- Add ArithmeticOverflow to HubError enum

**Trade Program** (`/contracts/solana/programs/trade/src/lib.rs`):
- Already partially implemented at lines 265, 2102-2115
- Audit all remaining arithmetic operations
- Ensure consistency in error handling

**Other Programs**:
- Search for any arithmetic operations
- Add error variants even if no arithmetic currently exists (future-proofing)

### 3. Testing Strategy

**Unit Tests** (in shared-types crate):
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn test_safe_add_overflow() {
        assert!(u64::MAX.safe_add(1).is_err());
    }

    proptest! {
        #[test]
        fn test_safe_math_properties(a: u64, b: u64) {
            // Test commutative property where valid
            if let (Ok(r1), Ok(r2)) = (a.safe_add(b), b.safe_add(a)) {
                assert_eq!(r1, r2);
            }
        }
    }
}
```

**Integration Tests**:
- Test fee calculations with maximum values
- Test zero amount edge cases
- Test percentage calculations at boundaries

## Files to Reference

### Existing Files to Modify
1. `/contracts/solana/programs/hub/src/lib.rs` - Primary target for arithmetic fixes
2. `/contracts/solana/programs/trade/src/lib.rs` - Reference for pattern, complete implementation
3. `/contracts/solana/programs/offer/src/lib.rs` - Add error variants
4. `/contracts/solana/programs/price/src/lib.rs` - Add error variants
5. `/contracts/solana/programs/profile/src/lib.rs` - Add error variants
6. `/contracts/solana/Cargo.toml` - Update workspace members

### New Files to Create
1. `/contracts/solana/shared-types/Cargo.toml`
2. `/contracts/solana/shared-types/src/lib.rs`
3. `/contracts/solana/shared-types/src/safe_math.rs`
4. `/contracts/solana/shared-types/tests/safe_math_tests.rs`

## Documentation References

- **Rust Checked Arithmetic**: https://doc.rust-lang.org/std/primitive.u64.html#method.checked_add
- **Solana Security Best Practices**: https://docs.solana.com/developing/on-chain-programs/developing-rust#arithmetic-errors
- **Anchor Error Handling**: https://www.anchor-lang.com/docs/errors
- **Property-based Testing**: https://docs.rs/proptest/latest/proptest/

## Common Pitfalls to Avoid

1. **Don't forget cast operations**: When converting between types (e.g., `u16 as u32`), wrap in checked operations
2. **Percentage calculations**: Always validate basis points are within 0-10000 range
3. **Division by zero**: Check divisor before any division operation
4. **Gas optimization**: Group related calculations to minimize error checks
5. **Precision loss**: Document expected precision loss in division operations

## Validation Gates

```bash
# Build all programs with overflow checks
cd /contracts/solana
cargo build --release

# Run unit tests for shared-types
cd /contracts/solana/shared-types
cargo test

# Run clippy for linting
cargo clippy --all-targets --all-features -- -D warnings

# Run anchor tests
cd /contracts/solana
anchor test

# Check for any remaining unchecked arithmetic
rg '\b\w+\s*[\+\-\*\/]\s*\w+\b' --type rust programs/ | grep -v '//' | grep -v 'safe_' | grep -v 'checked_'
```

## Error Handling Strategy

All arithmetic operations should follow this pattern:
```rust
// For required operations (will halt program on overflow)
let result = a.safe_add(b)?;

// For optional operations (can handle overflow gracefully)
let result = match a.safe_add(b) {
    Ok(val) => val,
    Err(_) => return err!(ErrorCode::ArithmeticOverflow)
};
```

## Migration Checklist

- [X] Create shared-types crate with SafeMath module
- [X] Update workspace Cargo.toml
- [X] Add shared-types dependency to all programs
- [X] Update hub program arithmetic (lines 17-20, 86-89)
- [X] Complete trade program arithmetic safety
- [X] Add error variants to all program enums
- [X] Implement percentage calculation helpers
- [X] Create unit tests with proptest
- [X] Add integration tests for edge cases
- [X] Run all validation gates
- [X] Document precision assumptions

## Success Criteria

1. All arithmetic operations use checked variants
2. No compilation warnings about arithmetic
3. All tests pass including edge cases
4. Basis points validation enforced (0-10000)
5. Clear error messages for overflow/underflow
6. Performance impact < 5% (measured via benchmark)

## Confidence Score: 8/10

High confidence due to:
- Clear existing patterns in trade program
- Well-defined workspace structure
- Comprehensive research of current state
- Detailed implementation plan

Minor uncertainty around:
- Exact performance impact
- Integration test complexity with multiple programs

## Implementation Time Estimate

- Shared-types creation: 1 hour
- Program updates: 2-3 hours
- Testing: 1-2 hours
- Total: 4-6 hours