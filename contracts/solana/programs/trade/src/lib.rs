use anchor_lang::prelude::*;
// Assuming the following paths are correct after Cargo.toml setup
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};
use offer::program::Offer as OfferProgram; // To refer to the Offer program ID
use offer::Offer as OfferAccountData; // To refer to the Offer account data structure
use price::program::Price as PriceProgram; // To refer to the Price program ID
use price::CalculatedPriceAccount; // To refer to the Price account data structure

// Imports for Profile CPI
use profile::program::Profile as ProfileProgram;
use profile::{
    Profile as ProfileAccountData,
    TradeStateForProfileUpdate,
    HubConfigStub as ProfileHubConfigStub,
    ProfileGlobalState as ProfileGlobalStateAccount
};

// PLACEHOLDER: These would normally be imported from the hub crate
// mod hub_program_placeholder {
//     use anchor_lang::prelude::*;
//     declare_id!("HubProg1111111111111111111111111111111111"); // Placeholder Hub Program ID
//     #[program]
//     pub mod hub {
//         // Define hub program functions if needed for CPI, not for account deserialization
//     }
// }
// #[derive(Clone)]
// pub struct Hub; // Placeholder for HubProgram type for Program<'info, Hub>
// impl anchor_lang::Id for Hub {
//     fn id() -> Pubkey {
//         // This should be the actual Hub Program ID, fetched from trade_global_state.hub_address if it stores it,
//         // or hardcoded/imported if known at compile time. For now, a placeholder.
//         // For accessing HubConfigAccount, we'll use trade_global_state.hub_address as the program_id.
//         Pubkey::new_from_array([0u8; 32]) // Default, will be replaced by actual hub_address
//     }
// }


// This placeholder should align with the actual HubConfig definition in the Hub program.
// It's defined here temporarily to allow Trade program development.
#[account]
#[derive(InitSpace, Debug)] // Added Debug
pub struct HubConfigAccount {
    pub admin_addr: Pubkey, // Example field from full spec
    // Fields relevant for trade fees
    pub chain_fee_collector_addr: Pubkey,
    pub warchest_addr: Pubkey,
    pub burn_fee_basis_points: u16,     // e.g., 100 basis_points = 1%
    pub chain_fee_basis_points: u16,
    pub warchest_fee_basis_points: u16,
    // Other fields from full spec that affect size or might be needed
    pub offer_addr: Pubkey,
    pub trade_addr: Pubkey,
    pub profile_addr: Pubkey,
    pub price_addr: Pubkey,
    pub price_provider_addr: Pubkey,
    pub local_market_addr: Pubkey,
    #[max_len(8)]
    pub local_denom: String, // Assuming Denom is a string symbol
    pub active_offers_limit: u8,
    pub active_trades_limit: u8,
    pub trade_expiration_timer: u64, // seconds
    pub trade_dispute_timer: u64,    // seconds
    pub trade_limit_min: u128,       // in USD (represented as u128 for large values)
    pub trade_limit_max: u128,
    pub bump: u8, // PDA bump for HubConfig itself
}
// END PLACEHOLDERS

declare_id!("TradZuT9g8uYmRqwL2hD5mCEvRztzAnQhND2BxAQKz2"); // New placeholder ID for Trade program

#[program]
pub mod trade {
    use super::*;
    // Placeholder initialize, actual init for global state will be added
    pub fn initialize_trade_global_state(ctx: Context<InitializeTradeGlobalState>) -> Result<()> {
        let global_state = &mut ctx.accounts.trade_global_state;
        global_state.trades_count = 0;
        global_state.hub_address = Pubkey::default(); // Not registered yet
        global_state.bump = ctx.bumps.trade_global_state;
        Ok(())
    }

    pub fn create_trade(
        ctx: Context<CreateTrade>,
        offer_id_arg: u64, // Passed to help derive offer_account if not directly used in seeds by trade program itself for trade_account
        crypto_amount_to_trade: u64,
        buyer_contact_info_arg: Option<String>,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;

        let offer_account = &ctx.accounts.offer_account;
        let price_account = &ctx.accounts.price_account;

        // Validation 1: Buyer cannot trade with themselves
        require_keys_neq!(
            ctx.accounts.buyer.key(),
            offer_account.owner,
            TradeError::BuyerIsOfferOwner
        );

        // Validation 2: Offer must be active
        // Assuming offer::OfferStateAnchor::Active exists and is the correct variant name
        require!(
            offer_account.state == offer::OfferStateAnchor::Active,
            TradeError::OfferNotActive
        );

        // Validation 3: Amount is within offer limits
        require!(
            crypto_amount_to_trade >= offer_account.min_amount
                && crypto_amount_to_trade <= offer_account.max_amount,
            TradeError::AmountOutOfOfferRange
        );

        // Validation 4: Price account matches offer details
        require_eq!(
            &price_account.denom_symbol,
            &offer_account.denom,
            TradeError::PriceAccountMismatch
        );
        require_eq!(
            &price_account.fiat_symbol,
            &offer_account.fiat_currency,
            TradeError::PriceAccountMismatch
        );
        // TODO: Add check for price_account.last_updated_at_timestamp freshness (e.g., against HubConfig.max_price_age)

        let trade_global_state = &mut ctx.accounts.trade_global_state;
        let new_trade_id = trade_global_state.trades_count;

        trade_global_state.trades_count = trade_global_state
            .trades_count
            .checked_add(1)
            .ok_or(TradeError::TradeIdOverflow)?;

        let trade_account = &mut ctx.accounts.trade_account;
        trade_account.id = new_trade_id;
        trade_account.offer_id = offer_id_arg; // Using offer_id_arg passed, which should match offer_account.id
        trade_account.buyer = ctx.accounts.buyer.key();
        trade_account.seller = offer_account.owner;
        trade_account.crypto_denom_symbol = offer_account.denom.clone();
        trade_account.crypto_amount = crypto_amount_to_trade;
        trade_account.fiat_currency_symbol = offer_account.fiat_currency.clone();
        trade_account.exchange_rate = price_account.price;
        trade_account.exchange_rate_decimals = price_account.decimals;
        trade_account.state = TradeState::RequestCreated;

        // Determine EscrowType and escrow_mint_address (Simplified)
        if trade_account.crypto_denom_symbol == "SOL" {
            trade_account.escrow_type = EscrowType::Native;
            trade_account.escrow_mint_address = None;
        } else {
            trade_account.escrow_type = EscrowType::Spl;
            // TODO: Determine escrow_mint_address. For now, None.
            // This should ideally come from offer_account if it stored the mint,
            // or a trusted registry based on offer_account.denom_symbol.
            trade_account.escrow_mint_address = None; // Placeholder
        }

        trade_account.escrow_crypto_funded_amount = 0;
        trade_account.created_at_ts = current_timestamp;
        trade_account.updated_at_ts = current_timestamp;

        // TODO: Fetch trade_creation_expiry_seconds from HubConfig
        let trade_creation_expiry_seconds: i64 = 3600 * 24; // Placeholder: 1 day
        trade_account.expires_at_ts = current_timestamp
            .checked_add(trade_creation_expiry_seconds)
            .ok_or(TradeError::TimestampOverflow)?;

        trade_account.dispute_window_ends_at_ts = None;
        trade_account.buyer_contact_info = buyer_contact_info_arg;
        trade_account.seller_contact_info = Some(offer_account.owner_contact.clone()); // Prefill from offer
        trade_account.arbitrator = None;
        trade_account.bump = ctx.bumps.trade_account;

        msg!("Trade #{} created between buyer {} and seller {} for offer #{}. Crypto Amount: {}, Fiat: {}, Rate: {} ({} dec)", 
            new_trade_id, 
            trade_account.buyer, 
            trade_account.seller,
            trade_account.offer_id,
            trade_account.crypto_amount,
            trade_account.fiat_currency_symbol,
            trade_account.exchange_rate,
            trade_account.exchange_rate_decimals
        );
        
        // CPI to Profile program for buyer
        let cpi_accounts_buyer = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.buyer_profile.to_account_info(),
            profile_authority: ctx.accounts.buyer.to_account_info(), // Buyer is the authority for their profile
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state_for_buyer.to_account_info(),
        };
        let cpi_program_buyer = ctx.accounts.profile_program.to_account_info();
        let cpi_ctx_buyer = CpiContext::new(cpi_program_buyer, cpi_accounts_buyer);
        profile::cpi::update_trades_count(cpi_ctx_buyer, TradeStateForProfileUpdate::RequestCreated)?;

        // CPI to Profile program for seller
        // The seller's profile authority is trade_account.seller (which is offer_account.owner)
        // We need to pass this as an AccountInfo to the CPI context.
        // It's not a signer in CreateTrade, so it must be passed as an unchecked AccountInfo if not already present.
        // For UpdateTradesCount, profile_authority is a CHECKED AccountInfo, but its check is just `profile.authority == profile_authority.key()`
        // This means we need an AccountInfo for trade_account.seller.
        // We can use ctx.accounts.seller_profile_authority_account_info for this.

        let cpi_accounts_seller = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.seller_profile.to_account_info(),
            profile_authority: ctx.accounts.seller_profile_authority_account_info.to_account_info(),
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(), // Can reuse the same hub_config
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(), // Can reuse
            profile_global_state: ctx.accounts.profile_global_state_for_seller.to_account_info(),
        };
        let cpi_program_seller = ctx.accounts.profile_program.to_account_info(); // Can reuse
        let cpi_ctx_seller = CpiContext::new(cpi_program_seller, cpi_accounts_seller);
        // Assuming RequestCreated also affects seller's requested_trades_count or a similar counter.
        // The CosmWasm spec for profile.update_trades_count mentions:
        // TradeState::RequestCreated => profile.requested_trades_count += 1;
        // This seems to apply to the profile of the user involved in the request.
        // So, for the seller (offer owner), this is an incoming request.
        profile::cpi::update_trades_count(cpi_ctx_seller, TradeStateForProfileUpdate::RequestCreated)?;

        Ok(())
    }

    pub fn accept_trade(
        ctx: Context<AcceptTrade>,
        _trade_id_arg: u64, 
        seller_contact_info_arg: Option<String>,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;
        let trade_account = &mut ctx.accounts.trade_account;

        // Validation 1: Caller must be the seller designated in the trade account
        // This is already enforced by `has_one = seller` in `AcceptTrade` Accounts struct.
        // require_keys_eq!(ctx.accounts.seller.key(), trade_account.seller, TradeError::NotTradeSeller);

        // Validation 2: Trade must be in RequestCreated state
        require_eq!(
            trade_account.state,
            TradeState::RequestCreated,
            TradeError::InvalidTradeState
        );

        // Update trade state
        trade_account.state = TradeState::RequestAccepted;
        trade_account.updated_at_ts = current_timestamp;

        // Update seller contact info if provided
        if let Some(contact_info) = seller_contact_info_arg {
            trade_account.seller_contact_info = Some(contact_info);
        }

        // TODO: Update expires_at_ts for the next phase (e.g., funding deadline from HubConfig)
        // let funding_expiry_seconds: i64 = 3600 * 24 * 2; // Placeholder: 2 days
        // trade_account.expires_at_ts = current_timestamp.checked_add(funding_expiry_seconds).ok_or(TradeError::TimestampOverflow)?;

        msg!("Trade #{} accepted by seller {}. State: {:?}. Buyer contact: {:?}, Seller contact: {:?}", 
            trade_account.id, 
            trade_account.seller, 
            trade_account.state,
            trade_account.buyer_contact_info,
            trade_account.seller_contact_info
        );

        // CPI to Profile program for seller
        let cpi_accounts_seller = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.seller_profile.to_account_info(),
            profile_authority: ctx.accounts.seller.to_account_info(), // Seller is the authority
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state_for_seller.to_account_info(),
        };
        let cpi_program_profile = ctx.accounts.profile_program.to_account_info();
        let cpi_ctx_seller = CpiContext::new(cpi_program_profile.clone(), cpi_accounts_seller);
        profile::cpi::update_trades_count(cpi_ctx_seller, TradeStateForProfileUpdate::RequestAcceptedOrEscrowFunded)?;

        // CPI to Profile program for buyer
        let cpi_accounts_buyer = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.buyer_profile.to_account_info(),
            profile_authority: ctx.accounts.buyer_profile_authority_account_info.to_account_info(), // Buyer's authority passed as AccountInfo
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state_for_buyer.to_account_info(),
        };
        let cpi_ctx_buyer = CpiContext::new(cpi_program_profile, cpi_accounts_buyer);
        profile::cpi::update_trades_count(cpi_ctx_buyer, TradeStateForProfileUpdate::RequestAcceptedOrEscrowFunded)?;

        Ok(())
    }

    pub fn fund_trade_escrow(
        ctx: Context<FundTradeEscrow>,
        _trade_id_arg: u64, 
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;
        let trade_account = &mut ctx.accounts.trade_account;

        // Validation 1: Caller must be the seller (funder)
        // This is implicitly handled by has_one constraint on trade_account in FundTradeEscrow Accounts struct.

        // Validation 2: Trade must be in RequestAccepted state
        require_eq!(
            trade_account.state,
            TradeState::RequestAccepted,
            TradeError::InvalidTradeState
        );

        // Validation 3: Escrow must not be already funded (idempotency check, though state check above helps)
        require_eq!(
            trade_account.escrow_crypto_funded_amount,
            0,
            TradeError::EscrowAlreadyFunded
        );

        // Determine escrow type and handle funding
        match trade_account.escrow_type {
            EscrowType::Native => {
                // Ensure no SPL accounts were accidentally provided
                require!(
                    ctx.accounts.funder_token_account.is_none()
                        && ctx.accounts.escrow_vault_token_account.is_none()
                        && ctx.accounts.token_program.is_none(),
                    TradeError::EscrowTypeNotSupported // Or a more specific error
                );

                // Check if the crypto_amount is > 0 to prevent empty funding
                require!(
                    trade_account.crypto_amount > 0,
                    TradeError::EscrowAmountMismatch // Or specific "AmountMustBeGreaterThanZero"
                );

                let trade_pda_info = trade_account.to_account_info(); // Get AccountInfo from mutable borrow

                // Transfer native SOL from funder to trade_account PDA
                let transfer_instruction = anchor_lang::solana_program::system_instruction::transfer(
                    &ctx.accounts.funder.key(),        // from
                    &trade_pda_info.key, // to: trade PDA, use key from stored AccountInfo
                    trade_account.crypto_amount,       // lamports (read from mut borrow is fine here)
                );
                anchor_lang::solana_program::program::invoke(
                    &transfer_instruction,
                    &[
                        ctx.accounts.funder.to_account_info(),
                        trade_pda_info.clone(), // Use cloned AccountInfo for invoke
                        ctx.accounts.system_program.to_account_info(),
                    ],
                )?;
                trade_account.escrow_crypto_funded_amount = trade_account.crypto_amount;
                msg!(
                    "Native SOL escrow funded for trade #{}. Amount: {}",
                    trade_account.id,
                    trade_account.crypto_amount
                );
            }
            EscrowType::Spl => {
                msg!("Funding SPL token escrow for trade #{}", trade_account.id);
                let mint_pubkey = trade_account
                    .escrow_mint_address
                    .ok_or(TradeError::MissingEscrowMint)?;

                // Ensure required accounts for SPL are provided
                let funder_token_account = ctx
                    .accounts
                    .funder_token_account
                    .as_ref()
                    .ok_or(TradeError::MissingSplAccounts)?;
                let escrow_vault_token_account = ctx
                    .accounts
                    .escrow_vault_token_account
                    .as_ref()
                    .ok_or(TradeError::MissingSplAccounts)?;
                let token_program = ctx
                    .accounts
                    .token_program
                    .as_ref()
                    .ok_or(TradeError::MissingSplAccounts)?;
                
                // Verify mints
                require_keys_eq!(funder_token_account.mint, mint_pubkey, TradeError::SplMintMismatch);
                require_keys_eq!(escrow_vault_token_account.mint, mint_pubkey, TradeError::SplMintMismatch);

                // Crucially, verify the escrow_vault_token_account is owned by the trade_account PDA.
                // This makes it a program-controlled escrow account.
                // This assumes the client correctly created/derived this ATA with trade_account as authority.
                require_keys_eq!(escrow_vault_token_account.owner, trade_account.key(), TradeError::EscrowVaultAuthorityMismatch);

                let transfer_instruction = SplTransfer {
                    from: funder_token_account.to_account_info(),
                    to: escrow_vault_token_account.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(), // Funder (seller) authorizes transfer from their account
                };
                let cpi_ctx = CpiContext::new(
                    token_program.to_account_info(),
                    transfer_instruction,
                );
                token::transfer(cpi_ctx, trade_account.crypto_amount)?;
                msg!("SPL Token transfer successful to escrow vault: {}", escrow_vault_token_account.key());
            }
        }

        trade_account.escrow_crypto_funded_amount = trade_account.crypto_amount;
        trade_account.state = TradeState::EscrowFunded;
        trade_account.updated_at_ts = current_timestamp;

        // TODO: Update expires_at_ts for the next phase (e.g., buyer's payment deadline from HubConfig)

        msg!(
            "Trade #{} escrow funded by seller {} with {} of {}. State: {:?}. Funded Amount: {}",
            trade_account.id,
            trade_account.seller,
            trade_account.escrow_crypto_funded_amount,
            trade_account.crypto_denom_symbol,
            trade_account.state,
            trade_account.escrow_crypto_funded_amount
        );

        // CPIs to Profile program
        let trade_state_update = TradeStateForProfileUpdate::RequestAcceptedOrEscrowFunded;

        // For seller (the funder)
        let cpi_accounts_seller = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.seller_profile.to_account_info(),
            profile_authority: ctx.accounts.funder.to_account_info(), // Funder is the seller
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state_for_seller.to_account_info(),
        };
        let cpi_program_profile = ctx.accounts.profile_program.to_account_info();
        let cpi_ctx_seller = CpiContext::new(cpi_program_profile.clone(), cpi_accounts_seller);
        profile::cpi::update_trades_count(cpi_ctx_seller, trade_state_update)?;

        // For buyer
        let cpi_accounts_buyer = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.buyer_profile.to_account_info(),
            profile_authority: ctx.accounts.buyer_profile_authority_account_info.to_account_info(),
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state_for_buyer.to_account_info(),
        };
        let cpi_ctx_buyer = CpiContext::new(cpi_program_profile, cpi_accounts_buyer);
        profile::cpi::update_trades_count(cpi_ctx_buyer, trade_state_update)?;

        Ok(())
    }

    pub fn confirm_payment_sent(
        ctx: Context<ConfirmPaymentSent>,
        _trade_id_arg: u64, // Used for PDA derivation
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;
        let trade_account = &mut ctx.accounts.trade_account;

        // Buyer is the one confirming, enforced by has_one constraint.

        // Validate trade state: Must be EscrowFunded
        require_eq!(
            trade_account.state,
            TradeState::EscrowFunded,
            TradeError::InvalidTradeState
        );

        // Update trade state
        trade_account.state = TradeState::FiatDeposited;
        trade_account.updated_at_ts = current_timestamp;

        // TODO: Fetch trade_dispute_timer_seconds from HubConfig via trade_global_state.hub_address
        // For now, using a placeholder.
        // This should use ctx.accounts.hub_config.trade_dispute_timer if HubConfig is passed here.
        let trade_dispute_timer_seconds: i64 = if let Some(hub_config) = &ctx.accounts.hub_config_for_dispute_timer {
            hub_config.trade_dispute_timer as i64
        } else {
            3600 * 24 * 3 // Fallback placeholder: 3 days
        };
        
        trade_account.dispute_window_ends_at_ts = Some(
            current_timestamp
                .checked_add(trade_dispute_timer_seconds)
                .ok_or(TradeError::TimestampOverflow)?,
        );

        msg!(
            "Trade #{} confirmed payment sent by buyer {}. State: {:?}. Dispute window ends: {:?}. Crypto Amount: {}, Fiat: {}",
            trade_account.id,
            trade_account.buyer,
            trade_account.state,
            trade_account.dispute_window_ends_at_ts,
            trade_account.crypto_amount,
            trade_account.fiat_currency_symbol
        );
        
        // No direct CPI to Profile for FiatDeposited according to CosmWasm spec's Profile.UpdateTradesCount logic.
        // Active trades counts are usually adjusted at EscrowFunded and EscrowReleased/Settled.

        Ok(())
    }

    pub fn release_escrow(ctx: Context<ReleaseEscrow>, _trade_id_arg: u64) -> Result<()> {
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;

        let trade_pda_account_info = ctx.accounts.trade_account.to_account_info(); 
        let trade_account_data = &mut ctx.accounts.trade_account; 

        // Validation 1: Caller (buyer) must be the trade's buyer
        // Handled by `has_one = buyer` in ReleaseEscrow Accounts struct.

        // Validation 2: Trade must be in FiatDeposited state
        require_eq!(
            trade_account_data.state,
            TradeState::FiatDeposited,
            TradeError::InvalidTradeState
        );

        // Validation 3: Check if dispute window has passed (if applicable)
        if let Some(dispute_window_end) = trade_account_data.dispute_window_ends_at_ts {
            require!(
                current_timestamp <= dispute_window_end,
                TradeError::DisputeWindowPassed
            );
        }

        // Validation 4: Escrow must be funded with the expected amount
        require!(
            trade_account_data.escrow_crypto_funded_amount > 0 &&
            trade_account_data.escrow_crypto_funded_amount == trade_account_data.crypto_amount,
            TradeError::EscrowNotFundedOrEmpty // Or Mismatch if already funded but wrong amount.
                                               // Assuming fund_trade_escrow ensures it matches crypto_amount.
        );
        
        let hub_config = &ctx.accounts.hub_config;
        let total_escrowed_amount = trade_account_data.escrow_crypto_funded_amount;

        // Calculate fees
        let burn_fee = total_escrowed_amount
            .checked_mul(hub_config.burn_fee_basis_points as u64)
            .ok_or(TradeError::MathOverflow)?
            .checked_div(10000)
            .ok_or(TradeError::MathOverflow)?; // 10000 for basis points

        let chain_fee = total_escrowed_amount
            .checked_mul(hub_config.chain_fee_basis_points as u64)
            .ok_or(TradeError::MathOverflow)?
            .checked_div(10000)
            .ok_or(TradeError::MathOverflow)?;

        let warchest_fee = total_escrowed_amount
            .checked_mul(hub_config.warchest_fee_basis_points as u64)
            .ok_or(TradeError::MathOverflow)?
            .checked_div(10000)
            .ok_or(TradeError::MathOverflow)?;

        let total_fees = burn_fee
            .checked_add(chain_fee)
            .ok_or(TradeError::MathOverflow)?
            .checked_add(warchest_fee)
            .ok_or(TradeError::MathOverflow)?;

        require!(
            total_fees <= total_escrowed_amount,
            TradeError::FeesExceedEscrowAmount
        );

        let amount_to_seller = total_escrowed_amount
            .checked_sub(total_fees)
            .ok_or(TradeError::MathOverflow)?;

        // Prepare signer seeds for the trade PDA
        let trade_id_bytes = trade_account_data.id.to_le_bytes();
        let trade_bump_bytes = &[trade_account_data.bump];
        let signer_seeds_array: &[&[u8]] = &[b"trade".as_ref(), &trade_id_bytes, trade_bump_bytes];


        // Perform transfers based on escrow type
        match trade_account_data.escrow_type {
            EscrowType::Native => {
                // Ensure SPL accounts are not present
                require!(
                    ctx.accounts.escrow_vault_mint.is_none() &&
                    ctx.accounts.escrow_vault.is_none() &&
                    ctx.accounts.seller_token_account.is_none() &&
                    ctx.accounts.chain_fee_collector_token_account.is_none() &&
                    ctx.accounts.warchest_token_account.is_none(),
                    TradeError::EscrowTypeNotSupported // Indicates wrong accounts passed for Native
                );

                // Transfer to seller
                if amount_to_seller > 0 {
                    require_keys_eq!(ctx.accounts.seller_native_account.key(), trade_account_data.seller, TradeError::GenericError); // Replace with specific error if needed
                    anchor_lang::solana_program::program::invoke_signed(
                        &anchor_lang::solana_program::system_instruction::transfer(
                            trade_pda_account_info.key,
                            ctx.accounts.seller_native_account.key,
                            amount_to_seller,
                        ),
                        &[
                            trade_pda_account_info.clone(),
                            ctx.accounts.seller_native_account.clone(),
                            ctx.accounts.system_program.to_account_info(),
                        ],
                        &[signer_seeds_array],
                    )
                    .map_err(|_| TradeError::NativeTransferFailed)?;
                }

                // Transfer to chain fee collector
                if chain_fee > 0 {
                    require_keys_eq!(ctx.accounts.chain_fee_collector.key(), hub_config.chain_fee_collector_addr, TradeError::GenericError);
                    anchor_lang::solana_program::program::invoke_signed(
                        &anchor_lang::solana_program::system_instruction::transfer(
                            trade_pda_account_info.key,
                            ctx.accounts.chain_fee_collector.key,
                            chain_fee,
                        ),
                        &[
                            trade_pda_account_info.clone(),
                            ctx.accounts.chain_fee_collector.clone(),
                            ctx.accounts.system_program.to_account_info(),
                        ],
                        &[signer_seeds_array],
                    )
                    .map_err(|_| TradeError::NativeTransferFailed)?;
                }

                // Transfer to warchest collector
                if warchest_fee > 0 {
                    require_keys_eq!(ctx.accounts.warchest_collector.key(), hub_config.warchest_addr, TradeError::GenericError);
                    anchor_lang::solana_program::program::invoke_signed(
                        &anchor_lang::solana_program::system_instruction::transfer(
                            trade_pda_account_info.key,
                            ctx.accounts.warchest_collector.key,
                            warchest_fee,
                        ),
                        &[
                            trade_pda_account_info.clone(),
                            ctx.accounts.warchest_collector.clone(),
                            ctx.accounts.system_program.to_account_info(),
                        ],
                        &[signer_seeds_array],
                    )
                    .map_err(|_| TradeError::NativeTransferFailed)?;
                }
                
                // For native SOL, burn_fee means these lamports are effectively "lost" from the PDA
                // as they are not transferred out. The PDA's balance will be reduced by total_escrowed_amount.
                // If the PDA needs to be closed, its lamports (rent) would go to a specified recipient.
                // Here, we assume the burn_fee is accounted for by not distributing it.
            }
            EscrowType::Spl => {
                let token_program_info = ctx
                    .accounts
                    .token_program
                    .as_ref()
                    .ok_or(TradeError::MissingSplAccounts)?
                    .to_account_info();
                
                let escrow_vault_account = ctx
                    .accounts
                    .escrow_vault
                    .as_ref()
                    .ok_or(TradeError::MissingSplAccounts)?;
                
                // Verify escrow vault ownership and mint (though mint check could be more robust)
                require_keys_eq!(escrow_vault_account.owner, trade_pda_account_info.key(), TradeError::EscrowVaultAuthorityMismatch);
                if let Some(expected_mint) = trade_account_data.escrow_mint_address {
                    require_keys_eq!(escrow_vault_account.mint, expected_mint, TradeError::SplMintMismatch);
                } else {
                    return err!(TradeError::MissingEscrowMint); // Should have mint for SPL
                }


                // Transfer to seller
                if amount_to_seller > 0 {
                    let seller_token_account = ctx
                        .accounts
                        .seller_token_account
                        .as_ref()
                        .ok_or(TradeError::MissingSellerAccount)?;
                    require_keys_eq!(seller_token_account.mint, escrow_vault_account.mint, TradeError::FeeCollectorMintMismatch); // Re-using error, consider specific one for seller

                    let cpi_accounts = SplTransfer {
                        from: escrow_vault_account.to_account_info(),
                        to: seller_token_account.to_account_info(),
                        authority: trade_pda_account_info.clone(),
                    };
                    token::transfer(
                        CpiContext::new_with_signer(
                            token_program_info.clone(),
                            cpi_accounts,
                            &[signer_seeds_array],
                        ),
                        amount_to_seller,
                    )
                    .map_err(|_| TradeError::TokenTransferFailed)?;
                }

                // Transfer to chain fee collector
                if chain_fee > 0 {
                    let fee_collector_token_account = ctx
                        .accounts
                        .chain_fee_collector_token_account
                        .as_ref()
                        .ok_or(TradeError::MissingFeeCollectorAccount)?;
                    require_keys_eq!(fee_collector_token_account.mint, escrow_vault_account.mint, TradeError::FeeCollectorMintMismatch);
                    
                    let cpi_accounts = SplTransfer {
                        from: escrow_vault_account.to_account_info(),
                        to: fee_collector_token_account.to_account_info(),
                        authority: trade_pda_account_info.clone(),
                    };
                    token::transfer(
                        CpiContext::new_with_signer(
                            token_program_info.clone(),
                            cpi_accounts,
                            &[signer_seeds_array],
                        ),
                        chain_fee,
                    )
                    .map_err(|_| TradeError::TokenTransferFailed)?;
                }

                // Transfer to warchest collector
                if warchest_fee > 0 {
                    let warchest_token_account = ctx
                        .accounts
                        .warchest_token_account
                        .as_ref()
                        .ok_or(TradeError::MissingFeeCollectorAccount)?;
                    require_keys_eq!(warchest_token_account.mint, escrow_vault_account.mint, TradeError::FeeCollectorMintMismatch);

                    let cpi_accounts = SplTransfer {
                        from: escrow_vault_account.to_account_info(),
                        to: warchest_token_account.to_account_info(),
                        authority: trade_pda_account_info.clone(),
                    };
                    token::transfer(
                        CpiContext::new_with_signer(
                            token_program_info.clone(),
                            cpi_accounts,
                            &[signer_seeds_array],
                        ),
                        warchest_fee,
                    )
                    .map_err(|_| TradeError::TokenTransferFailed)?;
                }
                
                // Burn fee for SPL tokens
                if burn_fee > 0 {
                    let escrow_mint_account = ctx
                        .accounts
                        .escrow_vault_mint
                        .as_ref()
                        .ok_or(TradeError::MissingEscrowMint)? // Mint account must be provided for burn
                        .to_account_info();
                    require_keys_eq!(escrow_mint_account.key(), escrow_vault_account.mint, TradeError::SplMintMismatch);

                    let cpi_accounts = token::Burn {
                        mint: escrow_mint_account,
                        from: escrow_vault_account.to_account_info(),
                        authority: trade_pda_account_info.clone(),
                    };
                    token::burn(
                        CpiContext::new_with_signer(
                            token_program_info.clone(),
                            cpi_accounts,
                            &[signer_seeds_array],
                        ),
                        burn_fee,
                    )
                    .map_err(|_| TradeError::TokenTransferFailed)?; // Or a specific BurnFailed error
                }
            }
        }

        // Update trade state
        // TODO: Differentiate between TradeSettledMaker and TradeSettledTaker based on who benefits
        // For simplicity, using a generic settled state or EscrowReleased.
        // If buyer is releasing, it implies they received fiat, so seller (maker) benefits.
        // If this function is called by seller (e.g. confirming crypto receipt after buyer sent stablecoin), then buyer (taker) benefits.
        // Current design: Buyer calls this.
        trade_account_data.state = TradeState::TradeSettledMaker; // Assuming buyer confirms, seller (maker) is settled
        trade_account_data.updated_at_ts = current_timestamp;

        msg!(
            "Escrow released for trade #{}. State: {:?}. Amount to seller: {}, Fees: (Burn: {}, Chain: {}, Warchest: {})",
            trade_account_data.id,
            trade_account_data.state,
            amount_to_seller,
            burn_fee,
            chain_fee,
            warchest_fee
        );
        
        // CPIs to Profile program
        let trade_state_update = TradeStateForProfileUpdate::EscrowReleased;

        // For buyer (the releaser)
        let cpi_accounts_buyer = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.buyer_profile.to_account_info(),
            profile_authority: ctx.accounts.buyer.to_account_info(), // Buyer is the authority
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state_for_buyer.to_account_info(),
        };
        let cpi_program_profile = ctx.accounts.profile_program.to_account_info();
        let cpi_ctx_buyer = CpiContext::new(cpi_program_profile.clone(), cpi_accounts_buyer);
        profile::cpi::update_trades_count(cpi_ctx_buyer, trade_state_update)?;

        // For seller
        let cpi_accounts_seller = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.seller_profile.to_account_info(),
            profile_authority: ctx.accounts.seller_profile_authority_account_info.to_account_info(),
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state_for_seller.to_account_info(),
        };
        let cpi_ctx_seller = CpiContext::new(cpi_program_profile, cpi_accounts_seller);
        profile::cpi::update_trades_count(cpi_ctx_seller, trade_state_update)?;

        Ok(())
    }

    // TODO: Add other instructions like create_trade, accept_trade etc.
}

#[derive(Accounts)]
pub struct InitializeTradeGlobalState<'info> {
    #[account(
        init,
        payer = authority,
        space = TradeGlobalState::SPACE,
        seeds = [b"trade_global_state"],
        bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(offer_id_arg: u64, crypto_amount_to_trade: u64, buyer_contact_info_arg: Option<String>)]
pub struct CreateTrade<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>, // Payer for trade_account and authority for their profile CPI

    #[account(
        mut, 
        seeds = [b"trade_global_state"],
        bump = trade_global_state.bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,

    #[account(
        init,
        payer = buyer,
        space = 8 + Trade::INIT_SPACE,
        seeds = [b"trade".as_ref(), &trade_global_state.trades_count.to_le_bytes()],
        bump
    )]
    pub trade_account: Account<'info, Trade>,

    #[account(
        seeds = [b"offer".as_ref(), &offer_id_arg.to_le_bytes()],
        bump = offer_account.bump, 
        seeds::program = offer_program.key()
    )]
    pub offer_account: Account<'info, OfferAccountData>,

    #[account()] // No seeds constraint from Trade program
    pub price_account: Account<'info, CalculatedPriceAccount>,

    pub offer_program: Program<'info, OfferProgram>,
    pub price_program: Program<'info, PriceProgram>,
    pub system_program: Program<'info, System>,

    // Accounts for Profile CPI
    pub profile_program: Program<'info, ProfileProgram>,

    #[account(
        mut,
        seeds = [b"profile", buyer.key().as_ref()], // Buyer's profile
        bump = buyer_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub buyer_profile: Account<'info, ProfileAccountData>,
    
    // Seller's profile. Seller is offer_account.owner.
    // The authority for this profile is not a Signer in this instruction.
    // So, we need to pass seller_profile_authority_account_info.
    #[account(
        mut,
        seeds = [b"profile", offer_account.owner.as_ref()], // Seller's profile
        bump = seller_profile.bump,
        seeds::program = profile_program.key()
        // constraint = seller_profile.authority == offer_account.owner @ TradeError::GenericError // Implicitly checked by seeds
    )]
    pub seller_profile: Account<'info, ProfileAccountData>,

    /// CHECK: This is the offer_account.owner, used as profile_authority for seller's profile CPI.
    /// It's not a signer here. The Profile program's UpdateTradesCount constraint will verify
    /// that this key matches seller_profile.authority.
    #[account(address = offer_account.owner @ TradeError::GenericError)] // Ensure this is offer_account.owner
    pub seller_profile_authority_account_info: AccountInfo<'info>,


    // HubConfig for Profile CPI context (needs to be ProfileHubConfigStub compatible)
    // Assuming trade_global_state.hub_address is the Hub Program ID.
    // And Hub Program's config PDA is seeded with [b"hub"].
    #[account(
        seeds = [b"hub"],
        bump = hub_config_for_profile_cpi.bump, // TODO: How to get bump for an external PDA if not passed?
                                                // If ProfileHubConfigStub is small enough, can we pass HubConfigAccount
                                                // and hope Anchor deserializes the stub portion?
                                                // Or Profile program should take AccountLoader for HubConfig.
                                                // For now, assuming ProfileHubConfigStub can be loaded this way.
        seeds::program = trade_global_state.hub_address // This IS the Hub Program ID
    )]
    pub hub_config_for_profile_cpi: Account<'info, ProfileHubConfigStub>, // Expected by Profile's UpdateTradesCount

    /// CHECK: This is the Hub Program ID, used for deriving hub_config_for_profile_cpi.
    /// Will be trade_global_state.hub_address.
    #[account(address = trade_global_state.hub_address @ TradeError::GenericError)] // Constraint to ensure it's the correct hub ID
    pub hub_program_id_for_profile_cpi: AccountInfo<'info>,


    // ProfileGlobalState for buyer's profile CPI
    #[account(
        seeds = [b"profile_global_state"],
        bump = profile_global_state_for_buyer.bump, // Assuming same global state for all profiles in that program
        seeds::program = profile_program.key()
    )]
    pub profile_global_state_for_buyer: Account<'info, ProfileGlobalStateAccount>,

    // ProfileGlobalState for seller's profile CPI (can be the same account instance)
    #[account(
        seeds = [b"profile_global_state"],
        bump = profile_global_state_for_seller.bump,
        seeds::program = profile_program.key()
    )]
    pub profile_global_state_for_seller: Account<'info, ProfileGlobalStateAccount>,

}

#[derive(Accounts)]
#[instruction(trade_id_arg: u64, seller_contact_info_arg: Option<String>)]
pub struct AcceptTrade<'info> {
    #[account(mut)] 
    pub seller: Signer<'info>, // Authority for their profile CPI

    #[account(
        mut,
        seeds = [b"trade".as_ref(), &trade_id_arg.to_le_bytes()],
        bump = trade_account.bump,
        has_one = seller @ TradeError::NotTradeSeller
    )]
    pub trade_account: Account<'info, Trade>,

    // Accounts for Profile CPI
    pub profile_program: Program<'info, ProfileProgram>,

    #[account(
        mut,
        seeds = [b"profile", seller.key().as_ref()], // Seller's profile
        bump = seller_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub seller_profile: Account<'info, ProfileAccountData>,

    #[account(
        mut,
        seeds = [b"profile", trade_account.buyer.as_ref()], // Buyer's profile (buyer is from trade_account)
        bump = buyer_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub buyer_profile: Account<'info, ProfileAccountData>,

    /// CHECK: This is trade_account.buyer, used as profile_authority for buyer's profile CPI.
    #[account(address = trade_account.buyer @ TradeError::GenericError)] 
    pub buyer_profile_authority_account_info: AccountInfo<'info>,

    #[account(
        seeds = [b"trade_global_state"],
        bump = trade_global_state.bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>, // Needed for hub_address to derive hub_config_for_profile_cpi

    #[account(
        seeds = [b"hub"],
        bump = hub_config_for_profile_cpi.bump,
        seeds::program = trade_global_state.hub_address // Hub Program ID from trade_global_state
    )]
    pub hub_config_for_profile_cpi: Account<'info, ProfileHubConfigStub>,

    /// CHECK: This is the Hub Program ID (trade_global_state.hub_address).
    #[account(address = trade_global_state.hub_address @ TradeError::GenericError)]
    pub hub_program_id_for_profile_cpi: AccountInfo<'info>,
    
    #[account(
        seeds = [b"profile_global_state"],
        bump = profile_global_state_for_seller.bump,
        seeds::program = profile_program.key()
    )]
    pub profile_global_state_for_seller: Account<'info, ProfileGlobalStateAccount>,

    #[account(
        seeds = [b"profile_global_state"],
        bump = profile_global_state_for_buyer.bump,
        seeds::program = profile_program.key()
    )]
    pub profile_global_state_for_buyer: Account<'info, ProfileGlobalStateAccount>,
}

#[derive(Accounts)]
#[instruction(_trade_id_arg: u64)] // Ensure _trade_id_arg is available for seeds if needed directly
pub struct FundTradeEscrow<'info> {
    #[account(mut)]
    pub funder: Signer<'info>, // This is the trade_account.seller, also seller's profile authority for CPI

    #[account(
        mut,
        seeds = [b"trade".as_ref(), &_trade_id_arg.to_le_bytes()],
        bump = trade_account.bump,
        constraint = trade_account.seller == funder.key() @ TradeError::NotTradeSeller,
        // Ensure buyer is correctly referenced for buyer_profile derivation
        // constraint = trade_account.buyer == buyer_profile.owner_address if ProfileAccountData has owner_address
        // or ensure buyer_profile seeds use trade_account.buyer
    )]
    pub trade_account: Account<'info, Trade>,

    // SPL Token specific accounts - Conditionally provided by client if escrow_type is Spl
    #[account(mut)]
    pub funder_token_account: Option<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub escrow_vault_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
    pub system_program: Program<'info, System>,

    // Accounts for Profile CPI
    pub profile_program: Program<'info, ProfileProgram>,

    // Seller's Profile (funder is the seller)
    #[account(
        mut,
        seeds = [b"profile", funder.key().as_ref()], // funder.key() is trade_account.seller
        bump = seller_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub seller_profile: Account<'info, ProfileAccountData>,

    // Buyer's Profile
    #[account(
        mut,
        seeds = [b"profile", trade_account.buyer.as_ref()],
        bump = buyer_profile.bump,
        seeds::program = profile_program.key()
        // constraint = buyer_profile.authority == trade_account.buyer @ TradeError::GenericError // Checked by profile program
    )]
    pub buyer_profile: Account<'info, ProfileAccountData>,

    /// CHECK: This is trade_account.buyer, used as profile_authority for buyer's profile CPI.
    /// The Profile program's UpdateTradesCount constraint will verify this.
    #[account(address = trade_account.buyer @ TradeError::GenericError)]
    pub buyer_profile_authority_account_info: AccountInfo<'info>,
    
    // HubConfig for Profile CPI context
    // trade_global_state is needed to get trade_global_state.hub_address
    #[account(
        seeds = [b"trade_global_state"],
        bump = trade_global_state.bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,

    #[account(
        seeds = [b"hub"],
        bump = hub_config_for_profile_cpi.bump,
        seeds::program = trade_global_state.hub_address // Hub Program ID from trade_global_state
    )]
    pub hub_config_for_profile_cpi: Account<'info, ProfileHubConfigStub>,

    /// CHECK: This is the Hub Program ID (trade_global_state.hub_address).
    #[account(address = trade_global_state.hub_address @ TradeError::GenericError)]
    pub hub_program_id_for_profile_cpi: AccountInfo<'info>,

    // ProfileGlobalState for seller's profile CPI
    #[account(
        seeds = [b"profile_global_state"],
        bump = profile_global_state_for_seller.bump,
        seeds::program = profile_program.key()
    )]
    pub profile_global_state_for_seller: Account<'info, ProfileGlobalStateAccount>,

    // ProfileGlobalState for buyer's profile CPI
    #[account(
        seeds = [b"profile_global_state"],
        bump = profile_global_state_for_buyer.bump,
        seeds::program = profile_program.key()
    )]
    pub profile_global_state_for_buyer: Account<'info, ProfileGlobalStateAccount>,
}

#[derive(Accounts)]
#[instruction(_trade_id_arg: u64)]
pub struct ConfirmPaymentSent<'info> {
    #[account(mut)] // Buyer signs
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"trade".as_ref(), &_trade_id_arg.to_le_bytes()],
        bump = trade_account.bump,
        has_one = buyer @ TradeError::NotTradeBuyer
    )]
    pub trade_account: Account<'info, Trade>,
    
    // Optional: To get trade_dispute_timer from HubConfig accurately
    // Client must provide if they want non-placeholder timer.
    // Seeds constraint assume trade_global_state.hub_address is Hub Program ID
    // and HubConfig PDA is derived with [b"hub"] seed.
    #[account(
        seeds = [b"hub"], // Using common seed for HubConfig as per CONVERSION_PLAN.md
        bump = hub_config_for_dispute_timer.bump,
        seeds::program = trade_global_state.hub_address // hub_address is Hub Program ID
    )]
    pub hub_config_for_dispute_timer: Option<Account<'info, HubConfigAccount>>,
    
    #[account(
        seeds = [b"trade_global_state"], // To get hub_address for hub_config_for_dispute_timer
        bump = trade_global_state.bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,
}

#[derive(Accounts)]
#[instruction(_trade_id_arg: u64)] // trade_id_arg used for PDA derivation of trade_account
pub struct ReleaseEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>, // Buyer is the one confirming receipt and releasing, authority for their profile CPI

    #[account(
        mut,
        seeds = [b"trade".as_ref(), &_trade_id_arg.to_le_bytes()],
        bump = trade_account.bump,
        has_one = buyer @ TradeError::NotTradeBuyer,
    )]
    pub trade_account: Box<Account<'info, Trade>>, // Using Box for potentially large account state

    #[account(
        seeds = [b"trade_global_state"],
        bump = trade_global_state.bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,

    #[account(
        seeds = [b"hub"], // Seed for HubConfig PDA as per CONVERSION_PLAN.md M2
        bump = hub_config.bump,
        seeds::program = trade_global_state.hub_address // hub_address from trade_global_state IS the Hub Program ID
    )]
    pub hub_config: Account<'info, HubConfigAccount>, // Full HubConfig for fee calculations

    // Native SOL recipients
    /// CHECK: Verified in instruction logic: must match trade_account.seller
    #[account(mut)]
    pub seller_native_account: AccountInfo<'info>,
    /// CHECK: Verified in instruction logic: must match hub_config.chain_fee_collector_addr
    #[account(mut)]
    pub chain_fee_collector: AccountInfo<'info>,
    /// CHECK: Verified in instruction logic: must match hub_config.warchest_addr
    #[account(mut)]
    pub warchest_collector: AccountInfo<'info>,

    // SPL Token accounts (conditionally used based on trade_account.escrow_type)
    /// The SPL token mint of the escrowed asset. Only needed for token::burn.
    /// Client must provide if EscrowType::Spl and burn_fee > 0.
    pub escrow_vault_mint: Option<Account<'info, anchor_spl::token::Mint>>,

    #[account(
        mut,
        // Constraint: escrow_vault.owner == trade_account.key() (checked in fund_trade_escrow)
        // Constraint: escrow_vault.mint == trade_account.escrow_mint_address (if Some)
    )]
    pub escrow_vault: Option<Account<'info, TokenAccount>>, // PDA-controlled ATA

    #[account(mut)] // Seller's token account to receive SPL tokens
    pub seller_token_account: Option<Account<'info, TokenAccount>>,
    
    #[account(mut)] // Chain fee collector's token account
    pub chain_fee_collector_token_account: Option<Account<'info, TokenAccount>>,
    
    #[account(mut)] // Warchest collector's token account
    pub warchest_token_account: Option<Account<'info, TokenAccount>>,

    // Programs
    pub token_program: Option<Program<'info, Token>>,
    pub system_program: Program<'info, System>, // For native SOL transfers

    // Accounts for Profile CPI
    pub profile_program: Program<'info, ProfileProgram>,

    #[account(
        mut,
        seeds = [b"profile", buyer.key().as_ref()], // Buyer's profile
        bump = buyer_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub buyer_profile: Account<'info, ProfileAccountData>,

    #[account(
        mut,
        seeds = [b"profile", trade_account.seller.as_ref()], // Seller's profile (seller is from trade_account.inner.seller)
        bump = seller_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub seller_profile: Account<'info, ProfileAccountData>,

    /// CHECK: This is trade_account.seller, used as profile_authority for seller's profile CPI.
    #[account(address = trade_account.seller @ TradeError::GenericError)] // trade_account is Box<Account<Trade>> so .seller is direct
    pub seller_profile_authority_account_info: AccountInfo<'info>,

    // HubConfigStub for Profile CPI context
    #[account(
        seeds = [b"hub"],
        bump = hub_config_for_profile_cpi.bump,
        seeds::program = trade_global_state.hub_address 
    )]
    pub hub_config_for_profile_cpi: Account<'info, ProfileHubConfigStub>,

    /// CHECK: This is the Hub Program ID (trade_global_state.hub_address).
    #[account(address = trade_global_state.hub_address @ TradeError::GenericError)]
    pub hub_program_id_for_profile_cpi: AccountInfo<'info>,

    #[account(
        seeds = [b"profile_global_state"],
        bump = profile_global_state_for_buyer.bump,
        seeds::program = profile_program.key()
    )]
    pub profile_global_state_for_buyer: Account<'info, ProfileGlobalStateAccount>,

    #[account(
        seeds = [b"profile_global_state"],
        bump = profile_global_state_for_seller.bump,
        seeds::program = profile_program.key()
    )]
    pub profile_global_state_for_seller: Account<'info, ProfileGlobalStateAccount>,
}

// Account to store global state for the Trade program
#[account]
pub struct TradeGlobalState {
    pub trades_count: u64, // Counter for total trades created, used for ID generation
    pub hub_address: Pubkey, // Address of the central Hub program
    pub bump: u8,          // PDA bump seed
}

impl TradeGlobalState {
    pub const SPACE: usize = 8 + 8 + 32 + 1; // Discriminator + u64 + Pubkey + u8
}

#[derive(InitSpace, AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TradeState {
    RequestCreated,    // Buyer initiated trade from an offer
    RequestAccepted,   // Seller accepted the trade request
    EscrowFunded, // Crypto asset funded into on-chain escrow by seller (or buyer if buying crypto with stablecoin escrow)
    FiatDeposited, // Buyer confirms they have sent off-chain fiat payment
    EscrowReleased, // On-chain crypto escrow released to the entitled party
    TradeSettledMaker, // Trade completed successfully, crypto seller (offer owner) received fiat / crypto buyer received crypto
    TradeSettledTaker, // Trade completed successfully, crypto buyer (offer taker) received crypto / crypto seller received fiat
    RequestCanceled, // Buyer/Taker canceled before seller acceptance or funding, or other conditions
    EscrowRefunded,  // Escrowed crypto funds returned (e.g., trade expired)
    DisputeOpened,   // A dispute has been raised by buyer or seller
    DisputeResolved, // Dispute resolved by arbitrator (can lead to Settled or Refunded states)
}

impl std::fmt::Display for TradeState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EscrowType {
    Native, // For SOL escrow
    Spl,    // For SPL Token escrow
}

// Represents a P2P trade transaction
// PDA seeds: [b"trade", &id.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct Trade {
    pub id: u64, // Unique identifier for the trade, derived from TradeGlobalState.trades_count
    pub offer_id: u64, // ID of the offer this trade is related to
    pub buyer: Pubkey, // Pubkey of the buyer (taker of the offer)
    pub seller: Pubkey, // Pubkey of the seller (owner of the offer)

    #[max_len(16)]
    pub crypto_denom_symbol: String, // Symbol of the crypto asset (e.g., "SOL", "USDC")
    pub crypto_amount: u64, // Amount of crypto asset being traded

    #[max_len(8)]
    pub fiat_currency_symbol: String, // Symbol of the fiat currency (e.g., "EUR", "USD")

    // Price/Rate at which the trade was initiated
    // Represents: 1 unit of crypto_denom_symbol = X units of fiat_currency_symbol (scaled by decimals)
    pub exchange_rate: u64,
    pub exchange_rate_decimals: u8,

    pub state: TradeState, // Current state of the trade

    pub escrow_type: EscrowType, // Defines the type of on-chain escrow for the crypto asset
    pub escrow_mint_address: Option<Pubkey>, // Mint address if SPL token escrow for the crypto asset
    pub escrow_crypto_funded_amount: u64, // Amount of crypto asset actually funded into on-chain escrow

    pub created_at_ts: i64, // Timestamp of trade creation (Unix timestamp)
    pub updated_at_ts: i64, // Timestamp of last state update (Unix timestamp)
    pub expires_at_ts: i64, // Timestamp when the current phase/trade might expire (e.g. funding deadline)
    pub dispute_window_ends_at_ts: Option<i64>, // Deadline to open a dispute after payment confirmation

    #[max_len(100)]
    pub buyer_contact_info: Option<String>, // Contact information for the buyer
    #[max_len(100)]
    pub seller_contact_info: Option<String>, // Contact information for the seller

    pub arbitrator: Option<Pubkey>, // Pubkey of the assigned arbitrator if/when a dispute is opened

    pub bump: u8, // PDA bump seed for this Trade account
}

#[error_code]
pub enum TradeError {
    #[msg("Generic error.")] // Placeholder, more specific errors to be added
    GenericError,
    #[msg("Trade ID counter overflow.")]
    TradeIdOverflow,
    #[msg("Buyer cannot be the same as the offer owner.")]
    BuyerIsOfferOwner,
    #[msg("Offer is not active and cannot be taken.")]
    OfferNotActive,
    #[msg("Trade amount is outside the range specified in the offer.")]
    AmountOutOfOfferRange,
    #[msg("Provided price account does not match the offer's currency pair.")]
    PriceAccountMismatch,
    #[msg("Timestamp calculation resulted in an overflow.")]
    TimestampOverflow,
    #[msg("Invalid trade state for the operation.")]
    InvalidTradeState,
    #[msg("Caller is not the designated seller for this trade.")]
    NotTradeSeller,
    #[msg("Escrow is already funded.")]
    EscrowAlreadyFunded,
    #[msg("Escrow type not supported by this instruction (e.g., native SOL funding uses a different one).")]
    EscrowTypeNotSupported,
    #[msg("Escrow mint address is missing for SPL token escrow.")]
    MissingEscrowMint,
    #[msg("Token transfer failed.")]
    TokenTransferFailed,
    #[msg("Caller is not the designated buyer for this trade.")]
    NotTradeBuyer,
    #[msg("Required crypto amount for escrow does not match trade details.")]
    EscrowAmountMismatch,
    #[msg("Native SOL transfer failed.")]
    NativeTransferFailed,
    #[msg("Required SPL accounts are missing for SPL token escrow.")]
    MissingSplAccounts, // New Error
    #[msg("SPL token mint does not match trade details.")]
    SplMintMismatch, // New Error
    #[msg("Escrow vault authority does not match trade account PDA.")]
    EscrowVaultAuthorityMismatch, // New Error
    #[msg("Native SOL escrow should not have an escrow_mint_address defined.")]
    NativeEscrowShouldNotHaveMint, // New Error
    #[msg("Math operation overflow.")]
    MathOverflow, // New Error
    #[msg("Escrow is not funded or amount is zero.")]
    EscrowNotFundedOrEmpty, // New Error
    #[msg("Calculated fees exceed total escrowed amount.")]
    FeesExceedEscrowAmount, // New Error
    #[msg("Missing fee collector account for SPL transfer.")]
    MissingFeeCollectorAccount, // New Error
    #[msg("Fee collector token account has mismatched mint.")]
    FeeCollectorMintMismatch, // New Error
    #[msg("Missing seller account for SPL transfer.")]
    MissingSellerAccount, // New Error
    #[msg("Dispute window has passed, cannot release directly.")]
    DisputeWindowPassed, // New Error
}
