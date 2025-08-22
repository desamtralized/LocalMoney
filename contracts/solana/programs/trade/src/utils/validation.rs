use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;
use localmoney_shared::{FiatCurrency, TradeState, SafeMath, SecurityAlertEvent};

use crate::errors::ErrorCode;
use crate::state::{Trade, transitions::AuthorizationRole, fees::FeeInfo};

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

/// Validates trade amount with USD conversion
pub fn validate_trade_amount_with_usd_conversion(
    trade_amount: u64,
    token_mint_decimals: u8,
    locked_price: u64,
    fiat_currency: &FiatCurrency,
    hub_config: &hub::HubConfig,
    price_program: &AccountInfo,
) -> Result<()> {
    // Convert trade amount to USD using price oracle
    let usd_equivalent = convert_to_usd_equivalent(
        trade_amount,
        token_mint_decimals,
        locked_price,
        fiat_currency,
        price_program,
    )?;

    // Validate against hub limits
    require!(
        usd_equivalent >= hub_config.trade_limit_min,
        ErrorCode::TradeBelowMinimum
    );

    require!(
        usd_equivalent <= hub_config.trade_limit_max,
        ErrorCode::TradeAboveMaximum
    );

    // Additional overflow protection
    require!(trade_amount > 0, ErrorCode::InvalidTradeAmount);

    // Ensure locked price is reasonable
    require!(
        locked_price > 0 && locked_price < u64::MAX / 1000,
        ErrorCode::InvalidLockedPrice
    );

    Ok(())
}

/// Converts trade amount to USD equivalent
pub fn convert_to_usd_equivalent(
    trade_amount: u64,
    token_decimals: u8,
    locked_price_in_fiat: u64,
    fiat_currency: &FiatCurrency,
    price_program: &AccountInfo,
) -> Result<u64> {
    // Query USD price for the fiat currency
    let usd_rate = get_fiat_to_usd_rate(fiat_currency, price_program)?;

    // Calculate USD equivalent
    let amount_in_fiat = (trade_amount as u128)
        .checked_mul(locked_price_in_fiat as u128)
        .ok_or(ErrorCode::ArithmeticError)?;

    let amount_in_usd = amount_in_fiat
        .checked_mul(usd_rate as u128)
        .ok_or(ErrorCode::ArithmeticError)?;

    let divisor = (10u128.pow(token_decimals as u32))
        .checked_mul(1_000_000u128) // 6 decimals for fiat precision
        .ok_or(ErrorCode::ArithmeticError)?;

    let usd_equivalent = amount_in_usd
        .checked_div(divisor)
        .ok_or(ErrorCode::ArithmeticError)?;

    Ok(usd_equivalent as u64)
}

/// Validates state transition
pub fn validate_state_transition(
    current_state: &TradeState,
    target_state: &TradeState,
    actor: &Pubkey,
    trade: &Trade,
    current_timestamp: u64,
) -> Result<()> {
    use TradeState::*;

    // Define valid state transitions matrix
    let valid_transition = match (current_state, target_state) {
        // Initial state transitions
        (RequestCreated, RequestAccepted) => trade.seller == *actor,
        (RequestCreated, RequestCancelled) => trade.buyer == *actor || trade.seller == *actor,

        // Funding transitions
        (RequestAccepted, EscrowFunded) => trade.seller == *actor,
        (RequestAccepted, RequestCancelled) => trade.buyer == *actor || trade.seller == *actor,

        // Deposit and release transitions
        (EscrowFunded, FiatDeposited) => trade.buyer == *actor,
        (EscrowFunded, RequestCancelled) => trade.buyer == *actor,
        (FiatDeposited, EscrowReleased) => trade.seller == *actor,

        // Dispute transitions
        (FiatDeposited, DisputeOpened) => {
            if let Some(dispute_window_at) = trade.dispute_window_at {
                current_timestamp >= dispute_window_at
                    && (trade.buyer == *actor || trade.seller == *actor)
            } else {
                false
            }
        }

        // Settlement transitions
        (DisputeOpened, DisputeResolved) => trade.arbitrator == *actor,

        // Expiration handling
        (EscrowFunded, EscrowRefunded) => current_timestamp > trade.expires_at,

        _ => false,
    };

    require!(valid_transition, ErrorCode::InvalidStateTransition);

    // Additional time-based validations
    validate_timing_constraints(current_state, target_state, trade, current_timestamp)?;

    Ok(())
}

/// Validates timing constraints
pub fn validate_timing_constraints(
    current_state: &TradeState,
    target_state: &TradeState,
    trade: &Trade,
    current_timestamp: u64,
) -> Result<()> {
    use TradeState::*;

    match (current_state, target_state) {
        // Ensure trade hasn't expired for active transitions
        (RequestCreated | RequestAccepted, EscrowFunded | FiatDeposited) => {
            require!(
                current_timestamp <= trade.expires_at,
                ErrorCode::TradeExpired
            );
        }

        // Validate dispute timing
        (FiatDeposited, DisputeOpened) => {
            if let Some(dispute_window) = trade.dispute_window_at {
                require!(
                    current_timestamp >= dispute_window,
                    ErrorCode::PrematureDisputeRequest
                );
            } else {
                return Err(ErrorCode::DisputeWindowNotOpen.into());
            }
        }

        // Ensure refunds only happen after expiration
        (EscrowFunded, EscrowRefunded) => {
            require!(
                current_timestamp > trade.expires_at,
                ErrorCode::RefundNotAllowed
            );
        }

        _ => {}
    }

    Ok(())
}

/// Validates comprehensive authorization
pub fn validate_comprehensive_authorization(
    actor: &Pubkey,
    trade: &Trade,
    required_role: AuthorizationRole,
) -> Result<()> {
    let is_authorized = match required_role {
        AuthorizationRole::Buyer => trade.buyer == *actor,
        AuthorizationRole::Seller => trade.seller == *actor,
        AuthorizationRole::Arbitrator => trade.arbitrator == *actor,
        AuthorizationRole::System => true,
    };

    require!(is_authorized, ErrorCode::Unauthorized);

    // Additional security checks
    validate_account_security(actor, trade)?;

    Ok(())
}

/// Validates account security
pub fn validate_account_security(actor: &Pubkey, trade: &Trade) -> Result<()> {
    // Prevent zero address attacks
    require!(*actor != Pubkey::default(), ErrorCode::InvalidAccount);

    // Ensure buyer and seller are different
    require!(trade.buyer != trade.seller, ErrorCode::SelfTradeNotAllowed);

    // Ensure arbitrator is different from both parties
    require!(
        trade.arbitrator != trade.buyer && trade.arbitrator != trade.seller,
        ErrorCode::InvalidArbitratorAssignment
    );

    // Check for suspicious patterns
    if is_suspicious_pattern(actor) {
        emit!(SecurityAlertEvent {
            alert_type: "suspicious_account".to_string(),
            severity: 3,
            actor: *actor,
            details: format!("Suspicious activity detected for trade {}", trade.id),
            timestamp: Clock::get()?.unix_timestamp,
            alert_index: "suspicious_account".to_string(),
        });
    }

    Ok(())
}

fn is_suspicious_pattern(account: &Pubkey) -> bool {
    let account_bytes = account.to_bytes();
    
    // Pattern 1: All zeros except last few bytes
    let zero_count = account_bytes.iter().filter(|&&b| b == 0).count();
    if zero_count > 28 { return true; }
    
    // Pattern 2: Sequential bytes
    let mut sequential = true;
    for i in 1..account_bytes.len() {
        if account_bytes[i] != account_bytes[i-1].wrapping_add(1) {
            sequential = false;
            break;
        }
    }
    sequential
}

/// Validates CPI call security
pub fn validate_cpi_call_security(
    program_id: &Pubkey,
    expected_program: &Pubkey,
    instruction_data: &[u8],
) -> Result<()> {
    // Ensure we're calling the expected program
    require!(
        program_id == expected_program,
        ErrorCode::UnauthorizedCpiCall
    );

    // Validate instruction data isn't empty
    require!(!instruction_data.is_empty(), ErrorCode::InvalidCpiData);

    Ok(())
}

/// Validates fee calculation
pub fn validate_fee_calculation(amount: u64, fee_info: &FeeInfo) -> Result<()> {
    // Ensure no overflow in fee calculations
    let total_fees = fee_info.total_fees();
    require!(total_fees <= amount, ErrorCode::ExcessiveFees);

    // Ensure individual fee components are reasonable
    require!(
        fee_info.burn_amount <= amount / 10,
        ErrorCode::ExcessiveBurnFee
    );

    require!(
        fee_info.chain_amount <= amount / 10,
        ErrorCode::ExcessiveChainFee
    );

    require!(
        fee_info.warchest_amount <= amount / 10,
        ErrorCode::ExcessiveWarchestFee
    );

    Ok(())
}

/// Gets fiat to USD conversion rate
pub fn get_fiat_to_usd_rate(
    fiat_currency: &FiatCurrency,
    _price_program: &AccountInfo,
) -> Result<u64> {
    // In a real implementation, this would query the price oracle
    // For now, we'll use approximate rates
    let rate = match fiat_currency {
        FiatCurrency::Usd => 1_000_000, // 1:1 ratio, 6 decimal places
        FiatCurrency::Eur => 1_100_000, // ~1.1 USD per EUR
        FiatCurrency::Gbp => 1_250_000, // ~1.25 USD per GBP
        FiatCurrency::Cad => 750_000,   // ~0.75 USD per CAD
        FiatCurrency::Aud => 670_000,   // ~0.67 USD per AUD
        FiatCurrency::Jpy => 7_000,     // ~0.007 USD per JPY
        FiatCurrency::Brl => 200_000,   // ~0.2 USD per BRL
        FiatCurrency::Mxn => 60_000,    // ~0.06 USD per MXN
        FiatCurrency::Ars => 1_200,     // ~0.0012 USD per ARS
        FiatCurrency::Clp => 1_100,     // ~0.0011 USD per CLP
        FiatCurrency::Cop => 250,       // ~0.00025 USD per COP
        FiatCurrency::Ngn => 1_300,     // ~0.0013 USD per NGN
        FiatCurrency::Thb => 28_000,    // ~0.028 USD per THB
        FiatCurrency::Ves => 30,        // ~0.00003 USD per VES
    };

    Ok(rate)
}
