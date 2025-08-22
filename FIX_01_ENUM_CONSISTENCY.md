## FEATURE:

- Create a shared types crate for consistent enum definitions across all Solana programs
- Standardize FiatCurrency enum to use consistent casing (PascalCase recommended)
- Update all programs to import from the shared types crate
- Ensure serialization/deserialization compatibility across CPI boundaries
- Add comprehensive tests for enum serialization consistency

## EXAMPLES:

```rust
// shared-types/src/lib.rs
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
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

// programs/profile/Cargo.toml
[dependencies]
localmoney-shared = { path = "../../shared-types" }

// programs/profile/src/lib.rs
use localmoney_shared::FiatCurrency;
```

## DOCUMENTATION:

- Anchor CPI serialization: https://www.anchor-lang.com/docs/cross-program-invocations
- Rust workspace organization: https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html
- Solana program interoperability best practices

## OTHER CONSIDERATIONS:

- **Breaking Change**: This will break existing deployed programs - plan migration strategy
- **Version Control**: Use semantic versioning for the shared crate
- **Backwards Compatibility**: Consider adding conversion methods for legacy data
- **Testing Priority**: Test all CPI calls between programs with the new shared type
- **SDK Updates**: Update TypeScript SDK to match new enum structure
- **Documentation**: Update all program documentation to reference shared types
- **Build Order**: Shared types crate must build before dependent programs
- **CI/CD**: Update build pipelines to handle workspace dependencies

## RELATED ISSUES:

- This fix must be completed FIRST as it affects fundamental type compatibility
- After this: FIX_02_ARITHMETIC_SAFETY (safe math operations)
- Related to: CPI validation fixes that depend on consistent types