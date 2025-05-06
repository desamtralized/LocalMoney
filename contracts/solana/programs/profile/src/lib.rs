use anchor_lang::prelude::*;

declare_id!("F9idjQaykbeAD5t8q2D3ozvgPYB54RcNS5zPfpq8E7Sz"); // Updated Program ID

pub mod constants {
    // Trade states
    pub const REQUEST_CREATED: u8 = 0;
    pub const REQUEST_ACCEPTED: u8 = 1;
    pub const ESCROW_FUNDED: u8 = 2;
    pub const FIAT_DEPOSITED: u8 = 3;
    pub const ESCROW_RELEASED: u8 = 4;
    pub const ESCROW_DISPUTED: u8 = 5;
    pub const SETTLED_FOR_MAKER: u8 = 6;
    pub const SETTLED_FOR_TAKER: u8 = 7;
    pub const ESCROW_REFUNDED: u8 = 8;
    pub const REQUEST_CANCELED: u8 = 9;

    // Offer states
    pub const OFFER_ACTIVE: u8 = 0;
    pub const OFFER_PAUSED: u8 = 1;
    pub const OFFER_ARCHIVED: u8 = 2;
}

pub mod state {
    use super::*;

    #[account]
    pub struct ProfileConfig {
        pub hub_addr: Pubkey,
        pub is_initialized: bool,
        pub bump: u8,
    }

    impl ProfileConfig {
        pub const SPACE: usize = 8 +  // Discriminator
            32 +                      // hub_addr
            1 +                       // is_initialized
            1; // bump
    }
}

pub mod client_cpi;

#[program]
pub mod localmoney_profile {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Initializing LocalMoney Profile program");
        let config = &mut ctx.accounts.profile_config;
        config.bump = ctx.bumps.profile_config;
        Ok(())
    }

    pub fn register_hub(ctx: Context<RegisterHub>, hub_addr: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.profile_config;

        // Ensure this is only called once
        require!(!config.is_initialized, ProfileError::AlreadyInitialized);

        // Verify that the caller is actually the hub program
        // This would typically verify the CPI context, but we'll keep it simple for now

        // Set hub address and mark as initialized
        config.hub_addr = hub_addr;
        config.is_initialized = true;

        msg!("Hub registered in Profile program: {}", hub_addr);
        Ok(())
    }

    pub fn update_contact(
        ctx: Context<UpdateContact>,
        contact: String,
        encryption_key: String,
    ) -> Result<()> {
        msg!(
            "Profile::update_contact called for profile_owner (derived from ctx.accounts.profile_owner.key): {}",
            ctx.accounts.profile_owner.key()
        );
        msg!(
            "Profile::update_contact - caller.key: {}",
            ctx.accounts.caller.key()
        );
        // Validate input
        require!(contact.len() <= 100, ProfileError::ContactTooLong);
        require!(
            encryption_key.len() <= 255,
            ProfileError::EncryptionKeyTooLong
        );

        let profile = &mut ctx.accounts.profile;
        let is_new_profile = profile.created_at == 0;

        // Set contact and encryption key
        profile.contact = contact;
        profile.encryption_key = encryption_key;

        // If this is a new profile, initialize fields
        if is_new_profile {
            profile.created_at = Clock::get()?.unix_timestamp;
            profile.address = ctx.accounts.profile_owner.key();
            // Profile address is already set by the #[account] macro during init
        }

        profile.updated_at = Clock::get()?.unix_timestamp;

        msg!(
            "Contact information updated for profile: {}",
            ctx.accounts.profile_owner.key()
        );
        Ok(())
    }

    pub fn update_trades_count(ctx: Context<UpdateTradesCount>, trade_state: u8) -> Result<()> {
        msg!(
            "Profile::update_trades_count called for profile_owner (derived from ctx.accounts.profile_owner.key): {}",
            ctx.accounts.profile_owner.key()
        );
        msg!(
            "Profile::update_trades_count - caller.key: {}",
            ctx.accounts.caller.key()
        );
        let profile = &mut ctx.accounts.profile;
        let config = &ctx.accounts.profile_config;

        // Update timestamps
        let current_time = Clock::get()?.unix_timestamp;
        profile.last_trade = current_time;
        profile.updated_at = current_time;

        // Update counters based on trade state
        match trade_state {
            // RequestCreated - increment requested trades, check active limit
            constants::REQUEST_CREATED => {
                profile.requested_trades_count = profile
                    .requested_trades_count
                    .checked_add(1)
                    .ok_or(ProfileError::CounterOverflow)?;

                // Check if we are within the active trades limit (this will be enforced by the Trade program)
            }

            // RequestAccepted or EscrowFunded - increment active trades
            constants::REQUEST_ACCEPTED | constants::ESCROW_FUNDED => {
                profile.active_trades_count = profile
                    .active_trades_count
                    .checked_add(1)
                    .ok_or(ProfileError::CounterOverflow)?;
            }

            // EscrowReleased - increment released trades & decrement active
            constants::ESCROW_RELEASED => {
                profile.released_trades_count = profile
                    .released_trades_count
                    .checked_add(1)
                    .ok_or(ProfileError::CounterOverflow)?;

                if profile.active_trades_count > 0 {
                    profile.active_trades_count -= 1;
                }
            }

            // Final states - decrement active trades if positive
            constants::SETTLED_FOR_MAKER
            | constants::SETTLED_FOR_TAKER
            | constants::ESCROW_REFUNDED
            | constants::REQUEST_CANCELED => {
                if profile.active_trades_count > 0 {
                    profile.active_trades_count -= 1;
                }
            }

            _ => { /* No action for other states */ }
        }

        msg!(
            "Updated trades count for profile: {} to state: {}",
            ctx.accounts.profile_owner.key(),
            trade_state
        );
        Ok(())
    }

    pub fn update_active_offers(ctx: Context<UpdateActiveOffers>, offer_state: u8) -> Result<()> {
        msg!(
            "Profile::update_active_offers called for profile_owner (derived from ctx.accounts.profile_owner.key): {}",
            ctx.accounts.profile_owner.key()
        );
        msg!(
            "Profile::update_active_offers - caller.key: {}",
            ctx.accounts.caller.key()
        );
        let profile = &mut ctx.accounts.profile;
        let config = &ctx.accounts.profile_config;

        // Validate offer state
        require!(
            offer_state <= constants::OFFER_ARCHIVED,
            ProfileError::InvalidOfferState
        );

        // Update active offers count based on state transition
        match offer_state {
            // New active offer - increment counter
            constants::OFFER_ACTIVE => {
                // Check if we're under the limit
                // TODO: Implement proper CPI to Hub program to read active_offers_limit from HubConfig
                const TEMP_ACTIVE_OFFERS_LIMIT: u8 = 5; // Placeholder limit

                require!(
                    profile.active_offers_count < TEMP_ACTIVE_OFFERS_LIMIT,
                    ProfileError::ActiveOffersLimitReached
                );

                profile.active_offers_count = profile
                    .active_offers_count
                    .checked_add(1)
                    .ok_or(ProfileError::CounterOverflow)?;
            }

            // Offer paused or archived - decrement counter if it was active before
            constants::OFFER_PAUSED | constants::OFFER_ARCHIVED => {
                if profile.active_offers_count > 0 {
                    profile.active_offers_count -= 1;
                }
            }

            _ => {
                return Err(ProfileError::InvalidOfferState.into());
            }
        }

        profile.updated_at = Clock::get()?.unix_timestamp;

        msg!(
            "Updated active offers for profile: {} to state: {}",
            ctx.accounts.profile_owner.key(),
            offer_state
        );
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = state::ProfileConfig::SPACE,
        seeds = [b"profile-config"],
        bump,
    )]
    pub profile_config: Account<'info, state::ProfileConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterHub<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"profile-config"],
        bump = profile_config.bump,
    )]
    pub profile_config: Account<'info, state::ProfileConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateContact<'info> {
    /// CHECK: This is the authority (user/program) calling the instruction. Signer status is enforced by #[account(signer)].
    #[account(mut, signer)]
    pub caller: AccountInfo<'info>,

    /// CHECK: This account doesn't need to sign if caller is a module
    pub profile_owner: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"profile-config"],
        bump = profile_config.bump,
        constraint = profile_config.is_initialized @ ProfileError::NotInitialized,
    )]
    pub profile_config: Account<'info, state::ProfileConfig>,

    #[account(
        init_if_needed,
        payer = caller,
        space = ProfileData::SPACE,
        seeds = [b"profile", profile_owner.key().as_ref()],
        bump,
    )]
    pub profile: Account<'info, ProfileData>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateTradesCount<'info> {
    /// CHECK: This is the authority (user/program) calling the instruction. Signer status is enforced by #[account(signer)].
    #[account(signer)]
    pub caller: AccountInfo<'info>,

    /// CHECK: This doesn't need to be verified since the Trade program will verify
    pub profile_owner: AccountInfo<'info>,

    #[account(
        seeds = [b"profile-config"],
        bump = profile_config.bump,
        constraint = profile_config.is_initialized @ ProfileError::NotInitialized,
    )]
    pub profile_config: Account<'info, state::ProfileConfig>,

    /// CHECK: This is the hub config account that we need to read limits from
    pub hub_config: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"profile", profile_owner.key().as_ref()],
        bump = profile.bump,
    )]
    pub profile: Account<'info, ProfileData>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateActiveOffers<'info> {
    /// CHECK: This is the authority (user/program) calling the instruction. Signer status is enforced by #[account(signer)].
    #[account(signer)]
    pub caller: AccountInfo<'info>,

    /// CHECK: This doesn't need to be verified since the Offer program will verify
    pub profile_owner: AccountInfo<'info>,

    #[account(
        seeds = [b"profile-config"],
        bump = profile_config.bump,
        constraint = profile_config.is_initialized @ ProfileError::NotInitialized,
    )]
    pub profile_config: Account<'info, state::ProfileConfig>,

    /// CHECK: This is the hub config account that we need to read limits from
    pub hub_config: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"profile", profile_owner.key().as_ref()],
        bump = profile.bump,
    )]
    pub profile: Account<'info, ProfileData>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct ProfileData {
    pub address: Pubkey,
    pub contact: String,        // Max 100 chars
    pub encryption_key: String, // Max 255 chars
    pub active_offers_count: u8,
    pub active_trades_count: u8,
    pub requested_trades_count: u64,
    pub released_trades_count: u64,
    pub last_trade: i64, // Unix timestamp
    pub created_at: i64, // Unix timestamp
    pub updated_at: i64, // Unix timestamp
    pub bump: u8,
}

impl ProfileData {
    pub const SPACE: usize = 8 +   // Discriminator
        32 +                       // address
        4 + 100 +                  // contact (String with max 100 chars)
        4 + 255 +                  // encryption_key (String with max 255 chars)
        1 +                        // active_offers_count
        1 +                        // active_trades_count
        8 +                        // requested_trades_count
        8 +                        // released_trades_count
        8 +                        // last_trade
        8 +                        // created_at
        8 +                        // updated_at
        1; // bump
}

#[error_code]
pub enum ProfileError {
    #[msg("Unauthorized access")]
    Unauthorized,

    #[msg("Counter overflow")]
    CounterOverflow,

    #[msg("Contact too long")]
    ContactTooLong,

    #[msg("Encryption key too long")]
    EncryptionKeyTooLong,

    #[msg("Invalid offer state")]
    InvalidOfferState,

    #[msg("Active offers limit reached")]
    ActiveOffersLimitReached,

    #[msg("Profile program not initialized with hub")]
    NotInitialized,

    #[msg("Profile program already initialized")]
    AlreadyInitialized,
}
