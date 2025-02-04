use borsh::{BorshDeserialize, BorshSerialize};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};


// Declare program ID
solana_program::declare_id!("5XkzWi5XrzgZGTw6YAYm4brCsRTYGCZpNiZJkMWwWUx5");

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct CurrencyPrice {
    pub currency: String,
    pub usd_price: u64,
    pub updated_at: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum ProgramInstruction {
    /// Initialize a new price oracle account
    /// Accounts expected: [oracle_account, admin_account]
    Initialize,

    /// Register a hub
    /// Accounts expected: [hub_account, admin_account]
    RegisterHub,

    /// Update prices for currencies
    /// Accounts expected: [oracle_account, price_provider_account]
    UpdatePrices { prices: Vec<CurrencyPrice> },

    /// Register price route for a token
    /// Accounts expected: [route_account, admin_account]
    RegisterPriceRoute {
        denom: String,
        route: Vec<PriceRoute>,
    },
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct PriceRoute {
    pub offer_asset: String,
    pub pool: Pubkey,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct PriceState {
    pub is_initialized: bool,
    pub admin: Pubkey,
    pub price_provider: Pubkey,
}

// Program entrypoint
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = ProgramInstruction::try_from_slice(instruction_data)?;

    match instruction {
        ProgramInstruction::Initialize => {
            msg!("Instruction: Initialize");
            process_initialize(program_id, accounts)
        }
        ProgramInstruction::RegisterHub => {
            msg!("Instruction: Register Hub");
            process_register_hub(accounts)
        }
        ProgramInstruction::UpdatePrices { prices } => {
            msg!("Instruction: Update Prices");
            process_update_prices(accounts, prices)
        }
        ProgramInstruction::RegisterPriceRoute { denom, route } => {
            msg!("Instruction: Register Price Route");
            process_register_price_route(accounts, denom, route)
        }
    }
}

fn process_initialize(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let oracle_account = next_account_info(account_info_iter)?;
    let admin_account = next_account_info(account_info_iter)?;

    if !admin_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let state = PriceState {
        is_initialized: true,
        admin: *admin_account.key,
        price_provider: *admin_account.key, // Initially set to admin
    };

    state.serialize(&mut *oracle_account.data.borrow_mut())?;
    Ok(())
}

fn process_register_hub(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let _hub_account = next_account_info(account_info_iter)?;
    let admin_account = next_account_info(account_info_iter)?;

    if !admin_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Add hub registration logic here
    msg!("Hub registered successfully");
    Ok(())
}

fn process_update_prices(accounts: &[AccountInfo], prices: Vec<CurrencyPrice>) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let oracle_account = next_account_info(account_info_iter)?;
    let price_provider = next_account_info(account_info_iter)?;

    let state = PriceState::try_from_slice(&oracle_account.data.borrow())?;
    if *price_provider.key != state.price_provider {
        return Err(ProgramError::InvalidAccountData);
    }

    if !price_provider.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Update prices in the oracle account
    for price in prices {
        msg!("Updating price for {}: {}", price.currency, price.usd_price);
        // Add price update logic here
    }

    Ok(())
}

fn process_register_price_route(
    accounts: &[AccountInfo],
    denom: String,
    route: Vec<PriceRoute>,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let route_account = next_account_info(account_info_iter)?;
    let admin_account = next_account_info(account_info_iter)?;

    if !admin_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Store route information
    let route_data = (denom, route);
    route_data.serialize(&mut *route_account.data.borrow_mut())?;

    msg!("Price route registered successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    

    // Add tests here
}
