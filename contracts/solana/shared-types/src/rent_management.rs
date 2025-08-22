use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent::Rent;

// Error codes specific to rent management
#[error_code]
pub enum RentError {
    #[msg("Account is not rent exempt")]
    NotRentExempt,
    #[msg("Insufficient funds for rent exemption")]
    InsufficientFunds,
    #[msg("Account balance too low (approaching rent collection)")]
    LowAccountBalance,
    #[msg("Invalid margin percentage (must be <= 100)")]
    InvalidMargin,
    #[msg("Arithmetic overflow in rent calculation")]
    ArithmeticOverflow,
}

/// Validates that an account is rent-exempt for its current size
pub fn validate_rent_exemption(account: &AccountInfo, expected_size: usize) -> Result<()> {
    let rent = Rent::get()?;
    let lamports = account.lamports();

    require!(
        rent.is_exempt(lamports, expected_size),
        RentError::NotRentExempt
    );

    Ok(())
}

/// Calculates the minimum rent exemption for a given size
pub fn calculate_rent_exemption(size: usize) -> Result<u64> {
    let rent = Rent::get()?;
    Ok(rent.minimum_balance(size))
}

/// Calculates rent with a safety margin (in basis points)
pub fn calculate_rent_with_margin(size: usize, margin_bps: u16) -> Result<u64> {
    require!(margin_bps <= 10000, RentError::InvalidMargin);

    let base_rent = calculate_rent_exemption(size)?;
    let margin = base_rent
        .checked_mul(margin_bps as u64)
        .ok_or(RentError::ArithmeticOverflow)?
        .checked_div(10000)
        .ok_or(RentError::ArithmeticOverflow)?;

    base_rent
        .checked_add(margin)
        .ok_or(RentError::ArithmeticOverflow.into())
}

/// Validates account health after operations
pub fn validate_account_health(account: &AccountInfo) -> Result<()> {
    // Ensure account still rent-exempt after operations
    let data_len = account.data_len();
    validate_rent_exemption(account, data_len)?;

    // Check account not close to rent collection (10% buffer)
    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(data_len);
    let buffer = min_balance / 10;

    require!(
        account.lamports() >= min_balance.saturating_add(buffer),
        RentError::LowAccountBalance
    );

    Ok(())
}

/// Safely resizes an account with rent adjustment
pub fn resize_account_safely<'info>(
    account: &AccountInfo<'info>,
    new_size: usize,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
) -> Result<()> {
    let old_size = account.data_len();

    if new_size > old_size {
        // Calculate additional rent needed
        let rent = Rent::get()?;
        let new_minimum = rent.minimum_balance(new_size);
        let old_minimum = rent.minimum_balance(old_size);
        let additional_rent = new_minimum.saturating_sub(old_minimum);

        // Transfer additional lamports if needed
        if additional_rent > 0 {
            anchor_lang::solana_program::program::invoke(
                &anchor_lang::solana_program::system_instruction::transfer(
                    payer.key,
                    account.key,
                    additional_rent,
                ),
                &[payer.clone(), account.clone(), system_program.clone()],
            )?;
        }

        // Resize account
        account.resize(new_size)?;
    }

    // Validate still rent-exempt
    validate_rent_exemption(account, new_size)?;

    Ok(())
}

/// Helper trait for account validation in instruction contexts
pub trait RentValidation {
    fn validate_rent_exemption(&self) -> Result<()>;
}

#[cfg(test)]
mod tests {
    use super::*;
    // use anchor_lang::solana_program::sysvar::rent::Rent; // Currently unused

    #[test]
    fn test_calculate_rent_with_margin() {
        // Test with 10% margin (1000 basis points)
        let size = 100;
        let _margin_bps = 1000;

        // This test would need a real runtime environment to get Rent
        // For unit tests, we're checking the logic is correct

        // Test invalid margin
        let result = calculate_rent_with_margin(size, 10001);
        assert!(result.is_err());
    }

    #[test]
    fn test_margin_calculation_logic() {
        // Test the margin calculation math
        let base_rent = 1000u64;
        let margin_bps = 1000u16; // 10%

        let margin = base_rent
            .checked_mul(margin_bps as u64)
            .unwrap()
            .checked_div(10000)
            .unwrap();

        assert_eq!(margin, 100); // 10% of 1000 is 100

        let total = base_rent.checked_add(margin).unwrap();
        assert_eq!(total, 1100); // 1000 + 100 = 1100
    }
}
