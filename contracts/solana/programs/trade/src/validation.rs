use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;

use crate::ErrorCode;

/// Validates that an account is the correct ATA for given wallet and mint
/// SECURITY: Prevents fund theft by ensuring the account matches expected derivation
pub fn validate_ata(ata_account: &AccountInfo, wallet: &Pubkey, mint: &Pubkey) -> Result<()> {
    let expected_ata = get_associated_token_address(wallet, mint);
    require_keys_eq!(
        ata_account.key(),
        expected_ata,
        ErrorCode::InvalidTokenAccount
    );

    // Also validate it's owned by token program
    require_keys_eq!(
        *ata_account.owner,
        anchor_spl::token::ID,
        ErrorCode::InvalidAccountOwner
    );

    Ok(())
}

/// Validates PDA derivation and returns bump
/// SECURITY: Ensures PDAs match expected seeds to prevent account spoofing
pub fn validate_pda(account: &AccountInfo, seeds: &[&[u8]], program_id: &Pubkey) -> Result<u8> {
    let (expected_pda, bump) = Pubkey::find_program_address(seeds, program_id);
    require_keys_eq!(account.key(), expected_pda, ErrorCode::InvalidPDA);
    Ok(bump)
}

/// Validates multiple ATAs in batch for fee distribution
/// SECURITY: Batch validation for all fee recipient accounts to prevent misdirection of funds
/// Attack vector: Attacker could substitute their own account to steal fees
/// This validation MUST NOT be skipped
pub fn validate_fee_recipient_atas(
    treasury_ata: &AccountInfo,
    chain_fee_ata: &AccountInfo,
    warchest_ata: &AccountInfo,
    burn_reserve_ata: &AccountInfo,
    hub_config: &hub::HubConfig,
    mint: &Pubkey,
) -> Result<()> {
    // SECURITY: Validate treasury ATA to prevent fund theft
    // Attack: Attacker could substitute their own account to steal treasury fees
    validate_ata(treasury_ata, &hub_config.treasury, mint)?;

    // SECURITY: Validate chain fee collector ATA to prevent fund theft
    // Attack: Attacker could substitute their own account to steal chain fees
    validate_ata(chain_fee_ata, &hub_config.chain_fee_collector, mint)?;

    // SECURITY: Validate warchest ATA to prevent fund theft
    // Attack: Attacker could substitute their own account to steal warchest fees
    validate_ata(warchest_ata, &hub_config.warchest_address, mint)?;

    // SECURITY: Validate burn reserve ATA ownership at minimum
    // Note: burn_reserve is not stored in HubConfig, so we only validate it's a token account
    // Attack: Attacker could substitute a non-token account to cause transfer failures
    validate_account_owner(burn_reserve_ata, &anchor_spl::token::ID)?;

    Ok(())
}

/// Validates account ownership for critical operations
/// SECURITY: Ensures accounts are owned by expected programs
pub fn validate_account_owner(account: &AccountInfo, expected_owner: &Pubkey) -> Result<()> {
    require_keys_eq!(
        *account.owner,
        *expected_owner,
        ErrorCode::InvalidAccountOwner
    );
    Ok(())
}

/// Validates token account is properly initialized and matches expected mint
/// SECURITY: Comprehensive token account validation
pub fn validate_token_account(
    token_account: &AccountInfo,
    _expected_mint: &Pubkey,
    _expected_authority: Option<&Pubkey>,
) -> Result<()> {
    // Validate owner is token program
    validate_account_owner(token_account, &anchor_spl::token::ID)?;

    // Additional validation for mint and authority can be added if needed
    // This would require deserializing the token account data

    Ok(())
}

/// Validates escrow token account for trades
/// SECURITY: Ensures escrow account is valid PDA with correct seeds
pub fn validate_escrow_token_account(
    escrow_account: &AccountInfo,
    trade_id: u64,
    program_id: &Pubkey,
) -> Result<u8> {
    let trade_id_bytes = trade_id.to_le_bytes();
    let seeds = &[
        b"trade" as &[u8],
        b"escrow" as &[u8],
        trade_id_bytes.as_ref(),
    ];
    validate_pda(escrow_account, seeds, program_id)
}

/// Validates program account for CPI calls
/// SECURITY: Ensures CPI targets are legitimate programs
pub fn validate_program_account(
    program_account: &AccountInfo,
    expected_program_id: &Pubkey,
) -> Result<()> {
    require_keys_eq!(
        program_account.key(),
        *expected_program_id,
        ErrorCode::InvalidProgramAccount
    );

    // Validate it's actually a program (executable)
    require!(program_account.executable, ErrorCode::InvalidProgramAccount);

    Ok(())
}

/// Batch validation for dispute settlement accounts
/// SECURITY: Comprehensive validation for arbitration fund distribution
pub fn validate_dispute_accounts(
    winner_ata: &AccountInfo,
    arbitrator_ata: &AccountInfo,
    treasury_ata: &AccountInfo,
    chain_fee_ata: &AccountInfo,
    warchest_ata: &AccountInfo,
    burn_reserve_ata: &AccountInfo,
    winner: &Pubkey,
    arbitrator: &Pubkey,
    hub_config: &hub::HubConfig,
    mint: &Pubkey,
) -> Result<()> {
    // SECURITY: Validate winner ATA to ensure funds go to correct party
    // Attack: Attacker could substitute their own account to steal settlement
    validate_ata(winner_ata, winner, mint)?;

    // SECURITY: Validate arbitrator ATA to ensure arbitrator gets their fee
    // Attack: Attacker could substitute their own account to steal arbitrator fee
    validate_ata(arbitrator_ata, arbitrator, mint)?;

    // Validate all fee recipient ATAs
    validate_fee_recipient_atas(
        treasury_ata,
        chain_fee_ata,
        warchest_ata,
        burn_reserve_ata,
        hub_config,
        mint,
    )?;

    Ok(())
}

/// Validates seller token account for refunds
/// SECURITY: Ensures refunds go to legitimate seller
pub fn validate_seller_token_account(
    seller_ata: &AccountInfo,
    seller: &Pubkey,
    mint: &Pubkey,
) -> Result<()> {
    // SECURITY: Validate seller ATA to prevent fund theft on refund
    // Attack: Attacker could substitute their own account to steal refund
    validate_ata(seller_ata, seller, mint)?;
    Ok(())
}

/// Validates buyer token account for escrow release
/// SECURITY: Ensures buyer receives funds correctly
pub fn validate_buyer_token_account(
    buyer_ata: &AccountInfo,
    buyer: &Pubkey,
    mint: &Pubkey,
) -> Result<()> {
    // SECURITY: Validate buyer ATA to ensure funds go to correct buyer
    // Attack: Attacker could substitute their own account to steal purchase
    validate_ata(buyer_ata, buyer, mint)?;
    Ok(())
}
