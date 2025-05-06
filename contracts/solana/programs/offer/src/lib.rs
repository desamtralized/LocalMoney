use anchor_lang::prelude::*;
use localmoney_profile::client_cpi;
use localmoney_profile::client_cpi::accounts_def as profile_client_accounts;
use localmoney_profile::program::LocalmoneyProfile;

declare_id!("6mya23vFa1BwWhmxuPqmM51wPe53VK2Ct3eA6bPyLZqJ"); // Updated Program ID

pub mod constants {
    pub const ACTIVE: u8 = 0;
    pub const PAUSED: u8 = 1;
    pub const ARCHIVED: u8 = 2;
}

pub mod state {
    use super::*;

    #[account]
    pub struct OfferConfig {
        pub hub_addr: Pubkey,
        pub offers_count: u64,
        pub is_initialized: bool,
        pub bump: u8,
    }

    impl OfferConfig {
        pub const SPACE: usize = 8 +  // Discriminator
            32 +                      // hub_addr
            8 +                       // offers_count
            1 +                       // is_initialized
            1; // bump
    }
}

pub mod cpi;

#[program]
pub mod localmoney_offer {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Initializing LocalMoney Offer program");
        let config = &mut ctx.accounts.offer_config;
        config.offers_count = 0;
        config.bump = ctx.bumps.offer_config;
        Ok(())
    }

    pub fn register_hub(ctx: Context<RegisterHub>, hub_addr: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.offer_config;

        // Ensure this is only called once
        require!(!config.is_initialized, OfferError::AlreadyInitialized);

        // Verify that the caller is actually the hub program
        // This would typically verify the CPI context, but we'll keep it simple for now

        // Set hub address and mark as initialized
        config.hub_addr = hub_addr;
        config.is_initialized = true;

        msg!("Hub registered: {}", hub_addr);
        Ok(())
    }

    pub fn create(
        ctx: Context<CreateOffer>,
        offer_type: u8,
        fiat_currency: String,
        rate: u64,
        denom: String,
        min_amount: u64,
        max_amount: u64,
        description: String,
        owner_contact: String,
        owner_encryption_key: String,
    ) -> Result<()> {
        // Validate inputs
        require!(min_amount <= max_amount, OfferError::InvalidAmountRange);
        require!(description.len() <= 255, OfferError::DescriptionTooLong);
        require!(fiat_currency.len() == 3, OfferError::InvalidFiatCurrency);
        require!(denom.len() <= 20, OfferError::InvalidDenom);
        require!(owner_contact.len() <= 100, OfferError::ContactTooLong);
        require!(
            owner_encryption_key.len() <= 255,
            OfferError::EncryptionKeyTooLong
        );

        let config = &mut ctx.accounts.offer_config;
        let offer_id = config.offers_count;

        config.offers_count = config
            .offers_count
            .checked_add(1)
            .ok_or(OfferError::OfferCountOverflow)?;

        let offer = &mut ctx.accounts.offer;
        offer.id = offer_id;
        offer.owner = ctx.accounts.owner.key();
        offer.offer_type = offer_type;

        // Convert fiat currency string to fixed bytes
        let mut fiat_bytes = [0u8; 3];
        for (i, byte) in fiat_currency.as_bytes().iter().enumerate().take(3) {
            fiat_bytes[i] = *byte;
        }
        offer.fiat_currency = fiat_bytes;

        // Set other offer fields
        offer.rate = rate;
        offer.denom = denom;
        offer.min_amount = min_amount;
        offer.max_amount = max_amount;
        offer.description = description;
        offer.state = constants::ACTIVE;
        offer.owner_contact = owner_contact.clone();
        offer.owner_encryption_key = owner_encryption_key.clone();
        offer.created_at = Clock::get()?.unix_timestamp;
        offer.updated_at = Clock::get()?.unix_timestamp;
        offer.bump = ctx.bumps.offer;

        msg!("Offer created with ID: {}", offer_id);
        msg!(
            "Offer::create - owner key for CPI (userA): {}",
            ctx.accounts.owner.key()
        );

        // CPI calls removed from here

        Ok(())
    }

    pub fn update_profile_after_offer_creation(
        ctx: Context<UpdateProfileAfterOfferCreation>,
    ) -> Result<()> {
        // Ensure offer owner matches signer
        require_keys_eq!(
            ctx.accounts.offer.owner,
            ctx.accounts.owner.key(),
            OfferError::Unauthorized
        );

        // CPI to Profile program to update contact info
        msg!("Updating profile contact via CPI (from update_profile_after_offer_creation)");
        let cpi_program_profile = ctx.accounts.profile_program.to_account_info();
        let cpi_accounts_update_contact = profile_client_accounts::UpdateContact {
            authority: ctx.accounts.owner.to_account_info(), // Use owner signer as CPI authority
            profile_owner: ctx.accounts.owner.to_account_info(), // Use owner key for profile PDA derivation
            profile_config: ctx.accounts.profile_config_account.to_account_info(),
            profile: ctx.accounts.user_profile.to_account_info(), // The user's profile PDA
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let cpi_ctx_update_contact =
            CpiContext::new(cpi_program_profile.clone(), cpi_accounts_update_contact);
        client_cpi::update_contact(
            cpi_ctx_update_contact,
            ctx.accounts.offer.owner_contact.clone(), // Get contact from offer data
            ctx.accounts.offer.owner_encryption_key.clone(), // Get key from offer data
        )?;

        // CPI to Profile program to update active offers count
        msg!("Updating active offers count via CPI (from update_profile_after_offer_creation)");
        let cpi_accounts_update_offers = profile_client_accounts::UpdateActiveOffers {
            authority: ctx.accounts.owner.to_account_info(),
            profile_owner: ctx.accounts.owner.to_account_info(),
            profile_config: ctx.accounts.profile_config_account.to_account_info(),
            hub_config: ctx.accounts.hub_config_account.to_account_info(),
            profile: ctx.accounts.user_profile.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let cpi_ctx_update_offers =
            CpiContext::new(cpi_program_profile, cpi_accounts_update_offers);
        // Assuming new offers are created in the ACTIVE state (use correct constant)
        profile_client_cpi::update_active_offers(cpi_ctx_update_offers, constants::OFFER_ACTIVE)?;

        Ok(())
    }

    pub fn update_offer(
        ctx: Context<UpdateOffer>,
        rate: Option<u64>,
        min_amount: Option<u64>,
        max_amount: Option<u64>,
        description: Option<String>,
        state: Option<u8>,
        owner_contact: Option<String>,
        owner_encryption_key: Option<String>,
    ) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        let old_state = offer.state;

        // Debug logging for profile CPI
        msg!("Offer::update_offer - owner: {}", ctx.accounts.owner.key());
        let expected_profile_pda = Pubkey::find_program_address(
            &[b"profile", ctx.accounts.owner.key().as_ref()],
            ctx.accounts.profile_program.key,
        )
        .0;
        msg!(
            "Offer::update_offer - expected profile PDA: {}",
            expected_profile_pda
        );
        msg!(
            "Offer::update_offer - user_profile account passed in: {}",
            ctx.accounts.user_profile.key()
        );

        // Apply updates if provided
        if let Some(new_rate) = rate {
            offer.rate = new_rate;
        }

        if let Some(new_min) = min_amount {
            offer.min_amount = new_min;
        }

        if let Some(new_max) = max_amount {
            // Validate min <= max after updates
            let min = offer.min_amount;
            require!(min <= new_max, OfferError::InvalidAmountRange);
            offer.max_amount = new_max;
        }

        if let Some(new_desc) = description {
            require!(new_desc.len() <= 255, OfferError::DescriptionTooLong);
            offer.description = new_desc;
        }

        // Handle state changes specifically (Active, Paused, Archived)
        if let Some(new_state) = state {
            require!(
                new_state <= constants::ARCHIVED,
                OfferError::InvalidOfferState
            );
            offer.state = new_state;

            // CPI to Profile if offer activeness changed
            if (old_state == constants::ACTIVE && new_state != constants::ACTIVE)
                || (old_state != constants::ACTIVE && new_state == constants::ACTIVE)
            {
                msg!("Updating active offers count via CPI due to state change");
                let cpi_program_profile = ctx.accounts.profile_program.to_account_info();
                let cpi_accounts_update_offers = profile_client_accounts::UpdateActiveOffers {
                    authority: ctx.accounts.owner.to_account_info(),
                    profile_owner: ctx.accounts.owner.to_account_info(),
                    profile_config: ctx.accounts.profile_config_account.to_account_info(),
                    hub_config: ctx.accounts.hub_config_account.to_account_info(),
                    profile: ctx.accounts.user_profile.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                };
                let cpi_ctx_update_offers =
                    CpiContext::new(cpi_program_profile.clone(), cpi_accounts_update_offers);
                client_cpi::update_active_offers(cpi_ctx_update_offers, new_state)?;
            }
        }

        // Update contact info if provided
        let contact_changed = owner_contact.is_some() || owner_encryption_key.is_some();
        if contact_changed {
            let new_contact = owner_contact.unwrap_or_else(|| offer.owner_contact.clone());
            let new_key =
                owner_encryption_key.unwrap_or_else(|| offer.owner_encryption_key.clone());

            if offer.owner_contact != new_contact || offer.owner_encryption_key != new_key {
                msg!("Updating profile contact via CPI due to contact change");
                offer.owner_contact = new_contact.clone();
                offer.owner_encryption_key = new_key.clone();

                let cpi_program_profile = ctx.accounts.profile_program.to_account_info();
                let cpi_accounts_update_contact = profile_client_accounts::UpdateContact {
                    authority: ctx.accounts.owner.to_account_info(),
                    profile_owner: ctx.accounts.owner.to_account_info(),
                    profile_config: ctx.accounts.profile_config_account.to_account_info(),
                    profile: ctx.accounts.user_profile.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                };
                let cpi_ctx_update_contact =
                    CpiContext::new(cpi_program_profile, cpi_accounts_update_contact);
                client_cpi::update_contact(cpi_ctx_update_contact, new_contact, new_key)?;
            }
        }

        // Update timestamp
        offer.updated_at = Clock::get()?.unix_timestamp;

        msg!("Offer {} updated", offer.id);
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
        space = state::OfferConfig::SPACE,
        seeds = [b"offer-config"],
        bump,
    )]
    pub offer_config: Account<'info, state::OfferConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterHub<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"offer-config"],
        bump = offer_config.bump,
    )]
    pub offer_config: Account<'info, state::OfferConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateOffer<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"offer-config"],
        bump = offer_config.bump,
        constraint = offer_config.is_initialized @ OfferError::NotInitialized,
    )]
    pub offer_config: Account<'info, state::OfferConfig>,

    #[account(
        init,
        payer = owner,
        space = Offer::SPACE,
        seeds = [
            b"offer",
            offer_config.offers_count.to_le_bytes().as_ref()
        ],
        bump,
    )]
    pub offer: Account<'info, Offer>,

    // Accounts for CPI to Profile program
    pub profile_program: Program<'info, LocalmoneyProfile>,
    #[account(mut)]
    /// CHECK: Initialized by profile program if needed, should be mutable for CPI updates
    pub user_profile: AccountInfo<'info>,
    #[account(mut)] // profile_config is needed as mut by Profile's update_contact
    /// CHECK: Read/written by profile program (update_contact needs it mut)
    pub profile_config_account: AccountInfo<'info>,
    /// CHECK: Read by profile program
    pub hub_config_account: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOffer<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"offer", offer.id.to_le_bytes().as_ref()],
        bump = offer.bump,
        constraint = offer.owner == owner.key() @ OfferError::Unauthorized,
    )]
    pub offer: Account<'info, Offer>,

    // Accounts for CPI to Profile program
    pub profile_program: Program<'info, LocalmoneyProfile>,
    #[account(mut)]
    /// CHECK: Read/written by profile program
    pub user_profile: AccountInfo<'info>,
    #[account(mut)] // profile_config is needed as mut by Profile's update_contact
    /// CHECK: Read/written by profile program (update_contact needs it mut)
    pub profile_config_account: AccountInfo<'info>,
    /// CHECK: Read by profile program
    pub hub_config_account: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProfileAfterOfferCreation<'info> {
    #[account(mut)] // Offer owner needs to sign to trigger this update
    pub owner: Signer<'info>,
    #[account(
        mut, // Offer might be mutated if state changes are involved later, keep mut for now
        seeds = [b"offer", owner.key().as_ref(), offer.offer_id.to_le_bytes().as_ref()],
        bump = offer.bump,
        constraint = offer.owner == owner.key() @ OfferError::Unauthorized // Added constraint for safety
    )]
    pub offer: Account<'info, state::Offer>,

    // Accounts needed for CPIs to Profile
    pub profile_program: Program<'info, LocalmoneyProfile>,
    #[account(mut)]
    /// CHECK: Passed to profile program CPI, checked there.
    pub user_profile: AccountInfo<'info>,
    #[account(mut)] // Needs to be mut for UpdateContact init_if_needed payer
    /// CHECK: Passed to profile program CPI, checked there.
    pub profile_config_account: AccountInfo<'info>,
    /// CHECK: Passed to profile program CPI, checked there.
    pub hub_config_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOfferState<'info> {
    // ... existing struct ...
}

#[account]
pub struct Offer {
    pub id: u64,
    pub owner: Pubkey,
    pub offer_type: u8,         // 0: Buy, 1: Sell
    pub fiat_currency: [u8; 3], // 3-letter currency code
    pub rate: u64,              // Rate relative to fiat currency
    pub denom: String,          // Token/currency denom (max 20 chars)
    pub min_amount: u64,
    pub max_amount: u64,
    pub description: String,          // Max 255 chars
    pub state: u8,                    // 0: Active, 1: Paused, 2: Archived
    pub owner_contact: String,        // Max 100 chars
    pub owner_encryption_key: String, // Max 255 chars
    pub created_at: i64,              // Unix timestamp
    pub updated_at: i64,              // Unix timestamp
    pub bump: u8,
}

impl Offer {
    pub const SPACE: usize = 8 +   // Discriminator
        8 +                        // id
        32 +                       // owner
        1 +                        // offer_type
        3 +                        // fiat_currency
        8 +                        // rate
        4 + 20 +                   // denom (String with max 20 chars)
        8 +                        // min_amount
        8 +                        // max_amount
        4 + 255 +                  // description (String with max 255 chars)
        1 +                        // state
        4 + 100 +                  // owner_contact (String with max 100 chars)
        4 + 255 +                  // owner_encryption_key (String with max 255 chars)
        8 +                        // created_at
        8 +                        // updated_at
        1; // bump
}

#[error_code]
pub enum OfferError {
    #[msg("Offer is not initialized")]
    NotInitialized,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid amount range, min_amount must be less than or equal to max_amount")]
    InvalidAmountRange,
    #[msg("Description is too long, max 255 characters")]
    DescriptionTooLong,
    #[msg("Invalid fiat currency, must be 3 characters")]
    InvalidFiatCurrency,
    #[msg("Invalid denom, max 20 characters")]
    InvalidDenom,
    #[msg("Contact information too long, max 100 characters")]
    ContactTooLong,
    #[msg("Encryption key too long, max 255 characters")]
    EncryptionKeyTooLong,
    #[msg("Offer count has overflowed")]
    OfferCountOverflow,
    #[msg("Invalid offer state")]
    InvalidOfferState,
    #[msg("Hub program ID mismatch in config")]
    HubProgramMismatch,
    #[msg("Profile program ID mismatch in config")]
    ProfileProgramMismatch,
    #[msg("Generic error for debugging")]
    GenericError,
    #[msg("User profile PDA mismatch in create_offer CPI preparation")]
    UserProfileMismatch,
    #[msg("Offer program already initialized")]
    AlreadyInitialized,
}
