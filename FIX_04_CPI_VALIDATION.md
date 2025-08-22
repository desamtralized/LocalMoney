## FEATURE:

- Validate all CPI target programs against expected program IDs from hub config
- Add program ID whitelisting for all cross-program invocations
- Implement CPI context validation wrapper functions
- Add logging for all CPI calls for audit trail
- Prevent arbitrary program execution through unchecked accounts

## EXAMPLES:

```rust
// shared-types/src/cpi_security.rs
use anchor_lang::prelude::*;

pub struct ValidatedCpiContext<'info, T: ToAccountInfos<'info>> {
    inner: CpiContext<'info, T>,
}

impl<'info, T: ToAccountInfos<'info>> ValidatedCpiContext<'info, T> {
    pub fn new(
        program: AccountInfo<'info>,
        accounts: T,
        expected_program_id: &Pubkey,
    ) -> Result<Self> {
        // Validate the program ID matches expected
        require!(
            program.key() == *expected_program_id,
            ErrorCode::InvalidProgramId
        );
        
        // Ensure the program is executable
        require!(
            program.executable,
            ErrorCode::ProgramNotExecutable
        );
        
        // Log the CPI call for audit
        msg!("CPI call to program: {}", program.key());
        
        Ok(Self {
            inner: CpiContext::new(program, accounts),
        })
    }
    
    pub fn with_signer(
        program: AccountInfo<'info>,
        accounts: T,
        expected_program_id: &Pubkey,
        signer_seeds: &'info [&'info [&'info [u8]]],
    ) -> Result<Self> {
        require!(
            program.key() == *expected_program_id,
            ErrorCode::InvalidProgramId
        );
        
        require!(
            program.executable,
            ErrorCode::ProgramNotExecutable
        );
        
        msg!("CPI call with signer to program: {}", program.key());
        
        Ok(Self {
            inner: CpiContext::new_with_signer(program, accounts, signer_seeds),
        })
    }
}

// In trade program:
pub fn create_trade(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
    // Validate profile program before CPI
    require!(
        ctx.accounts.profile_program.key() == ctx.accounts.hub_config.profile_program,
        ErrorCode::InvalidProfileProgram
    );
    
    // Create validated CPI context
    let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
        profile: ctx.accounts.buyer_profile.to_account_info(),
        actor: ctx.accounts.buyer.to_account_info(),
        // ... other accounts
    };
    
    let cpi_ctx = ValidatedCpiContext::new(
        ctx.accounts.profile_program.to_account_info(),
        cpi_accounts,
        &ctx.accounts.hub_config.profile_program,
    )?;
    
    // Execute CPI with confidence
    profile::cpi::update_trade_stats(cpi_ctx.inner, TradeState::RequestCreated)?;
    
    Ok(())
}

// Hub config with program registry:
#[account]
pub struct HubConfig {
    pub authority: Pubkey,
    pub profile_program: Pubkey,
    pub offer_program: Pubkey,
    pub trade_program: Pubkey,
    pub price_program: Pubkey,
    // Add version tracking for upgrade management
    pub profile_program_version: u8,
    pub offer_program_version: u8,
    pub trade_program_version: u8,
    pub price_program_version: u8,
    // ...
}
```

## DOCUMENTATION:

- Anchor CPI security: https://www.anchor-lang.com/docs/cross-program-invocations#security
- Solana CPI best practices: https://docs.solana.com/developing/programming-model/calling-between-programs
- Program upgrade security considerations
- Whitelisting patterns for smart contracts

## OTHER CONSIDERATIONS:

- **Performance**: CPI validation adds overhead - balance security vs performance
- **Upgrade Path**: Plan for program upgrades and version management
- **Error Recovery**: Handle CPI failures gracefully
- **Reentrancy**: Consider reentrancy guards for sensitive operations
- **Gas Limits**: CPI calls consume significant compute units
- **Testing**: Mock malicious programs in tests to verify protection
- **Monitoring**: Log all CPI calls for security monitoring
- **Documentation**: Document why each CPI is necessary and safe

## RELATED ISSUES:

- Prerequisites: FIX_01-03 (type consistency, arithmetic safety, account validation)
- Next: FIX_05_RENT_EXEMPTION (account stability)
- Critical for: Preventing malicious program execution