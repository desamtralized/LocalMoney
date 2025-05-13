use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"); // Example ID, replace with actual

#[program]
pub mod offer {
    use super::*;

    pub fn initialize_offer_global_state(ctx: Context<InitializeOfferGlobalState>) -> Result<()> {
        ctx.accounts.offer_global_state.offers_count = 0;
        ctx.accounts.offer_global_state.hub_address = Pubkey::default(); // Signifies not yet registered
        ctx.accounts.offer_global_state.bump = ctx.bumps.offer_global_state;
        Ok(())
    }

    pub fn register_hub(ctx: Context<RegisterHub>, hub_program_address: Pubkey) -> Result<()> {
        require!(
            ctx.accounts.offer_global_state.hub_address == Pubkey::default(),
            OfferError::HubAlreadyRegistered
        );
        // TODO: Add a check to ensure ctx.accounts.hub_program.key() == hub_program_address
        // And that hub_program is actually the Hub Program. This might involve a CPI to the Hub
        // to get its official address or verifying its executable flag / owner.
        // For now, we trust the authority calling this and the provided hub_program_address.
        // A more robust check would involve the Hub program calling this instruction itself,
        // or the authority being the admin of the Hub program.

        // The authority calling this should be a trusted party (e.g., global admin, or the Hub program via CPI)
        // For now, we assume the `authority` signer is the one authorized to set the Hub address.
        // In a real scenario, this authority might be the Hub program itself via CPI, or a multisig admin.

        ctx.accounts.offer_global_state.hub_address = hub_program_address;
        Ok(())
    }

    pub fn create_offer(
        ctx: Context<CreateOffer>,
        owner_contact: String,
        owner_encryption_key: String,
        offer_type: OfferType,
        fiat_currency: String,
        rate: u64,
        denom: String,
        token_mint: Option<Pubkey>,
        min_amount: u64,
        max_amount: u64,
        description: String,
    ) -> Result<()> {
        require!(
            ctx.accounts.offer_global_state.hub_address != Pubkey::default(),
            OfferError::HubNotRegistered
        );
        require!(
            min_amount <= max_amount,
            OfferError::MinAmountExceedsMaxAmount
        );
        // Length checks for strings are implicitly handled by #[max_len] on Offer struct with #[derive(InitSpace)]
        // when using init. If not using init_if_needed or realloc, ensure inputs fit.

        // Validation for token_mint based on denom
        if denom.to_uppercase() == "SOL" {
            require!(token_mint.is_none(), OfferError::SolOfferShouldNotHaveMint);
        } else {
            require!(token_mint.is_some(), OfferError::SplOfferMustHaveMint);
        }

        let offer_global_state = &mut ctx.accounts.offer_global_state;
        let new_offer_id = offer_global_state.offers_count;

        offer_global_state.offers_count = offer_global_state
            .offers_count
            .checked_add(1)
            .ok_or(OfferError::OfferIdOverflow)?;

        let offer = &mut ctx.accounts.offer;
        offer.id = new_offer_id;
        offer.owner = ctx.accounts.owner.key();
        offer.owner_contact = owner_contact.clone(); // Clone for event
        offer.owner_encryption_key = owner_encryption_key.clone(); // Clone for event
        offer.offer_type = offer_type.clone(); // Clone for event
        offer.fiat_currency = fiat_currency;
        offer.rate = rate;
        offer.denom = denom;
        offer.token_mint = token_mint;
        offer.min_amount = min_amount;
        offer.max_amount = max_amount;
        offer.description = description;
        offer.state = OfferStateAnchor::Active;
        offer.bump = ctx.bumps.offer;

        // Emit event for profile update (contact & active offers count)
        emit!(OfferProfileUpdateRequest {
            offer_id: new_offer_id,
            owner: offer.owner,
            owner_contact: Some(offer.owner_contact.clone()),
            owner_encryption_key: Some(offer.owner_encryption_key.clone()),
            offer_state_change: Some(OfferStateChange {
                old_state: None, // New offer, so no old state
                new_state: OfferStateAnchor::Active,
            }),
            action_type: ProfileUpdateActionType::CreateOffer,
        });

        // TODO: Implement actual CPI to Profile program for:
        // 1. Update contact (owner_contact, owner_encryption_key)
        // 2. Increment active_offers_count for the owner
        // This will require Profile program IDL and account contexts.

        msg!(
            "Offer #{} created by {}",
            new_offer_id,
            ctx.accounts.owner.key()
        );
        Ok(())
    }

    pub fn update_offer(
        ctx: Context<UpdateOffer>,
        owner_contact_update: Option<String>,
        owner_encryption_key_update: Option<String>,
        rate_update: Option<u64>,
        min_amount_update: Option<u64>,
        max_amount_update: Option<u64>,
        description_update: Option<String>,
        state_update: Option<OfferStateAnchor>,
    ) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        let mut contact_changed = false;
        let mut state_changed = false;
        let old_state = offer.state.clone();

        if let Some(contact) = owner_contact_update {
            if offer.owner_contact != contact {
                offer.owner_contact = contact;
                contact_changed = true;
            }
        }
        if let Some(key) = owner_encryption_key_update {
            if offer.owner_encryption_key != key {
                offer.owner_encryption_key = key;
                contact_changed = true; // Assuming key change also implies contact details update for profile
            }
        }
        if let Some(r) = rate_update {
            offer.rate = r;
        }
        if let Some(desc) = description_update {
            offer.description = desc;
        }
        if let Some(s) = state_update {
            if offer.state != s {
                offer.state = s;
                state_changed = true;
            }
        }

        let mut current_min = offer.min_amount;
        let mut current_max = offer.max_amount;
        let mut min_max_updated = false;

        if let Some(min_val) = min_amount_update {
            current_min = min_val;
            min_max_updated = true;
        }
        if let Some(max_val) = max_amount_update {
            current_max = max_val;
            min_max_updated = true;
        }

        if min_max_updated {
            require!(
                current_min <= current_max,
                OfferError::MinAmountExceedsMaxAmount
            );
            offer.min_amount = current_min;
            offer.max_amount = current_max;
        }

        if contact_changed || state_changed {
            emit!(OfferProfileUpdateRequest {
                offer_id: offer.id,
                owner: offer.owner,
                owner_contact: if contact_changed {
                    Some(offer.owner_contact.clone())
                } else {
                    None
                },
                owner_encryption_key: if contact_changed {
                    Some(offer.owner_encryption_key.clone())
                } else {
                    None
                },
                offer_state_change: if state_changed {
                    Some(OfferStateChange {
                        old_state: Some(old_state),
                        new_state: offer.state.clone(),
                    })
                } else {
                    None
                },
                action_type: ProfileUpdateActionType::UpdateOffer,
            });
            // TODO: Implement actual CPI to Profile program for:
            // 1. Update contact (if changed)
            // 2. Update active_offers_count (if state changed impacting active status)
            // This will require Profile program IDL and account contexts.
        }

        msg!(
            "Offer #{} updated by {}",
            offer.id,
            ctx.accounts.owner.key()
        );
        Ok(())
    }

    // Instructions will be added in subsequent tasks
    // e.g., update_offer
}

#[derive(Accounts)]
pub struct InitializeOfferGlobalState<'info> {
    #[account(
        init,
        payer = authority,
        space = OfferGlobalState::SPACE,
        seeds = [b"offer_global_state"],
        bump
    )]
    pub offer_global_state: Account<'info, OfferGlobalState>,
    #[account(mut)]
    pub authority: Signer<'info>, // Typically the deployer or program admin
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterHub<'info> {
    #[account(
        mut,
        seeds = [b"offer_global_state"],
        bump = offer_global_state.bump,
    )]
    pub offer_global_state: Account<'info, OfferGlobalState>,
    // This authority should be the Hub program admin or the Hub program via CPI.
    // For simplicity in this step, we assume a general authority signer.
    // In a CosmWasm SubMsg context, the Hub program would be the sender.
    pub authority: Signer<'info>,
    // Potentially, the Hub program account itself to verify it's executable and the correct one.
    // pub hub_program: AccountInfo<'info> // Or Program<'info, Hub> if its IDL is available
}

#[derive(Accounts)]
#[instruction(owner_contact: String, owner_encryption_key: String, offer_type: OfferType, fiat_currency: String, rate: u64, denom: String, token_mint: Option<Pubkey>, min_amount: u64, max_amount: u64, description: String)]
pub struct CreateOffer<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Offer::INIT_SPACE, // 8 for discriminator, Offer::INIT_SPACE for the rest
        seeds = [b"offer", &offer_global_state.offers_count.to_le_bytes()[..]], // Use current count as ID for seed before increment
        bump
    )]
    pub offer: Account<'info, Offer>,
    #[account(
        mut,
        seeds = [b"offer_global_state"],
        bump = offer_global_state.bump,
    )]
    pub offer_global_state: Account<'info, OfferGlobalState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
// Instruction data args are not needed here as they are passed directly to the function
// and used to fetch the Offer account with its ID.
pub struct UpdateOffer<'info> {
    #[account(
        mut,
        seeds = [b"offer", &offer.id.to_le_bytes()], // offer.id must be resolved from a passed arg or another account
        bump = offer.bump,
        has_one = owner @ OfferError::NotOfferOwner // Ensures the signer is the owner of the offer
    )]
    pub offer: Account<'info, Offer>,
    // The owner of the offer must sign the transaction.
    pub owner: Signer<'info>,
    // No system_program needed unless reallocating, which we are not doing here for simplicity.
    // If string fields could grow beyond their initial `max_len` in `Offer::INIT_SPACE`,
    // realloc would be necessary, involving system_program and careful space management.
}

// Account to store the global count of offers, used for generating new offer IDs.
// PDA seeds: [b"offer_global_state"]
#[account]
pub struct OfferGlobalState {
    pub offers_count: u64,   // Counter for total offers created
    pub hub_address: Pubkey, // Address of the central Hub program, Pubkey::default() if not registered
    pub bump: u8,            // PDA bump seed
}

impl OfferGlobalState {
    // Anchor discriminator + u64 + Pubkey + u8
    pub const SPACE: usize = 8 + 8 + 32 + 1;
}

// Represents a trade offer on the platform.
// PDA seeds: [b"offer", &id.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct Offer {
    pub id: u64,       // Unique identifier for the offer
    pub owner: Pubkey, // Pubkey of the offer creator
    #[max_len(100)]
    pub owner_contact: String, // Contact information of the owner
    #[max_len(100)]
    pub owner_encryption_key: String, // Encryption key for secure communication with the owner
    pub offer_type: OfferType, // Type of offer (Buy or Sell)
    #[max_len(8)]
    pub fiat_currency: String, // Fiat currency for the trade (e.g., "USD")
    pub rate: u64,     // Exchange rate (e.g., fiat units per smallest unit of denom)
    #[max_len(8)]
    pub denom: String, // Cryptocurrency or token being traded (e.g., "SOL", "USDC")
    pub token_mint: Option<Pubkey>, // Mint address if denom is an SPL token, None if SOL
    pub min_amount: u64, // Minimum amount of denom that can be traded
    pub max_amount: u64, // Maximum amount of denom that can be traded
    #[max_len(280)]
    pub description: String, // Description of the offer
    pub state: OfferStateAnchor, // Current state of the offer
    pub bump: u8,      // PDA bump seed
}

// Enum defining the type of an offer.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum OfferType {
    Buy,  // User wants to buy the specified denom using fiat_currency
    Sell, // User wants to sell the specified denom for fiat_currency
}

// Enum defining the state of an offer.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum OfferStateAnchor {
    Active,   // Offer is currently active and can be taken
    Paused,   // Offer is temporarily paused by the owner
    Archived, // Offer is archived and no longer active
}

#[error_code]
pub enum OfferError {
    #[msg("Offer ID counter overflow.")]
    OfferIdOverflow,
    #[msg("Description is too long.")]
    DescriptionTooLong,
    #[msg("Fiat currency string is too long.")]
    FiatCurrencyTooLong,
    #[msg("Denom string is too long.")]
    DenomTooLong,
    #[msg("Owner contact string is too long.")]
    OwnerContactTooLong,
    #[msg("Owner encryption key string is too long.")]
    OwnerEncryptionKeyTooLong,
    #[msg("Hub already registered.")]
    HubAlreadyRegistered,
    #[msg("Hub not registered.")]
    HubNotRegistered,
    #[msg("Unauthorized access. Caller is not the hub.")]
    UnauthorizedHub,
    #[msg("Min amount must be less than or equal to max amount.")]
    MinAmountExceedsMaxAmount,
    #[msg("Offer is not active.")]
    OfferNotActive,
    #[msg("Only the owner can update the offer.")]
    NotOfferOwner,
    #[msg("SOL offers should not have a token mint.")]
    SolOfferShouldNotHaveMint,
    #[msg("SPL token offers must have a token mint.")]
    SplOfferMustHaveMint,
}

// Event emitted when an offer action requires a profile update.
#[event]
pub struct OfferProfileUpdateRequest {
    pub offer_id: u64,
    pub owner: Pubkey,
    pub owner_contact: Option<String>, // New contact info if updated
    pub owner_encryption_key: Option<String>, // New encryption key if updated
    pub offer_state_change: Option<OfferStateChange>, // Details if offer state changed
    pub action_type: ProfileUpdateActionType, // Indicates if due to create or update
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct OfferStateChange {
    pub old_state: Option<OfferStateAnchor>, // None if it's a new offer
    pub new_state: OfferStateAnchor,
}

// Enum to distinguish the type of action triggering a profile update request.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ProfileUpdateActionType {
    CreateOffer, // For new offers, typically to set contact and increment active count
    UpdateOffer, // For existing offers, to update contact or active count based on state change
}
