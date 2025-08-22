## FEATURE:

- Add rent exemption validation for all newly created accounts
- Implement minimum balance checks before account initialization
- Add rent reclamation protection for long-lived accounts
- Create helper functions for rent calculations
- Validate existing accounts maintain rent exemption after operations

## EXAMPLES:

```rust
// shared-types/src/rent_management.rs
use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent::Rent;

pub fn validate_rent_exemption(
    account: &AccountInfo,
    expected_size: usize,
) -> Result<()> {
    let rent = Rent::get()?;
    let lamports = account.lamports();
    
    require!(
        rent.is_exempt(lamports, expected_size),
        ErrorCode::NotRentExempt
    );
    
    Ok(())
}

pub fn calculate_rent_exemption(size: usize) -> Result<u64> {
    let rent = Rent::get()?;
    Ok(rent.minimum_balance(size))
}

// Add safety margin for rent
pub fn calculate_rent_with_margin(size: usize, margin_percent: u8) -> Result<u64> {
    require!(margin_percent <= 100, ErrorCode::InvalidMargin);
    
    let base_rent = calculate_rent_exemption(size)?;
    let margin = base_rent
        .checked_mul(margin_percent as u64)
        .ok_or(ErrorCode::ArithmeticOverflow)?
        .checked_div(100)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    base_rent.checked_add(margin)
        .ok_or(ErrorCode::ArithmeticOverflow)
}

// In account initialization:
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = HubConfig::SPACE,
        seeds = [b"hub", b"config"],
        bump
    )]
    pub hub_config: Account<'info, HubConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    pub fn validate(&self) -> Result<()> {
        // Validate payer has enough balance
        let required_rent = calculate_rent_with_margin(HubConfig::SPACE, 10)?; // 10% margin
        require!(
            self.authority.lamports() >= required_rent,
            ErrorCode::InsufficientFunds
        );
        
        Ok(())
    }
}

// Post-operation validation:
pub fn validate_account_health(account: &AccountInfo) -> Result<()> {
    // Ensure account still rent-exempt after operations
    let data_len = account.data_len();
    validate_rent_exemption(account, data_len)?;
    
    // Check account not close to rent collection
    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(data_len);
    let buffer = min_balance / 10; // 10% buffer
    
    require!(
        account.lamports() >= min_balance + buffer,
        ErrorCode::LowAccountBalance
    );
    
    Ok(())
}

// Account resize with rent adjustment:
pub fn resize_account_safely(
    account: &AccountInfo,
    new_size: usize,
    payer: &AccountInfo,
) -> Result<()> {
    let old_size = account.data_len();
    
    if new_size > old_size {
        // Calculate additional rent needed
        let rent = Rent::get()?;
        let new_minimum = rent.minimum_balance(new_size);
        let old_minimum = rent.minimum_balance(old_size);
        let additional_rent = new_minimum.saturating_sub(old_minimum);
        
        // Transfer additional lamports
        if additional_rent > 0 {
            anchor_lang::solana_program::program::invoke(
                &anchor_lang::solana_program::system_instruction::transfer(
                    payer.key,
                    account.key,
                    additional_rent,
                ),
                &[payer.clone(), account.clone()],
            )?;
        }
        
        // Realloc account
        account.realloc(new_size, false)?;
    }
    
    // Validate still rent-exempt
    validate_rent_exemption(account, new_size)?;
    
    Ok(())
}
```

## DOCUMENTATION:

- Solana Rent: https://docs.solana.com/developing/programming-model/accounts#rent
- Rent exemption: https://docs.solana.com/implemented-proposals/rent
- Account lifecycle: https://docs.solana.com/developing/programming-model/accounts#account-lifecycle
- Anchor space calculation: https://www.anchor-lang.com/docs/space

## OTHER CONSIDERATIONS:

- **Cost Impact**: Rent exemption requires locking SOL - consider costs
- **Account Sizes**: Calculate exact sizes to minimize rent requirements
- **Future Growth**: Account for potential account growth in initial allocation
- **Refunds**: Design account close instructions to return rent to users
- **Testing**: Test with accounts near rent exemption threshold
- **Monitoring**: Track accounts approaching rent collection
- **Documentation**: Document space calculations for each account type
- **Migration**: Existing accounts may need rent top-ups

## RELATED ISSUES:

- Prerequisites: FIX_01-04 (foundation fixes)
- Next: FIX_06_CIRCUIT_BREAKER (emergency controls)
- Important for: Long-term account stability and preventing data loss