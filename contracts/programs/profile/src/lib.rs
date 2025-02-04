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
solana_program::declare_id!("CfC3efU4b5ppjSBYJwiKrZtz3hmzBBgSM2s6RCFN4nYA");

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct Profile {
    pub owner: Pubkey,
    pub username: String,
    pub reputation_score: u32,
    pub trades_completed: u32,
    pub trades_disputed: u32,
    pub is_verified: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum ProgramInstruction {
    /// Create a new profile
    /// Accounts expected: [profile_account, owner_account]
    CreateProfile { username: String },

    /// Update profile information
    /// Accounts expected: [profile_account, owner_account]
    UpdateProfile { username: Option<String> },

    /// Update profile reputation
    /// Accounts expected: [profile_account, authority_account]
    UpdateReputation { score_delta: i32 },

    /// Verify a profile
    /// Accounts expected: [profile_account, authority_account]
    VerifyProfile,

    /// Record trade completion
    /// Accounts expected: [profile_account, trade_program_account]
    RecordTradeCompletion,

    /// Record trade dispute
    /// Accounts expected: [profile_account, trade_program_account]
    RecordTradeDispute,
}

// Program entrypoint
entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = ProgramInstruction::try_from_slice(instruction_data)?;

    match instruction {
        ProgramInstruction::CreateProfile { username } => {
            msg!("Instruction: Create Profile");
            process_create_profile(accounts, username)
        }
        ProgramInstruction::UpdateProfile { username } => {
            msg!("Instruction: Update Profile");
            process_update_profile(accounts, username)
        }
        ProgramInstruction::UpdateReputation { score_delta } => {
            msg!("Instruction: Update Reputation");
            process_update_reputation(accounts, score_delta)
        }
        ProgramInstruction::VerifyProfile => {
            msg!("Instruction: Verify Profile");
            process_verify_profile(accounts)
        }
        ProgramInstruction::RecordTradeCompletion => {
            msg!("Instruction: Record Trade Completion");
            process_record_trade_completion(accounts)
        }
        ProgramInstruction::RecordTradeDispute => {
            msg!("Instruction: Record Trade Dispute");
            process_record_trade_dispute(accounts)
        }
    }
}

fn process_create_profile(accounts: &[AccountInfo], username: String) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let profile_account = next_account_info(account_info_iter)?;
    let owner_account = next_account_info(account_info_iter)?;

    if !owner_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let profile = Profile {
        owner: *owner_account.key,
        username,
        reputation_score: 0,
        trades_completed: 0,
        trades_disputed: 0,
        is_verified: false,
        created_at: solana_program::clock::Clock::get()?.unix_timestamp,
        updated_at: solana_program::clock::Clock::get()?.unix_timestamp,
    };

    profile.serialize(&mut *profile_account.data.borrow_mut())?;
    msg!("Profile created successfully");
    Ok(())
}

fn process_update_profile(accounts: &[AccountInfo], username: Option<String>) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let profile_account = next_account_info(account_info_iter)?;
    let owner_account = next_account_info(account_info_iter)?;

    if !owner_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut profile = Profile::try_from_slice(&profile_account.data.borrow())?;
    if profile.owner != *owner_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    if let Some(new_username) = username {
        profile.username = new_username;
    }

    profile.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;
    profile.serialize(&mut *profile_account.data.borrow_mut())?;
    msg!("Profile updated successfully");
    Ok(())
}

fn process_update_reputation(accounts: &[AccountInfo], score_delta: i32) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let profile_account = next_account_info(account_info_iter)?;
    let authority_account = next_account_info(account_info_iter)?;

    if !authority_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut profile = Profile::try_from_slice(&profile_account.data.borrow())?;

    // Update reputation score, ensuring it doesn't underflow
    if score_delta < 0 && profile.reputation_score < score_delta.abs() as u32 {
        profile.reputation_score = 0;
    } else if score_delta < 0 {
        profile.reputation_score -= score_delta.abs() as u32;
    } else {
        profile.reputation_score += score_delta as u32;
    }

    profile.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;
    profile.serialize(&mut *profile_account.data.borrow_mut())?;
    msg!("Reputation updated successfully");
    Ok(())
}

fn process_verify_profile(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let profile_account = next_account_info(account_info_iter)?;
    let authority_account = next_account_info(account_info_iter)?;

    if !authority_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut profile = Profile::try_from_slice(&profile_account.data.borrow())?;
    profile.is_verified = true;
    profile.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;

    profile.serialize(&mut *profile_account.data.borrow_mut())?;
    msg!("Profile verified successfully");
    Ok(())
}

fn process_record_trade_completion(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let profile_account = next_account_info(account_info_iter)?;
    let _trade_program_account = next_account_info(account_info_iter)?;

    // Verify the trade program account
    // In production, you would verify this is the actual trade program

    let mut profile = Profile::try_from_slice(&profile_account.data.borrow())?;
    profile.trades_completed += 1;
    profile.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;

    profile.serialize(&mut *profile_account.data.borrow_mut())?;
    msg!("Trade completion recorded successfully");
    Ok(())
}

fn process_record_trade_dispute(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let profile_account = next_account_info(account_info_iter)?;
    let _trade_program_account = next_account_info(account_info_iter)?;

    // Verify the trade program account
    // In production, you would verify this is the actual trade program

    let mut profile = Profile::try_from_slice(&profile_account.data.borrow())?;
    profile.trades_disputed += 1;
    profile.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;

    profile.serialize(&mut *profile_account.data.borrow_mut())?;
    msg!("Trade dispute recorded successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    
    // Add tests here
}
