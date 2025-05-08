use anchor_lang::prelude::*;

declare_id!("Prf1LAmRgPhXJCpVd8q92q7tWd5Qy3gYxXm9hPaJpkr"); // Replace with actual Profile Program ID

#[program]
pub mod profile {
    use super::*;

    pub fn initialize_profile_global_state(
        ctx: Context<InitializeProfileGlobalState>,
    ) -> Result<()> {
        ctx.accounts.profile_global_state.hub_address = Pubkey::default(); // Signifies not yet registered
        ctx.accounts.profile_global_state.bump = ctx.bumps.profile_global_state;
        Ok(())
    }

    pub fn register_hub_for_profile(
        ctx: Context<RegisterHubForProfile>,
        hub_address_arg: Pubkey,
    ) -> Result<()> {
        require!(
            ctx.accounts.profile_global_state.hub_address == Pubkey::default(),
            ProfileError::HubAlreadyRegistered
        );
        // TODO: Add authority checks - e.g., ensure caller is the actual Hub program or Hub admin.
        ctx.accounts.profile_global_state.hub_address = hub_address_arg;
        Ok(())
    }

    pub fn update_contact(
        ctx: Context<UpdateContact>,
        contact_info: Option<String>,
        encryption_key_info: Option<String>,
    ) -> Result<()> {
        require!(
            ctx.accounts.profile_global_state.hub_address != Pubkey::default(),
            ProfileError::HubNotRegistered
        );

        let profile = &mut ctx.accounts.profile;

        // Initialize created_at_timestamp if this is the first meaningful update
        // (i.e., when the account is being initialized by this instruction call)
        // The InitSpace on Profile struct and `init_if_needed` handles allocation.
        // We check if created_at_timestamp is 0 (its default when init by anchor_lang if not set explicitly).
        if profile.created_at_timestamp == 0 {
            profile.authority = ctx.accounts.profile_authority.key();
            profile.created_at_timestamp = Clock::get()?.unix_timestamp as u64;
            profile.bump = ctx.bumps.profile; // Set bump only on init
        }

        // TODO: Add more sophisticated authorization for Offer/Trade program calls.
        // For now, only profile_authority (owner) can update directly.
        // If called by Offer/Trade via CPI, those programs would be signers and need to be checked.

        if let Some(contact) = contact_info {
            profile.contact = Some(contact);
        }
        if let Some(enc_key) = encryption_key_info {
            profile.encryption_key = Some(enc_key);
        }

        msg!("Contact updated for profile: {}", profile.authority);
        Ok(())
    }

    pub fn update_active_offers(
        ctx: Context<UpdateActiveOffers>,
        action: CounterAction,
    ) -> Result<()> {
        require!(
            ctx.accounts.profile_global_state.hub_address != Pubkey::default(),
            ProfileError::HubNotRegistered
        );
        // Authorization: Check if the caller is the registered Offer program.
        // The Offer program ID should be known (e.g. from HubConfig or ProfileGlobalState if stored there)
        // For now, we assume `ctx.accounts.caller_program.key()` is checked against a known Offer Program ID.
        // Example: require_keys_eq!(ctx.accounts.caller_program.key(), expected_offer_program_id, ProfileError::UnauthorizedCaller);
        // This check requires `caller_program: AccountInfo<'info>` in context and making sure it's a Signer if not CPI
        // or using more advanced CPI signer checks.
        // A simpler way for CPI is that the `offer_program` account in context is executable and its key is the expected one.

        // Access active_offers_limit from HubConfig (passed in context)
        let active_offers_limit = ctx.accounts.hub_config.active_offers_limit;
        let profile = &mut ctx.accounts.profile;

        match action {
            CounterAction::Increment => {
                require!(
                    profile.active_offers_count < active_offers_limit,
                    ProfileError::ActiveOffersLimitReached
                );
                profile.active_offers_count = profile
                    .active_offers_count
                    .checked_add(1)
                    .ok_or(ProfileError::NumericOverflow)?;
            }
            CounterAction::Decrement => {
                profile.active_offers_count = profile
                    .active_offers_count
                    .checked_sub(1)
                    .ok_or(ProfileError::NumericOverflow)?;
            }
        }
        msg!(
            "Active offers count for {} is now {}",
            profile.authority,
            profile.active_offers_count
        );
        Ok(())
    }

    pub fn update_trades_count(
        ctx: Context<UpdateTradesCount>,
        trade_state_update: TradeStateForProfileUpdate,
    ) -> Result<()> {
        require!(
            ctx.accounts.profile_global_state.hub_address != Pubkey::default(),
            ProfileError::HubNotRegistered
        );
        // TODO: Authorization: Check if the caller is the registered Trade program.

        let active_trades_limit = ctx.accounts.hub_config.active_trades_limit;
        let profile = &mut ctx.accounts.profile;

        match trade_state_update {
            TradeStateForProfileUpdate::RequestCreated => {
                profile.requested_trades_count = profile
                    .requested_trades_count
                    .checked_add(1)
                    .ok_or(ProfileError::NumericOverflow)?;
                // Check active_trades_limit here if RequestCreated implies an active trade slot immediately
                // Spec says: `RequestCreated` → +`requested_trades_count`, check `active_trades_limit`.
                // This implies active_trades_limit might be checked against a potential increment to active_trades_count, not requested_trades_count.
                // For now, let's assume active_trades_limit applies to actual active_trades_count.
            }
            TradeStateForProfileUpdate::RequestAcceptedOrEscrowFunded => {
                require!(
                    profile.active_trades_count < active_trades_limit,
                    ProfileError::ActiveTradesLimitReached
                );
                profile.active_trades_count = profile
                    .active_trades_count
                    .checked_add(1)
                    .ok_or(ProfileError::NumericOverflow)?;
            }
            TradeStateForProfileUpdate::EscrowReleased => {
                profile.released_trades_count = profile
                    .released_trades_count
                    .checked_add(1)
                    .ok_or(ProfileError::NumericOverflow)?;
                profile.active_trades_count = profile
                    .active_trades_count
                    .checked_sub(1)
                    .ok_or(ProfileError::NumericOverflow)?;
            }
            TradeStateForProfileUpdate::FinalizedErrorOrCancelled => {
                // For states like Settled*, Refunded, Canceled which might just decrement active_trades_count
                if profile.active_trades_count > 0 {
                    // Ensure not to underflow if already 0
                    profile.active_trades_count = profile
                        .active_trades_count
                        .checked_sub(1)
                        .ok_or(ProfileError::NumericOverflow)?;
                }
            }
        }

        profile.last_trade_timestamp = Clock::get()?.unix_timestamp as u64;
        msg!(
            "Trade counts updated for {}. Active: {}, Requested: {}, Released: {}",
            profile.authority,
            profile.active_trades_count,
            profile.requested_trades_count,
            profile.released_trades_count
        );
        Ok(())
    }

    // Instructions like update_trades_count, update_active_offers
    // will be added in subsequent tasks.
}

#[derive(Accounts)]
pub struct InitializeProfileGlobalState<'info> {
    #[account(
        init,
        payer = authority,
        space = ProfileGlobalState::SPACE,
        seeds = [b"profile_global_state"],
        bump
    )]
    pub profile_global_state: Account<'info, ProfileGlobalState>,
    #[account(mut)]
    pub authority: Signer<'info>, // Typically the deployer or program admin
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterHubForProfile<'info> {
    #[account(
        mut,
        seeds = [b"profile_global_state"],
        bump = profile_global_state.bump
    )]
    pub profile_global_state: Account<'info, ProfileGlobalState>,
    // This authority should be the Hub program admin or the Hub program via CPI.
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(contact_info: Option<String>, encryption_key_info: Option<String>)] // Required for space/rent if strings are Some
pub struct UpdateContact<'info> {
    #[account(
        init_if_needed, // Initialize the profile account if it doesn't exist
        payer = payer,      // User (profile_authority) or CPI caller pays for init
        space = 8 + Profile::INIT_SPACE, // 8 for discriminator
        seeds = [b"profile", profile_authority.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, Profile>,

    /// CHECK: This is the authority for whom the profile is being updated.
    /// It's used as a seed and should be a signer if the user is calling this directly.
    /// If a CPI is calling, this pubkey is passed, and the CPI program (e.g. Offer) is the signer.
    pub profile_authority: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>, // The one paying for account creation/rent

    #[account(
        seeds = [b"profile_global_state"],
        bump = profile_global_state.bump
    )]
    pub profile_global_state: Account<'info, ProfileGlobalState>,
    pub system_program: Program<'info, System>,
}

// Account to store global state for the Profile program, like the Hub address.
// PDA seeds: [b"profile_global_state"]
#[account]
pub struct ProfileGlobalState {
    pub hub_address: Pubkey, // Address of the central Hub program, Pubkey::default() if not registered
    pub bump: u8,            // PDA bump seed
}

impl ProfileGlobalState {
    // Anchor discriminator + Pubkey + u8
    pub const SPACE: usize = 8 + 32 + 1;
}

// Represents a user's profile on the platform.
// PDA seeds: [b"profile", authority.key().as_ref()]
#[account]
#[derive(InitSpace)]
pub struct Profile {
    pub authority: Pubkey, // The user this profile belongs to (also part of seed)
    #[max_len(100)]
    pub contact: Option<String>, // Optional contact information (e.g., email, telegram)
    #[max_len(100)]
    pub encryption_key: Option<String>, // Optional public encryption key for secure communication
    pub active_offers_count: u8, // Number of active offers by the user
    pub active_trades_count: u8, // Number of active trades the user is part of
    pub requested_trades_count: u64, // Total trades requested by/to the user
    pub released_trades_count: u64, // Total trades successfully released/completed
    pub last_trade_timestamp: u64, // Timestamp of the last trade activity
    pub created_at_timestamp: u64, // Timestamp when the profile was first interacted with (e.g. first contact update)
    pub bump: u8,                  // PDA bump seed
}

#[error_code]
pub enum ProfileError {
    #[msg("Contact string is too long.")]
    ContactTooLong,
    #[msg("Encryption key string is too long.")]
    EncryptionKeyTooLong,
    #[msg("Hub already registered for Profile program.")]
    HubAlreadyRegistered,
    #[msg("Hub not registered for Profile program. Cannot perform action.")]
    HubNotRegistered,
    #[msg("Unauthorized caller. Expected Hub, Offer, or Trade program with valid signature.")]
    UnauthorizedCaller,
    #[msg("Active offers limit reached as per Hub configuration.")]
    ActiveOffersLimitReached,
    #[msg("Active trades limit reached as per Hub configuration.")]
    ActiveTradesLimitReached,
    #[msg("Profile account is not initialized.")]
    ProfileNotInitialized,
    #[msg("Numeric overflow occurred.")]
    NumericOverflow,
}

// Add #[account] and bump field to HubConfigStub
#[account]
pub struct HubConfigStub {
    pub active_offers_limit: u8,
    pub active_trades_limit: u8,
    pub bump: u8, // Assuming this bump is the one stored by the Hub program in its HubConfig PDA
                  // ... other hub config fields that might be relevant for profile, if any
}

#[derive(Accounts)]
#[instruction(action: CounterAction)]
pub struct UpdateActiveOffers<'info> {
    #[account(
        mut,
        seeds = [b"profile", profile_authority.key().as_ref()],
        bump = profile.bump,
        constraint = profile.authority == profile_authority.key() @ ProfileError::ProfileNotInitialized // Ensures profile is for this authority
    )]
    pub profile: Account<'info, Profile>,

    /// CHECK: The authority (user) whose profile is being updated.
    pub profile_authority: AccountInfo<'info>,

    // TODO: Add account for Offer Program for authorization
    // pub offer_program: Program<'info, OfferProgram>, // Assuming OfferProgram type is defined
    // pub offer_program_signer: Signer<'info>, // If Offer program calls this via CPI, it signs.

    // Account for HubConfig to check limits.
    // This assumes HubConfig PDA seeds are known, e.g. [b"hub_config_seed_from_hub_program"]
    // Or it could be passed as a non-PDA account if its address is obtained differently.
    #[account(seeds = [b"hub"], bump = hub_config.bump, seeds::program = hub_program_id.key())]
    pub hub_config: Account<'info, HubConfigStub>, // Using HubConfigStub for now
    /// CHECK: The Hub Program ID, needed for hub_config PDA derivation.
    pub hub_program_id: AccountInfo<'info>,

    #[account(seeds = [b"profile_global_state"], bump = profile_global_state.bump)]
    pub profile_global_state: Account<'info, ProfileGlobalState>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CounterAction {
    Increment,
    Decrement,
}

#[derive(Accounts)]
#[instruction(trade_state_update: TradeStateForProfileUpdate)]
pub struct UpdateTradesCount<'info> {
    #[account(
        mut,
        seeds = [b"profile", profile_authority.key().as_ref()],
        bump = profile.bump,
        constraint = profile.authority == profile_authority.key() @ ProfileError::ProfileNotInitialized
    )]
    pub profile: Account<'info, Profile>,

    /// CHECK: The authority (user) whose profile is being updated.
    pub profile_authority: AccountInfo<'info>,

    // TODO: Add account for Trade Program for authorization
    // pub trade_program: Program<'info, TradeProgram>, // Assuming TradeProgram type defined
    #[account(seeds = [b"hub"], bump = hub_config.bump, seeds::program = hub_program_id.key())]
    pub hub_config: Account<'info, HubConfigStub>, // Using HubConfigStub for now
    /// CHECK: The Hub Program ID, needed for hub_config PDA derivation.
    pub hub_program_id: AccountInfo<'info>,

    #[account(seeds = [b"profile_global_state"], bump = profile_global_state.bump)]
    pub profile_global_state: Account<'info, ProfileGlobalState>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TradeStateForProfileUpdate {
    RequestCreated, // +requested_trades_count, check active_trades_limit (CosmWasm spec implies check here)
    RequestAcceptedOrEscrowFunded, // +active_trades_count
    EscrowReleased, // +released_trades_count, -active_trades_count
    FinalizedErrorOrCancelled, // -active_trades_count (for Settled*, Refunded, Canceled)
}
