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
solana_program::declare_id!("Gpy5ATEJY5YawGqJhBd1Xcd59NZW547tCjH9d8s2B1vp");

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct Offer {
    pub creator: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub price_per_token: u64,
    pub min_amount: u64,
    pub max_amount: u64,
    pub payment_method: PaymentMethod,
    pub status: OfferStatus,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum PaymentMethod {
    BankTransfer {
        bank_name: String,
        account_info: String,
    },
    MobileMoney {
        provider: String,
        phone_number: String,
    },
    Other {
        name: String,
        details: String,
    },
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum OfferStatus {
    Active,
    Paused,
    Closed,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum ProgramInstruction {
    /// Create a new offer
    /// Accounts expected: [offer_account, creator_account, token_mint]
    CreateOffer {
        amount: u64,
        price_per_token: u64,
        min_amount: u64,
        max_amount: u64,
        payment_method: PaymentMethod,
    },

    /// Update an offer
    /// Accounts expected: [offer_account, creator_account]
    UpdateOffer {
        price_per_token: Option<u64>,
        min_amount: Option<u64>,
        max_amount: Option<u64>,
        payment_method: Option<PaymentMethod>,
    },

    /// Pause an offer
    /// Accounts expected: [offer_account, creator_account]
    PauseOffer,

    /// Resume an offer
    /// Accounts expected: [offer_account, creator_account]
    ResumeOffer,

    /// Close an offer
    /// Accounts expected: [offer_account, creator_account]
    CloseOffer,

    /// Take an offer (initiates a trade)
    /// Accounts expected: [offer_account, taker_account, trade_program]
    TakeOffer { amount: u64 },
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
        ProgramInstruction::CreateOffer {
            amount,
            price_per_token,
            min_amount,
            max_amount,
            payment_method,
        } => {
            msg!("Instruction: Create Offer");
            process_create_offer(
                accounts,
                amount,
                price_per_token,
                min_amount,
                max_amount,
                payment_method,
            )
        }
        ProgramInstruction::UpdateOffer {
            price_per_token,
            min_amount,
            max_amount,
            payment_method,
        } => {
            msg!("Instruction: Update Offer");
            process_update_offer(
                accounts,
                price_per_token,
                min_amount,
                max_amount,
                payment_method,
            )
        }
        ProgramInstruction::PauseOffer => {
            msg!("Instruction: Pause Offer");
            process_pause_offer(accounts)
        }
        ProgramInstruction::ResumeOffer => {
            msg!("Instruction: Resume Offer");
            process_resume_offer(accounts)
        }
        ProgramInstruction::CloseOffer => {
            msg!("Instruction: Close Offer");
            process_close_offer(accounts)
        }
        ProgramInstruction::TakeOffer { amount } => {
            msg!("Instruction: Take Offer");
            process_take_offer(accounts, amount)
        }
    }
}

fn process_create_offer(
    accounts: &[AccountInfo],
    amount: u64,
    price_per_token: u64,
    min_amount: u64,
    max_amount: u64,
    payment_method: PaymentMethod,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let offer_account = next_account_info(account_info_iter)?;
    let creator_account = next_account_info(account_info_iter)?;
    let token_mint = next_account_info(account_info_iter)?;

    if !creator_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Validate amounts
    if min_amount > max_amount || max_amount > amount {
        return Err(ProgramError::InvalidArgument);
    }

    let offer = Offer {
        creator: *creator_account.key,
        token_mint: *token_mint.key,
        amount,
        price_per_token,
        min_amount,
        max_amount,
        payment_method,
        status: OfferStatus::Active,
        created_at: solana_program::clock::Clock::get()?.unix_timestamp,
        updated_at: solana_program::clock::Clock::get()?.unix_timestamp,
    };

    offer.serialize(&mut *offer_account.data.borrow_mut())?;
    msg!("Offer created successfully");
    Ok(())
}

fn process_update_offer(
    accounts: &[AccountInfo],
    price_per_token: Option<u64>,
    min_amount: Option<u64>,
    max_amount: Option<u64>,
    payment_method: Option<PaymentMethod>,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let offer_account = next_account_info(account_info_iter)?;
    let creator_account = next_account_info(account_info_iter)?;

    if !creator_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut offer = Offer::try_from_slice(&offer_account.data.borrow())?;
    if offer.creator != *creator_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    if let Some(new_price) = price_per_token {
        offer.price_per_token = new_price;
    }

    if let Some(new_min) = min_amount {
        offer.min_amount = new_min;
    }

    if let Some(new_max) = max_amount {
        offer.max_amount = new_max;
    }

    if let Some(new_payment_method) = payment_method {
        offer.payment_method = new_payment_method;
    }

    // Validate amounts after update
    if offer.min_amount > offer.max_amount || offer.max_amount > offer.amount {
        return Err(ProgramError::InvalidArgument);
    }

    offer.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;
    offer.serialize(&mut *offer_account.data.borrow_mut())?;
    msg!("Offer updated successfully");
    Ok(())
}

fn process_pause_offer(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let offer_account = next_account_info(account_info_iter)?;
    let creator_account = next_account_info(account_info_iter)?;

    if !creator_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut offer = Offer::try_from_slice(&offer_account.data.borrow())?;
    if offer.creator != *creator_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    if offer.status != OfferStatus::Active {
        return Err(ProgramError::InvalidAccountData);
    }

    offer.status = OfferStatus::Paused;
    offer.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;
    offer.serialize(&mut *offer_account.data.borrow_mut())?;
    msg!("Offer paused successfully");
    Ok(())
}

fn process_resume_offer(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let offer_account = next_account_info(account_info_iter)?;
    let creator_account = next_account_info(account_info_iter)?;

    if !creator_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut offer = Offer::try_from_slice(&offer_account.data.borrow())?;
    if offer.creator != *creator_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    if offer.status != OfferStatus::Paused {
        return Err(ProgramError::InvalidAccountData);
    }

    offer.status = OfferStatus::Active;
    offer.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;
    offer.serialize(&mut *offer_account.data.borrow_mut())?;
    msg!("Offer resumed successfully");
    Ok(())
}

fn process_close_offer(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let offer_account = next_account_info(account_info_iter)?;
    let creator_account = next_account_info(account_info_iter)?;

    if !creator_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut offer = Offer::try_from_slice(&offer_account.data.borrow())?;
    if offer.creator != *creator_account.key {
        return Err(ProgramError::InvalidAccountData);
    }

    offer.status = OfferStatus::Closed;
    offer.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;
    offer.serialize(&mut *offer_account.data.borrow_mut())?;
    msg!("Offer closed successfully");
    Ok(())
}

fn process_take_offer(accounts: &[AccountInfo], amount: u64) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let offer_account = next_account_info(account_info_iter)?;
    let taker_account = next_account_info(account_info_iter)?;
    let _trade_program = next_account_info(account_info_iter)?;

    if !taker_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let offer = Offer::try_from_slice(&offer_account.data.borrow())?;
    if offer.status != OfferStatus::Active {
        return Err(ProgramError::InvalidAccountData);
    }

    if amount < offer.min_amount || amount > offer.max_amount {
        return Err(ProgramError::InvalidArgument);
    }

    // Here we would create a new trade using the trade program
    // This would involve a CPI call to the trade program

    msg!("Offer taken successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    
    // Add tests here
}
