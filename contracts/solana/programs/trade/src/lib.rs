use anchor_lang::prelude::*;
// Assuming the following paths are correct after Cargo.toml setup
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};
use offer::program::Offer as OfferProgram; // To refer to the Offer program ID
use offer::Offer as OfferAccountData; // To refer to the Offer account data structure
use offer::OfferStateAnchor; // Import for offer_account.state comparison
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
            offer_account.state == OfferStateAnchor::Active,
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

        // Determine EscrowType and escrow_mint_address
        if offer_account.denom.to_uppercase() == "SOL" {
            trade_account.escrow_type = EscrowType::Native;
            trade_account.escrow_mint_address = None; // SOL has no mint address
        } else {
            trade_account.escrow_type = EscrowType::Spl;
            // escrow_mint_address should come from the offer_account
            trade_account.escrow_mint_address = offer_account.token_mint;
            // Ensure that for SPL tokens, the offer actually has a mint address defined.
            // This should be guaranteed by the Offer program's create_offer validation,
            // but an extra check here can be good for defense.
            if trade_account.escrow_mint_address.is_none() {
                return err!(TradeError::MissingEscrowMintFromOffer);
            }
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
        let cpi_accounts_seller = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.seller_profile.to_account_info(),
            profile_authority: ctx.accounts.seller_profile_authority_account_info.to_account_info(),
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(), 
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(), 
            profile_global_state: ctx.accounts.profile_global_state_for_seller.to_account_info(),
        };
        let cpi_program_seller = ctx.accounts.profile_program.to_account_info(); 
        let cpi_ctx_seller = CpiContext::new(cpi_program_seller, cpi_accounts_seller);
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

        // Validation 1: Caller must be the seller (handled by has_one)
        // Validation 2: Trade must be in RequestCreated state
        require_eq!(
            trade_account.state,
            TradeState::RequestCreated,
            TradeError::InvalidTradeState
        );

        // Update trade state
        trade_account.state = TradeState::RequestAccepted;
        trade_account.updated_at_ts = current_timestamp;
        if seller_contact_info_arg.is_some() { // Update seller contact if provided
            trade_account.seller_contact_info = seller_contact_info_arg;
        }
        // TODO: update expires_at_ts for funding deadline?

        msg!(
            "Trade #{} accepted by seller {}. State: {:?}. Buyer: {}, Crypto Amount: {}, Fiat: {}",
            trade_account.id,
            trade_account.seller,
            trade_account.state,
            trade_account.buyer,
            trade_account.crypto_amount,
            trade_account.fiat_currency_symbol
        );

        // CPIs to Profile program for buyer and seller with RequestAcceptedOrEscrowFunded
        let trade_state_update = TradeStateForProfileUpdate::RequestAcceptedOrEscrowFunded;

        // For seller (the acceptor)
        let cpi_accounts_seller = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.seller_profile.to_account_info(),
            profile_authority: ctx.accounts.seller.to_account_info(), // Seller is the authority
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

    pub fn fund_trade_escrow(
        ctx: Context<FundTradeEscrow>,
        _trade_id_arg: u64, 
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;
        let trade_account = &mut ctx.accounts.trade_account;
        let funder_key = ctx.accounts.funder.key();

        // Validation 1: Caller (funder) must be the seller
        // This is already enforced by the constraint `trade_account.seller == funder.key()` 
        // in the `FundTradeEscrow` Accounts struct.

        // Validation 2: Trade must be in RequestAccepted state
        require_eq!(
            trade_account.state,
            TradeState::RequestAccepted,
            TradeError::InvalidTradeState
        );
        
        // Validation 3: Escrow not already funded (idempotency check based on amount)
        require_eq!(
            trade_account.escrow_crypto_funded_amount,
            0,
            TradeError::EscrowAlreadyFunded
        );

        let amount_to_escrow = trade_account.crypto_amount;
        require_gt!(amount_to_escrow, 0, TradeError::EscrowAmountMismatch); // Cannot escrow zero

        match trade_account.escrow_type {
            EscrowType::Native => {
                // Ensure SPL accounts are not present
                require!(
                    ctx.accounts.funder_token_account.is_none() &&
                    ctx.accounts.escrow_vault_token_account.is_none() &&
                    ctx.accounts.escrow_mint.is_none() &&
                    ctx.accounts.token_program.is_none(),
                    TradeError::EscrowTypeMismatch // SPL accounts provided for Native trade
                );
                // Ensure escrow_mint_address is None for native
                require!(
                    trade_account.escrow_mint_address.is_none(),
                    TradeError::NativeEscrowShouldNotHaveMint
                );

                // Transfer SOL from funder to trade_account (PDA)
                anchor_lang::solana_program::program::invoke(
                    &anchor_lang::solana_program::system_instruction::transfer(
                        &funder_key,
                        &trade_account.to_account_info().key(),
                        amount_to_escrow,
                    ),
                    &[
                        ctx.accounts.funder.to_account_info(),
                        trade_account.to_account_info(),
                        ctx.accounts.system_program.to_account_info(),
                    ],
                )
                .map_err(|_| TradeError::NativeTransferFailed)?;
            }
            EscrowType::Spl => {
                let funder_token_account = ctx
                    .accounts
                    .funder_token_account
                    .as_ref()
                    .ok_or(TradeError::MissingFunderTokenAccount)?;

                let escrow_vault_account = ctx
                    .accounts
                    .escrow_vault_token_account
                    .as_ref()
                    .ok_or(TradeError::MissingEscrowVaultAccount)?;
                
                let token_program = ctx
                    .accounts
                    .token_program
                    .as_ref()
                    .ok_or(TradeError::MissingTokenProgram)?
                    .to_account_info();

                let escrow_mint_account = ctx
                    .accounts
                    .escrow_mint
                    .as_ref()
                    .ok_or(TradeError::MissingEscrowMint)?;

                // Validate mint addresses
                let expected_mint_addr_from_trade = trade_account.escrow_mint_address.ok_or(TradeError::MissingEscrowMint)?;
                require_keys_eq!(escrow_mint_account.key(), expected_mint_addr_from_trade, TradeError::SplMintMismatch);
                require_keys_eq!(funder_token_account.mint, escrow_mint_account.key(), TradeError::SplMintMismatch);
                require_keys_eq!(escrow_vault_account.mint, escrow_mint_account.key(), TradeError::SplMintMismatch);

                // Transfer SPL tokens from funder_token_account to escrow_vault_account
                let cpi_accounts = SplTransfer {
                    from: funder_token_account.to_account_info(),
                    to: escrow_vault_account.to_account_info(), 
                    authority: ctx.accounts.funder.to_account_info(),
                };
                token::transfer(
                    CpiContext::new(token_program.clone(), cpi_accounts),
                    amount_to_escrow,
                )
                .map_err(|_| TradeError::TokenTransferFailed)?;
            }
        }

        trade_account.escrow_crypto_funded_amount = amount_to_escrow;
        trade_account.state = TradeState::EscrowFunded;
        trade_account.updated_at_ts = current_timestamp;
        // TODO: Potentially update expires_at_ts for next phase (e.g. buyer payment confirmation)

        msg!(
            "Trade #{} escrow funded by {}. Amount: {}, Type: {:?}. State: {:?}. Buyer: {}",
            trade_account.id,
            funder_key,
            amount_to_escrow,
            trade_account.escrow_type,
            trade_account.state,
            trade_account.buyer
        );

        // CPIs to Profile program for seller and buyer with RequestAcceptedOrEscrowFunded
        // This state implies an active trade slot is now definitely consumed.
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
        
        Ok(())
    }

    pub fn release_escrow(ctx: Context<ReleaseEscrow>, _trade_id_arg: u64) -> Result<()> {
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;

        let trade_pda_account_info = ctx.accounts.trade_account.to_account_info(); 
        let trade_account_data = &mut ctx.accounts.trade_account; 

        // Validation 1: Caller (buyer) must be the trade's buyer (handled by has_one)
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
            TradeError::EscrowNotFundedOrEmpty
        );
        
        let hub_config = &ctx.accounts.hub_config;
        let total_escrowed_amount = trade_account_data.escrow_crypto_funded_amount;

        // Calculate fees
        let burn_fee = total_escrowed_amount
            .checked_mul(hub_config.burn_fee_basis_points as u64)
            .ok_or(TradeError::MathOverflow)?
            .checked_div(10000)
            .ok_or(TradeError::MathOverflow)?; 

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
                require!(
                    ctx.accounts.escrow_vault_mint.is_none() &&
                    ctx.accounts.escrow_vault.is_none() &&
                    ctx.accounts.seller_token_account.is_none() &&
                    ctx.accounts.chain_fee_collector_token_account.is_none() &&
                    ctx.accounts.warchest_token_account.is_none(),
                    TradeError::EscrowTypeNotSupported 
                );

                if amount_to_seller > 0 {
                    require_keys_eq!(ctx.accounts.seller_native_account.key(), trade_account_data.seller, TradeError::GenericError); 
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
            }
            EscrowType::Spl => {
                let token_program_info = ctx
                    .accounts
                    .token_program
                    .as_ref()
                    .ok_or(TradeError::MissingTokenProgram)?
                    .to_account_info();
                
                let escrow_vault_account = ctx
                    .accounts
                    .escrow_vault
                    .as_ref()
                    .ok_or(TradeError::MissingEscrowVaultAccount)?;
                
                require_keys_eq!(escrow_vault_account.owner, trade_pda_account_info.key(), TradeError::EscrowVaultAuthorityMismatch);
                if let Some(expected_mint) = trade_account_data.escrow_mint_address {
                    require_keys_eq!(escrow_vault_account.mint, expected_mint, TradeError::SplMintMismatch);
                } else {
                    return err!(TradeError::MissingEscrowMint); 
                }

                if amount_to_seller > 0 {
                    let seller_token_account = ctx
                        .accounts
                        .seller_token_account
                        .as_ref()
                        .ok_or(TradeError::MissingSellerAccount)?;
                    require_keys_eq!(seller_token_account.mint, escrow_vault_account.mint, TradeError::FeeCollectorMintMismatch); 

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
                
                if burn_fee > 0 {
                    let escrow_mint_account = ctx
                        .accounts
                        .escrow_vault_mint
                        .as_ref()
                        .ok_or(TradeError::MissingEscrowMint)? 
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
                    .map_err(|_| TradeError::TokenTransferFailed)?;
                }
            }
        }

        trade_account_data.state = TradeState::TradeSettledMaker; 
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

        let cpi_accounts_buyer = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.buyer_profile.to_account_info(),
            profile_authority: ctx.accounts.buyer.to_account_info(), 
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state_for_buyer.to_account_info(),
        };
        let cpi_program_profile = ctx.accounts.profile_program.to_account_info();
        let cpi_ctx_buyer = CpiContext::new(cpi_program_profile.clone(), cpi_accounts_buyer);
        profile::cpi::update_trades_count(cpi_ctx_buyer, trade_state_update)?;

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
    pub buyer: Signer<'info>, 

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

    #[account()] 
    pub price_account: Account<'info, CalculatedPriceAccount>,

    pub offer_program: Program<'info, OfferProgram>,
    pub price_program: Program<'info, PriceProgram>,
    pub system_program: Program<'info, System>,

    // Accounts for Profile CPI
    pub profile_program: Program<'info, ProfileProgram>,

    #[account(
        mut,
        seeds = [b"profile", buyer.key().as_ref()], 
        bump = buyer_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub buyer_profile: Account<'info, ProfileAccountData>,
    
    #[account(
        mut,
        seeds = [b"profile", offer_account.owner.as_ref()], 
        bump = seller_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub seller_profile: Account<'info, ProfileAccountData>,

    /// CHECK: This is the offer_account.owner
    #[account(address = offer_account.owner @ TradeError::GenericError)] 
    pub seller_profile_authority_account_info: AccountInfo<'info>,

    #[account(
        seeds = [b"hub"],
        bump = hub_config_for_profile_cpi.bump, 
        seeds::program = trade_global_state.hub_address 
    )]
    pub hub_config_for_profile_cpi: Account<'info, ProfileHubConfigStub>, 

    /// CHECK: This is the Hub Program ID
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

#[derive(Accounts)]
#[instruction(trade_id_arg: u64, seller_contact_info_arg: Option<String>)]
pub struct AcceptTrade<'info> {
    #[account(mut)] 
    pub seller: Signer<'info>, 

    #[account(
        mut,
        seeds = [b"trade".as_ref(), &trade_id_arg.to_le_bytes()],
        bump = trade_account.bump,
        has_one = seller @ TradeError::NotTradeSeller
    )]
    pub trade_account: Account<'info, Trade>,

    pub profile_program: Program<'info, ProfileProgram>,

    #[account(
        mut,
        seeds = [b"profile", seller.key().as_ref()], 
        bump = seller_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub seller_profile: Account<'info, ProfileAccountData>,

    #[account(
        mut,
        seeds = [b"profile", trade_account.buyer.as_ref()], 
        bump = buyer_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub buyer_profile: Account<'info, ProfileAccountData>,

    /// CHECK: This is trade_account.buyer
    #[account(address = trade_account.buyer @ TradeError::GenericError)] 
    pub buyer_profile_authority_account_info: AccountInfo<'info>,

    #[account(
        seeds = [b"trade_global_state"],
        bump = trade_global_state.bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>, 

    #[account(
        seeds = [b"hub"],
        bump = hub_config_for_profile_cpi.bump,
        seeds::program = trade_global_state.hub_address 
    )]
    pub hub_config_for_profile_cpi: Account<'info, ProfileHubConfigStub>,

    /// CHECK: This is the Hub Program ID
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
#[instruction(_trade_id_arg: u64)]
pub struct FundTradeEscrow<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,

    #[account(
        mut,
        seeds = [b"trade".as_ref(), &_trade_id_arg.to_le_bytes()],
        bump = trade_account.bump,
        constraint = trade_account.seller == funder.key() @ TradeError::NotTradeSeller,
    )]
    pub trade_account: Account<'info, Trade>,

    #[account(mut)]
    pub funder_token_account: Option<Account<'info, TokenAccount>>,

    pub escrow_mint: Option<Account<'info, anchor_spl::token::Mint>>,

    #[account(
        init_if_needed,
        payer = funder,
        seeds = [b"trade_escrow_vault".as_ref(), trade_account.key().as_ref()],
        bump,
        token::mint = escrow_mint,
        token::authority = trade_account,
    )]
    pub escrow_vault_token_account: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
    pub system_program: Program<'info, System>,
    pub rent: Option<Sysvar<'info, Rent>>,

    pub profile_program: Program<'info, ProfileProgram>,
    #[account(
        mut,
        seeds = [b"profile", funder.key().as_ref()], 
        bump = seller_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub seller_profile: Account<'info, ProfileAccountData>,
    #[account(
        mut,
        seeds = [b"profile", trade_account.buyer.as_ref()],
        bump = buyer_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub buyer_profile: Account<'info, ProfileAccountData>,
    /// CHECK: This is trade_account.buyer
    #[account(address = trade_account.buyer @ TradeError::GenericError)]
    pub buyer_profile_authority_account_info: AccountInfo<'info>,
    #[account(
        seeds = [b"trade_global_state"],
        bump = trade_global_state.bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,
    #[account(
        seeds = [b"hub"],
        bump = hub_config_for_profile_cpi.bump,
        seeds::program = trade_global_state.hub_address 
    )]
    pub hub_config_for_profile_cpi: Account<'info, ProfileHubConfigStub>,
    /// CHECK: This is the Hub Program ID
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
#[instruction(_trade_id_arg: u64)]
pub struct ConfirmPaymentSent<'info> {
    #[account(mut)] 
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"trade".as_ref(), &_trade_id_arg.to_le_bytes()],
        bump = trade_account.bump,
        has_one = buyer @ TradeError::NotTradeBuyer
    )]
    pub trade_account: Account<'info, Trade>,
    
    #[account(
        seeds = [b"hub"], 
        bump = hub_config_for_dispute_timer.bump,
        seeds::program = trade_global_state.hub_address 
    )]
    pub hub_config_for_dispute_timer: Option<Account<'info, HubConfigAccount>>,
    
    #[account(
        seeds = [b"trade_global_state"], 
        bump = trade_global_state.bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,
}

#[derive(Accounts)]
#[instruction(_trade_id_arg: u64)] 
pub struct ReleaseEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>, 

    #[account(
        mut,
        seeds = [b"trade".as_ref(), &_trade_id_arg.to_le_bytes()],
        bump = trade_account.bump,
        has_one = buyer @ TradeError::NotTradeBuyer,
    )]
    pub trade_account: Box<Account<'info, Trade>>, 

    #[account(
        seeds = [b"trade_global_state"],
        bump = trade_global_state.bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,

    #[account(
        seeds = [b"hub"], 
        bump = hub_config.bump,
        seeds::program = trade_global_state.hub_address 
    )]
    pub hub_config: Box<Account<'info, HubConfigAccount>>, 

    /// CHECK: Verified in instruction logic: must match trade_account.seller
    #[account(mut)]
    pub seller_native_account: AccountInfo<'info>,
    /// CHECK: Verified in instruction logic: must match hub_config.chain_fee_collector_addr
    #[account(mut)]
    pub chain_fee_collector: AccountInfo<'info>,
    /// CHECK: Verified in instruction logic: must match hub_config.warchest_addr
    #[account(mut)]
    pub warchest_collector: AccountInfo<'info>,

    // Mint of the escrowed token. Required if SPL. Must match trade_account.escrow_mint_address
    // and escrow_vault.mint.
    pub escrow_vault_mint: Option<Box<Account<'info, anchor_spl::token::Mint>>>,

    // The SPL escrow vault PDA. Required if SPL trade.
    #[account(
        mut,
        seeds = [b"trade_escrow_vault".as_ref(), trade_account.key().as_ref()],
        bump, // Anchor will use the canonical bump for this PDA
        // Constraint: only if trade_account.escrow_type == EscrowType::Spl
        // Client should only pass if SPL.
    )]
    pub escrow_vault: Option<Box<Account<'info, TokenAccount>>>, 

    #[account(mut)] 
    pub seller_token_account: Option<Box<Account<'info, TokenAccount>>>,
    
    #[account(mut)] 
    pub chain_fee_collector_token_account: Option<Box<Account<'info, TokenAccount>>>,
    
    #[account(mut)] 
    pub warchest_token_account: Option<Box<Account<'info, TokenAccount>>>,

    pub token_program: Option<Program<'info, Token>>,
    pub system_program: Program<'info, System>, 

    pub profile_program: Program<'info, ProfileProgram>,

    #[account(
        mut,
        seeds = [b"profile", buyer.key().as_ref()], 
        bump = buyer_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub buyer_profile: Box<Account<'info, ProfileAccountData>>,

    #[account(
        mut,
        seeds = [b"profile", trade_account.seller.as_ref()], 
        bump = seller_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub seller_profile: Box<Account<'info, ProfileAccountData>>,

    /// CHECK: This is trade_account.seller
    #[account(address = trade_account.seller @ TradeError::GenericError)] 
    pub seller_profile_authority_account_info: AccountInfo<'info>,

    #[account(
        seeds = [b"hub"],
        bump = hub_config_for_profile_cpi.bump,
        seeds::program = trade_global_state.hub_address 
    )]
    pub hub_config_for_profile_cpi: Account<'info, ProfileHubConfigStub>,

    /// CHECK: This is the Hub Program ID
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

#[account]
pub struct TradeGlobalState {
    pub trades_count: u64, 
    pub hub_address: Pubkey, 
    pub bump: u8,          
}

impl TradeGlobalState {
    pub const SPACE: usize = 8 + 8 + 32 + 1; // Discriminator + u64 + Pubkey + u8
}

#[derive(InitSpace, AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TradeState {
    RequestCreated,    
    RequestAccepted,   
    EscrowFunded, 
    FiatDeposited, 
    EscrowReleased, 
    TradeSettledMaker, 
    TradeSettledTaker, 
    RequestCanceled, 
    EscrowRefunded,  
    DisputeOpened,   
    DisputeResolved, 
}

impl std::fmt::Display for TradeState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace, Debug)]
pub enum EscrowType {
    Native, 
    Spl,    
}

#[account]
#[derive(InitSpace)]
pub struct Trade {
    pub id: u64, 
    pub offer_id: u64, 
    pub buyer: Pubkey, 
    pub seller: Pubkey, 

    #[max_len(16)]
    pub crypto_denom_symbol: String, 
    pub crypto_amount: u64, 

    #[max_len(8)]
    pub fiat_currency_symbol: String, 

    pub exchange_rate: u64,
    pub exchange_rate_decimals: u8,

    pub state: TradeState, 

    pub escrow_type: EscrowType, 
    pub escrow_mint_address: Option<Pubkey>, 
    pub escrow_crypto_funded_amount: u64, 

    pub created_at_ts: i64, 
    pub updated_at_ts: i64, 
    pub expires_at_ts: i64, 
    pub dispute_window_ends_at_ts: Option<i64>, 

    #[max_len(100)]
    pub buyer_contact_info: Option<String>, 
    #[max_len(100)]
    pub seller_contact_info: Option<String>, 

    pub arbitrator: Option<Pubkey>, 

    pub bump: u8, 
}

#[error_code]
pub enum TradeError {
    #[msg("Generic error.")] 
    GenericError,
    #[msg("Trade ID counter overflow.")]
    TradeIdOverflow,
    #[msg("Buyer cannot be the same as the offer owner.")]
    BuyerIsOfferOwner,
    #[msg("Offer is not active and cannot be taken.")]
    OfferNotActive,
    #[msg("Trade amount is outside the range specified in the offer.")]
    AmountOutOfOfferRange,
    #[msg("Provided price account does not match the offer\'s currency pair.")]
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
    MissingSplAccounts, 
    #[msg("SPL token mint does not match trade details.")]
    SplMintMismatch, 
    #[msg("Escrow vault authority does not match trade account PDA.")]
    EscrowVaultAuthorityMismatch, 
    #[msg("Native SOL escrow should not have an escrow_mint_address defined.")]
    NativeEscrowShouldNotHaveMint, 
    #[msg("Math operation overflow.")]
    MathOverflow, 
    #[msg("Escrow is not funded or amount is zero.")]
    EscrowNotFundedOrEmpty, 
    #[msg("Calculated fees exceed total escrowed amount.")]
    FeesExceedEscrowAmount, 
    #[msg("Missing fee collector account for SPL transfer.")]
    MissingFeeCollectorAccount, 
    #[msg("Fee collector token account has mismatched mint.")]
    FeeCollectorMintMismatch, 
    #[msg("Missing seller account for SPL transfer.")]
    MissingSellerAccount, 
    #[msg("Dispute window has passed, cannot release directly.")]
    DisputeWindowPassed,
    #[msg("Missing escrow mint address from offer for SPL token trade.")]
    MissingEscrowMintFromOffer,
    #[msg("SPL accounts provided for a Native SOL trade, or Native accounts for SPL.")]
    EscrowTypeMismatch,
    #[msg("Funder's SPL token account is missing for SPL trade.")]
    MissingFunderTokenAccount,
    #[msg("Escrow vault (SPL token account) is missing for SPL trade.")]
    MissingEscrowVaultAccount,
    #[msg("Token Program is missing for SPL trade.")]
    MissingTokenProgram,
}
