use anchor_lang::prelude::*;
// Assuming the following paths are correct after Cargo.toml setup
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer, Mint};
use offer::program::Offer as OfferProgram; // To refer to the Offer program ID
use offer::{
    Offer as OfferAccountData,
    OfferStateAnchor,
};
use price::program::Price as PriceProgram; // To refer to the Price program ID
use price::CalculatedPriceAccount; // To refer to the Price account data structure

// Imports for Profile CPI
use profile::program::Profile as ProfileProgram;
use profile::{
    Profile as ProfileAccountData,
    TradeStateForProfileUpdate,
    HubConfigStub as ProfileHubConfigStub,
    ProfileGlobalState as ProfileGlobalStateAccount,
};

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

// Updated Trade account struct
#[account]
#[derive(InitSpace, Debug)]
pub struct Trade {
    pub id: u64,
    pub offer_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,

    #[max_len(10)] // Placeholder length for crypto symbol
    pub crypto_denom_symbol: String,
    pub crypto_amount: u64,

    #[max_len(10)] // Placeholder length for fiat symbol
    pub fiat_currency_symbol: String,
    // fiat_amount is calculated, not stored: price * crypto_amount

    pub exchange_rate: u64, // Price from oracle at time of trade creation
    pub exchange_rate_decimals: u8, // Decimals for the exchange_rate

    pub state: TradeState,
    pub escrow_type: EscrowType,
    pub escrow_mint_address: Option<Pubkey>, // For SPL tokens, Some(mint_address) or None for Native
    pub escrow_crypto_funded_amount: u64,    // Amount of crypto actually funded into escrow
    // pub escrow_vault_bump: Option<u8>, // Bump of the escrow PDA if applicable, might not be stored on Trade directly

    pub created_at_ts: i64,      // Unix timestamp of creation
    pub updated_at_ts: i64,      // Unix timestamp of last update
    pub expires_at_ts: i64,      // Unix timestamp when the trade offer acceptance/funding expires
    pub dispute_window_ends_at_ts: Option<i64>, // Unix timestamp when dispute window closes after payment confirmation

    #[max_len(100)] // Placeholder max length for contact info
    pub buyer_contact_info: Option<String>,
    #[max_len(100)] // Placeholder max length for contact info
    pub seller_contact_info: Option<String>,

    pub arbitrator: Option<Pubkey>, // Assigned arbitrator if disputed
    pub dispute_opener: Option<Pubkey>, // Added: Who opened the dispute
    #[max_len(280)] // Added: Reason for dispute (e.g. Twitter length)
    pub dispute_reason: Option<String>,
    pub bump: u8,                   // Bump for the Trade account PDA itself
}

// Add Event for TradeDisputed
#[event]
pub struct TradeDisputed {
    pub trade_id: u64,
    pub disputer: Pubkey,
    pub reason: Option<String>,
}

// Event for Arbitrator Assigned
#[event]
pub struct TradeArbitratorAssigned {
    pub trade_id: u64,
    pub arbitrator: Pubkey,
    pub assigned_by: Pubkey,
}

#[event]
pub struct TradeDisputeResolved {
    pub trade_id: u64,
    pub arbitrator: Pubkey,
    pub outcome: DisputeResolutionOutcome,
    pub amount_to_buyer: u64,
    pub amount_to_seller: u64,
    pub fees_paid: u64,
    pub reason: Option<String>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum DisputeResolutionOutcome {
    FavorBuyer,
    FavorSeller,
    NoAction, // e.g. if resolution implies something else like specific split or external handling
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum TradeState {
    RequestCreated,      // Buyer initiates, pending seller acceptance
    RequestAccepted,     // Seller accepts
    EscrowFunded,        // Seller funds escrow (crypto)
    FiatDeposited,       // Buyer confirms fiat payment sent
    EscrowReleased,      // Seller releases crypto to buyer (trade complete)
    RequestCanceled,     // Buyer or Seller cancels before funding
    TradeExpired,        // Trade expires due to timeout
    DisputeOpened,       // A dispute is opened by buyer or seller
    DisputeResolved,     // Arbitrator resolves dispute (implies final state like EscrowReleased/Refunded)
    TradeSettledMaker,   // For dispute resolution: maker (seller) receives funds
    TradeSettledTaker,   // For dispute resolution: taker (buyer) receives funds
    EscrowRefunded,      // For dispute resolution or cancellation: escrow returned to seller
}

impl std::fmt::Display for TradeState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self) // Default to Debug representation for Display
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum EscrowType {
    Native, // For SOL
    Spl,    // For SPL Tokens
}

#[account]
#[derive(InitSpace, Debug)]
pub struct TradeGlobalState {
    // Authority that can update global settings, typically an admin or multisig
    pub admin: Pubkey,
    // Counter for total trades created, used for generating unique trade IDs
    pub trades_count: u64,
    // Pubkey of the Hub program, used for CPIs to fetch HubConfig
    pub hub_address: Pubkey,
    // Bump seed for this PDA
    pub bump: u8,
}

declare_id!("8amGZVCwzB7i26AD39N26N47EMvjaFqRJmQJKYJNEG8Z");

#[error_code]
pub enum TradeError {
    #[msg("Generic error.")]
    GenericError,
    #[msg("Buyer cannot trade with themselves.")]
    BuyerIsOfferOwner,
    #[msg("Offer is not active.")]
    OfferNotActive,
    #[msg("Amount is out of offer range.")]
    AmountOutOfOfferRange,
    #[msg("Price account details mismatch offer details.")]
    PriceAccountMismatch,
    #[msg("Trade ID counter overflowed.")]
    TradeIdOverflow,
    #[msg("Timestamp calculation overflowed.")]
    TimestampOverflow,
    #[msg("SPL Escrow mint address is missing from the offer when it's required.")]
    MissingEscrowMintFromOffer,
    #[msg("The trade has expired.")]
    TradeExpired,
    #[msg("The trade is not in a state where it can be accepted.")]
    TradeNotAcceptable,
    #[msg("The signer is not the seller of this trade.")]
    NotTradeSeller,
    #[msg("The trade is not in a state where it can be funded.")]
    TradeNotFundable,
    #[msg("The escrow mint on the trade does not match the provided mint account.")]
    EscrowMintMismatch,
    #[msg("The escrow vault token account is missing for an SPL trade.")]
    MissingEscrowVault,
    #[msg("The funder token account is missing for an SPL trade.")]
    MissingFunderTokenAccount,
    #[msg("The token program is missing when required for SPL operations.")]
    MissingTokenProgram,
    #[msg("The system program is missing when required.")]
    MissingSystemProgram,
    #[msg("The rent sysvar is missing when required.")]
    MissingRentSysvar,
    #[msg("Insufficient funds in the funder's token account.")]
    InsufficientFunds,
    #[msg("The trade is not in a state where payment can be confirmed.")]
    TradeNotConfirmable,
    #[msg("The signer is not the buyer of this trade.")]
    NotTradeBuyer,
    #[msg("Dispute window has not been configured.")]
    DisputeWindowNotConfigured,
    #[msg("The trade is not in a state where it can be released.")]
    TradeNotReleasable,
    #[msg("The buyer is not the signer trying to release the escrow.")]
    BuyerNotSignerForRelease,
    #[msg("The trade is not yet eligible for release (still within dispute window).")]
    TradeInDisputeWindow,
    #[msg("The trade has already been disputed.")]
    TradeAlreadyDisputed,
    #[msg("Native SOL transfer failed.")]
    NativeTransferFailed,
    #[msg("SPL token transfer failed.")]
    SplTransferFailed,
    #[msg("Fee calculation resulted in an overflow.")]
    FeeOverflow,
    #[msg("Seller native account for SOL release does not match trade.seller.")]
    SellerNativeAccountMismatch,
    #[msg("Chain fee collector address in HubConfig does not match provided account.")]
    ChainFeeCollectorMismatch,
    #[msg("Warchest collector address in HubConfig does not match provided account.")]
    WarchestCollectorMismatch,
    #[msg("Escrow vault mint does not match trade_account.escrow_mint_address.")]
    EscrowVaultMintMismatch,
    #[msg("Escrow vault is missing when SPL token transfer is expected.")]
    EscrowVaultMissingForSpl,
    #[msg("Seller token account is missing for SPL token release.")]
    SellerTokenAccountMissingForSpl,
    #[msg("Chain fee collector token account is missing for SPL token fee collection.")]
    ChainFeeTokenAccountMissingForSpl,
    #[msg("Warchest token account is missing for SPL token fee collection.")]
    WarchestTokenAccountMissingForSpl,
    #[msg("The trade is not in a state where it can be disputed.")]
    TradeNotDisputable,
    #[msg("The disputer is neither the buyer nor the seller of the trade.")]
    DisputerNotPartyToTrade,
    #[msg("The trade is not in a state where an arbitrator can be assigned.")]
    TradeNotAssignableForArbitration,
    #[msg("Only the admin can assign an arbitrator.")]
    ArbitratorNotAdmin,
    #[msg("The trade is not in a state for dispute resolution by an arbitrator.")]
    TradeNotResolvableByArbitrator,
    #[msg("The signer is not the assigned arbitrator for this trade.")]
    NotAssignedArbitrator,
    #[msg("The arbitrator account is not initialized.")]
    ArbitratorAccountNotInitialized,
    #[msg("The arbitrator profile account is not initialized.")]
    ArbitratorProfileNotInitialized,
    #[msg("Cannot resolve with NoAction if trade is not already settled or refunded.")]
    InvalidNoActionResolution,
    #[msg("The trade is not in a state where it can be settled by parties.")]
    TradeNotSettlableByParties,
    #[msg("Signer is not a party to the trade (buyer or seller).")]
    SignerNotPartyToTradeForSettle,
    #[msg("The trade is not in a state where it can be refunded by parties.")]
    TradeNotRefundableByParties,
    #[msg("Fee collector token account not found")]
    MissingFeeCollectorTokenAccount,

    // Added missing variants from build log
    #[msg("Invalid offer data provided.")]
    InvalidOfferData,
    #[msg("SPL mint does not match expected mint.")]
    SplMintMismatch,
    // TokenTransferFailed already covered by SplTransferFailed
    #[msg("Trade is in an invalid state for this operation.")]
    InvalidTradeState,
    #[msg("The dispute window for this trade has passed.")]
    DisputeWindowPassed,
    #[msg("Escrow is not funded or is empty.")]
    EscrowNotFundedOrEmpty,
    // MathOverflow already covered by FeeOverflow
    #[msg("Calculated fees exceed the total escrow amount.")]
    FeesExceedEscrowAmount,
    #[msg("The specified escrow type is not supported for this operation.")]
    EscrowTypeNotSupported,
    #[msg("Missing escrow vault account.")]
    MissingEscrowVaultAccount, // Distinct from MissingEscrowVault which is for SPL trades
    #[msg("Escrow vault authority does not match expected authority.")]
    EscrowVaultAuthorityMismatch,
    // MissingEscrowMint covered by MissingEscrowMintFromOffer or implies specific SPL context
    #[msg("Seller account is missing.")]
    MissingSellerAccount,
    #[msg("Fee collector mint does not match expected mint.")]
    FeeCollectorMintMismatch,
    #[msg("Missing fee collector account.")]
    MissingFeeCollectorAccount, // Distinct from MissingFeeCollectorTokenAccount
    #[msg("Signer is not a participant in this trade.")]
    NotTradeParticipant,
    #[msg("Trade is in an invalid state to be disputed.")]
    InvalidTradeStateForDispute,
    #[msg("Trade has already been disputed or is finalized.")]
    TradeAlreadyDisputedOrFinalized,
    #[msg("Dispute reason exceeds maximum allowed length.")]
    DisputeReasonTooLong,
    #[msg("Signer is not the Hub admin.")]
    NotHubAdmin,
    #[msg("Trade is not currently disputed.")]
    TradeNotDisputed,
    #[msg("An arbitrator has already been assigned to this trade.")]
    ArbitratorAlreadyAssigned,
    #[msg("The proposed arbitrator cannot be a participant in the trade.")]
    ArbitratorCannotBeParticipant,
    #[msg("No arbitrator has been assigned to this trade yet.")]
    ArbitratorNotAssigned,
    #[msg("Signer is not the designated arbitrator for this trade.")]
    NotDesignatedArbitrator,
    #[msg("Recipient account does not match the expected recipient.")]
    RecipientMismatch,
    #[msg("Missing recipient token account.")]
    MissingRecipientTokenAccount,
    #[msg("Missing seller token account.")] // This seems specific enough to keep
    MissingSellerTokenAccount,

    // Additional variants based on recent linter errors and initial build log
    #[msg("Escrow has already been funded.")]
    EscrowAlreadyFunded,
    #[msg("Escrow amount does not match expected amount or is invalid.")]
    EscrowAmountMismatch,
    #[msg("Escrow type (Native/SPL) mismatch for the operation.")]
    EscrowTypeMismatch,
    #[msg("Native escrow should not have a mint address specified.")]
    NativeEscrowShouldNotHaveMint,
    #[msg("SPL escrow is missing a required mint address.")]
    MissingEscrowMint, // General missing mint for SPL, distinct from MissingEscrowMintFromOffer
    #[msg("Token transfer operation failed.")]
    TokenTransferFailed, // General token transfer error
    #[msg("Mathematical operation resulted in an overflow.")]
    MathOverflow, // General math overflow, distinct from FeeOverflow

    // Profile CPI specific errors - can be more granular if needed
    #[msg("Profile CPI: Hub config account mismatch for profile update.")]
    ProfileCpiHubConfigMismatch,
    #[msg("Profile CPI: Hub program ID mismatch for profile update.")]
    ProfileCpiHubProgramIdMismatch,
    #[msg("Profile CPI: Profile global state account mismatch for profile update.")]
    ProfileCpiGlobalStateMismatch,
    #[msg("Profile CPI: Buyer profile account mismatch for profile update.")]
    ProfileCpiBuyerProfileMismatch,
    #[msg("Profile CPI: Seller profile account mismatch for profile update.")]
    ProfileCpiSellerProfileMismatch,
    #[msg("Profile CPI: Seller profile authority mismatch.")]
    ProfileCpiSellerProfileAuthorityMismatch,
    #[msg("Profile CPI: Buyer profile authority mismatch.")]
    ProfileCpiBuyerProfileAuthorityMismatch,
} // THIS CLOSES TradeError ENUM

// Placeholder for AssignArbitrator accounts struct
#[derive(Accounts)]
#[instruction(_trade_id_arg: u64, arbitrator_pubkey: Pubkey)] // Added instruction args
pub struct AssignArbitrator<'info> {
    #[account(mut,
        seeds = [b"trade".as_ref(), &_trade_id_arg.to_le_bytes()],
        bump = trade_account.bump
    )]
    pub trade_account: Account<'info, Trade>,

    // Authority that can assign arbitrator (e.g. Hub admin)
    pub admin_signer: Signer<'info>, // Renamed from admin_or_authority

    // Need TradeGlobalState to get hub_address for hub_config constraint
    #[account(
        seeds = [b"trade_global_state"],
        bump = trade_global_state.bump // Ensuring trade_global_state is defined with its bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,

    // Hub Config to check if admin_signer is the actual admin
    #[account(
        seeds = [b"hub"], 
        bump = hub_config.bump, // Ensuring hub_config is defined with its bump
        seeds::program = trade_global_state.hub_address // Use hub_address from trade_global_state
    )]
    pub hub_config: Account<'info, HubConfigAccount>,
}

// Placeholder for ArbitratorResolveDispute accounts struct
#[derive(Accounts)]
#[instruction(_trade_id_arg: u64, resolution_outcome: DisputeResolutionOutcome, resolution_reason: Option<String>)]
pub struct ArbitratorResolveDispute<'info> {
    #[account(mut,
        seeds = [b"trade".as_ref(), &_trade_id_arg.to_le_bytes()],
        bump = trade_account.bump
    )]
    pub trade_account: Box<Account<'info, Trade>>,

    // The arbitrator signing the transaction
    pub arbitrator_signer: Signer<'info>, // Renamed from 'arbitrator' to match instruction usage

    // Trade Global State (to get hub_address for hub_config and for Profile CPIs)
    #[account(
        seeds = [b"trade_global_state"],
        bump = trade_global_state.bump
    )]
    pub trade_global_state: Box<Account<'info, TradeGlobalState>>, // Boxed

    // Hub Config for fees and admin checks if needed here (though admin not directly used)
    #[account(
        seeds = [b"hub"],
        bump = hub_config.bump,
        seeds::program = trade_global_state.hub_address
    )]
    pub hub_config: Box<Account<'info, HubConfigAccount>>, // Boxed as it's large

    // Native SOL transfer accounts (receiver + fee collectors)
    /// CHECK: Verified in instruction logic: must match trade_account.buyer or trade_account.seller
    #[account(mut)]
    pub buyer_native_account: AccountInfo<'info>,
    /// CHECK: Verified in instruction logic: must match trade_account.seller or trade_account.buyer
    #[account(mut)]
    pub seller_native_account: AccountInfo<'info>,
    /// CHECK: Verified in instruction logic: must match hub_config.chain_fee_collector_addr
    #[account(mut)]
    pub chain_fee_collector: AccountInfo<'info>,
    /// CHECK: Verified in instruction logic: must match hub_config.warchest_addr
    #[account(mut)]
    pub warchest_collector: AccountInfo<'info>,

    // SPL Token transfer accounts
    // Mint of the escrowed token. Required if SPL. Must match trade_account.escrow_mint_address and escrow_vault.mint.
    pub escrow_vault_mint: Option<Account<'info, Mint>>,

    #[account(mut,
        seeds = [b"trade_escrow_vault".as_ref(), trade_account.key().as_ref()],
        bump // Anchor will use the canonical bump for this PDA
    )]
    pub escrow_vault: Option<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub buyer_token_account: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub seller_token_account: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub chain_fee_collector_token_account: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub warchest_token_account: Option<Account<'info, TokenAccount>>,

    // System Programs
    pub token_program: Option<Program<'info, Token>>,
    pub system_program: Program<'info, System>,

    // Accounts for Profile CPI (similar to ReleaseEscrow but for both parties)
    pub profile_program: Program<'info, ProfileProgram>,

    #[account(mut,
        seeds = [b"profile", trade_account.buyer.as_ref()],
        bump = buyer_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub buyer_profile: Box<Account<'info, ProfileAccountData>>,
    /// CHECK: This is trade_account.buyer
    #[account(address = trade_account.buyer @ TradeError::ProfileCpiBuyerProfileAuthorityMismatch)]
    pub buyer_profile_authority_info: AccountInfo<'info>,

    #[account(mut,
        seeds = [b"profile", trade_account.seller.as_ref()],
        bump = seller_profile.bump,
        seeds::program = profile_program.key()
    )]
    pub seller_profile: Box<Account<'info, ProfileAccountData>>,
    /// CHECK: This is trade_account.seller
    #[account(address = trade_account.seller @ TradeError::ProfileCpiSellerProfileAuthorityMismatch)]
    pub seller_profile_authority_info: AccountInfo<'info>,

    // Hub Config and Program ID specifically for Profile CPI (can reuse trade_global_state.hub_address)
    #[account(
        seeds = [b"hub"],
        bump = hub_config_for_profile_cpi.bump,
        seeds::program = trade_global_state.hub_address
    )]
    pub hub_config_for_profile_cpi: Account<'info, ProfileHubConfigStub>,
    /// CHECK: This is the Hub Program ID for Profile CPI
    #[account(address = trade_global_state.hub_address @ TradeError::ProfileCpiHubProgramIdMismatch)]
    pub hub_program_id_for_profile_cpi: AccountInfo<'info>,

    // Profile Global States for CPI
    #[account(
        seeds = [b"profile_global_state"],
        bump, // Anchor infers bump
        seeds::program = profile_program.key()
    )]
    pub profile_global_state_for_buyer: Box<Account<'info, ProfileGlobalStateAccount>>, // Boxed

    #[account(
        seeds = [b"profile_global_state"],
        bump, // Anchor infers bump
        seeds::program = profile_program.key()
    )]
    pub profile_global_state_for_seller: Box<Account<'info, ProfileGlobalStateAccount>>, // Boxed
}

#[program]
pub mod trade {
    use super::*;
    // Placeholder initialize, actual init for global state will be added
    pub fn initialize_trade_global_state(ctx: Context<InitializeTradeGlobalState>) -> Result<()> {
        let global_state = &mut ctx.accounts.trade_global_state;
        global_state.admin = ctx.accounts.authority.key();
        global_state.trades_count = 0;
        global_state.hub_address = Pubkey::default(); // Not registered yet
        global_state.bump = ctx.bumps.trade_global_state;
        Ok(())
    }

    pub fn register_hub(ctx: Context<RegisterHub>, hub_program_address: Pubkey) -> Result<()> {
        let global_state = &mut ctx.accounts.trade_global_state;
        global_state.hub_address = hub_program_address;
        msg!("Trade program registered with Hub program: {}", hub_program_address);
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
        profile::cpi::update_trades_count(cpi_ctx_seller, trade_state_update.clone())?;

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
        profile::cpi::update_trades_count(cpi_ctx_seller, trade_state_update.clone())?;

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
        let trade_account = &mut ctx.accounts.trade_account; 

        // Validation 1: Caller (buyer) must be the trade's buyer (handled by has_one)
        // Validation 2: Trade must be in FiatDeposited state
        require_eq!(
            trade_account.state,
            TradeState::FiatDeposited,
            TradeError::InvalidTradeState
        );

        // Validation 3: Check if dispute window has passed (if applicable)
        if let Some(dispute_window_end) = trade_account.dispute_window_ends_at_ts {
            require!(
                current_timestamp <= dispute_window_end,
                TradeError::DisputeWindowPassed
            );
        }

        // Validation 4: Escrow must be funded with the expected amount
        require!(
            trade_account.escrow_crypto_funded_amount > 0 &&
            trade_account.escrow_crypto_funded_amount == trade_account.crypto_amount,
            TradeError::EscrowNotFundedOrEmpty
        );
        
        let hub_config = &ctx.accounts.hub_config;
        let total_escrowed_amount = trade_account.escrow_crypto_funded_amount;

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
        let trade_id_bytes = trade_account.id.to_le_bytes();
        let bump_seed = [trade_account.bump];
        let signer_seeds: &[&[u8]] = &[
            b"trade",
            &trade_id_bytes,
            &bump_seed,
        ];
        let signer_seeds_array: &[&[&[u8]]] = &[signer_seeds];

        match trade_account.escrow_type {
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
                    require_keys_eq!(ctx.accounts.seller_native_account.key(), trade_account.seller, TradeError::GenericError); 
                    anchor_lang::solana_program::program::invoke_signed(
                        &anchor_lang::solana_program::system_instruction::transfer(
                            &trade_pda_account_info.key(),
                            &ctx.accounts.seller_native_account.key(),
                            amount_to_seller,
                        ),
                        &[
                            trade_pda_account_info.clone(),
                            ctx.accounts.seller_native_account.clone(),
                            ctx.accounts.system_program.to_account_info(),
                        ],
                        signer_seeds_array,
                    )
                    .map_err(|_| TradeError::NativeTransferFailed)?;
                }

                if chain_fee > 0 {
                    require_keys_eq!(ctx.accounts.chain_fee_collector.key(), hub_config.chain_fee_collector_addr, TradeError::GenericError);
                    anchor_lang::solana_program::program::invoke_signed(
                        &anchor_lang::solana_program::system_instruction::transfer(
                            &trade_pda_account_info.key(),
                            &ctx.accounts.chain_fee_collector.key(),
                            chain_fee,
                        ),
                        &[
                            trade_pda_account_info.clone(),
                            ctx.accounts.chain_fee_collector.clone(),
                            ctx.accounts.system_program.to_account_info(),
                        ],
                        signer_seeds_array,
                    )
                    .map_err(|_| TradeError::NativeTransferFailed)?;
                }

                if warchest_fee > 0 {
                    require_keys_eq!(ctx.accounts.warchest_collector.key(), hub_config.warchest_addr, TradeError::GenericError);
                    anchor_lang::solana_program::program::invoke_signed(
                        &anchor_lang::solana_program::system_instruction::transfer(
                            &trade_pda_account_info.key(),
                            &ctx.accounts.warchest_collector.key(),
                            warchest_fee,
                        ),
                        &[
                            trade_pda_account_info.clone(),
                            ctx.accounts.warchest_collector.clone(),
                            ctx.accounts.system_program.to_account_info(),
                        ],
                        signer_seeds_array,
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
                if let Some(expected_mint) = trade_account.escrow_mint_address {
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
                            signer_seeds_array,
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
                            signer_seeds_array,
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
                            signer_seeds_array,
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
                            signer_seeds_array,
                        ),
                        burn_fee,
                    )
                    .map_err(|_| TradeError::TokenTransferFailed)?;
                }
            }
        }

        trade_account.state = TradeState::TradeSettledMaker;
        trade_account.updated_at_ts = current_timestamp;

        msg!(
            "Escrow released for trade #{}. State: {:?}. Amount to seller: {}, Fees: (Burn: {}, Chain: {}, Warchest: {})",
            trade_account.id,
            trade_account.state,
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
        profile::cpi::update_trades_count(cpi_ctx_buyer, trade_state_update.clone())?;

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

    pub fn dispute_trade(
        ctx: Context<DisputeTrade>,
        _trade_id_arg: u64, // Used for PDA derivation, matches trade_account.id
        reason: Option<String>,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;
        let trade_account = &mut ctx.accounts.trade_account;
        let disputer_key = ctx.accounts.disputer.key();

        // Validation 1: Disputer must be buyer or seller
        require!(
            disputer_key == trade_account.buyer || disputer_key == trade_account.seller,
            TradeError::NotTradeParticipant
        );

        // Validation 2: Trade must be in a state that allows dispute
        // Typically FiatDeposited, or EscrowFunded if seller disputes non-payment
        // Or RequestAccepted if buyer disputes seller's non-funding.
        // For now, let's allow from EscrowFunded or FiatDeposited.
        require!(
            trade_account.state == TradeState::EscrowFunded
                || trade_account.state == TradeState::FiatDeposited,
            TradeError::InvalidTradeStateForDispute
        );

        // Validation 3: Trade not already disputed or resolved/canceled
        require!(
            trade_account.state != TradeState::DisputeOpened
                && trade_account.state != TradeState::DisputeResolved
                && trade_account.state != TradeState::EscrowReleased
                && trade_account.state != TradeState::EscrowRefunded
                && trade_account.state != TradeState::RequestCanceled,
            TradeError::TradeAlreadyDisputedOrFinalized
        );
        
        // Optional: Check against hub_config.trade_dispute_timer if it defines a window *to open* a dispute.
        // Current understanding is that trade_dispute_timer is for how long a dispute *lasts* or a window for seller to respond.
        // For now, we allow opening dispute as long as state is valid.

        trade_account.state = TradeState::DisputeOpened;
        trade_account.dispute_opener = Some(disputer_key);
        if let Some(ref r) = reason {
            require!(r.len() <= 200, TradeError::DisputeReasonTooLong);
        }
        trade_account.dispute_reason = reason.clone(); // Store the reason
        trade_account.updated_at_ts = current_timestamp;
        // `dispute_window_ends_at_ts` might be repurposed or a new field like `dispute_resolution_deadline_ts` could be set here based on HubConfig.

        emit!(TradeDisputed {
            trade_id: trade_account.id,
            disputer: disputer_key,
            reason: reason,
        });

        msg!(
            "Trade #{} disputed by {}. State: {:?}. Reason: {:?}",
            trade_account.id,
            disputer_key,
            trade_account.state,
            trade_account.dispute_reason
        );
        
        // CPI to Profile program for disputer
        let trade_state_update = TradeStateForProfileUpdate::DisputeOpened;

        let cpi_accounts_disputer_profile_update = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.disputer_profile.to_account_info(),
            profile_authority: ctx.accounts.disputer.to_account_info(),
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state.to_account_info(),
        };
        let cpi_program_profile = ctx.accounts.profile_program.to_account_info();
        profile::cpi::update_trades_count(CpiContext::new(cpi_program_profile, cpi_accounts_disputer_profile_update), trade_state_update.clone())?;
        
        // CPI to Profile program for the other party (non-disputer)
        // Determine the other party and their profile
        let (other_party_profile_info, other_party_authority_info) = if disputer_key == trade_account.buyer {
            (ctx.accounts.seller_profile.to_account_info(), ctx.accounts.seller_profile_authority_info.to_account_info())
        } else {
            (ctx.accounts.buyer_profile.to_account_info(), ctx.accounts.buyer_profile_authority_info.to_account_info())
        };

        let cpi_accounts_other_party_profile_update = profile::cpi::accounts::UpdateTradesCount {
            profile: other_party_profile_info,
            profile_authority: other_party_authority_info,
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state.to_account_info(), // Assuming same global state for profile
        };
        let cpi_program_profile_other = ctx.accounts.profile_program.to_account_info(); // Same program
        profile::cpi::update_trades_count(CpiContext::new(cpi_program_profile_other, cpi_accounts_other_party_profile_update), trade_state_update)?;


        Ok(())
    }

    pub fn assign_arbitrator(
        ctx: Context<AssignArbitrator>,
        _trade_id_arg: u64, // Used for PDA derivation
        arbitrator_pubkey: Pubkey,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let trade_account = &mut ctx.accounts.trade_account;

        // Validation 1: Signer must be the Hub admin
        require_keys_eq!(
            ctx.accounts.admin_signer.key(),
            ctx.accounts.hub_config.admin_addr,
            TradeError::NotHubAdmin
        );

        // Validation 2: Trade must be in DisputeOpened state
        require_eq!(
            trade_account.state,
            TradeState::DisputeOpened,
            TradeError::TradeNotDisputed
        );

        // Validation 3: Arbitrator should not already be assigned
        require!(
            trade_account.arbitrator.is_none(),
            TradeError::ArbitratorAlreadyAssigned
        );
        
        // Validation 4: Arbitrator cannot be the buyer or seller
        require_keys_neq!(
            arbitrator_pubkey,
            trade_account.buyer,
            TradeError::ArbitratorCannotBeParticipant
        );
        require_keys_neq!(
            arbitrator_pubkey,
            trade_account.seller,
            TradeError::ArbitratorCannotBeParticipant
        );


        trade_account.arbitrator = Some(arbitrator_pubkey);
        trade_account.updated_at_ts = clock.unix_timestamp;

        emit!(TradeArbitratorAssigned {
            trade_id: trade_account.id,
            arbitrator: arbitrator_pubkey,
            assigned_by: ctx.accounts.admin_signer.key(),
        });

        msg!(
            "Arbitrator {} assigned to trade #{} by admin {}",
            arbitrator_pubkey,
            trade_account.id,
            ctx.accounts.admin_signer.key()
        );
        Ok(())
    }

    pub fn arbitrator_resolve_dispute(
        ctx: Context<ArbitratorResolveDispute>,
        _trade_id_arg: u64,
        resolution_outcome: DisputeResolutionOutcome,
        resolution_reason: Option<String>,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;
        let trade_pda_account_info = ctx.accounts.trade_account.to_account_info();
        let trade_account = &mut ctx.accounts.trade_account;

        // Validation 1: Signer must be the assigned arbitrator
        require!(
            trade_account.arbitrator.is_some(),
            TradeError::ArbitratorNotAssigned
        );
        require_keys_eq!(
            ctx.accounts.arbitrator_signer.key(),
            trade_account.arbitrator.unwrap(),
            TradeError::NotDesignatedArbitrator
        );

        // Validation 2: Trade must be in DisputeOpened state
        require_eq!(
            trade_account.state,
            TradeState::DisputeOpened,
            TradeError::TradeNotDisputed
        );

        // Validation 3: Resolution reason length
        if let Some(ref reason) = resolution_reason {
            require!(reason.len() <= 200, TradeError::DisputeReasonTooLong);
        }

        let hub_config = &ctx.accounts.hub_config;
        let total_escrowed_amount = trade_account.escrow_crypto_funded_amount;
        let mut amount_to_buyer_resolved: u64 = 0;
        let mut amount_to_seller_resolved: u64 = 0;
        let mut total_fees_resolved: u64 = 0;

        // Logic based on resolution_outcome
        match resolution_outcome {
            DisputeResolutionOutcome::FavorBuyer => {
                // For simplicity, assume if arbitrator favors buyer, buyer gets full refund, no fees are taken from escrow.
                // This might differ based on actual platform rules for dispute resolution fees.
                // For now, let's assume full refund to buyer, fees are perhaps waived or handled differently.
                amount_to_buyer_resolved = total_escrowed_amount;
                amount_to_seller_resolved = 0;
                total_fees_resolved = 0;
                // If there are fees even when favoring buyer, they'd be calculated here and subtracted.
            }
            DisputeResolutionOutcome::FavorSeller => {
                // If arbitrator favors seller, it's similar to a normal release_escrow
                // Calculate fees like in release_escrow
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

                total_fees_resolved = burn_fee
                    .checked_add(chain_fee)
                    .ok_or(TradeError::MathOverflow)?
                    .checked_add(warchest_fee)
                    .ok_or(TradeError::MathOverflow)?;

                require!(
                    total_fees_resolved <= total_escrowed_amount,
                    TradeError::FeesExceedEscrowAmount
                );

                amount_to_seller_resolved = total_escrowed_amount
                    .checked_sub(total_fees_resolved)
                    .ok_or(TradeError::MathOverflow)?;
                amount_to_buyer_resolved = 0;
            }
            DisputeResolutionOutcome::NoAction => {
                // In NoAction, funds might remain in escrow or be handled by a different process.
                // For now, this means no on-chain fund movement by this instruction.
                // The state will be updated to DisputeResolved.
                // Or, this could be an error if NoAction is not supposed to be passed to this specific function.
                // For now, let's assume it just means no fund movement.
                amount_to_buyer_resolved = 0;
                amount_to_seller_resolved = 0;
                total_fees_resolved = 0;
            }
        }
        
        // Perform fund transfers if amounts are greater than 0
        let trade_id_bytes = trade_account.id.to_le_bytes();
        let bump_seed = [trade_account.bump];
        let signer_seeds: &[&[u8]] = &[
            b"trade",
            &trade_id_bytes,
            &bump_seed,
        ];
        let signer_seeds_array: &[&[&[u8]]] = &[signer_seeds];

        match trade_account.escrow_type {
            EscrowType::Native => {
                if amount_to_buyer_resolved > 0 {
                    require_keys_eq!(ctx.accounts.buyer_native_account.key(), trade_account.buyer, TradeError::RecipientMismatch);
                    anchor_lang::solana_program::program::invoke_signed(
                        &anchor_lang::solana_program::system_instruction::transfer(
                            &trade_pda_account_info.key(), 
                            &ctx.accounts.buyer_native_account.key(), 
                            amount_to_buyer_resolved,
                        ),
                        &[
                            trade_pda_account_info.clone(),
                            ctx.accounts.buyer_native_account.clone(),
                            ctx.accounts.system_program.to_account_info(),
                        ],
                        &[signer_seeds], 
                    )
                    .map_err(|_| TradeError::NativeTransferFailed)?;
                }

                if amount_to_seller_resolved > 0 {
                     require_keys_eq!(ctx.accounts.seller_native_account.key(), trade_account.seller, TradeError::RecipientMismatch);
                    anchor_lang::solana_program::program::invoke_signed(
                        &anchor_lang::solana_program::system_instruction::transfer(
                            &trade_pda_account_info.key(), 
                            &ctx.accounts.seller_native_account.key(), 
                            amount_to_seller_resolved,
                        ),
                        &[
                            trade_pda_account_info.clone(),
                            ctx.accounts.seller_native_account.clone(),
                            ctx.accounts.system_program.to_account_info(),
                        ],
                        signer_seeds_array,
                    )
                    .map_err(|_| TradeError::NativeTransferFailed)?;
                }
                
                // Fee transfers if any (only if favoring seller in current logic)
                if resolution_outcome == DisputeResolutionOutcome::FavorSeller && total_fees_resolved > 0 {
                    let burn_fee = total_escrowed_amount.checked_mul(hub_config.burn_fee_basis_points as u64).unwrap_or(0) / 10000; 
                    let chain_fee = total_escrowed_amount.checked_mul(hub_config.chain_fee_basis_points as u64).unwrap_or(0) / 10000;
                    let warchest_fee = total_escrowed_amount.checked_mul(hub_config.warchest_fee_basis_points as u64).unwrap_or(0) / 10000;

                    if chain_fee > 0 {
                        require_keys_eq!(ctx.accounts.chain_fee_collector.key(), hub_config.chain_fee_collector_addr, TradeError::RecipientMismatch);
                        anchor_lang::solana_program::program::invoke_signed(
                            &anchor_lang::solana_program::system_instruction::transfer(
                                &trade_pda_account_info.key(),
                                &ctx.accounts.chain_fee_collector.key(),
                                chain_fee,
                            ),
                            &[
                                trade_pda_account_info.clone(),
                                ctx.accounts.chain_fee_collector.clone(),
                                ctx.accounts.system_program.to_account_info(),
                            ],
                            signer_seeds_array,
                        )
                        .map_err(|_| TradeError::NativeTransferFailed)?;
                    }
                    if warchest_fee > 0 {
                         require_keys_eq!(ctx.accounts.warchest_collector.key(), hub_config.warchest_addr, TradeError::RecipientMismatch);
                        anchor_lang::solana_program::program::invoke_signed(
                            &anchor_lang::solana_program::system_instruction::transfer(
                                &trade_pda_account_info.key(),
                                &ctx.accounts.warchest_collector.key(),
                                warchest_fee,
                            ),
                            &[
                                trade_pda_account_info.clone(),
                                ctx.accounts.warchest_collector.clone(),
                                ctx.accounts.system_program.to_account_info(),
                            ],
                            signer_seeds_array,
                        )
                        .map_err(|_| TradeError::NativeTransferFailed)?;
                    }
                }
            }
            EscrowType::Spl => {
                let token_program_info = ctx
                    .accounts
                    .token_program
                    .as_ref()
                    .ok_or(TradeError::MissingTokenProgram)?
                    .to_account_info();
                let escrow_vault_account_info = ctx 
                    .accounts
                    .escrow_vault
                    .as_ref()
                    .ok_or(TradeError::MissingEscrowVaultAccount)?
                    .to_account_info(); 
                 let escrow_vault_token_account_data = ctx.accounts.escrow_vault.as_ref().unwrap(); 

                if amount_to_buyer_resolved > 0 {
                    let buyer_token_account_info = ctx 
                        .accounts
                        .buyer_token_account
                        .as_ref()
                        .ok_or(TradeError::MissingRecipientTokenAccount)?
                        .to_account_info();
                    let buyer_token_account_data = ctx.accounts.buyer_token_account.as_ref().unwrap(); 
                    require_keys_eq!(*buyer_token_account_info.owner, trade_account.buyer, TradeError::RecipientMismatch);
                    require_keys_eq!(escrow_vault_token_account_data.mint, buyer_token_account_data.mint, TradeError::SplMintMismatch);

                    let cpi_accounts = SplTransfer {
                        from: escrow_vault_account_info.clone(),
                        to: buyer_token_account_info.clone(),
                        authority: trade_pda_account_info.clone(),
                    };
                    token::transfer(
                        CpiContext::new_with_signer(
                            token_program_info.clone(),
                            cpi_accounts,
                            signer_seeds_array, 
                        ),
                        amount_to_buyer_resolved,
                    )
                    .map_err(|_| TradeError::TokenTransferFailed)?;
                }

                if amount_to_seller_resolved > 0 {
                    let seller_token_account_info = ctx 
                        .accounts
                        .seller_token_account
                        .as_ref()
                        .ok_or(TradeError::MissingSellerTokenAccount)?
                        .to_account_info();
                     let seller_token_account_data = ctx.accounts.seller_token_account.as_ref().unwrap(); 
                    require_keys_eq!(*seller_token_account_info.owner, trade_account.seller, TradeError::RecipientMismatch);
                    require_keys_eq!(escrow_vault_token_account_data.mint, seller_token_account_data.mint, TradeError::SplMintMismatch);

                    let cpi_accounts = SplTransfer {
                        from: escrow_vault_account_info.clone(),
                        to: seller_token_account_info.clone(),
                        authority: trade_pda_account_info.clone(),
                    };
                    token::transfer(
                        CpiContext::new_with_signer(
                            token_program_info.clone(),
                            cpi_accounts,
                            signer_seeds_array, 
                        ),
                        amount_to_seller_resolved,
                    )
                    .map_err(|_| TradeError::TokenTransferFailed)?;
                }

                if resolution_outcome == DisputeResolutionOutcome::FavorSeller && total_fees_resolved > 0 {
                    let burn_fee = total_escrowed_amount.checked_mul(hub_config.burn_fee_basis_points as u64).unwrap_or(0) / 10000;
                    let chain_fee = total_escrowed_amount.checked_mul(hub_config.chain_fee_basis_points as u64).unwrap_or(0) / 10000;
                    let warchest_fee = total_escrowed_amount.checked_mul(hub_config.warchest_fee_basis_points as u64).unwrap_or(0) / 10000;

                    if chain_fee > 0 {
                        let chain_fee_collector_token_account_info = ctx 
                            .accounts
                            .chain_fee_collector_token_account
                            .as_ref()
                            .ok_or(TradeError::MissingFeeCollectorTokenAccount)?
                            .to_account_info();
                        let chain_fee_collector_token_account_data = ctx.accounts.chain_fee_collector_token_account.as_ref().unwrap(); 
                         require_keys_eq!(*chain_fee_collector_token_account_info.owner, hub_config.chain_fee_collector_addr, TradeError::RecipientMismatch);
                         require_keys_eq!(escrow_vault_token_account_data.mint, chain_fee_collector_token_account_data.mint, TradeError::SplMintMismatch);

                        let cpi_accounts = SplTransfer {
                            from: escrow_vault_account_info.clone(),
                            to: chain_fee_collector_token_account_info.clone(),
                            authority: trade_pda_account_info.clone(),
                        };
                        token::transfer(
                            CpiContext::new_with_signer(
                                token_program_info.clone(),
                                cpi_accounts,
                                signer_seeds_array, 
                            ),
                            chain_fee,
                        )
                        .map_err(|_| TradeError::TokenTransferFailed)?;
                    }

                    if warchest_fee > 0 {
                        let warchest_token_account_info = ctx 
                            .accounts
                            .warchest_token_account
                            .as_ref()
                            .ok_or(TradeError::MissingFeeCollectorTokenAccount)? 
                            .to_account_info();
                        let warchest_token_account_data = ctx.accounts.warchest_token_account.as_ref().unwrap(); 
                        require_keys_eq!(*warchest_token_account_info.owner, hub_config.warchest_addr, TradeError::RecipientMismatch);
                        require_keys_eq!(escrow_vault_token_account_data.mint, warchest_token_account_data.mint, TradeError::SplMintMismatch);

                        let cpi_accounts = SplTransfer {
                            from: escrow_vault_account_info.clone(),
                            to: warchest_token_account_info.clone(),
                            authority: trade_pda_account_info.clone(),
                        };
                        token::transfer(
                            CpiContext::new_with_signer(
                                token_program_info.clone(),
                                cpi_accounts,
                                signer_seeds_array, 
                            ),
                            warchest_fee,
                        )
                        .map_err(|_| TradeError::TokenTransferFailed)?;
                    }
                    
                    if burn_fee > 0 {
                        let escrow_mint_account_info = ctx 
                            .accounts
                            .escrow_vault_mint
                            .as_ref()
                            .ok_or(TradeError::MissingEscrowMint)?
                            .to_account_info();
                        require_keys_eq!(escrow_mint_account_info.key(), escrow_vault_token_account_data.mint, TradeError::SplMintMismatch);

                        let cpi_accounts = token::Burn {
                            mint: escrow_mint_account_info.clone(), 
                            from: escrow_vault_account_info.clone(),
                            authority: trade_pda_account_info.clone(),
                        };
                        token::burn(
                            CpiContext::new_with_signer(
                                token_program_info.clone(),
                                cpi_accounts,
                                signer_seeds_array, 
                            ),
                            burn_fee,
                        )
                        .map_err(|_| TradeError::TokenTransferFailed)?;
                    }
                }
            }
        }

        // Update trade state
        trade_account.state = TradeState::DisputeResolved;
        trade_account.updated_at_ts = current_timestamp;
        // Potentially store resolution reason and outcome in Trade account if needed
        // trade_account.dispute_resolution_reason = resolution_reason;
        // trade_account.dispute_resolution_outcome = Some(resolution_outcome);

        emit!(TradeDisputeResolved {
            trade_id: trade_account.id,
            arbitrator: ctx.accounts.arbitrator_signer.key(),
            outcome: resolution_outcome,
            amount_to_buyer: amount_to_buyer_resolved,
            amount_to_seller: amount_to_seller_resolved,
            fees_paid: total_fees_resolved,
            reason: resolution_reason,
        });

        msg!(
            "Trade #{} dispute resolved by arbitrator {}. Outcome: {:?}. Buyer gets: {}, Seller gets: {}, Fees: {}",
            trade_account.id,
            ctx.accounts.arbitrator_signer.key(),
            resolution_outcome,
            amount_to_buyer_resolved,
            amount_to_seller_resolved,
            total_fees_resolved
        );

        // CPIs to Profile program
        let trade_state_update_for_profile = match resolution_outcome {
            DisputeResolutionOutcome::FavorBuyer => TradeStateForProfileUpdate::DisputeResolvedFavorBuyer,
            DisputeResolutionOutcome::FavorSeller => TradeStateForProfileUpdate::DisputeResolvedFavorSeller,
            DisputeResolutionOutcome::NoAction => TradeStateForProfileUpdate::DisputeResolvedNoAction, // Or a generic DisputeResolved
        };

        // For buyer
        let cpi_accounts_buyer = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.buyer_profile.to_account_info(),
            profile_authority: ctx.accounts.buyer_profile_authority_info.to_account_info(),
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state_for_buyer.to_account_info(),
        };
        let cpi_program_profile = ctx.accounts.profile_program.to_account_info();
        profile::cpi::update_trades_count(
            CpiContext::new(cpi_program_profile.clone(), cpi_accounts_buyer),
            trade_state_update_for_profile.clone(),
        )?;

        // For seller
        let cpi_accounts_seller = profile::cpi::accounts::UpdateTradesCount {
            profile: ctx.accounts.seller_profile.to_account_info(),
            profile_authority: ctx.accounts.seller_profile_authority_info.to_account_info(),
            hub_config: ctx.accounts.hub_config_for_profile_cpi.to_account_info(),
            hub_program_id: ctx.accounts.hub_program_id_for_profile_cpi.to_account_info(),
            profile_global_state: ctx.accounts.profile_global_state_for_seller.to_account_info(),
        };
        profile::cpi::update_trades_count(
            CpiContext::new(cpi_program_profile, cpi_accounts_seller),
            trade_state_update_for_profile,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeTradeGlobalState<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + TradeGlobalState::INIT_SPACE, // Corrected from SPACE to INIT_SPACE
        seeds = [b"trade_global_state"],
        bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterHub<'info> {
    #[account(
        mut,
        seeds = [b"trade_global_state"],
        bump = trade_global_state.bump,
        has_one = admin @ TradeError::NotHubAdmin
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,
    #[account(mut)]
    pub admin: Signer<'info>,
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

    pub escrow_mint: Option<Account<'info, Mint>>,

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
    pub escrow_vault_mint: Option<Box<Account<'info, Mint>>>,

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

#[derive(Accounts)]
#[instruction(_trade_id_arg: u64, reason: Option<String>)]
pub struct DisputeTrade<'info> {
    #[account(mut)]
    pub disputer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"trade".as_ref(), &_trade_id_arg.to_le_bytes()],
        bump = trade_account.bump
    )]
    pub trade_account: Account<'info, Trade>,

    // Accounts for Profile CPI
    pub profile_program: Program<'info, ProfileProgram>,

    // Disputer's Profile (could be buyer or seller)
    #[account(mut,
        seeds = [b"profile", disputer.key().as_ref()],
        bump,
        seeds::program = profile_program.key()
    )]
    pub disputer_profile: Account<'info, ProfileAccountData>,

    // Buyer's Profile & Authority
    #[account(mut,
        seeds = [b"profile", trade_account.buyer.as_ref()],
        bump,
        seeds::program = profile_program.key()
    )]
    pub buyer_profile: Account<'info, ProfileAccountData>,
    /// CHECK: Authority for buyer's profile, must be trade_account.buyer
    #[account(address = trade_account.buyer @ TradeError::ProfileCpiBuyerProfileAuthorityMismatch)]
    pub buyer_profile_authority_info: AccountInfo<'info>,

    // Seller's Profile & Authority
    #[account(mut,
        seeds = [b"profile", trade_account.seller.as_ref()],
        bump,
        seeds::program = profile_program.key()
    )]
    pub seller_profile: Account<'info, ProfileAccountData>,
    /// CHECK: Authority for seller's profile, must be trade_account.seller
    #[account(address = trade_account.seller @ TradeError::ProfileCpiSellerProfileAuthorityMismatch)]
    pub seller_profile_authority_info: AccountInfo<'info>,
    
    // Profile Global State for CPI
    #[account(
        seeds = [b"profile_global_state"],
        bump,
        seeds::program = profile_program.key()
    )]
    pub profile_global_state: Account<'info, ProfileGlobalStateAccount>,

    // Trade Global State (to get hub_address for hub_config_for_profile_cpi and hub_program_id_for_profile_cpi)
    #[account(
        seeds = [b"trade_global_state"],
        bump
    )]
    pub trade_global_state: Account<'info, TradeGlobalState>,

    // Hub Config and Program ID for Profile CPI (use trade_global_state.hub_address for seeds::program and address check)
    #[account(
        seeds = [b"hub"],
        bump,
        seeds::program = trade_global_state.hub_address
    )]
    pub hub_config_for_profile_cpi: Account<'info, ProfileHubConfigStub>,

    /// CHECK: This is the Hub Program ID, used for Profile CPI
    #[account(address = trade_global_state.hub_address @ TradeError::ProfileCpiHubProgramIdMismatch)]
    pub hub_program_id_for_profile_cpi: AccountInfo<'info>,
}
