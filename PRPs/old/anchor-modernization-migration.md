name: "Anchor 0.31.1 Modernization Migration - Token Interface & IDL Build"
description: |

## Purpose
Comprehensive migration of LocalMoney Solana programs from legacy Anchor patterns (2022-2023) to modern Anchor 0.31.1 best practices, enabling IDL generation, Token-2022 compatibility, and type safety.

## Core Principles
1. **Zero Breaking Changes**: Maintain program interface compatibility
2. **Type Safety First**: Use InterfaceAccount for dual token program support
3. **Modern Patterns**: Follow 2025 Anchor best practices exactly
4. **IDL Generation**: Enable proper IDL compilation for all programs
5. **Token-2022 Ready**: Future-proof with token_interface module
6. **Validation Gates**: Each phase must compile and pass tests

---

## Goal
Migrate Trade and Offer programs from legacy `anchor_spl::token` patterns to modern `anchor_spl::token_interface` patterns, enabling IDL generation and Token-2022 compatibility while maintaining full backward compatibility.

## Why
- **IDL Generation Failures**: Current programs fail to compile IDLs due to missing `anchor-spl/idl-build` feature and legacy token types
- **Type System Incompatibility**: `Account<'info, T>` types don't work with Anchor 0.31.1 IDL generation
- **Token Program Limitation**: Legacy `token` module only supports original SPL Token, not Token-2022
- **Safety Concerns**: `token::transfer` lacks decimals validation that `transfer_checked` provides
- **Future-Proofing**: Enable support for Token Extensions without code changes

## What
Complete modernization including:
- Cargo.toml dependency and feature updates for IDL build support
- Import migrations from `token` to `token_interface` modules
- Type system migration from `Account` to `InterfaceAccount` types
- Constraint updates to include `token_program` validation
- Transfer function migration from `transfer` to `transfer_checked`
- Validation of IDL generation and program compilation

### Success Criteria
- [ ] Trade program compiles with `anchor build` and generates IDL
- [ ] Offer program compiles with `anchor build` and generates IDL
- [ ] All existing tests pass without modification
- [ ] Programs deploy successfully to local validator
- [ ] No breaking changes to program interface or account structures
- [ ] TypeScript SDK can be regenerated from new IDLs

## All Needed Context

### Critical Documentation Sources
```yaml
# MUST READ - Official Anchor 0.31.1 Documentation
anchor_framework: https://www.anchor-lang.com/docs
token_integration: https://www.anchor-lang.com/docs/tokens
token_basics: https://www.anchor-lang.com/docs/tokens/basics
transfer_tokens: https://www.anchor-lang.com/docs/tokens/basics/transfer-tokens
release_notes: https://www.anchor-lang.com/docs/updates/release-notes/0-31-1

# EXTERNAL REFERENCES - Community Examples and Guides
quicknode_token2022: https://www.quicknode.com/guides/solana-development/anchor/token-2022
solana_stackexchange_migration: https://solana.stackexchange.com/questions/20824/what-has-changed-from-anchor-version-0-30-1-to-version-0-31-0
github_token2022_example: https://github.com/LeaderMalang/anchor-token-2022
```

### Current State Analysis - File Locations

**Trade Program Issues** (`contracts/solana/programs/trade/src/lib.rs`):
```rust
// ❌ CURRENT - Line 4: Legacy token import
use anchor_spl::token::{self, Token, Mint, TokenAccount};

// ❌ CURRENT - Lines 258, 260, 268: Wrong account types
pub token_mint: Account<'info, Mint>,
pub seller_token_account: Account<'info, TokenAccount>,
pub token_program: Program<'info, Token>,

// ❌ CURRENT - Lines 44-52: Basic transfer without decimals validation
token::transfer(transfer_ctx, amount)?;
```

**Offer Program Issues** (`contracts/solana/programs/offer/src/lib.rs`):
```rust
// ❌ CURRENT - Line 2: Legacy token import  
use anchor_spl::token::{self, Token, Mint, TokenAccount};

// ❌ CURRENT - Lines 186, 237, 256: Wrong account types
pub token_mint: Account<'info, Mint>,
pub seller_token_account: Account<'info, TokenAccount>, 
pub token_program: Program<'info, Token>,

// ❌ CURRENT - Lines 150-161: Basic transfer without decimals
token::transfer(CpiContext::new_with_signer(...), transfer_amount)?;
```

**Cargo.toml Issues** (Both programs):
```toml
# ❌ CURRENT - Missing idl-build feature
anchor-spl = { git = "https://github.com/coral-xyz/anchor.git", tag = "v0.31.1", default-features = false, features = ["token"] }

# ❌ CURRENT - Missing anchor-spl/idl-build
idl-build = ["anchor-lang/idl-build"]
```

### Modern Anchor 0.31.1 Patterns - Required Changes

**Official Documentation Quotes**:
> "The `token_interface` module from anchor-spl is designed to work with both the original Token Program and the newer Token Extension Program (Token 2022), providing types that are compatible with either program."

> "Simply add the anchor-spl crate as a dependency to your program and add 'anchor-spl/idl-build' to idl-build feature list in Cargo.toml."

> "Use `InterfaceAccount` instead of `Account` for mints and token accounts"

> "Use `TransferChecked` instead of regular `Transfer` as it includes decimals validation for safer transfers"

**Modern Import Pattern**:
```rust
// ✅ CORRECT - 2025 Pattern
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
    Transfer, transfer, TransferChecked, transfer_checked
};
```

**Modern Account Types**:
```rust
// ✅ CORRECT - InterfaceAccount with constraint updates
#[account(
    mut,
    associated_token::mint = token_mint,
    associated_token::authority = seller,
    associated_token::token_program = token_program,  // REQUIRED
)]
pub seller_token_account: InterfaceAccount<'info, TokenAccount>,
pub token_mint: InterfaceAccount<'info, Mint>,
pub token_program: Interface<'info, TokenInterface>,
```

**Modern Transfer Pattern**:
```rust
// ✅ CORRECT - transfer_checked with decimals validation
transfer_checked(
    CpiContext::new(
        token_program.to_account_info(),
        TransferChecked {
            from: seller_token_account.to_account_info(),
            to: escrow_account.to_account_info(),
            authority: seller.to_account_info(),
            mint: token_mint.to_account_info(),  // REQUIRED
        },
    ),
    amount,
    token_mint.decimals,  // REQUIRED decimals validation
)?;
```

### Known Error Patterns & Solutions

**IDL Build Errors**:
```bash
# ❌ ERROR: Missing idl-build feature
error: no function or associated item named 'create_type'

# ✅ SOLUTION: Add anchor-spl/idl-build to Cargo.toml features
anchor-spl = { ..., features = ["token", "idl-build"] }
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
```

**Type System Errors**:
```bash
# ❌ ERROR: Wrong account types for IDL generation  
error: DISCRIMINATOR not found for Account<Mint>

# ✅ SOLUTION: Use InterfaceAccount instead of Account
pub token_mint: InterfaceAccount<'info, Mint>,
```

**Missing Constraint Errors**:
```bash
# ❌ ERROR: Missing token_program validation
InvalidProgramId error during execution

# ✅ SOLUTION: Add token_program constraint
associated_token::token_program = token_program
```

### Existing Codebase Patterns to Preserve

**Trade Program CPI Patterns** (Keep Unchanged):
```rust
// ✅ PRESERVE - These CPI calls work correctly
price::cpi::verify_price_for_trade(cpi_ctx, price, "USD".to_string(), 100)?;
profile::cpi::record_trade_completion(buyer_profile_ctx)?;
```

**Account Structure Patterns** (Keep Same Layout):
```rust
// ✅ PRESERVE - Account structure and space calculations remain same
#[account]
pub struct Trade {
    pub seller: Pubkey,           // Keep same
    pub buyer: Option<Pubkey>,    // Keep same  
    pub amount: u64,              // Keep same
    // ... all other fields identical
}
```

**Test Infrastructure** (Should Work Without Changes):
```typescript
// ✅ PRESERVE - Test patterns are well-designed
const tradeClient = new TradeClient(provider.connection, wallet, TRADE_PROGRAM_ID);
// Tests should pass after migration without modification
```

## Implementation Blueprint

### Phase 1: Cargo.toml Dependencies Update
**Files**: `contracts/solana/programs/trade/Cargo.toml`, `contracts/solana/programs/offer/Cargo.toml`

```toml
# BEFORE (Lines 21, 16 respectively)
anchor-spl = { git = "https://github.com/coral-xyz/anchor.git", tag = "v0.31.1", default-features = false, features = ["token"] }
idl-build = ["anchor-lang/idl-build"]

# AFTER - Add idl-build feature and include anchor-spl/idl-build  
anchor-spl = { git = "https://github.com/coral-xyz/anchor.git", tag = "v0.31.1", default-features = false, features = ["token", "idl-build"] }
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
```

**Validation**: Run `cargo check` in each program directory - should compile without token-related errors.

### Phase 2: Import Statement Updates
**Trade Program** (`contracts/solana/programs/trade/src/lib.rs:4`):
```rust
// BEFORE
use anchor_spl::token::{self, Token, Mint, TokenAccount};

// AFTER  
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
    Transfer, transfer, TransferChecked, transfer_checked
};
```

**Offer Program** (`contracts/solana/programs/offer/src/lib.rs:2`):
```rust
// BEFORE
use anchor_spl::token::{self, Token, Mint, TokenAccount};

// AFTER
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface, 
    transfer_checked, TransferChecked
};
```

**Validation**: Run `cargo check` - imports should resolve successfully.

### Phase 3: Account Type Migrations

**Trade Program Account Structs** - Update ALL instances:

**CreateTrade struct** (`lines 258-268`):
```rust
// BEFORE
pub token_mint: Account<'info, Mint>,
pub seller_token_account: Account<'info, TokenAccount>,
pub token_program: Program<'info, Token>,

// AFTER
pub token_mint: InterfaceAccount<'info, Mint>,
#[account(
    mut,
    associated_token::mint = token_mint,
    associated_token::authority = seller,
    associated_token::token_program = token_program,
)]
pub seller_token_account: InterfaceAccount<'info, TokenAccount>,
pub token_program: Interface<'info, TokenInterface>,
```

**CompleteTrade struct** (`lines 296-303`):
```rust
// BEFORE
pub escrow_account: Box<Account<'info, TokenAccount>>,
pub buyer_token_account: Box<Account<'info, TokenAccount>>,
pub token_program: Program<'info, Token>,

// AFTER  
#[account(
    mut,
    constraint = escrow_account.key() == trade.escrow_account,
    token::mint = trade.token_mint,
    token::authority = trade,
    token::token_program = token_program,
)]
pub escrow_account: Box<InterfaceAccount<'info, TokenAccount>>,
#[account(
    mut,
    constraint = buyer_token_account.mint == trade.token_mint,
    constraint = buyer_token_account.owner == buyer.key(),
    token::token_program = token_program,
)]
pub buyer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
pub token_program: Interface<'info, TokenInterface>,
```

**CancelTrade struct** (`lines 341-348`):
```rust
// BEFORE
pub escrow_account: Box<Account<'info, TokenAccount>>,
pub seller_token_account: Box<Account<'info, TokenAccount>>,
pub token_program: Program<'info, Token>,

// AFTER
#[account(
    mut,
    constraint = escrow_account.key() == trade.escrow_account,
    token::mint = trade.token_mint,
    token::authority = trade,
    token::token_program = token_program,
)]
pub escrow_account: Box<InterfaceAccount<'info, TokenAccount>>,
#[account(
    mut,
    constraint = seller_token_account.mint == trade.token_mint,
    constraint = seller_token_account.owner == seller.key(),
    token::token_program = token_program,
)]
pub seller_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
pub token_program: Interface<'info, TokenInterface>,
```

**Offer Program Account Structs**:

**CreateOffer struct** (`line 186`):
```rust  
// BEFORE
pub token_mint: Account<'info, Mint>,

// AFTER
pub token_mint: InterfaceAccount<'info, Mint>,
```

**TakeOffer struct** (`lines 230-256`):
```rust
// BEFORE
pub token_mint: Account<'info, Mint>,
pub seller_token_account: Account<'info, TokenAccount>,
pub escrow_account: Account<'info, TokenAccount>,
pub token_program: Program<'info, Token>,

// AFTER  
pub token_mint: InterfaceAccount<'info, Mint>,
#[account(
    mut,
    constraint = seller_token_account.mint == token_mint.key(),
    constraint = seller_token_account.owner == creator.key(),
    token::token_program = token_program,
)]
pub seller_token_account: InterfaceAccount<'info, TokenAccount>,
#[account(
    mut,
    constraint = escrow_account.mint == token_mint.key(),
    constraint = escrow_account.owner == trade.key(),
    token::token_program = token_program,
)]
pub escrow_account: InterfaceAccount<'info, TokenAccount>,
pub token_program: Interface<'info, TokenInterface>,
```

**Validation**: Run `cargo check` - should compile without type errors.

### Phase 4: CPI Call Updates

**Trade Program Transfer Calls**:

**create_trade function** (`lines 44-52`):
```rust
// BEFORE
let transfer_ctx = CpiContext::new(
    ctx.accounts.token_program.to_account_info(),
    token::Transfer {
        from: ctx.accounts.seller_token_account.to_account_info(),
        to: ctx.accounts.escrow_account.to_account_info(),
        authority: ctx.accounts.seller.to_account_info(),
    },
);
token::transfer(transfer_ctx, amount)?;

// AFTER
let transfer_ctx = CpiContext::new(
    ctx.accounts.token_program.to_account_info(),
    TransferChecked {
        from: ctx.accounts.seller_token_account.to_account_info(),
        to: ctx.accounts.escrow_account.to_account_info(),
        authority: ctx.accounts.seller.to_account_info(),
        mint: ctx.accounts.token_mint.to_account_info(),
    },
);
transfer_checked(transfer_ctx, amount, ctx.accounts.token_mint.decimals)?;
```

**complete_trade function** (`lines 105-114`):
```rust
// BEFORE  
let transfer_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    token::Transfer {
        from: ctx.accounts.escrow_account.to_account_info(),
        to: ctx.accounts.buyer_token_account.to_account_info(),
        authority: trade_account_info,
    },
    signer,
);
token::transfer(transfer_ctx, ctx.accounts.trade.amount)?;

// AFTER
let transfer_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    TransferChecked {
        from: ctx.accounts.escrow_account.to_account_info(),
        to: ctx.accounts.buyer_token_account.to_account_info(),
        authority: trade_account_info,
        mint: ctx.accounts.token_mint.to_account_info(),
    },
    signer,
);
transfer_checked(transfer_ctx, ctx.accounts.trade.amount, ctx.accounts.token_mint.decimals)?;
```

**cancel_trade function** (`lines 168-177`):
```rust
// BEFORE
let transfer_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    token::Transfer {
        from: ctx.accounts.escrow_account.to_account_info(),
        to: ctx.accounts.seller_token_account.to_account_info(),
        authority: trade_account_info,
    },
    signer,
);
token::transfer(transfer_ctx, amount)?;

// AFTER  
let transfer_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    TransferChecked {
        from: ctx.accounts.escrow_account.to_account_info(),
        to: ctx.accounts.seller_token_account.to_account_info(),
        authority: trade_account_info,
        mint: ctx.accounts.token_mint.to_account_info(),
    },
    signer,
);
transfer_checked(transfer_ctx, amount, ctx.accounts.token_mint.decimals)?;
```

**Note**: You'll need to add `token_mint` to the CompleteTrade and CancelTrade account structs.

**Offer Program Transfer Calls**:

**take_offer function** (`lines 150-161`):
```rust
// BEFORE
token::transfer(
    CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        token::Transfer {
            from: ctx.accounts.seller_token_account.to_account_info(),
            to: ctx.accounts.escrow_account.to_account_info(),
            authority: ctx.accounts.trade.to_account_info(),
        },
        seeds,
    ),
    transfer_amount,
)?;

// AFTER
transfer_checked(
    CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.seller_token_account.to_account_info(),
            to: ctx.accounts.escrow_account.to_account_info(),
            authority: ctx.accounts.trade.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        },
        seeds,
    ),
    transfer_amount,
    ctx.accounts.token_mint.decimals,
)?;
```

**Validation**: Run `cargo check` - all transfer calls should compile correctly.

### Phase 5: Missing Token Mint References

**Trade Program** - Add token_mint to account structs that need it:

**CompleteTrade struct** (add after line 287):
```rust
pub token_mint: InterfaceAccount<'info, Mint>,
```

**CancelTrade struct** (add after line 334):
```rust  
pub token_mint: InterfaceAccount<'info, Mint>,
```

**Validation**: Run `cargo check` - should resolve all mint references.

### Phase 6: IDL Generation Test
```bash
# Test IDL compilation
cd contracts/solana/programs/trade
cargo check
anchor build --skip-lint

cd ../offer  
cargo check
anchor build --skip-lint

# Verify IDL files are generated
ls -la ../../target/idl/
# Should see: trade.json, offer.json
```

### Phase 7: Integration Validation
```bash
# Build all programs
cd contracts/solana
anchor build --skip-lint

# Run test suite (should pass without modification)
cd tests
npm test
```

## Error Handling Strategy

### Expected Compilation Errors During Migration
1. **Import Resolution Errors**: Normal during Phase 2 - resolve by completing all import updates
2. **Type Mismatch Errors**: Normal during Phase 3 - resolve by updating all account types consistently  
3. **Missing Field Errors**: Normal during Phase 4-5 - resolve by adding mint references to transfer calls

### Success Indicators
```bash
# ✅ SUCCESS - These should all work after migration
anchor build --skip-lint  # Compiles without errors
ls target/idl/trade.json  # IDL file exists  
ls target/idl/offer.json  # IDL file exists
anchor test               # All tests pass
```

### Rollback Strategy
If migration fails:
```bash
git checkout -- contracts/solana/programs/trade/
git checkout -- contracts/solana/programs/offer/
# Restore original state and debug specific phase
```

## Gotchas & Common Pitfalls

1. **Token Mint References**: Must add `mint` field to all `TransferChecked` calls - this is required and often forgotten
2. **Decimals Parameter**: `transfer_checked` requires mint decimals - must be `ctx.accounts.token_mint.decimals`
3. **Constraint Consistency**: All token accounts need `token::token_program = token_program` constraint
4. **Box Types**: Keep `Box<InterfaceAccount<...>>` for large accounts to avoid stack overflow
5. **CPI Context**: Transfer calls need `mint` account info added to CPI context
6. **Feature Order**: In Cargo.toml, `["token", "idl-build"]` order matters for compilation

## Quality Confidence Score

**Confidence Level: 9/10** for one-pass implementation success

**Reasoning**:
- ✅ **Clear Migration Path**: Step-by-step transformation with exact code changes
- ✅ **Comprehensive Context**: All error patterns, solutions, and examples provided  
- ✅ **Official Documentation**: Based on authoritative Anchor 0.31.1 docs
- ✅ **Validation Gates**: Each phase has clear success criteria
- ✅ **Error Handling**: Known pitfalls and solutions documented
- ✅ **Rollback Strategy**: Safe failure recovery plan

**Risk Factors** (-1 point):
- Complex transfer call updates require careful attention to mint references
- Multiple account struct updates must be done consistently

**Mitigation**:
- Detailed before/after code examples for every change
- Phase-by-phase validation prevents accumulating errors
- Clear error patterns help debug issues quickly

This PRP provides everything needed for successful one-pass implementation of the Anchor 0.31.1 modernization migration.