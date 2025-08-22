use anchor_lang::prelude::*;
use anchor_lang::ToAccountMetas;
use anchor_lang::solana_program::instruction::AccountMeta;

pub struct ValidatedCpiContext<'a, 'b, 'c, 'info, T>
where
    T: ToAccountInfos<'info> + ToAccountMetas,
    'info: 'a + 'b + 'c,
{
    inner: CpiContext<'a, 'b, 'c, 'info, T>,
    verified_program_id: Pubkey,
}

impl<'a, 'b, 'c, 'info, T> ValidatedCpiContext<'a, 'b, 'c, 'info, T>
where
    T: ToAccountInfos<'info> + ToAccountMetas,
    'info: 'a + 'b + 'c,
{
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
        require!(program.executable, SharedError::ProgramNotExecutable);

        // Audit log
        msg!(
            "CPI validated: program={}, timestamp={}",
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

        require!(program.executable, SharedError::ProgramNotExecutable);

        msg!(
            "Signed CPI validated: program={}, timestamp={}",
            program.key(),
            Clock::get()?.unix_timestamp
        );

        Ok(Self {
            inner: CpiContext::new_with_signer(program, accounts, signer_seeds),
            verified_program_id: *expected_program_id,
        })
    }

    pub fn into_inner(self) -> CpiContext<'a, 'b, 'c, 'info, T> {
        self.inner
    }

    pub fn get_verified_program_id(&self) -> &Pubkey {
        &self.verified_program_id
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
    #[msg("Protected account cannot be modified")]
    ProtectedAccount,
    #[msg("Reentrancy detected")]
    ReentrancyDetected,
}

// Helper function to validate token program
pub fn validate_token_program(program: &AccountInfo) -> Result<()> {
    require_keys_eq!(
        program.key(),
        anchor_spl::token::ID,
        SharedError::InvalidProgramId
    );
    require!(program.executable, SharedError::ProgramNotExecutable);
    Ok(())
}

// Helper function to validate token-2022 program
pub fn validate_token_2022_program(program: &AccountInfo) -> Result<()> {
    require_keys_eq!(
        program.key(),
        anchor_spl::token_2022::ID,
        SharedError::InvalidProgramId
    );
    require!(program.executable, SharedError::ProgramNotExecutable);
    Ok(())
}

// Helper function to validate token interface program (supports both token and token-2022)
pub fn validate_token_interface_program(program: &AccountInfo) -> Result<()> {
    let is_token = program.key() == anchor_spl::token::ID;
    let is_token_2022 = program.key() == anchor_spl::token_2022::ID;

    require!(is_token || is_token_2022, SharedError::InvalidProgramId);

    require!(program.executable, SharedError::ProgramNotExecutable);

    Ok(())
}

/// Helper function to validate protected accounts for reentrancy prevention
/// Checks that critical accounts are not being modified through CPIs
pub fn validate_protected_accounts(
    instruction_accounts: &[AccountMeta],
    protected: &[Pubkey],
) -> Result<()> {
    for account in instruction_accounts.iter().filter(|a| a.is_writable) {
        require!(
            !protected.contains(&account.pubkey),
            SharedError::ProtectedAccount
        );
    }
    Ok(())
}

/// Validates that CPI doesn't create reentrancy vulnerabilities
/// Ensures the calling program doesn't call back into itself
pub fn validate_no_reentrancy(
    caller_program: &Pubkey,
    target_program: &Pubkey,
) -> Result<()> {
    require!(
        caller_program != target_program,
        SharedError::ReentrancyDetected
    );
    Ok(())
}

/// Creates a list of protected system accounts that should never be modified via CPI
pub fn get_system_protected_accounts() -> Vec<Pubkey> {
    vec![
        anchor_lang::system_program::ID,
        anchor_spl::token::ID,
        anchor_spl::token_2022::ID,
        anchor_spl::associated_token::ID,
        anchor_lang::solana_program::sysvar::rent::ID,
        anchor_lang::solana_program::sysvar::clock::ID,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_codes() {
        // Test that error codes compile and can be created
        let _err1 = SharedError::InvalidProgramId;
        let _err2 = SharedError::ProgramNotExecutable;
        let _err3 = SharedError::CpiDepthExceeded;
        let _err4 = SharedError::UnauthorizedCpi;
    }
}
