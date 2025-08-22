## FEATURE:

- Replace all unchecked arithmetic operations with checked variants throughout all programs
- Implement SafeMath utility module for common arithmetic patterns
- Add overflow/underflow error variants to all program error enums
- Validate all percentage calculations stay within basis points bounds (0-10000)
- Add comprehensive unit tests for edge cases (MAX values, zero amounts)

## EXAMPLES:

```rust
// shared-types/src/safe_math.rs
use anchor_lang::prelude::*;

pub trait SafeMath {
    fn safe_add(&self, other: Self) -> Result<Self> where Self: Sized;
    fn safe_sub(&self, other: Self) -> Result<Self> where Self: Sized;
    fn safe_mul(&self, other: Self) -> Result<Self> where Self: Sized;
    fn safe_div(&self, other: Self) -> Result<Self> where Self: Sized;
}

impl SafeMath for u64 {
    fn safe_add(&self, other: u64) -> Result<u64> {
        self.checked_add(other)
            .ok_or(error!(ErrorCode::ArithmeticOverflow))
    }
}

// Before (UNSAFE):
let total_fees = burn_fee + chain_fee + warchest_fee;
let net_amount = trade_amount - total_fees;

// After (SAFE):
let total_fees = burn_fee
    .safe_add(chain_fee)?
    .safe_add(warchest_fee)?;
let net_amount = trade_amount
    .safe_sub(total_fees)?;

// Percentage calculation with bounds check:
pub fn calculate_fee(amount: u64, fee_bps: u16) -> Result<u64> {
    require!(fee_bps <= 10_000, ErrorCode::InvalidFeePercentage);
    amount
        .safe_mul(fee_bps as u64)?
        .safe_div(10_000)
}
```

## DOCUMENTATION:

- Rust checked arithmetic: https://doc.rust-lang.org/std/primitive.u64.html#method.checked_add
- Solana program security best practices: https://docs.solana.com/developing/on-chain-programs/developing-rust#arithmetic-errors
- Integer overflow vulnerabilities in smart contracts

## OTHER CONSIDERATIONS:

- **Performance Impact**: Checked operations are slightly slower but critical for security
- **Error Handling**: All arithmetic errors should return descriptive error codes
- **Testing Strategy**: Use proptest/quickcheck for property-based testing of math operations
- **Audit Trail**: Document all arithmetic assumptions in code comments
- **Gas Optimization**: Group related calculations to minimize error checks
- **Type Safety**: Consider using newtype pattern for different value types (Amount, Fee, etc.)
- **Precision Loss**: Document and test for precision loss in division operations
- **Boundary Testing**: Test with u64::MAX, 0, and boundary values

## RELATED ISSUES:

- Prerequisite: FIX_01_ENUM_CONSISTENCY (shared types crate needed)
- Next: FIX_03_ACCOUNT_VALIDATION (secure account handling)
- Affects: All fee calculations, trade amounts, escrow math