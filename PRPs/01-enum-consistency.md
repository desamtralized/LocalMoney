name: "Solana Programs: Shared Types Crate for Enum Consistency"
description: |

## Purpose
Create a shared types crate to ensure consistent enum definitions across all Solana programs, fixing the current FiatCurrency casing mismatch between profile (PascalCase) and price (UPPERCASE) programs, and establishing a pattern for all shared types used in Cross-Program Invocations (CPIs).

## Core Principles
1. **Single Source of Truth**: All shared enums defined in one crate
2. **Consistent Casing**: Use PascalCase for all enum variants
3. **CPI Compatibility**: Ensure serialization compatibility across program boundaries
4. **Backwards Compatibility**: Plan migration strategy for deployed programs
5. **Build Order**: Shared types must build before dependent programs

---

## Goal
Implement a shared types crate that provides consistent enum definitions (FiatCurrency, TradeState, OfferState, OfferType) across all five Solana programs, ensuring proper serialization/deserialization for Cross-Program Invocations.

## Why
- **Type Safety**: Prevent runtime errors from enum mismatches during CPI calls
- **Maintainability**: Single location for shared type updates
- **Consistency**: Standardized casing across all programs
- **Future-Proofing**: Easier to add new shared types
- **SDK Generation**: Consistent TypeScript types from IDLs

## What
Complete implementation of shared types crate including:
- **Shared Types Crate**: New Rust crate with all shared enums
- **Program Updates**: Migrate all programs to use shared types
- **Casing Fix**: Convert price program from UPPERCASE to PascalCase
- **CPI Validation**: Ensure all cross-program calls work
- **Test Coverage**: Serialization and integration tests
- **Build Pipeline**: Update workspace configuration

### Success Criteria
- [X] Shared types crate compiles successfully
- [X] All programs import and use shared enums
- [X] FiatCurrency uses consistent PascalCase across all programs
- [X] CPI calls between programs work correctly
- [X] All existing tests pass with new types
- [X] TypeScript SDK generates with consistent types
- [X] Build order ensures shared types compile first

## All Needed Context

### Critical Documentation Sources
```yaml
# ANCHOR DOCUMENTATION
anchor_cpi_types: https://www.anchor-lang.com/docs/cross-program-invocations
anchor_serialization: https://docs.rs/anchor-lang/latest/anchor_lang/trait.AnchorSerialize.html
anchor_workspace: https://www.anchor-lang.com/docs/references/anchor-toml

# RUST WORKSPACE PATTERNS
rust_workspaces: https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html
cargo_dependencies: https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html

# SOLANA TYPE SAFETY
solana_serialization: https://solana.com/docs/core/accounts#serialization
anchor_idl_types: https://www.anchor-lang.com/docs/idl
```

### Current Implementation Analysis

**FINDING 1: Inconsistent FiatCurrency Definitions**
```rust
// profile/src/lib.rs:247 - PascalCase
pub enum FiatCurrency {
    Usd, Eur, Gbp, Cad, Aud, Jpy, Brl, Mxn, Ars, Clp, Cop, Ngn, Thb, Ves,
}

// price/src/lib.rs:138 - UPPERCASE (INCOMPATIBLE!)
pub enum FiatCurrency {
    USD, EUR, GBP, CAD, AUD, JPY, BRL, MXN, ARS, CLP, COP, NGN, THB, VES,
}
```

**FINDING 2: Shared Enums from Profile**
```rust
// offer/src/lib.rs:234
pub use profile::{FiatCurrency, OfferState, OfferType};

// trade/src/lib.rs:2000
pub use profile::{FiatCurrency, TradeState};
```

**FINDING 3: Enum Definitions to Share**
```rust
// profile/src/lib.rs - All these should move to shared crate
pub enum TradeState { ... }  // Line 214
pub enum OfferState { ... }  // Line 234
pub enum OfferType { ... }   // Line 241
pub enum FiatCurrency { ... } // Line 247
```

### Implementation Blueprint

**STEP 1: Create Shared Types Crate Structure**
```bash
# Directory structure
contracts/solana/shared-types/
├── Cargo.toml
└── src/
    └── lib.rs
```

**STEP 2: Shared Types Implementation**
```rust
// shared-types/src/lib.rs
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Hash, Debug)]
pub enum FiatCurrency {
    Usd,
    Eur,
    Gbp,
    Cad,
    Aud,
    Jpy,
    Brl,
    Mxn,
    Ars,
    Clp,
    Cop,
    Ngn,
    Thb,
    Ves,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum TradeState {
    RequestCreated,
    RequestCanceled,
    RequestExpired,
    RequestAccepted,
    EscrowFunded,
    EscrowCanceled,
    EscrowRefunded,
    FiatDeposited,
    EscrowReleased,
    EscrowDisputed,
    SettledForMaker,
    SettledForTaker,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum OfferState {
    Active,
    Paused,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum OfferType {
    Buy,
    Sell,
}

// Helper conversions for backwards compatibility
impl FiatCurrency {
    pub fn to_seed_bytes(&self) -> &[u8] {
        match self {
            FiatCurrency::Usd => b"USD",
            FiatCurrency::Eur => b"EUR",
            FiatCurrency::Gbp => b"GBP",
            FiatCurrency::Cad => b"CAD",
            FiatCurrency::Aud => b"AUD",
            FiatCurrency::Jpy => b"JPY",
            FiatCurrency::Brl => b"BRL",
            FiatCurrency::Mxn => b"MXN",
            FiatCurrency::Ars => b"ARS",
            FiatCurrency::Clp => b"CLP",
            FiatCurrency::Cop => b"COP",
            FiatCurrency::Ngn => b"NGN",
            FiatCurrency::Thb => b"THB",
            FiatCurrency::Ves => b"VES",
        }
    }
}
```

**STEP 3: Update Workspace Configuration**
```toml
# contracts/solana/Cargo.toml
[workspace]
members = ["shared-types", "programs/*"]  # shared-types MUST be first
resolver = "2"

[workspace.dependencies]
anchor-lang = "0.31.1"
anchor-spl = { version = "0.31.1", features = ["token", "idl-build"] }
localmoney-shared = { path = "./shared-types", version = "0.1.0" }
```

**STEP 4: Update Each Program's Dependencies**
```toml
# programs/profile/Cargo.toml (and all other programs)
[dependencies]
anchor-lang = { workspace = true }
anchor-spl = { workspace = true }
localmoney-shared = { workspace = true }
```

**STEP 5: Program Migration Pattern**
```rust
// programs/profile/src/lib.rs
use localmoney_shared::{FiatCurrency, TradeState, OfferState, OfferType};
// Remove local enum definitions

// programs/offer/src/lib.rs
use localmoney_shared::{FiatCurrency, OfferState, OfferType};
// Remove: pub use profile::{FiatCurrency, OfferState, OfferType};

// programs/trade/src/lib.rs
use localmoney_shared::{FiatCurrency, TradeState};
// Remove: pub use profile::{FiatCurrency, TradeState};

// programs/price/src/lib.rs - CRITICAL CASING CHANGE
use localmoney_shared::FiatCurrency;
// Remove local enum, update all references from USD to Usd, etc.
```

### Files to Modify

1. **CREATE NEW FILES:**
   - `contracts/solana/shared-types/Cargo.toml`
   - `contracts/solana/shared-types/src/lib.rs`

2. **UPDATE WORKSPACE:**
   - `contracts/solana/Cargo.toml` - Add shared-types to workspace

3. **UPDATE DEPENDENCIES (all programs):**
   - `contracts/solana/programs/profile/Cargo.toml`
   - `contracts/solana/programs/offer/Cargo.toml`
   - `contracts/solana/programs/trade/Cargo.toml`
   - `contracts/solana/programs/price/Cargo.toml`
   - `contracts/solana/programs/hub/Cargo.toml`

4. **UPDATE SOURCE FILES:**
   - `contracts/solana/programs/profile/src/lib.rs` - Remove enums, import shared
   - `contracts/solana/programs/offer/src/lib.rs` - Update imports
   - `contracts/solana/programs/trade/src/lib.rs` - Update imports, fix match arms
   - `contracts/solana/programs/price/src/lib.rs` - Update imports, FIX CASING
   - `contracts/solana/programs/hub/src/lib.rs` - Update if using shared types

### Validation Gates

```bash
# 1. Build shared types first
cd contracts/solana/shared-types && cargo build

# 2. Build all programs
cd ../.. && anchor build

# 3. Run existing tests
anchor test

# 4. Verify CPI serialization
cargo test --package shared-types

# 5. Check generated IDLs
ls target/idl/*.json | xargs -I {} grep -l "FiatCurrency" {}

# 6. Run E2E tests
cd sdk && npm test
```

### Implementation Tasks (in order)

1. **Create Shared Types Crate**
   - [X] Create directory structure
   - [X] Implement all shared enums
   - [X] Add helper methods for seeds

2. **Update Workspace Configuration**
   - [X] Modify Cargo.toml workspace
   - [X] Add shared dependency to workspace

3. **Update Profile Program**
   - [X] Add shared-types dependency
   - [X] Remove local enum definitions
   - [X] Import from shared crate
   - [X] Test compilation

4. **Update Price Program**
   - [X] Add shared-types dependency
   - [X] Remove local FiatCurrency
   - [X] Fix all UPPERCASE to PascalCase
   - [X] Update match statements
   - [X] Test compilation

5. **Update Offer Program**
   - [X] Add shared-types dependency
   - [X] Remove profile imports
   - [X] Import from shared crate
   - [X] Test compilation

6. **Update Trade Program**
   - [X] Add shared-types dependency
   - [X] Remove profile imports
   - [X] Import from shared crate
   - [X] Update match arms for seeds
   - [X] Test compilation

7. **Update Hub Program**
   - [X] Add shared-types dependency if needed
   - [X] Import any shared types used
   - [X] Test compilation

8. **Testing & Validation**
   - [X] Run anchor build
   - [X] Run anchor test
   - [X] Verify IDL generation
   - [X] Run SDK tests

### Common Pitfalls to Avoid

1. **Build Order**: Shared types MUST be listed first in workspace members
2. **Casing Changes**: Price program needs careful updates from UPPERCASE
3. **Seed Bytes**: PDA seeds still use uppercase bytes for compatibility
4. **CPI Boundaries**: Test all cross-program calls after migration
5. **IDL Generation**: May need to run `anchor build` twice for proper IDL updates

### Error Handling Strategy

```rust
// For migration compatibility, add conversion methods
impl TryFrom<u8> for FiatCurrency {
    type Error = ProgramError;
    
    fn try_from(value: u8) -> Result<Self> {
        match value {
            0 => Ok(FiatCurrency::Usd),
            1 => Ok(FiatCurrency::Eur),
            // ... other variants
            _ => Err(ProgramError::InvalidArgument),
        }
    }
}
```

### Testing Requirements

1. **Unit Tests** (shared-types/src/lib.rs):
   - Serialization/deserialization roundtrip
   - Seed bytes generation
   - Conversion methods

2. **Integration Tests**:
   - CPI calls between programs
   - PDA derivation with enum seeds
   - State account serialization

3. **E2E Tests**:
   - Complete trading flow
   - Price feed updates
   - Profile operations

## Quality Score: 9/10

**Confidence Level**: Very High
- Clear migration path with step-by-step instructions
- All affected files identified
- Validation gates are executable
- Common pitfalls documented
- Backwards compatibility considered

**Risk Factors**:
- Breaking change for deployed programs (mitigated by migration strategy)
- Build order dependency (documented in workspace config)
- Casing changes in price program (detailed fix provided)

This PRP provides comprehensive context for one-pass implementation success.