use borsh::{BorshDeserialize, BorshSerialize};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::{Sysvar},
};

// Declare program ID
solana_program::declare_id!("9iWg8Fhoh9Z5zo9rhgD3Z2FS46ggUwRnRwdKHtB92w74");
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct HubConfig {
    pub admin: Pubkey,
    pub price_program: Pubkey,
    pub trade_program: Pubkey,
    pub profile_program: Pubkey,
    pub offer_program: Pubkey,
    pub fee_account: Pubkey,
    pub fee_basis_points: u16,
    pub is_paused: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum HubInstruction {
    Initialize {
        price_program: Pubkey,
        trade_program: Pubkey,
        profile_program: Pubkey,
        offer_program: Pubkey,
        fee_account: Pubkey,
        fee_basis_points: u16,
    },
    UpdateConfig {
        fee_basis_points: Option<u16>,
        fee_account: Option<Pubkey>,
    },
    PauseOperations,
    ResumeOperations,
    TransferAdmin {
        new_admin: Pubkey,
    },
}

// Program entrypoint
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("LocalMoney Hub program entrypoint");

    let instruction = HubInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        HubInstruction::Initialize {
            price_program,
            trade_program,
            profile_program,
            offer_program,
            fee_account,
            fee_basis_points,
        } => {
            msg!("Instruction: Initialize");
            process_initialize(
                program_id,
                accounts,
                price_program,
                trade_program,
                profile_program,
                offer_program,
                fee_account,
                fee_basis_points,
            )
        }
        HubInstruction::UpdateConfig {
            fee_basis_points,
            fee_account,
        } => {
            msg!("Instruction: UpdateConfig");
            process_update_config(program_id, accounts, fee_basis_points, fee_account)
        }
        HubInstruction::PauseOperations => {
            msg!("Instruction: PauseOperations");
            process_pause_operations(program_id, accounts)
        }
        HubInstruction::ResumeOperations => {
            msg!("Instruction: ResumeOperations");
            process_resume_operations(program_id, accounts)
        }
        HubInstruction::TransferAdmin { new_admin } => {
            msg!("Instruction: TransferAdmin");
            process_transfer_admin(program_id, accounts, new_admin)
        }
    }
}

fn process_initialize(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    price_program: Pubkey,
    trade_program: Pubkey,
    profile_program: Pubkey,
    offer_program: Pubkey,
    fee_account: Pubkey,
    fee_basis_points: u16,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let config_account = next_account_info(account_info_iter)?;
    let admin_account = next_account_info(account_info_iter)?;

    // Verify the config account is owned by our program
    if config_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    // Check if the config account has enough space
    let config_size = std::mem::size_of::<HubConfig>();
    if config_account.data_len() < config_size {
        return Err(ProgramError::AccountDataTooSmall);
    }

    if !admin_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let config = HubConfig {
        admin: *admin_account.key,
        price_program,
        trade_program,
        profile_program,
        offer_program,
        fee_account,
        fee_basis_points,
        is_paused: false,
        created_at: solana_program::clock::Clock::get()?.unix_timestamp,
        updated_at: solana_program::clock::Clock::get()?.unix_timestamp,
    };

    config.serialize(&mut *config_account.data.borrow_mut())?;
    msg!("Hub initialized successfully");
    Ok(())
}

fn process_update_config(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    fee_basis_points: Option<u16>,
    fee_account: Option<Pubkey>,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let config_account = next_account_info(account_info_iter)?;
    let admin_account = next_account_info(account_info_iter)?;

    // Verify the config account is owned by our program
    if config_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    if !admin_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut config = HubConfig::try_from_slice(&config_account.data.borrow())?;
    if config.admin != *admin_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    if let Some(new_fee_basis_points) = fee_basis_points {
        config.fee_basis_points = new_fee_basis_points;
    }

    if let Some(new_fee_account) = fee_account {
        config.fee_account = new_fee_account;
    }

    config.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;
    config.serialize(&mut *config_account.data.borrow_mut())?;
    msg!("Hub config updated successfully");
    Ok(())
}

fn process_pause_operations(
    program_id: &Pubkey,
    accounts: &[AccountInfo]
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let config_account = next_account_info(account_info_iter)?;
    let admin_account = next_account_info(account_info_iter)?;

    // Verify the config account is owned by our program
    if config_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    if !admin_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut config = HubConfig::try_from_slice(&config_account.data.borrow())?;
    if config.admin != *admin_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    config.is_paused = true;
    config.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;
    config.serialize(&mut *config_account.data.borrow_mut())?;
    msg!("Operations paused successfully");
    Ok(())
}

fn process_resume_operations(
    program_id: &Pubkey,
    accounts: &[AccountInfo]
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let config_account = next_account_info(account_info_iter)?;
    let admin_account = next_account_info(account_info_iter)?;

    // Verify the config account is owned by our program
    if config_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    if !admin_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut config = HubConfig::try_from_slice(&config_account.data.borrow())?;
    if config.admin != *admin_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    config.is_paused = false;
    config.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;
    config.serialize(&mut *config_account.data.borrow_mut())?;
    msg!("Operations resumed successfully");
    Ok(())
}

fn process_transfer_admin(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    new_admin: Pubkey
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let config_account = next_account_info(account_info_iter)?;
    let current_admin_account = next_account_info(account_info_iter)?;
    let new_admin_account = next_account_info(account_info_iter)?;

    // Verify the config account is owned by our program
    if config_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    if !current_admin_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut config = HubConfig::try_from_slice(&config_account.data.borrow())?;
    if config.admin != *current_admin_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    if new_admin != *new_admin_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    config.admin = new_admin;
    config.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;
    config.serialize(&mut *config_account.data.borrow_mut())?;
    msg!("Admin transferred successfully");
    Ok(())
}

fn process_collect_fees(
    program_id: &Pubkey,
    accounts: &[AccountInfo]
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let config_account = next_account_info(account_info_iter)?;
    let admin_account = next_account_info(account_info_iter)?;
    let fee_account = next_account_info(account_info_iter)?;

    // Verify the config account is owned by our program
    if config_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    if !admin_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let config = HubConfig::try_from_slice(&config_account.data.borrow())?;
    if config.admin != *admin_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    if config.fee_account != *fee_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    // Transfer fees logic would go here
    // This would involve checking the fee account balance and transferring to the admin

    msg!("Fees collected successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    // Add tests here
}
