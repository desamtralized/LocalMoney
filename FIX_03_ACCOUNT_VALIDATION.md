## FEATURE:

- Add runtime validation for all UncheckedAccount uses in critical fund transfers
- Implement ATA (Associated Token Account) derivation validation
- Add account ownership checks before all operations
- Validate all PDAs match expected derivations
- Create validation helper functions for common patterns

## EXAMPLES:

```rust
// shared-types/src/validation.rs
use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;

pub fn validate_ata(
    ata_account: &AccountInfo,
    wallet: &Pubkey,
    mint: &Pubkey,
) -> Result<()> {
    let expected_ata = get_associated_token_address(wallet, mint);
    require!(
        ata_account.key() == expected_ata,
        ErrorCode::InvalidTokenAccount
    );
    Ok(())
}

pub fn validate_pda(
    account: &AccountInfo,
    seeds: &[&[u8]],
    program_id: &Pubkey,
) -> Result<u8> {
    let (expected_pda, bump) = Pubkey::find_program_address(seeds, program_id);
    require!(
        account.key() == expected_pda,
        ErrorCode::InvalidPDA
    );
    Ok(bump)
}

// In release_escrow instruction:
pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
    // Validate all fee recipient ATAs
    validate_ata(
        &ctx.accounts.treasury_token_account,
        &ctx.accounts.hub_config.treasury,
        &ctx.accounts.token_mint.key()
    )?;
    
    validate_ata(
        &ctx.accounts.chain_fee_token_account,
        &ctx.accounts.hub_config.chain_fee_collector,
        &ctx.accounts.token_mint.key()
    )?;
    
    validate_ata(
        &ctx.accounts.warchest_token_account,
        &ctx.accounts.hub_config.warchest_address,
        &ctx.accounts.token_mint.key()
    )?;
    
    // Validate account ownership
    require!(
        ctx.accounts.escrow_token_account.owner == &anchor_spl::token::ID,
        ErrorCode::InvalidAccountOwner
    );
    
    // Continue with transfer logic...
}

// Use Anchor constraints where possible:
#[account(
    mut,
    seeds = [b"trade", b"escrow", trade.id.to_le_bytes().as_ref()],
    bump,
    token::mint = token_mint,
    token::authority = trade,
)]
pub escrow_token_account: Account<'info, TokenAccount>,
```

## DOCUMENTATION:

- Anchor account constraints: https://www.anchor-lang.com/docs/account-constraints
- SPL Associated Token Account: https://spl.solana.com/associated-token-account
- Solana account validation best practices
- PDA security considerations

## OTHER CONSIDERATIONS:

- **Gas Costs**: Validation adds compute units - optimize for common paths
- **Error Messages**: Provide specific errors for each validation failure
- **Reusability**: Create a validation library for common patterns
- **Testing**: Test with malicious accounts to ensure validation works
- **Migration**: Existing transactions may fail - plan gradual rollout
- **Documentation**: Document why each validation is necessary
- **Performance**: Cache validated accounts within instruction when safe
- **Composability**: Design validations to be composable and reusable

## RELATED ISSUES:

- Prerequisites: FIX_01_ENUM_CONSISTENCY, FIX_02_ARITHMETIC_SAFETY
- Next: FIX_04_CPI_VALIDATION (secure cross-program calls)
- Critical for: Preventing fund theft through malicious account substitution