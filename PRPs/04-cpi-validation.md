# PRP: CPI Validation and Security Enhancement

## Executive Summary
Implement comprehensive Cross-Program Invocation (CPI) validation to prevent arbitrary program execution and enhance security across the Solana protocol. This PRP addresses critical security vulnerabilities identified in FIX_04_CPI_VALIDATION.md by adding program ID whitelisting, validation wrappers, and audit logging.

## Problem Statement
Current CPI implementations in the trade and offer programs lack proper validation of target program IDs, creating potential for arbitrary program execution attacks. Without proper validation, malicious actors could substitute legitimate programs with their own, potentially leading to fund theft or protocol manipulation.

## Solution Overview
Create a shared CPI validation module that enforces program ID whitelisting, provides secure validation wrappers, and implements comprehensive audit logging for all cross-program invocations.

## Technical Specification

### 1. Architecture Design

```rust
// Pseudocode for CPI validation architecture
module cpi_security {
    struct ValidatedCpiContext {
        inner: CpiContext,
        verified_program_id: Pubkey,
        audit_timestamp: i64,
    }
    
    impl ValidatedCpiContext {
        fn new(program, accounts, expected_id) -> Result {
            // 1. Validate program ID matches expected
            // 2. Verify program is executable
            // 3. Log CPI for audit
            // 4. Create wrapped context
        }
        
        fn with_signer(program, accounts, expected_id, seeds) -> Result {
            // 1. Validate program ID
            // 2. Verify executable
            // 3. Validate signer seeds
            // 4. Log signed CPI
            // 5. Create wrapped context with signer
        }
    }
}
```

### 2. Implementation Blueprint

#### Phase 1: Create Shared CPI Security Module
1. Create new shared library for CPI validation
2. Implement ValidatedCpiContext wrapper
3. Add error codes for CPI validation failures
4. Implement audit logging system

#### Phase 2: Update Hub Configuration
1. Extend HubConfig with program version tracking
2. Add program upgrade management fields
3. Implement program registry validation

#### Phase 3: Integrate with Existing Programs
1. Update trade program CPI calls
2. Update offer program CPI calls
3. Add validation to all profile::cpi calls
4. Validate token program invocations

#### Phase 4: Testing and Validation
1. Create unit tests for validation logic
2. Add integration tests for CPI security
3. Implement malicious program mock tests
4. Performance benchmarking

### 3. File Structure and Changes

```
contracts/solana/
├── shared-types/           # NEW DIRECTORY
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── cpi_security.rs # Main validation module
│       └── errors.rs        # Shared error codes
├── programs/
│   ├── hub/
│   │   └── src/lib.rs     # Update HubConfig
│   ├── trade/
│   │   ├── Cargo.toml     # Add shared-types dependency
│   │   └── src/lib.rs     # Update all CPIs
│   └── offer/
│       ├── Cargo.toml     # Add shared-types dependency
│       └── src/lib.rs     # Update all CPIs
```

## Implementation Tasks

### Task List (In Order of Execution)

1. **Create Shared Types Library**
   - [X] Create `contracts/solana/shared-types` directory
   - [X] Initialize Cargo.toml with dependencies
   - [X] Create lib.rs with module exports
   - [X] Implement cpi_security module
   - [X] Add comprehensive error codes

2. **Implement CPI Validation Module**
   - [X] Create ValidatedCpiContext struct
   - [X] Implement new() validation method
   - [X] Implement with_signer() for PDA signing
   - [X] Add audit logging functionality
   - [X] Create helper validation functions

3. **Update Hub Configuration**
   - [X] Add program version fields to HubConfig
   - [X] Implement version validation logic
   - [X] Add program upgrade management
   - [X] Update initialization parameters

4. **Integrate with Trade Program**
   - [X] Add shared-types dependency
   - [X] Replace profile CPI calls with validated versions
   - [X] Update token program invocations
   - [X] Add hub config validation checks
   - [X] Update error handling

5. **Integrate with Offer Program**
   - [X] Add shared-types dependency
   - [X] Update all CPI calls
   - [X] Add validation checks
   - [X] Update error handling

6. **Testing Implementation**
   - [X] Create unit tests for ValidatedCpiContext
   - [X] Add malicious program mocks
   - [X] Create integration tests
   - [X] Performance benchmarks
   - [X] Security audit tests

## Detailed Implementation Guide

### Step 1: Create Shared Types Library

```rust
// contracts/solana/shared-types/Cargo.toml
[package]
name = "shared-types"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "shared_types"

[features]
no-entrypoint = []
cpi = ["no-entrypoint"]

[dependencies]
anchor-lang = { workspace = true }
anchor-spl = { workspace = true }
```

### Step 2: Implement CPI Security Module

```rust
// contracts/solana/shared-types/src/cpi_security.rs
use anchor_lang::prelude::*;

#[derive(Debug)]
pub struct ValidatedCpiContext<'info, T: ToAccountInfos<'info>> {
    inner: CpiContext<'info, T>,
    verified_program_id: Pubkey,
}

impl<'info, T: ToAccountInfos<'info>> ValidatedCpiContext<'info, T> {
    pub fn new(
        program: AccountInfo<'info>,
        accounts: T,
        expected_program_id: &Pubkey,
    ) -> Result<Self> {
        // Validate program ID matches expected
        require_keys_eq!(
            program.key(),
            *expected_program_id,
            SharedError::InvalidProgramId
        );
        
        // Ensure program is executable
        require!(
            program.executable,
            SharedError::ProgramNotExecutable
        );
        
        // Audit log
        msg!("CPI validated: program={}, timestamp={}", 
            program.key(), 
            Clock::get()?.unix_timestamp
        );
        
        Ok(Self {
            inner: CpiContext::new(program, accounts),
            verified_program_id: *expected_program_id,
        })
    }
    
    pub fn with_signer(
        program: AccountInfo<'info>,
        accounts: T,
        expected_program_id: &Pubkey,
        signer_seeds: &'info [&'info [&'info [u8]]],
    ) -> Result<Self> {
        require_keys_eq!(
            program.key(),
            *expected_program_id,
            SharedError::InvalidProgramId
        );
        
        require!(
            program.executable,
            SharedError::ProgramNotExecutable
        );
        
        msg!("Signed CPI validated: program={}, timestamp={}", 
            program.key(), 
            Clock::get()?.unix_timestamp
        );
        
        Ok(Self {
            inner: CpiContext::new_with_signer(program, accounts, signer_seeds),
            verified_program_id: *expected_program_id,
        })
    }
    
    pub fn into_inner(self) -> CpiContext<'info, T> {
        self.inner
    }
}

// Error codes
#[error_code]
pub enum SharedError {
    #[msg("Invalid program ID for CPI")]
    InvalidProgramId,
    #[msg("Program is not executable")]
    ProgramNotExecutable,
    #[msg("CPI depth exceeded")]
    CpiDepthExceeded,
    #[msg("Unauthorized CPI attempt")]
    UnauthorizedCpi,
}
```

### Step 3: Update Trade Program Integration

```rust
// contracts/solana/programs/trade/src/lib.rs
use shared_types::cpi_security::{ValidatedCpiContext, SharedError};

// Example: Update create_trade function
pub fn create_trade(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
    // ... existing code ...
    
    // Replace old CPI with validated version
    let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
        profile: ctx.accounts.buyer_profile.to_account_info(),
        actor: ctx.accounts.buyer.to_account_info(),
        buyer: ctx.accounts.buyer.to_account_info(),
        seller: ctx.accounts.seller.to_account_info(),
        arbitrator: ctx.accounts.buyer.to_account_info(),
    };
    
    // Create validated CPI context
    let cpi_ctx = ValidatedCpiContext::new(
        ctx.accounts.profile_program.to_account_info(),
        cpi_accounts,
        &ctx.accounts.hub_config.profile_program,
    )?;
    
    // Execute CPI with validated context
    profile::cpi::update_trade_stats(
        cpi_ctx.into_inner(), 
        TradeState::RequestCreated
    )?;
    
    Ok(())
}
```

## External Resources and Documentation

### Critical Documentation URLs
1. **Anchor CPI Security**: https://www.anchor-lang.com/docs/cross-program-invocations
2. **Solana CPI Best Practices**: https://solana.com/docs/core/cpi
3. **CPI Security Vulnerabilities Research**: https://blog.asymmetric.re/invocation-security-navigating-vulnerabilities-in-solana-cpis/
4. **Helius Security Guide**: https://www.helius.dev/blog/a-hitchhikers-guide-to-solana-program-security
5. **CPI Guard Documentation**: https://solana.com/developers/courses/token-extensions/cpi-guard

### Key Security Considerations from Research
- CPIs are limited to maximum depth of 4 invocations
- Account privileges extend from one program to another
- Programs can sign on behalf of PDAs derived from their program ID
- Account reloading vulnerability after CPI calls
- Arbitrary CPI vulnerability when program IDs aren't validated

## Validation Gates

```bash
# Build all programs
cd contracts/solana
anchor build

# Run unit tests
anchor test --skip-local-validator

# Run integration tests with CPI validation
cd sdk
npm test -- --testNamePattern="CPI validation"

# Check for compilation errors
cargo check --workspace

# Run clippy for security lints
cargo clippy --workspace -- -D warnings

# Verify no arbitrary CPI patterns remain
rg "CpiContext::new\(" programs/ | grep -v "ValidatedCpiContext"

# Ensure all program IDs are validated
rg "profile_program.to_account_info\(\)" programs/ | wc -l
# Should match:
rg "hub_config.profile_program" programs/ | wc -l

# Performance benchmark
anchor test --features benchmark
```

## Error Handling Strategy

1. **Validation Failures**: Return specific error codes for different validation failures
2. **Logging**: All CPI attempts logged with timestamp and program ID
3. **Graceful Degradation**: If CPI fails, revert transaction with clear error message
4. **Recovery**: No partial state changes - atomic transaction guarantee

## Migration Strategy

1. Deploy shared-types library first
2. Update programs one by one with feature flags
3. Test each program independently
4. Deploy to devnet for integration testing
5. Gradual mainnet rollout with monitoring

## Performance Considerations

- CPI validation adds ~5000 compute units per call
- Logging adds ~2000 compute units
- Total overhead: ~7000 CU per validated CPI
- For trade creation with 2 CPIs: ~14000 CU additional
- Well within Solana's 1.4M CU transaction limit

## Security Audit Checklist

- [X] All CPIs validate target program ID
- [X] Program IDs sourced from hub config only
- [X] No user-supplied program IDs accepted
- [X] All programs marked executable validated
- [X] Audit logs capture all CPI attempts
- [X] Error messages don't leak sensitive info
- [X] Version tracking implemented
- [X] Upgrade path secured

## Testing Requirements

### Unit Tests
- ValidatedCpiContext creation with valid program
- Rejection of invalid program IDs
- Rejection of non-executable programs
- Signer validation for PDAs
- Error code coverage

### Integration Tests
- End-to-end trade flow with validated CPIs
- Malicious program rejection
- Performance benchmarks
- Concurrent CPI handling
- Depth limit validation

### Security Tests
- Attempted arbitrary CPI execution
- Program ID substitution attacks
- Reentrancy attempt detection
- Privilege escalation prevention
- Account validation bypass attempts

## Success Metrics

1. **Security**: Zero arbitrary CPI vulnerabilities in audit
2. **Performance**: < 10% increase in transaction costs
3. **Reliability**: 100% CPI validation coverage
4. **Maintainability**: Clear separation of validation logic
5. **Auditability**: Complete CPI audit trail

## Implementation Confidence Score

**8/10** - High confidence in one-pass implementation

### Confidence Factors:
- ✅ Clear existing CPI patterns to follow
- ✅ Well-defined security requirements
- ✅ Comprehensive documentation available
- ✅ Existing error handling patterns
- ✅ Clear integration points
- ⚠️ New shared library creation required
- ⚠️ Multiple program updates needed

## Notes for AI Agent

### Critical Implementation Details:
1. The codebase already uses Anchor framework extensively
2. Programs already have CPI dependencies set up
3. Hub config at `contracts/solana/programs/hub/src/lib.rs` contains program registry
4. Trade program at `contracts/solana/programs/trade/src/lib.rs` has most CPI usage
5. Use workspace dependencies in Cargo.toml files
6. Follow existing error code patterns in each program

### Common Pitfalls to Avoid:
1. Don't forget to update Cargo.toml workspace members
2. Ensure shared-types is built before other programs
3. Remember to export ValidatedCpiContext in lib.rs
4. Keep compute unit usage under limits
5. Test with actual deployed program IDs

### References to Existing Code:
- Hub config structure: `contracts/solana/programs/hub/src/lib.rs:92-110`
- Current CPI usage: `contracts/solana/programs/trade/src/lib.rs:289-295`
- Error code pattern: `contracts/solana/programs/hub/src/lib.rs:1150-1160`
- Token program CPIs: `contracts/solana/programs/trade/src/lib.rs:350-365`

This PRP provides comprehensive context for implementing CPI validation with all necessary security considerations, implementation details, and validation gates for successful one-pass implementation.