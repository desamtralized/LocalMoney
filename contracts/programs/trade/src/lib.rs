use borsh::{BorshDeserialize, BorshSerialize};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::{invoke},
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::{rent::Rent, Sysvar},
};
use spl_token::instruction as token_instruction;


// Declare program ID
solana_program::declare_id!("ENJvkqkwjEKd2CPd9NgcwEywx6ia3tCrvHE1ReZGac8t");

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct Trade {
    pub seller: Pubkey,
    pub buyer: Option<Pubkey>,
    pub amount: u64,
    pub price: u64,
    pub token_mint: Pubkey,
    pub escrow_account: Pubkey,
    pub status: TradeStatus,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum TradeStatus {
    Open,
    InProgress,
    Completed,
    Cancelled,
    Disputed,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum ProgramInstruction {
    /// Initialize a new trade
    /// Accounts expected: [trade_account, seller_account, token_mint, escrow_account]
    CreateTrade { amount: u64, price: u64 },

    /// Accept a trade
    /// Accounts expected: [trade_account, buyer_account]
    AcceptTrade,

    /// Complete a trade
    /// Accounts expected: [trade_account, seller_account, buyer_account, escrow_account, seller_token_account]
    CompleteTrade,

    /// Cancel a trade
    /// Accounts expected: [trade_account, seller_account, escrow_account, seller_token_account]
    CancelTrade,

    /// Dispute a trade
    /// Accounts expected: [trade_account, disputer_account]
    DisputeTrade,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TradeState {
    pub is_initialized: bool,
    pub admin: Pubkey,
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
        ProgramInstruction::CreateTrade { amount, price } => {
            msg!("Instruction: Create Trade");
            process_create_trade(program_id, accounts, amount, price)
        }
        ProgramInstruction::AcceptTrade => {
            msg!("Instruction: Accept Trade");
            process_accept_trade(accounts)
        }
        ProgramInstruction::CompleteTrade => {
            msg!("Instruction: Complete Trade");
            process_complete_trade(accounts)
        }
        ProgramInstruction::CancelTrade => {
            msg!("Instruction: Cancel Trade");
            process_cancel_trade(accounts)
        }
        ProgramInstruction::DisputeTrade => {
            msg!("Instruction: Dispute Trade");
            process_dispute_trade(accounts)
        }
    }
}

fn process_create_trade(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
    price: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let trade_account = next_account_info(account_info_iter)?;
    let seller_account = next_account_info(account_info_iter)?;
    let token_mint = next_account_info(account_info_iter)?;
    let escrow_account = next_account_info(account_info_iter)?;

    if !seller_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let trade = Trade {
        seller: *seller_account.key,
        buyer: None,
        amount,
        price,
        token_mint: *token_mint.key,
        escrow_account: *escrow_account.key,
        status: TradeStatus::Open,
        created_at: solana_program::clock::Clock::get()?.unix_timestamp,
        updated_at: solana_program::clock::Clock::get()?.unix_timestamp,
    };

    trade.serialize(&mut *trade_account.data.borrow_mut())?;

    // Create escrow account and transfer tokens
    let _rent = Rent::get()?;
    let transfer_instruction = token_instruction::transfer(
        &spl_token::id(),
        &seller_account.key,
        &escrow_account.key,
        &seller_account.key,
        &[&seller_account.key],
        amount,
    )?;
    invoke(&transfer_instruction, accounts)?;

    msg!("Trade created successfully");
    Ok(())
}

fn process_accept_trade(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let trade_account = next_account_info(account_info_iter)?;
    let buyer_account = next_account_info(account_info_iter)?;

    if !buyer_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut trade = Trade::try_from_slice(&trade_account.data.borrow())?;
    if trade.status != TradeStatus::Open {
        return Err(ProgramError::InvalidAccountData);
    }

    trade.buyer = Some(*buyer_account.key);
    trade.status = TradeStatus::InProgress;
    trade.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;

    trade.serialize(&mut *trade_account.data.borrow_mut())?;
    msg!("Trade accepted successfully");
    Ok(())
}

fn process_complete_trade(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let trade_account = next_account_info(account_info_iter)?;
    let seller_account = next_account_info(account_info_iter)?;
    let buyer_account = next_account_info(account_info_iter)?;
    let escrow_account = next_account_info(account_info_iter)?;
    let _seller_token_account = next_account_info(account_info_iter)?;

    if !seller_account.is_signer || !buyer_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut trade = Trade::try_from_slice(&trade_account.data.borrow())?;
    if trade.status != TradeStatus::InProgress {
        return Err(ProgramError::InvalidAccountData);
    }

    // Transfer tokens from escrow to buyer
    let transfer_instruction = token_instruction::transfer(
        &spl_token::id(),
        &escrow_account.key,
        &buyer_account.key,
        &seller_account.key,
        &[&seller_account.key],
        trade.amount,
    )?;
    invoke(&transfer_instruction, accounts)?;

    trade.status = TradeStatus::Completed;
    trade.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;

    trade.serialize(&mut *trade_account.data.borrow_mut())?;
    msg!("Trade completed successfully");
    Ok(())
}

fn process_cancel_trade(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let trade_account = next_account_info(account_info_iter)?;
    let seller_account = next_account_info(account_info_iter)?;
    let escrow_account = next_account_info(account_info_iter)?;
    let seller_token_account = next_account_info(account_info_iter)?;

    if !seller_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut trade = Trade::try_from_slice(&trade_account.data.borrow())?;
    if trade.status != TradeStatus::Open {
        return Err(ProgramError::InvalidAccountData);
    }

    // Return tokens from escrow to seller
    let transfer_instruction = token_instruction::transfer(
        &spl_token::id(),
        &escrow_account.key,
        &seller_token_account.key,
        &seller_account.key,
        &[&seller_account.key],
        trade.amount,
    )?;
    invoke(&transfer_instruction, accounts)?;

    trade.status = TradeStatus::Cancelled;
    trade.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;

    trade.serialize(&mut *trade_account.data.borrow_mut())?;
    msg!("Trade cancelled successfully");
    Ok(())
}

fn process_dispute_trade(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let trade_account = next_account_info(account_info_iter)?;
    let disputer_account = next_account_info(account_info_iter)?;

    if !disputer_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut trade = Trade::try_from_slice(&trade_account.data.borrow())?;
    if trade.status != TradeStatus::InProgress {
        return Err(ProgramError::InvalidAccountData);
    }

    // Verify disputer is either buyer or seller
    if trade.seller != *disputer_account.key && trade.buyer != Some(*disputer_account.key) {
        return Err(ProgramError::InvalidAccountData);
    }

    trade.status = TradeStatus::Disputed;
    trade.updated_at = solana_program::clock::Clock::get()?.unix_timestamp;

    trade.serialize(&mut *trade_account.data.borrow_mut())?;
    msg!("Trade disputed successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    
    // Add tests here
}
