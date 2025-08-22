# PRP: Account Validation Implementation for Solana LocalMoney Protocol

## Overview
Implement comprehensive runtime validation for all UncheckedAccount uses in critical fund transfers, with ATA derivation validation, account ownership checks, and PDA validation helpers. This is critical for preventing fund theft through malicious account substitution.

## Context & Research Findings

### Current State Analysis
- **26 UncheckedAccount usages** identified across the codebase, primarily in `/contracts/solana/programs/trade/src/lib.rs`
- **Critical fund transfer locations:**
  - `ReleaseEscrow` (lines 934-988): treasury, chain_fee, warchest, burn_reserve ATAs
  - `Arbitrate` (lines 1265-1331): winner, arbitrator, treasury, chain_fee, warchest ATAs  
  - `CancelTrade` (lines 1365-1372): seller token account
  - Fee distribution helpers (lines 3280-3489)

### Anchor & Solana Best Practices
- **Documentation URLs:**
  - Anchor Account Constraints: https://www.anchor-lang.com/docs/account-constraints
  - SPL Associated Token Account: https://spl.solana.com/associated-token-account
  - Solana Cookbook - Account Validation: https://solanacookbook.com/references/accounts.html#how-to-validate-accounts
  - Anchor Security Best Practices: https://book.anchor-lang.com/anchor_in_depth/security.html

### Key Security Requirements
1. **ATA Validation**: All token accounts must match expected derivation
2. **PDA Validation**: All PDAs must match expected seeds and bump
3. **Account Ownership**: Token accounts must be owned by SPL Token program
4. **Program Ownership**: Program accounts must match expected program IDs
5. **Signer Validation**: Critical operations must validate signer authority

## Implementation Blueprint

### Phase 1: Create Validation Library

```rust
// Create new file: contracts/solana/programs/trade/src/validation.rs

use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token_interface::TokenAccount;

/// Validates that an account is the correct ATA for given wallet and mint
pub fn validate_ata(
    ata_account: &AccountInfo,
    wallet: &Pubkey,
    mint: &Pubkey,
) -> Result<()> {
    let expected_ata = get_associated_token_address(wallet, mint);
    require_keys_eq!(
        ata_account.key(),
        expected_ata,
        ErrorCode::InvalidTokenAccount
    );
    
    // Also validate it's owned by token program
    require_keys_eq!(
        *ata_account.owner,
        anchor_spl::token::ID,
        ErrorCode::InvalidAccountOwner
    );
    
    Ok(())
}

/// Validates PDA derivation and returns bump
pub fn validate_pda(
    account: &AccountInfo,
    seeds: &[&[u8]],
    program_id: &Pubkey,
) -> Result<u8> {
    let (expected_pda, bump) = Pubkey::find_program_address(seeds, program_id);
    require_keys_eq!(
        account.key(),
        expected_pda,
        ErrorCode::InvalidPDA
    );
    Ok(bump)
}

/// Validates multiple ATAs in batch for fee distribution
pub fn validate_fee_recipient_atas(
    treasury_ata: &AccountInfo,
    chain_fee_ata: &AccountInfo,
    warchest_ata: &AccountInfo,
    burn_reserve_ata: &AccountInfo,
    hub_config: &HubConfig,
    mint: &Pubkey,
) -> Result<()> {
    validate_ata(treasury_ata, &hub_config.treasury, mint)?;
    validate_ata(chain_fee_ata, &hub_config.chain_fee_collector, mint)?;
    validate_ata(warchest_ata, &hub_config.warchest_address, mint)?;
    validate_ata(burn_reserve_ata, &hub_config.burn_reserve, mint)?;
    Ok(())
}
```

### Phase 2: Update Error Codes

```rust
// In contracts/solana/programs/trade/src/lib.rs (at line ~1398)

#[error_code]
pub enum ErrorCode {
    // Existing errors...
    
    #[msg("Invalid token account - does not match expected ATA")]
    InvalidTokenAccount,
    
    #[msg("Invalid account owner")]
    InvalidAccountOwner,
    
    #[msg("Invalid PDA - does not match expected derivation")]
    InvalidPDA,
    
    #[msg("Invalid program account")]
    InvalidProgramAccount,
}
```

### Phase 3: Update Critical Instructions

```rust
// contracts/solana/programs/trade/src/lib.rs - release_escrow function (~line 235)

pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
    // ADD: Validate all fee recipient ATAs before any transfers
    validate_fee_recipient_atas(
        &ctx.accounts.treasury_token_account,
        &ctx.accounts.chain_fee_token_account,
        &ctx.accounts.warchest_token_account,
        &ctx.accounts.burn_reserve_account,
        &ctx.accounts.hub_config,
        &ctx.accounts.token_mint.key()
    )?;
    
    // Existing validation...
    require!(
        ctx.accounts.trade.state == TradeState::EscrowFunded,
        ErrorCode::InvalidTradeState
    );
    
    // Continue with transfers...
}

// contracts/solana/programs/trade/src/lib.rs - arbitrate function (~line 551)

pub fn arbitrate(ctx: Context<Arbitrate>, winner: Pubkey) -> Result<()> {
    // ADD: Validate winner and arbitrator ATAs
    validate_ata(
        &ctx.accounts.winner_token_account,
        &winner,
        &ctx.accounts.token_mint.key()
    )?;
    
    validate_ata(
        &ctx.accounts.arbitrator_token_account,
        &ctx.accounts.arbitrator.key(),
        &ctx.accounts.token_mint.key()
    )?;
    
    // ADD: Validate fee recipient ATAs
    validate_fee_recipient_atas(
        &ctx.accounts.treasury_token_account,
        &ctx.accounts.chain_fee_token_account,
        &ctx.accounts.warchest_token_account,
        &ctx.accounts.burn_reserve_account,
        &ctx.accounts.hub_config,
        &ctx.accounts.token_mint.key()
    )?;
    
    // Continue with existing logic...
}
```

### Phase 4: Update Account Structs with Constraints

```rust
// Where possible, replace UncheckedAccount with proper Anchor constraints
// Example for escrow_token_account in various structs:

#[account(
    mut,
    seeds = [b"trade", b"escrow", trade.id.to_le_bytes().as_ref()],
    bump,
    token::mint = token_mint,
    token::authority = trade_pda
)]
pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
```

## Task List (Implementation Order)

1. **Create validation module** (`contracts/solana/programs/trade/src/validation.rs`)
   - Implement `validate_ata` function
   - Implement `validate_pda` function  
   - Implement `validate_fee_recipient_atas` batch validator
   - Add module declaration in lib.rs

2. **Update error codes** (`contracts/solana/programs/trade/src/lib.rs`)
   - Add `InvalidTokenAccount` error
   - Add `InvalidAccountOwner` error
   - Add `InvalidPDA` error
   - Add `InvalidProgramAccount` error

3. **Update ReleaseEscrow instruction** (`contracts/solana/programs/trade/src/lib.rs:~235`)
   - Add ATA validation for all fee recipients
   - Validate escrow token account ownership
   - Add validation before transfer operations

4. **Update Arbitrate instruction** (`contracts/solana/programs/trade/src/lib.rs:~551`)
   - Validate winner token account
   - Validate arbitrator token account
   - Validate all fee recipient ATAs

5. **Update CancelTrade instruction** (`contracts/solana/programs/trade/src/lib.rs:~749`)
   - Validate seller token account
   - Add ownership checks

6. **Update fee distribution helpers** (`contracts/solana/programs/trade/src/lib.rs:3280-3489`)
   - Add validation in each transfer helper function
   - Ensure account ownership checks

7. **Replace UncheckedAccount where possible**
   - Review each UncheckedAccount usage
   - Replace with proper Anchor account types and constraints
   - Document why UncheckedAccount is needed where it remains

8. **Create comprehensive tests** (`contracts/solana/sdk/tests/integration/validation.test.ts`)
   - Test with malicious ATA substitution
   - Test with invalid PDAs
   - Test with wrong account owners
   - Test error messages are correct

## Files to Modify

1. `/contracts/solana/programs/trade/src/lib.rs` - Main program file
2. `/contracts/solana/programs/trade/src/validation.rs` - New validation module (create)
3. `/contracts/solana/programs/trade/Cargo.toml` - Add dependencies if needed
4. `/contracts/solana/sdk/tests/integration/validation.test.ts` - New test file (create)

## Testing Strategy

### Unit Tests
```typescript
// contracts/solana/sdk/tests/integration/validation.test.ts

describe('Account Validation Tests', () => {
  it('should fail with InvalidTokenAccount when using wrong ATA', async () => {
    // Create a malicious ATA that doesn't match derivation
    const maliciousAta = Keypair.generate();
    
    await expect(
      sdk.releaseEscrow(tradeId, { 
        treasuryTokenAccount: maliciousAta.publicKey 
      })
    ).rejects.toThrow('InvalidTokenAccount');
  });
  
  it('should fail with InvalidAccountOwner for non-token accounts', async () => {
    // Pass a system account instead of token account
    const systemAccount = Keypair.generate();
    
    await expect(
      sdk.releaseEscrow(tradeId, {
        escrowTokenAccount: systemAccount.publicKey
      })
    ).rejects.toThrow('InvalidAccountOwner');
  });
  
  it('should fail with InvalidPDA for wrong PDA derivation', async () => {
    // Use wrong seeds for PDA
    const wrongPda = await PublicKey.findProgramAddress(
      [Buffer.from('wrong'), Buffer.from('seeds')],
      programId
    );
    
    await expect(
      sdk.tradePdaOperation(wrongPda[0])
    ).rejects.toThrow('InvalidPDA');
  });
});
```

### Security Tests
- Attempt fund theft via account substitution
- Test all error paths are properly validated
- Verify no funds can be misdirected

## Validation Gates

```bash
# Build and check for compilation errors
cd contracts/solana && anchor build

# Run all tests including new validation tests
cd contracts/solana/sdk && npm test

# Run specific validation tests
npm test -- validation.test.ts

# Check for any remaining unvalidated UncheckedAccounts
grep -r "UncheckedAccount" programs/ | grep -v "CHECK:" | grep -v "test"

# Verify all transfer operations have validation
grep -B5 "transfer_checked" programs/trade/src/lib.rs | grep -E "validate_|require_"
```

## Migration Strategy

1. **Deploy validation library first** - Non-breaking addition
2. **Add validations incrementally** - Start with most critical (ReleaseEscrow, Arbitrate)
3. **Test on devnet** - Ensure no legitimate transactions fail
4. **Monitor for errors** - Track InvalidTokenAccount errors to catch integration issues
5. **Gradual rollout** - Enable validation with feature flag if needed

## Performance Considerations

- **Validation adds ~5000 compute units per ATA check**
- **Batch validation for multiple ATAs saves ~20% compute**
- **Cache validated accounts within instruction when safe**
- **Use Anchor constraints where possible for compile-time optimization**

## Documentation Requirements

Each validation must include:
- WHY the validation is necessary
- WHAT attack vector it prevents
- WHEN it can be safely skipped (if ever)

Example:
```rust
// SECURITY: Validate treasury ATA to prevent fund theft
// Attack: Attacker could substitute their own account to steal fees
// This validation MUST NOT be skipped
validate_ata(&treasury_ata, &hub_config.treasury, &mint)?;
```

## Success Metrics

- Zero UncheckedAccount uses in fund transfer paths without validation
- All ATAs validated before transfers
- All PDAs validated against expected derivation
- 100% test coverage for validation failures
- No performance regression (< 5% increase in compute units)

## Confidence Score: 8/10

**Strengths:**
- Comprehensive validation coverage identified
- Clear implementation path with specific line numbers
- Reusable validation library design
- Thorough testing strategy

**Risks:**
- May need to adjust for stack size constraints
- Some UncheckedAccounts may need to remain for flexibility
- Compute unit costs need monitoring

## Related PRPs
- Prerequisites: `01-enum-consistency.md`, `02-arithmetic-safety.md`
- Next: `04-cpi-validation.md` (secure cross-program calls)