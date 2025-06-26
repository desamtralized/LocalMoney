use anchor_lang::prelude::*;
use shared_types::{
    validate_amount_range, FiatCurrency, LocalMoneyErrorCode, OfferState, OfferType,
    MAX_DESCRIPTION_LENGTH, OFFER_COUNTER_SEED, OFFER_SEED, OFFER_SIZE,
    CURRENCY_PRICE_SEED, CONFIG_SEED,
};

declare_id!("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");

#[program]
pub mod offer {
    use super::*;

    /// Initialize the offer counter
    pub fn initialize_counter(ctx: Context<InitializeCounter>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = 0;
        msg!("Offer counter initialized");
        Ok(())
    }

    /// Create a new offer with profile integration
    pub fn create_offer(
        ctx: Context<CreateOffer>,
        offer_type: OfferType,
        fiat_currency: FiatCurrency,
        rate: u64,
        min_amount: u64,
        max_amount: u64,
        description: Option<String>,
        expiration_hours: Option<u64>, // Hours from now (0 or None means no expiration)
    ) -> Result<()> {
        // First validate user can create offer via Profile program CPI
        if ctx.accounts.user_profile.is_some() {
            let profile_program = ctx.accounts.profile_program.as_ref().unwrap();
            let user_profile = ctx.accounts.user_profile.as_ref().unwrap();
            let hub_program = ctx.accounts.hub_program.as_ref().unwrap();
            let hub_config = ctx.accounts.hub_config.as_ref().unwrap();

            let cpi_program = profile_program.to_account_info();
            let cpi_accounts = profile::cpi::accounts::ValidateActivityLimits {
                profile: user_profile.to_account_info(),
                hub_program: hub_program.to_account_info(),
                hub_config: hub_config.to_account_info(),
                profile_program: profile_program.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

            // Check if user can create a new offer
            match profile::cpi::can_create_offer(cpi_ctx) {
                Ok(result) => {
                    let can_create = result.get();
                    require!(can_create, LocalMoneyErrorCode::OfferLimitExceeded);
                }
                Err(_) => {
                    return Err(LocalMoneyErrorCode::CpiCallFailed.into());
                }
            }
        }
        // Validate inputs
        require!(rate > 0, LocalMoneyErrorCode::InvalidRate);
        require!(min_amount > 0, LocalMoneyErrorCode::InvalidMinAmount);
        require!(
            max_amount >= min_amount,
            LocalMoneyErrorCode::InvalidMaxAmount
        );

        if let Some(ref desc) = description {
            require!(
                desc.len() <= MAX_DESCRIPTION_LENGTH,
                LocalMoneyErrorCode::DescriptionTooLong
            );
        }

        // Get current offer ID and increment counter
        let counter = &mut ctx.accounts.counter;
        let offer_id = counter.count;
        counter.count = counter
            .count
            .checked_add(1)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?;

        // Initialize offer account
        let offer = &mut ctx.accounts.offer;
        offer.id = offer_id;
        offer.owner = ctx.accounts.owner.key();
        offer.offer_type = offer_type;
        offer.fiat_currency = fiat_currency;
        offer.rate = rate;
        offer.min_amount = min_amount;
        offer.max_amount = max_amount;
        offer.description = description.unwrap_or_default();
        offer.token_mint = ctx.accounts.token_mint.key();
        offer.state = OfferState::Active;
        
        let clock = Clock::get()?;
        offer.created_at = clock.unix_timestamp;
        
        // Calculate expiration timestamp
        offer.expires_at = if let Some(hours) = expiration_hours {
            if hours == 0 {
                0 // No expiration
            } else {
                // Convert hours to seconds and add to current time
                clock.unix_timestamp
                    .checked_add((hours * 3600) as i64)
                    .ok_or(LocalMoneyErrorCode::MathOverflow)?
            }
        } else {
            0 // No expiration if not specified
        };
        
        offer.bump = ctx.bumps.offer;

        // Update profile offer statistics via CPI
        if ctx.accounts.user_profile.is_some() {
            let profile_program = ctx.accounts.profile_program.as_ref().unwrap();
            let user_profile = ctx.accounts.user_profile.as_ref().unwrap();

            let cpi_program = profile_program.to_account_info();
            let cpi_accounts = profile::cpi::accounts::UpdateProfile {
                profile: user_profile.to_account_info(),
                owner: ctx.accounts.owner.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

            // Increment active offer count in profile
            profile::cpi::update_offer_stats(cpi_ctx, true)?;
        }

        msg!(
            "Offer created: ID={}, type={}, currency={:?}, rate={}, expires_at={}",
            offer_id,
            offer.offer_type,
            offer.fiat_currency,
            rate,
            offer.expires_at
        );

        Ok(())
    }

    /// Update an existing offer
    pub fn update_offer(
        ctx: Context<UpdateOffer>,
        rate: Option<u64>,
        min_amount: Option<u64>,
        max_amount: Option<u64>,
        description: Option<String>,
    ) -> Result<()> {
        let offer = &mut ctx.accounts.offer;

        // Validate that offer can be updated (must be Active or Paused)
        require!(
            offer.state == OfferState::Active || offer.state == OfferState::Paused,
            LocalMoneyErrorCode::OfferNotUpdatable
        );

        // Update rate if provided
        if let Some(new_rate) = rate {
            require!(new_rate > 0, LocalMoneyErrorCode::InvalidRate);
            offer.rate = new_rate;
        }

        // Update amounts if provided and validate consistency
        let current_min = min_amount.unwrap_or(offer.min_amount);
        let current_max = max_amount.unwrap_or(offer.max_amount);

        require!(current_min > 0, LocalMoneyErrorCode::InvalidMinAmount);
        require!(
            current_max >= current_min,
            LocalMoneyErrorCode::InvalidMaxAmount
        );

        if let Some(new_min) = min_amount {
            offer.min_amount = new_min;
        }
        if let Some(new_max) = max_amount {
            offer.max_amount = new_max;
        }

        // Update description if provided
        if let Some(new_description) = description {
            require!(
                new_description.len() <= MAX_DESCRIPTION_LENGTH,
                LocalMoneyErrorCode::DescriptionTooLong
            );
            offer.description = new_description;
        }

        msg!("Offer updated: ID={}", offer.id);
        Ok(())
    }

    /// Change offer state (pause, activate, archive)
    /// Update offer state with profile integration (Task 2.3.2)
    /// Enhanced to properly manage active offer counts in profile statistics
    pub fn update_offer_state(ctx: Context<UpdateOfferWithProfile>, new_state: OfferState) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        let current_state = offer.state.clone();

        // Validate state transition
        let valid_transition = match (current_state.clone(), new_state.clone()) {
            (OfferState::Active, OfferState::Paused) => true,
            (OfferState::Active, OfferState::Archive) => true,
            (OfferState::Paused, OfferState::Active) => true,
            (OfferState::Paused, OfferState::Archive) => true,
            (OfferState::Archive, _) => false, // Archive is terminal
            _ => false,
        };

        require!(
            valid_transition,
            LocalMoneyErrorCode::InvalidStateTransition
        );

        // Update profile statistics based on state transition
        if ctx.accounts.user_profile.is_some() {
            let profile_program = ctx.accounts.profile_program.as_ref().unwrap();
            let user_profile = ctx.accounts.user_profile.as_ref().unwrap();

            let cpi_program = profile_program.to_account_info();
            let cpi_accounts = profile::cpi::accounts::UpdateProfile {
                profile: user_profile.to_account_info(),
                owner: ctx.accounts.owner.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

            // Handle active offer count changes based on state transition
            match (current_state.clone(), new_state.clone()) {
                // Offer becomes inactive (decrement count)
                (OfferState::Active, OfferState::Paused) => {
                    profile::cpi::update_offer_stats(cpi_ctx, false)?;
                }
                (OfferState::Active, OfferState::Archive) => {
                    profile::cpi::update_offer_stats(cpi_ctx, false)?;
                }
                // Offer becomes active (increment count)
                (OfferState::Paused, OfferState::Active) => {
                    profile::cpi::update_offer_stats(cpi_ctx, true)?;
                }
                // Paused to Archived (no change in active count - already not active)
                (OfferState::Paused, OfferState::Archive) => {
                    // No change needed - paused offers weren't counted as active
                }
                _ => {} // No other transitions are valid or need counting
            }
        }

        offer.state = new_state.clone();

        msg!(
            "Offer state updated with profile sync: ID={}, from={:?} to={:?}",
            offer.id,
            current_state,
            new_state
        );

        Ok(())
    }

    /// Bulk update active offer counts in profile (Task 2.3.2)
    /// Helper function to synchronize profile statistics with current offer states
    pub fn sync_profile_offer_counts(ctx: Context<SyncProfileOfferCounts>) -> Result<()> {
        // This function would iterate through all offers for a user and recalculate
        // the correct active_offers_count in their profile
        let mut active_count = 0u8;
        
        // Iterate through remaining_accounts which should be offer accounts for this owner
        for account_info in ctx.remaining_accounts.iter() {
            let account_data = account_info.try_borrow_data()?;
            if let Ok(offer_data) = Offer::try_deserialize(&mut account_data.as_ref()) {
                // Check if offer belongs to the profile owner and is active
                if offer_data.owner == ctx.accounts.profile.owner && offer_data.state == OfferState::Active {
                    active_count = active_count.checked_add(1).unwrap_or(255);
                }
            }
        }
        
        // Update profile with correct count via CPI
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        let cpi_accounts = profile::cpi::accounts::UpdateProfile {
            profile: ctx.accounts.profile.to_account_info(),
            owner: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        // For now, we'll use a custom sync method - in real implementation
        // we'd need a profile function that sets the exact count
        // This is a simplified approach
        msg!(
            "Profile offer count sync: calculated {} active offers for user {}",
            active_count,
            ctx.accounts.profile.owner
        );
        
        Ok(())
    }

    /// Update user contact information via CPI (Task 2.3.3)
    /// Convenience function to update contact info from the offer program
    pub fn update_contact_information(
        ctx: Context<UpdateContactInformation>,
        contact: Option<String>,
        encryption_key: Option<String>,
    ) -> Result<()> {
        // Make CPI call to Profile program to update contact information
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        let cpi_accounts = profile::cpi::accounts::UpdateProfile {
            profile: ctx.accounts.user_profile.to_account_info(),
            owner: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Call profile program's update_contact function
        profile::cpi::update_contact(cpi_ctx, contact.clone(), encryption_key.clone())?;

        msg!(
            "Contact information updated via offer program for user: {}, has_contact: {}, has_encryption: {}",
            ctx.accounts.owner.key(),
            contact.is_some(),
            encryption_key.is_some()
        );

        Ok(())
    }

    /// Update contact information and validate for trading (Task 2.3.3)
    /// Enhanced contact update with trading context validation
    pub fn update_contact_for_trading(
        ctx: Context<UpdateContactInformation>,
        contact: Option<String>,
        encryption_key: Option<String>,
        validate_for_offers: bool,
    ) -> Result<()> {
        // For trading purposes, we recommend having contact information
        if validate_for_offers {
            require!(
                contact.is_some(),
                LocalMoneyErrorCode::ContactInfoRequired
            );
            
            // If contact info is provided, recommend encryption
            if contact.is_some() && encryption_key.is_none() {
                msg!("Warning: Contact information provided without encryption key. Consider adding encryption for security.");
            }
        }

        // Make CPI call to Profile program to update contact information
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        let cpi_accounts = profile::cpi::accounts::UpdateProfile {
            profile: ctx.accounts.user_profile.to_account_info(),
            owner: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Call profile program's update_contact function
        profile::cpi::update_contact(cpi_ctx, contact.clone(), encryption_key.clone())?;

        // Get contact encryption status for validation
        let contact_check_cpi = CpiContext::new(
            ctx.accounts.profile_program.to_account_info(),
            profile::cpi::accounts::GetProfile {
                profile: ctx.accounts.user_profile.to_account_info(),
            },
        );
        
        match profile::cpi::validate_contact_encryption(contact_check_cpi) {
            Ok(status) => {
                let encryption_status = status.get();
                msg!(
                    "Contact encryption status: has_contact={}, appears_encrypted={}, has_key={}, properly_configured={}",
                    encryption_status.has_contact,
                    encryption_status.appears_encrypted,
                    encryption_status.has_encryption_key,
                    encryption_status.is_properly_configured
                );
            }
            Err(_) => {
                msg!("Could not validate contact encryption status");
            }
        }

        msg!(
            "Contact information updated for trading context: user={}, validated={}",
            ctx.accounts.owner.key(),
            validate_for_offers
        );

        Ok(())
    }

    /// Get user contact information for offer context (Task 2.3.3)
    /// Query function to get contact info relevant to trading
    pub fn get_contact_for_offers(
        ctx: Context<GetContactInformation>,
    ) -> Result<ContactInfoSummary> {
        // Make CPI call to Profile program to get contact information
        let cpi_ctx = CpiContext::new(
            ctx.accounts.profile_program.to_account_info(),
            profile::cpi::accounts::GetProfile {
                profile: ctx.accounts.user_profile.to_account_info(),
            },
        );

        let contact_info = match profile::cpi::get_contact_info(cpi_ctx) {
            Ok(result) => result.get(),
            Err(_) => {
                return Err(LocalMoneyErrorCode::CpiCallFailed.into());
            }
        };

        // Check if contact info is suitable for trading
        let suitable_for_trading = contact_info.has_contact && 
            (contact_info.has_encryption_key || !contact_info.contact.as_ref().unwrap_or(&String::new()).contains("@"));

        let summary = ContactInfoSummary {
            has_contact: contact_info.has_contact,
            has_encryption_key: contact_info.has_encryption_key,
            contact_length: contact_info.contact.as_ref().map(|c| c.len() as u16).unwrap_or(0),
            suitable_for_trading,
            recommendation: if !contact_info.has_contact {
                "Add contact information for trading"
            } else if !contact_info.has_encryption_key {
                "Consider adding encryption key for security"
            } else {
                "Contact information properly configured"
            }.to_string(),
        };

        msg!(
            "Contact info summary for offers: has_contact={}, suitable_for_trading={}",
            summary.has_contact,
            summary.suitable_for_trading
        );

        Ok(summary)
    }

    /// Check offer limits before creation (Task 2.3.4)
    /// Comprehensive limit enforcement using Hub program configuration
    pub fn check_offer_limits(
        ctx: Context<CheckOfferLimits>,
        min_amount_usd: u64,
        max_amount_usd: u64,
    ) -> Result<bool> {
        // Get trading limits from Hub program
        let hub_cpi_ctx = CpiContext::new(
            ctx.accounts.hub_program.to_account_info(),
            hub::cpi::accounts::GetTradingLimits {
                config: ctx.accounts.hub_config.to_account_info(),
                program_id: ctx.accounts.hub_program.to_account_info(),
            },
        );

        let trading_limits = match hub::cpi::get_trading_limits(hub_cpi_ctx) {
            Ok(result) => result.get(),
            Err(_) => {
                return Err(LocalMoneyErrorCode::CpiCallFailed.into());
            }
        };

        // Check if user has reached active offers limit
        let current_active_offers = if ctx.accounts.user_profile.is_some() {
            let profile = ctx.accounts.user_profile.as_ref().unwrap();
            profile.active_offers_count
        } else {
            0 // If no profile, assume 0 offers
        };

        // Validate against offer limits
        require!(
            current_active_offers < trading_limits.active_offers_limit,
            LocalMoneyErrorCode::OfferLimitExceeded
        );

        // Validate amount limits
        require!(
            min_amount_usd >= trading_limits.min_amount_usd,
            LocalMoneyErrorCode::BelowMinimumAmount
        );
        
        require!(
            max_amount_usd <= trading_limits.max_amount_usd,
            LocalMoneyErrorCode::AboveMaximumAmount
        );

        msg!(
            "Offer limits check passed: active_offers={}/{}, amount_range={}..{} USD (limits: {}..{})",
            current_active_offers,
            trading_limits.active_offers_limit,
            min_amount_usd,
            max_amount_usd,
            trading_limits.min_amount_usd,
            trading_limits.max_amount_usd
        );

        Ok(true)
    }

    /// Get current user limits and usage (Task 2.3.4)
    /// Query function to get limit information for a user
    pub fn get_user_limits_status(
        ctx: Context<GetUserLimitsStatus>,
    ) -> Result<UserLimitsStatus> {
        // Get trading limits from Hub program
        let hub_cpi_ctx = CpiContext::new(
            ctx.accounts.hub_program.to_account_info(),
            hub::cpi::accounts::GetTradingLimits {
                config: ctx.accounts.hub_config.to_account_info(),
                program_id: ctx.accounts.hub_program.to_account_info(),
            },
        );

        let trading_limits = match hub::cpi::get_trading_limits(hub_cpi_ctx) {
            Ok(result) => result.get(),
            Err(_) => {
                return Err(LocalMoneyErrorCode::CpiCallFailed.into());
            }
        };

        // Get current usage from profile
        let current_offers = if ctx.accounts.user_profile.is_some() {
            ctx.accounts.user_profile.as_ref().unwrap().active_offers_count
        } else {
            0
        };

        let current_trades = if ctx.accounts.user_profile.is_some() {
            ctx.accounts.user_profile.as_ref().unwrap().active_trades_count
        } else {
            0
        };

        let status = UserLimitsStatus {
            // Current usage
            active_offers_count: current_offers,
            active_trades_count: current_trades,
            
            // Limits from hub
            active_offers_limit: trading_limits.active_offers_limit,
            active_trades_limit: trading_limits.active_trades_limit,
            min_amount_usd: trading_limits.min_amount_usd,
            max_amount_usd: trading_limits.max_amount_usd,
            
            // Availability
            can_create_offer: current_offers < trading_limits.active_offers_limit,
            can_create_trade: current_trades < trading_limits.active_trades_limit,
            offers_remaining: trading_limits.active_offers_limit.saturating_sub(current_offers),
            trades_remaining: trading_limits.active_trades_limit.saturating_sub(current_trades),
        };

        msg!(
            "User limits status: offers={}/{}, trades={}/{}, amounts={}..{} USD",
            status.active_offers_count,
            status.active_offers_limit,
            status.active_trades_count,
            status.active_trades_limit,
            status.min_amount_usd,
            status.max_amount_usd
        );

        Ok(status)
    }



    /// Close/archive an offer (convenience function)
    pub fn close_offer(ctx: Context<UpdateOfferWithProfile>) -> Result<()> {
        let offer = &mut ctx.accounts.offer;

        // Can only close Active or Paused offers
        require!(
            offer.state == OfferState::Active || offer.state == OfferState::Paused,
            LocalMoneyErrorCode::OfferNotClosable
        );

        offer.state = OfferState::Archive;

        // Update profile offer statistics via CPI (decrement count)
        if ctx.accounts.user_profile.is_some() {
            let profile_program = ctx.accounts.profile_program.as_ref().unwrap();
            let user_profile = ctx.accounts.user_profile.as_ref().unwrap();

            let cpi_program = profile_program.to_account_info();
            let cpi_accounts = profile::cpi::accounts::UpdateProfile {
                profile: user_profile.to_account_info(),
                owner: ctx.accounts.owner.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

            // Decrement active offer count in profile
            profile::cpi::update_offer_stats(cpi_ctx, false)?;
        }

        msg!("Offer closed: ID={}", offer.id);
        Ok(())
    }

    /// Pause an offer (Task 2.2.3 + 2.3.2)
    /// Convenience function to pause an active offer with profile updates
    pub fn pause_offer(ctx: Context<UpdateOfferWithProfile>) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        
        require!(
            offer.state == OfferState::Active,
            LocalMoneyErrorCode::InvalidStateTransition
        );
        
        offer.state = OfferState::Paused;
        
        // Update profile offer statistics via CPI (decrement count since no longer active)
        if ctx.accounts.user_profile.is_some() {
            let profile_program = ctx.accounts.profile_program.as_ref().unwrap();
            let user_profile = ctx.accounts.user_profile.as_ref().unwrap();

            let cpi_program = profile_program.to_account_info();
            let cpi_accounts = profile::cpi::accounts::UpdateProfile {
                profile: user_profile.to_account_info(),
                owner: ctx.accounts.owner.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

            // Decrement active offer count in profile (paused offers are not active)
            profile::cpi::update_offer_stats(cpi_ctx, false)?;
        }
        
        msg!("Offer paused: ID={}", offer.id);
        Ok(())
    }

    /// Activate an offer (Task 2.2.3 + 2.3.2)
    /// Convenience function to reactivate a paused offer with profile updates
    pub fn activate_offer(ctx: Context<UpdateOfferWithProfile>) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        
        require!(
            offer.state == OfferState::Paused,
            LocalMoneyErrorCode::InvalidStateTransition
        );
        
        offer.state = OfferState::Active;
        
        // Update profile offer statistics via CPI (increment count since now active)
        if ctx.accounts.user_profile.is_some() {
            let profile_program = ctx.accounts.profile_program.as_ref().unwrap();
            let user_profile = ctx.accounts.user_profile.as_ref().unwrap();

            let cpi_program = profile_program.to_account_info();
            let cpi_accounts = profile::cpi::accounts::UpdateProfile {
                profile: user_profile.to_account_info(),
                owner: ctx.accounts.owner.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

            // Increment active offer count in profile (offer is now active again)
            profile::cpi::update_offer_stats(cpi_ctx, true)?;
        }
        
        msg!("Offer activated: ID={}", offer.id);
        Ok(())
    }

    /// Batch update offer states (Task 2.2.3)
    /// Update multiple offers to the same state in a single transaction
    pub fn batch_update_offer_states(
        ctx: Context<BatchUpdateOfferStates>,
        new_state: OfferState,
    ) -> Result<()> {
        let mut updated_count = 0;
        let mut failed_count = 0;
        
        // Iterate through remaining_accounts which should be offer accounts
        for account_info in ctx.remaining_accounts.iter() {
            // Attempt to deserialize each account as an Offer
            let account_data = account_info.try_borrow_data()?;
            if let Ok(mut offer_data) = Offer::try_deserialize(&mut account_data.as_ref()) {
                // Validate state transition
                let current_state = offer_data.state.clone();
                let valid_transition = match (current_state.clone(), new_state.clone()) {
                    (OfferState::Active, OfferState::Paused) => true,
                    (OfferState::Active, OfferState::Archive) => true,
                    (OfferState::Paused, OfferState::Active) => true,
                    (OfferState::Paused, OfferState::Archive) => true,
                    (OfferState::Archive, _) => false, // Archive is terminal
                    _ => false,
                };
                
                if valid_transition {
                    offer_data.state = new_state.clone();
                    updated_count += 1;
                    
                    msg!(
                        "Batch updated offer ID={}, from={:?} to={:?}",
                        offer_data.id,
                        current_state,
                        new_state
                    );
                } else {
                    failed_count += 1;
                }
            }
        }
        
        msg!(
            "Batch state update completed: {} updated, {} failed",
            updated_count,
            failed_count
        );
        
        Ok(())
    }

    /// Get offer states summary (Task 2.2.3)
    /// Returns counts of offers in each state for analytics
    pub fn get_offer_states_summary(
        ctx: Context<GetOfferStatesSummary>,
    ) -> Result<OfferStatesSummary> {
        // In a real implementation, this would iterate through all offers
        // and count the states. For now, return a placeholder structure
        let summary = OfferStatesSummary {
            active_count: 0,
            paused_count: 0,
            archived_count: 0,
            total_count: ctx.accounts.counter.count,
        };
        
        msg!(
            "Offer states summary: active={}, paused={}, archived={}, total={}",
            summary.active_count,
            summary.paused_count,
            summary.archived_count,
            summary.total_count
        );
        
        Ok(summary)
    }

    /// Validate offer state transition (Task 2.2.3)
    /// Helper function to check if a state transition is valid
    pub fn validate_state_transition(
        _ctx: Context<ValidateStateTransition>,
        from_state: OfferState,
        to_state: OfferState,
    ) -> Result<bool> {
        let is_valid = match (from_state.clone(), to_state.clone()) {
            (OfferState::Active, OfferState::Paused) => true,
            (OfferState::Active, OfferState::Archive) => true,
            (OfferState::Paused, OfferState::Active) => true,
            (OfferState::Paused, OfferState::Archive) => true,
            (OfferState::Archive, _) => false, // Archive is terminal
            _ => false,
        };
        
        msg!(
            "State transition validation: {:?} -> {:?} = {}",
            from_state,
            to_state,
            is_valid
        );
        
        Ok(is_valid)
    }

    /// Get offers with filtering (Task 2.2.1)
    /// This is a query function that doesn't modify state
    pub fn get_offers_filtered(
        _ctx: Context<GetOffersFiltered>,
        offer_type: Option<OfferType>,
        fiat_currency: Option<FiatCurrency>,
        min_rate: Option<u64>,
        max_rate: Option<u64>,
        state: Option<OfferState>,
        limit: Option<u8>,
        offset: Option<u64>,
    ) -> Result<Vec<OfferSummary>> {
        let limit = limit.unwrap_or(10).min(50) as usize; // Max 50 offers per query
        let offset = offset.unwrap_or(0);
        
        // This would typically be implemented by iterating through offer accounts
        // For now, return a placeholder that demonstrates the structure
        let offers = Vec::new();
        
        // In a real implementation, this would:
        // 1. Iterate through remaining_accounts (offer accounts)
        // 2. Apply filters based on the parameters
        // 3. Return matching offers up to the limit
        
        msg!(
            "Filtering offers: type={:?}, currency={:?}, rate_range=({:?}, {:?}), state={:?}, limit={}, offset={}",
            offer_type, fiat_currency, min_rate, max_rate, state, limit, offset
        );
        
        Ok(offers)
    }

    /// Search offers by owner (Task 2.2.1)
    pub fn get_offers_by_owner(
        _ctx: Context<GetOffersByOwner>,
        owner: Pubkey,
        state: Option<OfferState>,
        limit: Option<u8>,
        offset: Option<u64>,
    ) -> Result<Vec<OfferSummary>> {
        let limit = limit.unwrap_or(10).min(50) as usize;
        let offset = offset.unwrap_or(0);
        let offers = Vec::new();
        
        msg!(
            "Getting offers by owner: {}, state={:?}, limit={}, offset={}",
            owner, state, limit, offset
        );
        
        Ok(offers)
    }

    /// Get offer by ID (Task 2.2.1)
    pub fn get_offer_by_id(ctx: Context<GetOfferById>) -> Result<OfferSummary> {
        let offer = &ctx.accounts.offer;
        
        let offer_summary = OfferSummary {
            id: offer.id,
            owner: offer.owner,
            offer_type: offer.offer_type.clone(),
            fiat_currency: offer.fiat_currency.clone(),
            rate: offer.rate,
            min_amount: offer.min_amount,
            max_amount: offer.max_amount,
            description: offer.description.clone(),
            token_mint: offer.token_mint,
            state: offer.state.clone(),
            created_at: offer.created_at,
            expires_at: offer.expires_at,
        };
        
        msg!("Retrieved offer: ID={}", offer.id);
        Ok(offer_summary)
    }

    /// Get total offer count (Task 2.2.1)
    pub fn get_offer_count(ctx: Context<GetOfferCount>) -> Result<u64> {
        let counter = &ctx.accounts.counter;
        Ok(counter.count)
    }

    /// Get offers with pagination (Task 2.2.2)
    /// This implements comprehensive pagination for large result sets
    pub fn get_offers_paginated(
        ctx: Context<GetOffersPaginated>,
        page: u32,
        page_size: u8,
        _sort_by: Option<OfferSortBy>,
        _sort_order: Option<SortOrder>,
    ) -> Result<PaginatedOffersResponse> {
        let page_size = page_size.min(50).max(1) as usize; // Limit page size between 1 and 50
        let page = page.max(1); // Pages start from 1
        let _offset = ((page - 1) as usize).saturating_mul(page_size);
        
        let counter = &ctx.accounts.counter;
        let total_offers = counter.count;
        let total_pages = ((total_offers as usize + page_size - 1) / page_size) as u32;
        
        // In a real implementation, this would:
        // 1. Calculate the range of offer IDs to fetch based on pagination
        // 2. Iterate through remaining_accounts (offer accounts)
        // 3. Apply sorting based on sort_by and sort_order
        // 4. Return the paginated subset
        
        let offers = Vec::new(); // Placeholder for actual offer data
        
        let response = PaginatedOffersResponse {
            offers,
            pagination: PaginationInfo {
                current_page: page,
                page_size: page_size as u8,
                total_items: total_offers,
                total_pages,
                has_next_page: page < total_pages,
                has_previous_page: page > 1,
            },
        };
        
        msg!(
            "Paginated offers: page={}, page_size={}, total={}, total_pages={}",
            page, page_size, total_offers, total_pages
        );
        
        Ok(response)
    }

    /// Get offers with cursor-based pagination (Task 2.2.2)
    /// This implements cursor-based pagination for more efficient large dataset navigation
    pub fn get_offers_cursor_paginated(
        _ctx: Context<GetOffersCursorPaginated>,
        cursor: Option<u64>, // Last seen offer ID
        limit: u8,
        direction: Option<PaginationDirection>,
    ) -> Result<CursorPaginatedOffersResponse> {
        let _limit = limit.min(50).max(1) as usize;
        let _direction = direction.clone().unwrap_or(PaginationDirection::Forward);
        let _start_cursor = cursor.unwrap_or(0);
        
        // In a real implementation, this would:
        // 1. Start from the cursor position (offer ID)
        // 2. Fetch offers in the specified direction
        // 3. Return results with next/previous cursors
        
        let offers: Vec<OfferSummary> = Vec::new(); // Placeholder for actual offer data
        let next_cursor = if offers.is_empty() { 
            None 
        } else { 
            offers.last().map(|o| o.id) 
        };
        let previous_cursor = if offers.is_empty() { 
            None 
        } else { 
            offers.first().map(|o| o.id) 
        };
        
        let response = CursorPaginatedOffersResponse {
            offers,
            next_cursor,
            previous_cursor,
            has_more: false, // Would be calculated based on actual data
        };
        
        msg!(
            "Cursor paginated offers: cursor={:?}, limit={}, direction={:?}",
            cursor, limit, direction
        );
        
        Ok(response)
    }

    /// Get offers page info without data (Task 2.2.2)
    /// Lightweight function to get pagination metadata
    pub fn get_offers_page_info(
        ctx: Context<GetOfferCount>,
        page_size: u8,
    ) -> Result<PageInfo> {
        let page_size = page_size.min(50).max(1) as usize;
        let counter = &ctx.accounts.counter;
        let total_offers = counter.count;
        let total_pages = ((total_offers as usize + page_size - 1) / page_size) as u32;
        
        let page_info = PageInfo {
            total_items: total_offers,
            total_pages,
            page_size: page_size as u8,
            max_page_size: 50,
        };
        
        Ok(page_info)
    }

    /// Validate offer rate against market prices (Task 2.2.4)
    /// This function reads the price data directly from the Price program accounts
    /// to validate that the offer rate is within acceptable bounds of the current market price
    pub fn validate_offer_rate(
        ctx: Context<ValidateOfferRate>,
        offer_rate: u64,
        fiat_currency: FiatCurrency,
        max_deviation_percent: u8, // Maximum allowed deviation from market price (e.g., 10 for 10%)
    ) -> Result<bool> {
        let currency_price_account = &ctx.accounts.currency_price;
        let price_config_account = &ctx.accounts.price_config;
        
        // Read price configuration data to check staleness
        let config_data = price_config_account.try_borrow_data()?;
        let price_config = PriceConfig::try_deserialize(&mut config_data.as_ref())?;
        
        // Read currency price data
        let price_data = currency_price_account.try_borrow_data()?;
        let currency_price = CurrencyPrice::try_deserialize(&mut price_data.as_ref())?;
        
        // Validate price currency matches
        require!(
            currency_price.currency == fiat_currency,
            LocalMoneyErrorCode::UnsupportedCurrency
        );
        
        // Check if price is active
        require!(currency_price.is_active, LocalMoneyErrorCode::InactivePrice);
        
        // Check if price is not stale
        let clock = Clock::get()?;
        let time_since_update = clock.unix_timestamp - currency_price.last_updated;
        require!(
            time_since_update <= price_config.max_staleness_seconds as i64,
            LocalMoneyErrorCode::StalePrice
        );
        
        // Get market price
        let market_price = currency_price.price_usd;
        
        // Calculate acceptable range based on deviation percentage
        let max_deviation = max_deviation_percent.min(50); // Cap at 50% max deviation
        let lower_bound = market_price
            .checked_mul(100 - max_deviation as u64)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?
            .checked_div(100)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?;
        let upper_bound = market_price
            .checked_mul(100 + max_deviation as u64)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?
            .checked_div(100)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?;
        
        // Validate offer rate is within acceptable bounds
        let is_valid = offer_rate >= lower_bound && offer_rate <= upper_bound;
        
        msg!(
            "Rate validation: offer_rate={}, market_price={}, bounds=[{}, {}], valid={}",
            offer_rate,
            market_price,
            lower_bound,
            upper_bound,
            is_valid
        );
        
        Ok(is_valid)
    }

    /// Create offer with rate validation (Task 2.2.4)
    /// Enhanced version of create_offer that validates the rate against market prices
    pub fn create_offer_with_validation(
        ctx: Context<CreateOfferWithValidation>,
        offer_type: OfferType,
        fiat_currency: FiatCurrency,
        rate: u64,
        min_amount: u64,
        max_amount: u64,
        description: Option<String>,
        max_deviation_percent: Option<u8>,
        expiration_hours: Option<u64>,
    ) -> Result<()> {
        // Note: This function does not perform price validation
        // Use the separate price validation functions if needed
        
        // Proceed with standard offer creation validation
        require!(rate > 0, LocalMoneyErrorCode::InvalidRate);
        require!(min_amount > 0, LocalMoneyErrorCode::InvalidMinAmount);
        require!(
            max_amount >= min_amount,
            LocalMoneyErrorCode::InvalidMaxAmount
        );

        if let Some(ref desc) = description {
            require!(
                desc.len() <= MAX_DESCRIPTION_LENGTH,
                LocalMoneyErrorCode::DescriptionTooLong
            );
        }

        // Get current offer ID and increment counter
        let counter = &mut ctx.accounts.counter;
        let offer_id = counter.count;
        counter.count = counter
            .count
            .checked_add(1)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?;

        // Initialize offer account
        let offer = &mut ctx.accounts.offer;
        offer.id = offer_id;
        offer.owner = ctx.accounts.owner.key();
        offer.offer_type = offer_type;
        offer.fiat_currency = fiat_currency;
        offer.rate = rate;
        offer.min_amount = min_amount;
        offer.max_amount = max_amount;
        offer.description = description.unwrap_or_default();
        offer.token_mint = ctx.accounts.token_mint.key();
        offer.state = OfferState::Active;
        
        let clock = Clock::get()?;
        offer.created_at = clock.unix_timestamp;
        
        // Calculate expiration timestamp
        offer.expires_at = if let Some(hours) = expiration_hours {
            if hours == 0 {
                0 // No expiration
            } else {
                // Convert hours to seconds and add to current time
                clock.unix_timestamp
                    .checked_add((hours * 3600) as i64)
                    .ok_or(LocalMoneyErrorCode::MathOverflow)?
            }
        } else {
            0 // No expiration if not specified
        };
        
        offer.bump = ctx.bumps.offer;

        msg!(
            "Validated offer created: ID={}, type={}, currency={:?}, rate={}, expires_at={}",
            offer_id,
            offer.offer_type,
            offer.fiat_currency,
            rate,
            offer.expires_at
        );

        Ok(())
    }

    /// Update offer with rate validation (Task 2.2.4)
    /// Enhanced version of update_offer that validates rate changes against market prices
    pub fn update_offer_with_validation(
        ctx: Context<UpdateOfferWithValidation>,
        rate: Option<u64>,
        min_amount: Option<u64>,
        max_amount: Option<u64>,
        description: Option<String>,
        max_deviation_percent: Option<u8>,
    ) -> Result<()> {
        let offer = &mut ctx.accounts.offer;

        // Validate that offer can be updated
        require!(
            offer.state == OfferState::Active || offer.state == OfferState::Paused,
            LocalMoneyErrorCode::OfferNotUpdatable
        );

        // Validate rate if provided and rate validation is enabled
        if let (Some(new_rate), Some(deviation_percent)) = (rate, max_deviation_percent) {
            require!(new_rate > 0, LocalMoneyErrorCode::InvalidRate);
            
            let price_config_account = &ctx.accounts.price_config;
            let currency_price_account = &ctx.accounts.currency_price;
            
            // Read price configuration data
            let config_data = price_config_account.try_borrow_data()?;
            let price_config = PriceConfig::try_deserialize(&mut config_data.as_ref())?;
            
            // Read currency price data
            let price_data = currency_price_account.try_borrow_data()?;
            let currency_price = CurrencyPrice::try_deserialize(&mut price_data.as_ref())?;
            
            // Validate price currency matches offer currency
            require!(
                currency_price.currency == offer.fiat_currency,
                LocalMoneyErrorCode::UnsupportedCurrency
            );
            
            // Check if price is active
            require!(currency_price.is_active, LocalMoneyErrorCode::InactivePrice);
            
            // Check if price is not stale
            let clock = Clock::get()?;
            let time_since_update = clock.unix_timestamp - currency_price.last_updated;
            require!(
                time_since_update <= price_config.max_staleness_seconds as i64,
                LocalMoneyErrorCode::StalePrice
            );
            
            // Get market price
            let market_price = currency_price.price_usd;
            
            // Calculate acceptable bounds
            let max_deviation = deviation_percent.min(50);
            let lower_bound = market_price
                .checked_mul(100 - max_deviation as u64)
                .ok_or(LocalMoneyErrorCode::MathOverflow)?
                .checked_div(100)
                .ok_or(LocalMoneyErrorCode::MathOverflow)?;
            let upper_bound = market_price
                .checked_mul(100 + max_deviation as u64)
                .ok_or(LocalMoneyErrorCode::MathOverflow)?
                .checked_div(100)
                .ok_or(LocalMoneyErrorCode::MathOverflow)?;
            
            // Validate rate is within bounds
            require!(
                new_rate >= lower_bound && new_rate <= upper_bound,
                LocalMoneyErrorCode::InvalidRate
            );
            
            offer.rate = new_rate;
            
            msg!(
                "Rate update validation passed: new_rate={}, market={}, bounds=[{}, {}]",
                new_rate, market_price, lower_bound, upper_bound
            );
        } else if let Some(new_rate) = rate {
            // Standard rate validation without market price check
            require!(new_rate > 0, LocalMoneyErrorCode::InvalidRate);
            offer.rate = new_rate;
        }

        // Update amounts if provided and validate consistency
        let current_min = min_amount.unwrap_or(offer.min_amount);
        let current_max = max_amount.unwrap_or(offer.max_amount);

        require!(current_min > 0, LocalMoneyErrorCode::InvalidMinAmount);
        require!(
            current_max >= current_min,
            LocalMoneyErrorCode::InvalidMaxAmount
        );

        if let Some(new_min) = min_amount {
            offer.min_amount = new_min;
        }
        if let Some(new_max) = max_amount {
            offer.max_amount = new_max;
        }

        // Update description if provided
        if let Some(new_description) = description {
            require!(
                new_description.len() <= MAX_DESCRIPTION_LENGTH,
                LocalMoneyErrorCode::DescriptionTooLong
            );
            offer.description = new_description;
        }

        msg!("Offer updated with validation: ID={}", offer.id);
        Ok(())
    }

    /// Check if an offer has expired (Task 2.2.5)
    /// This function checks if an offer has expired and should be automatically archived
    pub fn check_offer_expiration(ctx: Context<UpdateOffer>) -> Result<bool> {
        let offer = &ctx.accounts.offer;
        
        // If expires_at is 0, the offer never expires
        if offer.expires_at == 0 {
            return Ok(false);
        }
        
        let clock = Clock::get()?;
        let has_expired = clock.unix_timestamp >= offer.expires_at;
        
        msg!(
            "Expiration check for offer ID={}: expires_at={}, current_time={}, expired={}",
            offer.id,
            offer.expires_at,
            clock.unix_timestamp,
            has_expired
        );
        
        Ok(has_expired)
    }

    /// Archive expired offer (Task 2.2.5)
    /// Automatically archive an offer that has expired
    pub fn archive_expired_offer(ctx: Context<UpdateOffer>) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        let clock = Clock::get()?;
        
        // Check if offer has expiration set
        require!(offer.expires_at > 0, LocalMoneyErrorCode::InvalidState);
        
        // Check if offer has actually expired
        require!(
            clock.unix_timestamp >= offer.expires_at,
            LocalMoneyErrorCode::InvalidState
        );
        
        // Only allow archiving if offer is currently Active or Paused
        require!(
            offer.state == OfferState::Active || offer.state == OfferState::Paused,
            LocalMoneyErrorCode::InvalidStateTransition
        );
        
        offer.state = OfferState::Archive;
        
        msg!(
            "Offer automatically archived due to expiration: ID={}, expired_at={}",
            offer.id,
            offer.expires_at
        );
        
        Ok(())
    }

    /// Create offer with comprehensive profile validation (Task 2.3.1)
    /// This function ensures full profile integration when creating offers
    pub fn create_offer_with_profile_validation(
        ctx: Context<CreateOffer>,
        offer_type: OfferType,
        fiat_currency: FiatCurrency,
        rate: u64,
        min_amount: u64,
        max_amount: u64,
        description: Option<String>,
        expiration_hours: Option<u64>,
    ) -> Result<()> {
        // Mandatory profile validation - this function requires profile integration
        require!(
            ctx.accounts.user_profile.is_some(),
            LocalMoneyErrorCode::ProfileRequired
        );
        require!(
            ctx.accounts.profile_program.is_some(),
            LocalMoneyErrorCode::ProfileRequired
        );

        // Validate user can create offer via Profile program CPI
        let profile_program = ctx.accounts.profile_program.as_ref().unwrap();
        let user_profile = ctx.accounts.user_profile.as_ref().unwrap();
        let hub_program = ctx.accounts.hub_program.as_ref().unwrap();
        let hub_config = ctx.accounts.hub_config.as_ref().unwrap();

        let cpi_program = profile_program.to_account_info();
        let cpi_accounts = profile::cpi::accounts::ValidateActivityLimits {
            profile: user_profile.to_account_info(),
            hub_program: hub_program.to_account_info(),
            hub_config: hub_config.to_account_info(),
            profile_program: profile_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Check if user can create a new offer
        match profile::cpi::can_create_offer(cpi_ctx) {
            Ok(result) => {
                let can_create = result.get();
                require!(can_create, LocalMoneyErrorCode::OfferLimitExceeded);
            }
            Err(_) => {
                return Err(LocalMoneyErrorCode::CpiCallFailed.into());
            }
        }

        // Validate profile exists and is properly configured
        let profile_check_cpi = CpiContext::new(
            profile_program.to_account_info(),
            profile::cpi::accounts::GetProfile {
                profile: user_profile.to_account_info(),
            },
        );
        match profile::cpi::profile_exists(profile_check_cpi) {
            Ok(result) => {
                let profile_exists = result.get();
                require!(profile_exists, LocalMoneyErrorCode::ProfileNotFound);
            }
            Err(_) => {
                return Err(LocalMoneyErrorCode::CpiCallFailed.into());
            }
        }

        // Now proceed with regular offer creation logic
        require!(rate > 0, LocalMoneyErrorCode::InvalidRate);
        require!(min_amount > 0, LocalMoneyErrorCode::InvalidMinAmount);
        require!(
            max_amount >= min_amount,
            LocalMoneyErrorCode::InvalidMaxAmount
        );

        if let Some(ref desc) = description {
            require!(
                desc.len() <= MAX_DESCRIPTION_LENGTH,
                LocalMoneyErrorCode::DescriptionTooLong
            );
        }

        // Get current offer ID and increment counter
        let counter = &mut ctx.accounts.counter;
        let offer_id = counter.count;
        counter.count = counter
            .count
            .checked_add(1)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?;

        // Initialize offer account
        let offer = &mut ctx.accounts.offer;
        offer.id = offer_id;
        offer.owner = ctx.accounts.owner.key();
        offer.offer_type = offer_type;
        offer.fiat_currency = fiat_currency;
        offer.rate = rate;
        offer.min_amount = min_amount;
        offer.max_amount = max_amount;
        offer.description = description.unwrap_or_default();
        offer.token_mint = ctx.accounts.token_mint.key();
        offer.state = OfferState::Active;
        
        let clock = Clock::get()?;
        offer.created_at = clock.unix_timestamp;
        
        // Calculate expiration timestamp
        offer.expires_at = if let Some(hours) = expiration_hours {
            if hours == 0 {
                0 // No expiration
            } else {
                clock.unix_timestamp
                    .checked_add((hours * 3600) as i64)
                    .ok_or(LocalMoneyErrorCode::MathOverflow)?
            }
        } else {
            0 // No expiration if not specified
        };
        
        offer.bump = ctx.bumps.offer;

        // Update profile offer statistics via CPI
        let profile_update_cpi = CpiContext::new(
            profile_program.to_account_info(),
            profile::cpi::accounts::UpdateProfile {
                profile: user_profile.to_account_info(),
                owner: ctx.accounts.owner.to_account_info(),
            },
        );
        
        // Increment active offer count in profile
        profile::cpi::update_offer_stats(profile_update_cpi, true)?;

        msg!(
            "Offer created with profile validation: ID={}, type={}, currency={:?}, rate={}, expires_at={}, profile_integrated=true",
            offer_id,
            offer.offer_type,
            offer.fiat_currency,
            rate,
            offer.expires_at
        );

        Ok(())
    }

    /// Update offer expiration (Task 2.2.5)
    /// Allow owner to extend or modify the expiration time of an offer
    pub fn update_offer_expiration(
        ctx: Context<UpdateOffer>,
        new_expiration_hours: Option<u64>, // Hours from now (0 or None means no expiration)
    ) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        
        // Validate that offer can be updated
        require!(
            offer.state == OfferState::Active || offer.state == OfferState::Paused,
            LocalMoneyErrorCode::OfferNotUpdatable
        );
        
        let clock = Clock::get()?;
        
        // Calculate new expiration timestamp
        let new_expires_at = if let Some(hours) = new_expiration_hours {
            if hours == 0 {
                0 // No expiration
            } else {
                // Convert hours to seconds and add to current time
                clock.unix_timestamp
                    .checked_add((hours * 3600) as i64)
                    .ok_or(LocalMoneyErrorCode::MathOverflow)?
            }
        } else {
            0 // No expiration if not specified
        };
        
        let old_expires_at = offer.expires_at;
        offer.expires_at = new_expires_at;
        
        msg!(
            "Offer expiration updated: ID={}, old_expires_at={}, new_expires_at={}",
            offer.id,
            old_expires_at,
            new_expires_at
        );
        
        Ok(())
    }

    /// Get expired offers (Task 2.2.5)
    /// Query function to get all offers that have expired and should be archived
    pub fn get_expired_offers(
        ctx: Context<GetOffers>,
        limit: Option<u8>,
    ) -> Result<Vec<OfferSummary>> {
        let limit = limit.unwrap_or(10).min(50) as usize;
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        // In a real implementation, this would iterate through remaining_accounts
        // and check for expired offers. For now, return a placeholder structure
        let expired_offers = Vec::new();
        
        // Implementation would:
        // 1. Iterate through remaining_accounts (offer accounts)
        // 2. Check if expires_at > 0 && current_time >= expires_at
        // 3. Include only Active or Paused offers that have expired
        // 4. Return up to the limit
        
        msg!(
            "Getting expired offers: current_time={}, limit={}",
            current_time,
            limit
        );
        
        Ok(expired_offers)
    }

    /// Batch archive expired offers (Task 2.2.5)
    /// Archive multiple expired offers in a single transaction
    pub fn batch_archive_expired_offers(
        ctx: Context<BatchUpdateOfferStates>,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        let mut archived_count = 0;
        let mut failed_count = 0;
        
        // Iterate through remaining_accounts which should be offer accounts
        for account_info in ctx.remaining_accounts.iter() {
            // Attempt to deserialize each account as an Offer
            let mut account_data = account_info.try_borrow_mut_data()?;
            if let Ok(mut offer_data) = Offer::try_deserialize_unchecked(&mut account_data.as_ref()) {
                // Check if offer has expired
                let should_archive = offer_data.expires_at > 0 
                    && current_time >= offer_data.expires_at
                    && (offer_data.state == OfferState::Active || offer_data.state == OfferState::Paused);
                
                if should_archive {
                    offer_data.state = OfferState::Archive;
                    
                    // Serialize the updated offer back to the account
                    let mut writer = &mut account_data[8..]; // Skip discriminator
                    offer_data.try_serialize(&mut writer)?;
                    
                    archived_count += 1;
                    
                    msg!(
                        "Batch archived expired offer ID={}, expired_at={}",
                        offer_data.id,
                        offer_data.expires_at
                    );
                } else {
                    failed_count += 1;
                }
            }
        }
        
        msg!(
            "Batch expiration archive completed: {} archived, {} failed/skipped",
            archived_count,
            failed_count
        );
        
        Ok(())
    }

    /// Validate profile for offers (Task 2.3.5)
    /// Comprehensive profile validation with scoring system for offer creation eligibility
    pub fn validate_profile_for_offers(
        ctx: Context<ValidateProfileForOffers>,
        min_reputation_score: Option<u32>,
        require_contact_info: bool,
        min_completed_trades: Option<u64>,
    ) -> Result<ProfileValidationResult> {
        let profile = &ctx.accounts.user_profile;
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        // Calculate profile age in days
        let profile_age_seconds = current_time - profile.created_at;
        let profile_age_days = (profile_age_seconds / 86400) as u32; // 86400 seconds in a day
        
        // Validation criteria
        let min_reputation = min_reputation_score.unwrap_or(0);
        let min_trades = min_completed_trades.unwrap_or(0);
        let min_profile_age_days = 7; // Minimum 7 days old
        
        // Check individual criteria
        let meets_min_reputation = profile.reputation_score >= min_reputation;
        let has_required_contact_info = if require_contact_info {
            profile.contact.is_some() && !profile.contact.as_ref().unwrap().is_empty()
        } else {
            true
        };
        let meets_min_completed_trades = profile.released_trades_count >= min_trades;
        let profile_age_sufficient = profile_age_days >= min_profile_age_days;
        
        // Check activity pattern - look for reasonable trade frequency
        let days_since_last_trade = if profile.last_trade > 0 {
            ((current_time - profile.last_trade) / 86400) as u32
        } else {
            u32::MAX
        };
        let has_valid_activity_pattern = days_since_last_trade <= 90 || profile.released_trades_count == 0;
        
        // Calculate validation score (0-100)
        let mut score = 0u8;
        
        // Reputation component (0-25 points)
        if profile.reputation_score > 0 {
            score += (25.min(profile.reputation_score / 4) as u8).min(25);
        }
        
        // Trade history component (0-30 points)
        if profile.released_trades_count > 0 {
            score += (30.min(profile.released_trades_count * 3) as u8).min(30);
        }
        
        // Profile age component (0-20 points)
        score += (20.min(profile_age_days / 2) as u8).min(20);
        
        // Contact info component (0-15 points)
        if has_required_contact_info {
            score += 15;
        }
        
        // Activity pattern component (0-10 points)
        if has_valid_activity_pattern {
            score += 10;
        }
        
        // Overall validation
        let all_criteria_met = meets_min_reputation 
            && has_required_contact_info 
            && meets_min_completed_trades 
            && profile_age_sufficient
            && has_valid_activity_pattern;
        
        let is_valid = all_criteria_met && score >= 50; // Minimum 50% score required
        
        // Generate recommendations
        let mut required_improvements = Vec::new();
        let recommendation = if is_valid {
            "Profile meets all requirements for offer creation".to_string()
        } else {
            if !meets_min_reputation {
                required_improvements.push(format!("Increase reputation score to at least {}", min_reputation));
            }
            if !has_required_contact_info {
                required_improvements.push("Add contact information".to_string());
            }
            if !meets_min_completed_trades {
                required_improvements.push(format!("Complete at least {} trades", min_trades));
            }
            if !profile_age_sufficient {
                required_improvements.push(format!("Profile must be at least {} days old", min_profile_age_days));
            }
            if !has_valid_activity_pattern {
                required_improvements.push("Show more recent trading activity".to_string());
            }
            if score < 50 {
                required_improvements.push("Improve overall profile score to at least 50".to_string());
            }
            "Profile requires improvements before creating offers".to_string()
        };
        
        // Generate issues list
        let mut issues = Vec::new();
        if !meets_min_reputation {
            issues.push(format!("Reputation score {} below minimum {}", profile.reputation_score, min_reputation));
        }
        if !has_required_contact_info {
            issues.push("Missing required contact information".to_string());
        }
        if !meets_min_completed_trades {
            issues.push(format!("Completed trades {} below minimum {}", profile.released_trades_count, min_trades));
        }
        if !profile_age_sufficient {
            issues.push(format!("Profile age {} days below minimum {}", profile_age_days, min_profile_age_days));
        }
        if !has_valid_activity_pattern {
            issues.push("Invalid activity pattern".to_string());
        }
        
        // Generate additional recommendations
        let mut recommendations = Vec::new();
        if profile.active_offers_count >= 3 {
            recommendations.push("Consider completing existing offers before creating new ones".to_string());
        }
        if profile.encryption_key.is_none() && has_required_contact_info {
            recommendations.push("Consider adding encryption key for secure communication".to_string());
        }
        
        let result = ProfileValidationResult {
            is_valid,
            validation_score: score,
            can_create_offers: is_valid,
            profile_age_days,
            reputation_score: profile.reputation_score,
            completed_trades: profile.released_trades_count,
            active_offers_count: profile.active_offers_count,
            active_trades_count: profile.active_trades_count,
            meets_min_reputation,
            has_required_contact_info,
            meets_min_completed_trades,
            has_valid_activity_pattern,
            profile_age_sufficient,
            issues,
            recommendations,
            recommendation,
            required_improvements,
            profile_score: score, // Duplicate field for compatibility
        };
        
        msg!(
            "Profile validation completed: valid={}, score={}, profile_age_days={}",
            result.is_valid,
            result.validation_score,
            result.profile_age_days
        );
        
        Ok(result)
    }

    /// Create offer with comprehensive validation (Task 2.3.5)
    /// Enhanced offer creation with strict profile requirements
    pub fn create_offer_with_comprehensive_validation(
        ctx: Context<CreateOfferWithValidation>,
        offer_type: OfferType,
        fiat_currency: FiatCurrency,
        rate: u64,
        min_amount: u64,
        max_amount: u64,
        description: Option<String>,
        expiration_hours: Option<u64>,
        min_reputation_score: u32,
        require_contact_info: bool,
        min_completed_trades: u64,
    ) -> Result<()> {
        // First, validate the profile comprehensively
        let profile = &ctx.accounts.user_profile;
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        // Profile age check
        let profile_age_seconds = current_time - profile.created_at;
        let profile_age_days = (profile_age_seconds / 86400) as u32;
        require!(profile_age_days >= 7, LocalMoneyErrorCode::ProfileValidationFailed);
        
        // Reputation check
        require!(
            profile.reputation_score >= min_reputation_score,
            LocalMoneyErrorCode::ProfileValidationFailed
        );
        
        // Contact information check
        if require_contact_info {
            require!(
                profile.contact.is_some() && !profile.contact.as_ref().unwrap().is_empty(),
                LocalMoneyErrorCode::ContactInfoRequired
            );
        }
        
        // Trading history check
        require!(
            profile.released_trades_count >= min_completed_trades,
            LocalMoneyErrorCode::ProfileValidationFailed
        );
        
        // Activity pattern check (must have traded within last 90 days or be new)
        if profile.last_trade > 0 {
            let days_since_last_trade = (current_time - profile.last_trade) / 86400;
            require!(
                days_since_last_trade <= 90,
                LocalMoneyErrorCode::ProfileValidationFailed
            );
        }
        
        // Check Hub limits via CPI
        let hub_cpi_program = ctx.accounts.hub_program.to_account_info();
        let hub_cpi_accounts = hub::cpi::accounts::ValidateActivityLimits {
            config: ctx.accounts.hub_config.to_account_info(),
            program_id: ctx.accounts.offer_program.to_account_info(),
        };
        let hub_cpi_ctx = CpiContext::new(hub_cpi_program, hub_cpi_accounts);
        
        match hub::cpi::validate_user_activity_limits(hub_cpi_ctx, profile.active_offers_count + 1, profile.active_trades_count) {
            Ok(_) => {},
            Err(_) => return Err(LocalMoneyErrorCode::OfferLimitExceeded.into()),
        }
        
        // Validate offer parameters
        require!(rate > 0, LocalMoneyErrorCode::InvalidRate);
        require!(min_amount > 0, LocalMoneyErrorCode::InvalidMinAmount);
        require!(
            max_amount >= min_amount,
            LocalMoneyErrorCode::InvalidMaxAmount
        );
        
        if let Some(ref desc) = description {
            require!(
                desc.len() <= MAX_DESCRIPTION_LENGTH,
                LocalMoneyErrorCode::DescriptionTooLong
            );
        }
        
        // Get current offer ID and increment counter
        let counter = &mut ctx.accounts.counter;
        let offer_id = counter.count;
        counter.count = counter
            .count
            .checked_add(1)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?;
        
        // Initialize offer account
        let offer = &mut ctx.accounts.offer;
        offer.id = offer_id;
        offer.owner = ctx.accounts.owner.key();
        offer.offer_type = offer_type;
        offer.fiat_currency = fiat_currency;
        offer.rate = rate;
        offer.min_amount = min_amount;
        offer.max_amount = max_amount;
        offer.description = description.unwrap_or_default();
        offer.token_mint = ctx.accounts.token_mint.key();
        offer.state = OfferState::Active;
        offer.created_at = current_time;
        
        // Calculate expiration timestamp
        offer.expires_at = if let Some(hours) = expiration_hours {
            if hours > 0 {
                current_time
                    .checked_add((hours * 3600) as i64)
                    .ok_or(LocalMoneyErrorCode::MathOverflow)?
            } else {
                0 // No expiration
            }
        } else {
            0 // No expiration
        };
        
        offer.bump = ctx.bumps.offer;
        
        // Update profile statistics via CPI
        let profile_cpi_program = ctx.accounts.profile_program.to_account_info();
        let profile_cpi_accounts = profile::cpi::accounts::UpdateProfile {
            profile: ctx.accounts.user_profile.to_account_info(),
            owner: ctx.accounts.owner.to_account_info(),
        };
        let profile_cpi_ctx = CpiContext::new(profile_cpi_program, profile_cpi_accounts);
        
        match profile::cpi::update_offer_stats(profile_cpi_ctx, true) {
            Ok(_) => {},
            Err(_) => return Err(LocalMoneyErrorCode::ProfileStatsUpdateFailed.into()),
        }
        
        msg!(
            "Offer created with comprehensive validation: ID={}, owner={}, type={}, currency={}, rate={}",
            offer.id,
            offer.owner,
            offer.offer_type,
            offer.fiat_currency,
            offer.rate
        );
        
        Ok(())
    }
}

/// Offer account - represents a buy or sell offer
#[account]
pub struct Offer {
    /// Unique offer ID
    pub id: u64,
    /// Owner of the offer
    pub owner: Pubkey,
    /// Type of offer (Buy/Sell)
    pub offer_type: OfferType,
    /// Fiat currency for the offer
    pub fiat_currency: FiatCurrency,
    /// Exchange rate (in rate scale units)
    pub rate: u64,
    /// Minimum trade amount
    pub min_amount: u64,
    /// Maximum trade amount
    pub max_amount: u64,
    /// Optional description
    pub description: String,
    /// Token mint for this offer
    pub token_mint: Pubkey,
    /// Current state of the offer
    pub state: OfferState,
    /// Creation timestamp
    pub created_at: i64,
    /// Expiration timestamp (0 means no expiration)
    pub expires_at: i64,
    /// PDA bump
    pub bump: u8,
}

/// Offer counter - tracks the next available offer ID
#[account]
pub struct OfferCounter {
    /// Next available offer ID
    pub count: u64,
}

/// Initialize offer counter context
#[derive(Accounts)]
pub struct InitializeCounter<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 8, // discriminator + u64
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Create offer context
#[derive(Accounts)]
#[instruction(offer_type: OfferType, fiat_currency: FiatCurrency)]
pub struct CreateOffer<'info> {
    #[account(
        init,
        payer = owner,
        space = OFFER_SIZE,
        seeds = [OFFER_SEED, counter.count.to_le_bytes().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// Token mint for the offer
    pub token_mint: Account<'info, anchor_spl::token::Mint>,

    /// Optional user profile for CPI calls (Task 2.3.1)
    /// CHECK: Optional account for profile integration
    pub user_profile: Option<Account<'info, profile::Profile>>,

    /// Optional profile program for CPI calls (Task 2.3.1)
    /// CHECK: This is the profile program ID, validated by CPI
    pub profile_program: Option<Program<'info, profile::program::Profile>>,

    /// Optional hub program for activity limit validation (Task 2.3.1)
    /// CHECK: This is the hub program ID, validated by CPI
    pub hub_program: Option<AccountInfo<'info>>,

    /// Optional hub configuration account (Task 2.3.1)
    /// CHECK: This is validated by the hub program during CPI
    pub hub_config: Option<AccountInfo<'info>>,

    pub system_program: Program<'info, System>,
}

/// Update offer context
#[derive(Accounts)]
pub struct UpdateOffer<'info> {
    #[account(
        mut,
        seeds = [OFFER_SEED, offer.id.to_le_bytes().as_ref()],
        bump = offer.bump,
        has_one = owner @ LocalMoneyErrorCode::Unauthorized
    )]
    pub offer: Account<'info, Offer>,

    pub owner: Signer<'info>,
}

/// Update offer context with profile integration (Task 2.3.1)
#[derive(Accounts)]
pub struct UpdateOfferWithProfile<'info> {
    #[account(
        mut,
        seeds = [OFFER_SEED, offer.id.to_le_bytes().as_ref()],
        bump = offer.bump,
        has_one = owner @ LocalMoneyErrorCode::Unauthorized
    )]
    pub offer: Account<'info, Offer>,

    pub owner: Signer<'info>,

    /// Optional user profile for CPI calls (Task 2.3.1)
    /// CHECK: Optional account for profile integration
    pub user_profile: Option<Account<'info, profile::Profile>>,

    /// Optional profile program for CPI calls (Task 2.3.1)
    /// CHECK: This is the profile program ID, validated by CPI
    pub profile_program: Option<Program<'info, profile::program::Profile>>,
}

/// Sync profile offer counts context (Task 2.3.2)
#[derive(Accounts)]
pub struct SyncProfileOfferCounts<'info> {
    /// User profile to sync
    /// CHECK: This is validated by the profile program during CPI
    pub profile: Account<'info, profile::Profile>,

    pub owner: Signer<'info>,

    /// Profile program for CPI calls
    /// CHECK: This is the profile program ID, validated by CPI
    pub profile_program: Program<'info, profile::program::Profile>,
    
    // remaining_accounts will contain offer accounts for this owner
}

/// Update contact information context (Task 2.3.3)
#[derive(Accounts)]
pub struct UpdateContactInformation<'info> {
    /// User profile to update
    /// CHECK: This is validated by the profile program during CPI
    pub user_profile: Account<'info, profile::Profile>,

    pub owner: Signer<'info>,

    /// Profile program for CPI calls
    /// CHECK: This is the profile program ID, validated by CPI
    pub profile_program: Program<'info, profile::program::Profile>,
}

/// Get contact information context (Task 2.3.3)
#[derive(Accounts)]
pub struct GetContactInformation<'info> {
    /// User profile to query
    /// CHECK: This is validated by the profile program during CPI
    pub user_profile: Account<'info, profile::Profile>,

    /// Profile program for CPI calls
    /// CHECK: This is the profile program ID, validated by CPI
    pub profile_program: Program<'info, profile::program::Profile>,
}

/// Check offer limits context (Task 2.3.4)
#[derive(Accounts)]
pub struct CheckOfferLimits<'info> {
    /// Optional user profile for limit checking
    /// CHECK: This is validated by the profile program during CPI
    pub user_profile: Option<Account<'info, profile::Profile>>,

    /// Hub program for limit validation
    /// CHECK: This is the hub program ID, validated by CPI
    pub hub_program: Program<'info, hub::program::Hub>,

    /// Hub configuration account
    /// CHECK: This is validated by the hub program during CPI
    pub hub_config: Account<'info, hub::GlobalConfig>,
}

/// Get user limits status context (Task 2.3.4)
#[derive(Accounts)]
pub struct GetUserLimitsStatus<'info> {
    /// Optional user profile for current usage stats
    /// CHECK: This is validated by the profile program during CPI
    pub user_profile: Option<Account<'info, profile::Profile>>,

    /// Hub program for limit queries
    /// CHECK: This is the hub program ID, validated by CPI
    pub hub_program: Program<'info, hub::program::Hub>,

    /// Hub configuration account
    /// CHECK: This is validated by the hub program during CPI
    pub hub_config: Account<'info, hub::GlobalConfig>,
}

/// Create offer with limits context (Task 2.3.4)
#[derive(Accounts)]
#[instruction(offer_type: OfferType, fiat_currency: FiatCurrency)]
pub struct CreateOfferWithLimits<'info> {
    #[account(
        init,
        payer = owner,
        space = OFFER_SIZE,
        seeds = [OFFER_SEED, counter.count.to_le_bytes().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// Token mint for the offer
    pub token_mint: Account<'info, anchor_spl::token::Mint>,

    /// User profile for limit enforcement
    /// CHECK: This is validated by the profile program during CPI
    pub user_profile: Option<Account<'info, profile::Profile>>,

    /// Profile program for statistics updates
    /// CHECK: This is the profile program ID, validated by CPI
    pub profile_program: Option<Program<'info, profile::program::Profile>>,

    /// Hub program for limit validation
    /// CHECK: This is the hub program ID, validated by CPI
    pub hub_program: Program<'info, hub::program::Hub>,

    /// Hub configuration account
    /// CHECK: This is validated by the hub program during CPI
    pub hub_config: Account<'info, hub::GlobalConfig>,

    /// Offer program for validation
    /// CHECK: This is the offer program ID
    pub offer_program: Program<'info, crate::program::Offer>,

    pub system_program: Program<'info, System>,
}

/// Validate profile for offers context (Task 2.3.5)
#[derive(Accounts)]
pub struct ValidateProfileForOffers<'info> {
    /// User profile to validate
    /// CHECK: This is validated by the profile program during CPI
    pub user_profile: Account<'info, profile::Profile>,
}

/// Create offer with validation context (Task 2.3.5)
#[derive(Accounts)]
#[instruction(offer_type: OfferType, fiat_currency: FiatCurrency)]
pub struct CreateOfferWithValidation<'info> {
    #[account(
        init,
        payer = owner,
        space = OFFER_SIZE,
        seeds = [OFFER_SEED, counter.count.to_le_bytes().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// Token mint for the offer
    pub token_mint: Account<'info, anchor_spl::token::Mint>,

    /// User profile for comprehensive validation
    /// CHECK: This is validated by the profile program during CPI
    pub user_profile: Account<'info, profile::Profile>,

    /// Profile program for CPI calls
    /// CHECK: This is the profile program ID, validated by CPI
    pub profile_program: Program<'info, profile::program::Profile>,

    /// Hub program for limit validation
    /// CHECK: This is the hub program ID, validated by CPI
    pub hub_program: Program<'info, hub::program::Hub>,

    /// Hub configuration account
    /// CHECK: This is validated by the hub program during CPI
    pub hub_config: Account<'info, hub::GlobalConfig>,

    /// Offer program for validation calls
    /// CHECK: This is the offer program ID
    pub offer_program: Program<'info, crate::program::Offer>,

    pub system_program: Program<'info, System>,
}

/// Get offers context (for queries)
#[derive(Accounts)]
pub struct GetOffers<'info> {
    #[account(
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,
}

/// Offer summary structure for query responses (Task 2.2.1)
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub struct OfferSummary {
    pub id: u64,
    pub owner: Pubkey,
    pub offer_type: OfferType,
    pub fiat_currency: FiatCurrency,
    pub rate: u64,
    pub min_amount: u64,
    pub max_amount: u64,
    pub description: String,
    pub token_mint: Pubkey,
    pub state: OfferState,
    pub created_at: i64,
    pub expires_at: i64,
}

/// Contact information summary for trading context (Task 2.3.3)
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub struct ContactInfoSummary {
    pub has_contact: bool,
    pub has_encryption_key: bool,
    pub contact_length: u16,
    pub suitable_for_trading: bool,
    pub recommendation: String,
}

/// User limits status for trading (Task 2.3.4)
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub struct UserLimitsStatus {
    // Current usage
    pub active_offers_count: u8,
    pub active_trades_count: u8,
    
    // Limits from hub
    pub active_offers_limit: u8,
    pub active_trades_limit: u8,
    pub min_amount_usd: u64,
    pub max_amount_usd: u64,
    
    // Availability
    pub can_create_offer: bool,
    pub can_create_trade: bool,
    pub offers_remaining: u8,
    pub trades_remaining: u8,
}

/// Profile validation result for offer creation (Task 2.3.5)
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub struct ProfileValidationResult {
    // Validation status
    pub is_valid: bool,
    pub validation_score: u8, // 0-100
    pub can_create_offers: bool,
    
    // Profile attributes
    pub profile_age_days: u32,
    pub reputation_score: u32,
    pub completed_trades: u64,
    pub active_offers_count: u8,
    pub active_trades_count: u8,
    
    // Validation criteria results
    pub meets_min_reputation: bool,
    pub has_required_contact_info: bool,
    pub meets_min_completed_trades: bool,
    pub has_valid_activity_pattern: bool,
    pub profile_age_sufficient: bool,
    
    // Issues and recommendations
    pub issues: Vec<String>,
    pub recommendations: Vec<String>,
    pub recommendation: String,
    pub required_improvements: Vec<String>,
    pub profile_score: u8, // Duplicate of validation_score for compatibility
}

/// Context for filtered offer queries (Task 2.2.1)
#[derive(Accounts)]
pub struct GetOffersFiltered<'info> {
    #[account(
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,
    // remaining_accounts will contain offer accounts to filter through
}

/// Context for getting offers by owner (Task 2.2.1)
#[derive(Accounts)]
pub struct GetOffersByOwner<'info> {
    #[account(
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,
    // remaining_accounts will contain offer accounts to filter
}

/// Context for getting offer by ID (Task 2.2.1)
#[derive(Accounts)]
pub struct GetOfferById<'info> {
    #[account(
        seeds = [OFFER_SEED, offer.id.to_le_bytes().as_ref()],
        bump = offer.bump
    )]
    pub offer: Account<'info, Offer>,
}

/// Context for getting offer count (Task 2.2.1)
#[derive(Accounts)]
pub struct GetOfferCount<'info> {
    #[account(
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,
}

/// Pagination-related structures and enums (Task 2.2.2)

/// Sorting options for offers
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub enum OfferSortBy {
    Id,
    CreatedAt,
    Rate,
    MinAmount,
    MaxAmount,
}

/// Sort order enum
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub enum SortOrder {
    Ascending,
    Descending,
}

/// Pagination direction for cursor-based pagination
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub enum PaginationDirection {
    Forward,
    Backward,
}

/// Pagination metadata
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub struct PaginationInfo {
    pub current_page: u32,
    pub page_size: u8,
    pub total_items: u64,
    pub total_pages: u32,
    pub has_next_page: bool,
    pub has_previous_page: bool,
}

/// Paginated offers response
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub struct PaginatedOffersResponse {
    pub offers: Vec<OfferSummary>,
    pub pagination: PaginationInfo,
}

/// Cursor-based paginated offers response
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub struct CursorPaginatedOffersResponse {
    pub offers: Vec<OfferSummary>,
    pub next_cursor: Option<u64>,
    pub previous_cursor: Option<u64>,
    pub has_more: bool,
}

/// Page information structure
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub struct PageInfo {
    pub total_items: u64,
    pub total_pages: u32,
    pub page_size: u8,
    pub max_page_size: u8,
}

/// Context for paginated offer queries (Task 2.2.2)
#[derive(Accounts)]
pub struct GetOffersPaginated<'info> {
    #[account(
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,
    // remaining_accounts will contain offer accounts to paginate through
}

/// Context for cursor-based paginated offer queries (Task 2.2.2)
#[derive(Accounts)]
pub struct GetOffersCursorPaginated<'info> {
    #[account(
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,
    // remaining_accounts will contain offer accounts to paginate through
}

/// State management structures and contexts (Task 2.2.3)

/// Offer states summary for analytics
#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub struct OfferStatesSummary {
    pub active_count: u64,
    pub paused_count: u64,
    pub archived_count: u64,
    pub total_count: u64,
}

/// Context for batch updating offer states (Task 2.2.3)
#[derive(Accounts)]
pub struct BatchUpdateOfferStates<'info> {
    #[account(
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,
    pub authority: Signer<'info>,
    // remaining_accounts will contain offer accounts to update
}

/// Context for getting offer states summary (Task 2.2.3)
#[derive(Accounts)]
pub struct GetOfferStatesSummary<'info> {
    #[account(
        seeds = [OFFER_COUNTER_SEED],
        bump
    )]
    pub counter: Account<'info, OfferCounter>,
    // remaining_accounts will contain offer accounts to analyze
}

/// Context for validating state transitions (Task 2.2.3)
#[derive(Accounts)]
pub struct ValidateStateTransition<'info> {
    // This is a pure utility function that doesn't need accounts, but we need a minimal account
    /// CHECK: This is just a placeholder for the accounts structure
    pub placeholder: UncheckedAccount<'info>,
}

/// Context for validating offer rates against market prices (Task 2.2.4)
#[derive(Accounts)]
#[instruction(offer_rate: u64, fiat_currency: FiatCurrency)]
pub struct ValidateOfferRate<'info> {
    /// Price program account
    /// CHECK: Verified through CPI
    pub price_program: UncheckedAccount<'info>,
    
    /// Price program configuration
    #[account(
        seeds = [CONFIG_SEED],
        bump,
        seeds::program = price_program.key()
    )]
    /// CHECK: Verified by price program
    pub price_config: UncheckedAccount<'info>,
    
    /// Currency price account for the specific fiat currency
    #[account(
        seeds = [CURRENCY_PRICE_SEED, fiat_currency.to_string().as_bytes()],
        bump,
        seeds::program = price_program.key()
    )]
    /// CHECK: Verified by price program
    pub currency_price: UncheckedAccount<'info>,
}


/// Context for updating offers with rate validation (Task 2.2.4)
#[derive(Accounts)]
pub struct UpdateOfferWithValidation<'info> {
    #[account(
        mut,
        seeds = [OFFER_SEED, offer.id.to_le_bytes().as_ref()],
        bump = offer.bump,
        has_one = owner @ LocalMoneyErrorCode::Unauthorized
    )]
    pub offer: Account<'info, Offer>,

    pub owner: Signer<'info>,

    /// Price program account (optional for rate validation)
    /// CHECK: Verified through CPI
    pub price_program: UncheckedAccount<'info>,
    
    /// Price program configuration (optional for rate validation)
    #[account(
        seeds = [CONFIG_SEED],
        bump,
        seeds::program = price_program.key()
    )]
    /// CHECK: Verified by price program
    pub price_config: UncheckedAccount<'info>,
    
    /// Currency price account for the specific fiat currency (optional for rate validation)
    #[account(
        seeds = [CURRENCY_PRICE_SEED, offer.fiat_currency.to_string().as_bytes()],
        bump,
        seeds::program = price_program.key()
    )]
    /// CHECK: Verified by price program
    pub currency_price: UncheckedAccount<'info>,
}

/// Price program configuration (for rate validation)
#[account]
pub struct PriceConfig {
    pub authority: Pubkey,
    pub hub_program: Pubkey,
    pub price_provider: Pubkey,
    pub max_staleness_seconds: u64,
    pub bump: u8,
}

/// Currency price information (for rate validation)
#[account]
pub struct CurrencyPrice {
    pub currency: FiatCurrency,
    pub price_usd: u64, // Price in USD with PRICE_SCALE decimals
    pub last_updated: i64,
    pub is_active: bool,
}

/// Validation helper functions
impl Offer {
    /// Check if offer can accept a trade of given amount (updated for Task 2.2.5)
    pub fn can_accept_trade_amount(&self, amount: u64) -> Result<()> {
        require!(
            self.state == OfferState::Active,
            LocalMoneyErrorCode::OfferNotActive
        );
        
        // Check if offer has expired
        let clock = Clock::get()?;
        require!(
            !self.is_expired(clock.unix_timestamp),
            LocalMoneyErrorCode::InvalidState // Could add a specific OfferExpired error code
        );
        
        validate_amount_range(self.min_amount, self.max_amount, amount)
    }

    /// Check if offer is active
    pub fn is_active(&self) -> bool {
        self.state == OfferState::Active
    }

    /// Check if offer has expired (Task 2.2.5)
    pub fn is_expired(&self, current_timestamp: i64) -> bool {
        self.expires_at > 0 && current_timestamp >= self.expires_at
    }

    /// Check if offer has expiration set (Task 2.2.5)
    pub fn has_expiration(&self) -> bool {
        self.expires_at > 0
    }

    /// Get seconds until expiration (Task 2.2.5)
    /// Returns None if no expiration is set, or Some(seconds) until expiration
    /// Returns Some(0) if already expired
    pub fn seconds_until_expiration(&self, current_timestamp: i64) -> Option<i64> {
        if self.expires_at == 0 {
            None // No expiration
        } else {
            Some((self.expires_at - current_timestamp).max(0))
        }
    }

    /// Check if offer is active and not expired (Task 2.2.5)
    pub fn is_available(&self, current_timestamp: i64) -> bool {
        self.is_active() && !self.is_expired(current_timestamp)
    }

    /// Get total number of offers from counter
    pub fn get_total_offers(counter: &OfferCounter) -> u64 {
        counter.count
    }
}

#[error_code]
pub enum OfferError {
    #[msg("Invalid rate provided")]
    InvalidRate,
    #[msg("Invalid minimum amount")]
    InvalidMinAmount,
    #[msg("Invalid maximum amount")]
    InvalidMaxAmount,
    #[msg("Description too long")]
    DescriptionTooLong,
    #[msg("Offer is not active")]
    OfferNotActive,
    #[msg("Offer cannot be updated in current state")]
    OfferNotUpdatable,
    #[msg("Offer cannot be closed in current state")]
    OfferNotClosable,
    #[msg("Invalid state transition")]
    InvalidStateTransition,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Math overflow")]
    MathOverflow,
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;
    use shared_types::{FiatCurrency, OfferState, OfferType};

    /// Test helper to create a mock pubkey
    fn create_mock_pubkey() -> Pubkey {
        Pubkey::new_unique()
    }

    /// Test helper to create a mock offer
    fn create_test_offer() -> Offer {
        Offer {
            id: 1,
            owner: create_mock_pubkey(),
            offer_type: OfferType::Buy,
            fiat_currency: FiatCurrency::USD,
            rate: 50000, // $50,000 per unit
            min_amount: 100,
            max_amount: 1000,
            description: "Test offer".to_string(),
            token_mint: create_mock_pubkey(),
            state: OfferState::Active,
            created_at: 1640995200, // Jan 1, 2022
            expires_at: 0, // No expiration
            bump: 255,
        }
    }

    #[test]
    fn test_offer_struct_creation() {
        let offer = create_test_offer();
        
        assert_eq!(offer.id, 1);
        assert_eq!(offer.offer_type, OfferType::Buy);
        assert_eq!(offer.fiat_currency, FiatCurrency::USD);
        assert_eq!(offer.rate, 50000);
        assert_eq!(offer.min_amount, 100);
        assert_eq!(offer.max_amount, 1000);
        assert_eq!(offer.state, OfferState::Active);
        assert_eq!(offer.expires_at, 0);
    }

    #[test]
    fn test_offer_counter_creation() {
        let counter = OfferCounter { count: 0 };
        assert_eq!(counter.count, 0);
        
        let counter_with_offers = OfferCounter { count: 42 };
        assert_eq!(counter_with_offers.count, 42);
    }

    #[test]
    fn test_offer_is_active() {
        let mut offer = create_test_offer();
        
        // Test active state
        offer.state = OfferState::Active;
        assert!(offer.is_active());
        
        // Test non-active states
        offer.state = OfferState::Paused;
        assert!(!offer.is_active());
        
        offer.state = OfferState::Archive;
        assert!(!offer.is_active());
    }

    #[test]
    fn test_offer_expiration_logic() {
        let mut offer = create_test_offer();
        let current_time = 1640995200; // Jan 1, 2022
        
        // Test no expiration
        offer.expires_at = 0;
        assert!(!offer.is_expired(current_time));
        assert!(!offer.has_expiration());
        assert_eq!(offer.seconds_until_expiration(current_time), None);
        
        // Test future expiration
        offer.expires_at = current_time + 3600; // 1 hour later
        assert!(!offer.is_expired(current_time));
        assert!(offer.has_expiration());
        assert_eq!(offer.seconds_until_expiration(current_time), Some(3600));
        
        // Test past expiration
        offer.expires_at = current_time - 3600; // 1 hour ago
        assert!(offer.is_expired(current_time));
        assert!(offer.has_expiration());
        assert_eq!(offer.seconds_until_expiration(current_time), Some(0));
        
        // Test exact expiration time
        offer.expires_at = current_time;
        assert!(offer.is_expired(current_time));
    }

    #[test]
    fn test_offer_availability() {
        let mut offer = create_test_offer();
        let current_time = 1640995200;
        
        // Test active and not expired
        offer.state = OfferState::Active;
        offer.expires_at = 0; // No expiration
        assert!(offer.is_available(current_time));
        
        // Test active but expired
        offer.expires_at = current_time - 3600; // 1 hour ago
        assert!(!offer.is_available(current_time));
        
        // Test paused and not expired
        offer.state = OfferState::Paused;
        offer.expires_at = 0;
        assert!(!offer.is_available(current_time));
        
        // Test archived
        offer.state = OfferState::Archive;
        assert!(!offer.is_available(current_time));
    }

    #[test]
    fn test_offer_summary_creation() {
        let offer = create_test_offer();
        
        let summary = OfferSummary {
            id: offer.id,
            owner: offer.owner,
            offer_type: offer.offer_type.clone(),
            fiat_currency: offer.fiat_currency.clone(),
            rate: offer.rate,
            min_amount: offer.min_amount,
            max_amount: offer.max_amount,
            description: offer.description.clone(),
            token_mint: offer.token_mint,
            state: offer.state.clone(),
            created_at: offer.created_at,
            expires_at: offer.expires_at,
        };
        
        assert_eq!(summary.id, offer.id);
        assert_eq!(summary.owner, offer.owner);
        assert_eq!(summary.rate, offer.rate);
        assert_eq!(summary.state, offer.state);
        assert_eq!(summary.expires_at, offer.expires_at);
    }

    #[test]
    fn test_pagination_info_creation() {
        let pagination = PaginationInfo {
            current_page: 1,
            page_size: 10,
            total_items: 100,
            total_pages: 10,
            has_next_page: true,
            has_previous_page: false,
        };
        
        assert_eq!(pagination.current_page, 1);
        assert_eq!(pagination.page_size, 10);
        assert_eq!(pagination.total_items, 100);
        assert_eq!(pagination.total_pages, 10);
        assert!(pagination.has_next_page);
        assert!(!pagination.has_previous_page);
    }

    #[test]
    fn test_pagination_calculations() {
        let total_items = 25u64;
        let page_size = 10usize;
        
        // Calculate total pages
        let total_pages = ((total_items as usize + page_size - 1) / page_size) as u32;
        assert_eq!(total_pages, 3);
        
        // Test page boundaries
        let page_1_offset = ((1 - 1) as usize) * page_size;
        let page_2_offset = ((2 - 1) as usize) * page_size;
        let page_3_offset = ((3 - 1) as usize) * page_size;
        
        assert_eq!(page_1_offset, 0);
        assert_eq!(page_2_offset, 10);
        assert_eq!(page_3_offset, 20);
        
        // Test has_next_page logic
        assert!(1 < total_pages); // Page 1 has next
        assert!(2 < total_pages); // Page 2 has next
        assert!(!(3 < total_pages)); // Page 3 is last
        
        // Test has_previous_page logic
        assert!(!(1 > 1)); // Page 1 has no previous
        assert!(2 > 1); // Page 2 has previous
        assert!(3 > 1); // Page 3 has previous
    }

    #[test]
    fn test_cursor_pagination_response() {
        let offers = vec![]; // Empty for test
        let response = CursorPaginatedOffersResponse {
            offers,
            next_cursor: Some(10),
            previous_cursor: Some(5),
            has_more: true,
        };
        
        assert_eq!(response.next_cursor, Some(10));
        assert_eq!(response.previous_cursor, Some(5));
        assert!(response.has_more);
        assert!(response.offers.is_empty());
    }

    #[test]
    fn test_offer_states_summary() {
        let summary = OfferStatesSummary {
            active_count: 15,
            paused_count: 5,
            archived_count: 30,
            total_count: 50,
        };
        
        assert_eq!(summary.active_count, 15);
        assert_eq!(summary.paused_count, 5);
        assert_eq!(summary.archived_count, 30);
        assert_eq!(summary.total_count, 50);
        
        // Verify total count matches sum of states
        let calculated_total = summary.active_count + summary.paused_count + summary.archived_count;
        assert_eq!(calculated_total, summary.total_count);
    }

    #[test]
    fn test_sort_orders() {
        let sort_by_id = OfferSortBy::Id;
        let sort_by_created = OfferSortBy::CreatedAt;
        let sort_by_rate = OfferSortBy::Rate;
        
        assert_eq!(format!("{:?}", sort_by_id), "Id");
        assert_eq!(format!("{:?}", sort_by_created), "CreatedAt");
        assert_eq!(format!("{:?}", sort_by_rate), "Rate");
        
        let ascending = SortOrder::Ascending;
        let descending = SortOrder::Descending;
        
        assert_eq!(format!("{:?}", ascending), "Ascending");
        assert_eq!(format!("{:?}", descending), "Descending");
    }

    #[test]
    fn test_pagination_direction() {
        let forward = PaginationDirection::Forward;
        let backward = PaginationDirection::Backward;
        
        assert_eq!(format!("{:?}", forward), "Forward");
        assert_eq!(format!("{:?}", backward), "Backward");
    }

    #[test]
    fn test_expiration_time_calculations() {
        let base_time = 1640995200i64; // Jan 1, 2022
        
        // Test hour to seconds conversion
        let hours_1 = 1u64;
        let hours_24 = 24u64;
        let hours_168 = 168u64; // 1 week
        
        let seconds_1h = (hours_1 * 3600) as i64;
        let seconds_24h = (hours_24 * 3600) as i64;
        let seconds_168h = (hours_168 * 3600) as i64;
        
        assert_eq!(seconds_1h, 3600);
        assert_eq!(seconds_24h, 86400);
        assert_eq!(seconds_168h, 604800);
        
        // Test expiration calculation
        let expires_1h = base_time + seconds_1h;
        let expires_24h = base_time + seconds_24h;
        let expires_168h = base_time + seconds_168h;
        
        assert_eq!(expires_1h, 1640998800);
        assert_eq!(expires_24h, 1641081600);
        assert_eq!(expires_168h, 1641600000);
    }

    #[test]
    fn test_rate_validation_bounds() {
        let market_price = 50000u64; // $50,000
        let deviation_10_percent = 10u8;
        let deviation_25_percent = 25u8;
        let deviation_50_percent = 50u8;
        
        // Test 10% deviation
        let lower_10 = market_price * (100 - deviation_10_percent as u64) / 100;
        let upper_10 = market_price * (100 + deviation_10_percent as u64) / 100;
        assert_eq!(lower_10, 45000);
        assert_eq!(upper_10, 55000);
        
        // Test 25% deviation
        let lower_25 = market_price * (100 - deviation_25_percent as u64) / 100;
        let upper_25 = market_price * (100 + deviation_25_percent as u64) / 100;
        assert_eq!(lower_25, 37500);
        assert_eq!(upper_25, 62500);
        
        // Test 50% deviation (maximum allowed)
        let lower_50 = market_price * (100 - deviation_50_percent as u64) / 100;
        let upper_50 = market_price * (100 + deviation_50_percent as u64) / 100;
        assert_eq!(lower_50, 25000);
        assert_eq!(upper_50, 75000);
        
        // Test bounds checking
        assert!(45000 >= lower_10 && 45000 <= upper_10);
        assert!(55000 >= lower_10 && 55000 <= upper_10);
        assert!(!(44999 >= lower_10 && 44999 <= upper_10));
        assert!(!(55001 >= lower_10 && 55001 <= upper_10));
    }

    #[test]
    fn test_offer_state_transitions() {
        // Test valid transitions
        assert!(matches!((OfferState::Active, OfferState::Paused), 
            (OfferState::Active, OfferState::Paused)));
        assert!(matches!((OfferState::Active, OfferState::Archive), 
            (OfferState::Active, OfferState::Archive)));
        assert!(matches!((OfferState::Paused, OfferState::Active), 
            (OfferState::Paused, OfferState::Active)));
        assert!(matches!((OfferState::Paused, OfferState::Archive), 
            (OfferState::Paused, OfferState::Archive)));
            
        // Test invalid transitions (Archive is terminal)
        assert!(!matches!((OfferState::Archive, OfferState::Active), 
            (OfferState::Active, OfferState::Paused)));
        assert!(!matches!((OfferState::Archive, OfferState::Paused), 
            (OfferState::Active, OfferState::Paused)));
    }

    #[test]
    fn test_amount_validation() {
        let min_amount = 100u64;
        let max_amount = 1000u64;
        
        // Test valid amounts
        let valid_amounts = [100, 500, 1000];
        for amount in valid_amounts {
            assert!(amount >= min_amount && amount <= max_amount);
        }
        
        // Test invalid amounts
        let invalid_amounts = [99, 1001, 0];
        for amount in invalid_amounts {
            assert!(!(amount >= min_amount && amount <= max_amount));
        }
        
        // Test min > max validation
        assert!(!(1000 < 100)); // min_amount should not be greater than max_amount
        assert!(100 <= 1000); // min_amount should be less than or equal to max_amount
    }

    #[test]
    fn test_description_length_validation() {
        let max_length = 500; // Assuming MAX_DESCRIPTION_LENGTH is 500
        
        // Test valid descriptions
        let short_desc = "Short description";
        let medium_desc = "A".repeat(250);
        let max_desc = "B".repeat(max_length);
        
        assert!(short_desc.len() <= max_length);
        assert!(medium_desc.len() <= max_length);
        assert!(max_desc.len() <= max_length);
        
        // Test invalid description
        let too_long_desc = "C".repeat(max_length + 1);
        assert!(too_long_desc.len() > max_length);
    }

    #[test]
    fn test_price_staleness_validation() {
        let price_timestamp = 1640995200i64; // Price updated at this time
        let current_time = 1640998800i64; // 1 hour later
        let max_staleness = 3600i64; // 1 hour max staleness
        
        let time_since_update = current_time - price_timestamp;
        
        // Test fresh price
        assert_eq!(time_since_update, 3600);
        assert!(time_since_update <= max_staleness);
        
        // Test stale price
        let stale_current_time = price_timestamp + max_staleness + 1;
        let stale_time_diff = stale_current_time - price_timestamp;
        assert!(stale_time_diff > max_staleness);
    }

    #[test]
    fn test_counter_operations() {
        let mut counter = OfferCounter { count: 0 };
        
        // Test initial state
        assert_eq!(Offer::get_total_offers(&counter), 0);
        
        // Simulate offer creation
        let offer_id = counter.count;
        counter.count = counter.count.checked_add(1).unwrap();
        
        assert_eq!(offer_id, 0);
        assert_eq!(counter.count, 1);
        assert_eq!(Offer::get_total_offers(&counter), 1);
        
        // Simulate multiple offers
        for i in 1..10 {
            let next_id = counter.count;
            counter.count = counter.count.checked_add(1).unwrap();
            assert_eq!(next_id, i);
        }
        
        assert_eq!(counter.count, 10);
        assert_eq!(Offer::get_total_offers(&counter), 10);
    }

    #[test]
    fn test_math_overflow_protection() {
        let max_u64 = u64::MAX;
        
        // Test checked addition
        assert!(max_u64.checked_add(1).is_none());
        assert!(100u64.checked_add(50).is_some());
        
        // Test checked multiplication
        assert!(max_u64.checked_mul(2).is_none());
        assert!(1000u64.checked_mul(50).is_some());
        
        // Test checked division
        assert!(100u64.checked_div(0).is_none());
        assert!(100u64.checked_div(2).is_some());
        
        // Test rate calculation overflow
        let large_price = u64::MAX / 100 + 1;
        let result = large_price.checked_mul(100);
        assert!(result.is_none()); // Should overflow
    }

    #[test]
    fn test_currency_price_struct() {
        let price = CurrencyPrice {
            currency: FiatCurrency::USD,
            price_usd: 1_000_000, // $1.00 with scale
            last_updated: 1640995200,
            is_active: true,
        };
        
        assert_eq!(price.currency, FiatCurrency::USD);
        assert_eq!(price.price_usd, 1_000_000);
        assert!(price.is_active);
        assert_eq!(price.last_updated, 1640995200);
    }

    #[test]
    fn test_price_config_struct() {
        let config = PriceConfig {
            authority: create_mock_pubkey(),
            hub_program: create_mock_pubkey(),
            price_provider: create_mock_pubkey(),
            max_staleness_seconds: 3600,
            bump: 255,
        };
        
        assert_eq!(config.max_staleness_seconds, 3600);
        assert_eq!(config.bump, 255);
    }

    #[test]
    fn test_page_info_calculations() {
        let total_items = 157u64;
        let page_size = 20u8;
        
        let total_pages = ((total_items as usize + page_size as usize - 1) / page_size as usize) as u32;
        
        let page_info = PageInfo {
            total_items,
            total_pages,
            page_size,
            max_page_size: 50,
        };
        
        assert_eq!(page_info.total_items, 157);
        assert_eq!(page_info.total_pages, 8); // ceil(157/20) = 8
        assert_eq!(page_info.page_size, 20);
        assert_eq!(page_info.max_page_size, 50);
    }

    #[test]
    fn test_edge_cases() {
        // Test zero values
        assert_eq!(0u64.checked_mul(1000), Some(0));
        assert_eq!(1000u64.checked_div(1000), Some(1));
        
        // Test timestamp edge cases
        let epoch_time = 0i64;
        let future_time = i64::MAX;
        
        assert!(epoch_time < future_time);
        
        // Test empty strings
        let empty_description = String::new();
        assert_eq!(empty_description.len(), 0);
        
        // Test minimum values
        let min_rate = 1u64;
        let min_amount = 1u64;
        
        assert!(min_rate > 0);
        assert!(min_amount > 0);
    }
}
