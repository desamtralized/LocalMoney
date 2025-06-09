use anchor_lang::prelude::*;
use shared_types::*;

declare_id!("BPFLoader2111111111111111111111111111111111");

#[program]
pub mod profile {
    use super::*;

    pub fn create_profile(
        ctx: Context<CreateProfile>,
        contact: Option<String>,
        encryption_key: Option<String>,
    ) -> Result<()> {
        // Validate profile creation parameters
        validate_profile_creation(&contact, &encryption_key)?;

        let profile = &mut ctx.accounts.profile;
        profile.owner = ctx.accounts.owner.key();
        profile.created_at = Clock::get()?.unix_timestamp;
        profile.requested_trades_count = 0;
        profile.active_trades_count = 0;
        profile.released_trades_count = 0;
        profile.last_trade = 0;
        profile.contact = contact;
        profile.encryption_key = encryption_key;
        profile.active_offers_count = 0;
        profile.reputation_score = 0;
        profile.bump = ctx.bumps.profile;

        msg!("Profile created for user: {}", ctx.accounts.owner.key());

        Ok(())
    }

    pub fn update_contact(
        ctx: Context<UpdateProfile>,
        contact: Option<String>,
        encryption_key: Option<String>,
    ) -> Result<()> {
        // Validate contact update parameters
        validate_contact_update(&contact, &encryption_key)?;

        let profile = &mut ctx.accounts.profile;
        profile.contact = contact;
        profile.encryption_key = encryption_key;

        msg!(
            "Contact information updated for user: {}",
            ctx.accounts.owner.key()
        );

        Ok(())
    }

    pub fn update_trade_stats(
        ctx: Context<UpdateProfile>,
        stat_type: TradeStatType,
        increment: bool,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;

        // Validate trade statistics update
        validate_trade_stats_update(profile, &stat_type, increment)?;

        match stat_type {
            TradeStatType::RequestedTrades => {
                if increment {
                    profile.requested_trades_count = profile
                        .requested_trades_count
                        .checked_add(1)
                        .ok_or(LocalMoneyErrorCode::MathOverflow)?;
                }
            }
            TradeStatType::ActiveTrades => {
                if increment {
                    profile.active_trades_count = profile
                        .active_trades_count
                        .checked_add(1)
                        .ok_or(LocalMoneyErrorCode::MathOverflow)?;
                } else {
                    profile.active_trades_count =
                        profile.active_trades_count.checked_sub(1).unwrap_or(0);
                }
            }
            TradeStatType::ReleasedTrades => {
                if increment {
                    profile.released_trades_count = profile
                        .released_trades_count
                        .checked_add(1)
                        .ok_or(LocalMoneyErrorCode::MathOverflow)?;
                    profile.last_trade = Clock::get()?.unix_timestamp;
                }
            }
        }

        Ok(())
    }

    pub fn update_offer_stats(ctx: Context<UpdateProfile>, increment: bool) -> Result<()> {
        let profile = &mut ctx.accounts.profile;

        // Validate offer statistics update
        validate_offer_stats_update(profile, increment)?;

        if increment {
            profile.active_offers_count = profile
                .active_offers_count
                .checked_add(1)
                .ok_or(LocalMoneyErrorCode::MathOverflow)?;
        } else {
            profile.active_offers_count = profile.active_offers_count.checked_sub(1).unwrap_or(0);
        }

        Ok(())
    }

    /// Validate activity limits against hub configuration
    pub fn validate_activity_limits(
        ctx: Context<ValidateActivityLimits>,
        offers_to_add: u8,
        trades_to_add: u8,
    ) -> Result<()> {
        let profile = &ctx.accounts.profile;

        // Calculate new totals
        let new_offers_count = profile
            .active_offers_count
            .checked_add(offers_to_add)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?;
        let new_trades_count = profile
            .active_trades_count
            .checked_add(trades_to_add)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?;

        // Make CPI call to hub to validate limits
        let cpi_program = ctx.accounts.hub_program.to_account_info();
        let cpi_accounts = hub::cpi::accounts::ValidateActivityLimits {
            config: ctx.accounts.hub_config.to_account_info(),
            program_id: ctx.accounts.profile_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        hub::cpi::validate_user_activity_limits(cpi_ctx, new_offers_count, new_trades_count)?;

        Ok(())
    }

    /// Check if user can create a new offer
    pub fn can_create_offer(ctx: Context<ValidateActivityLimits>) -> Result<bool> {
        let profile = &ctx.accounts.profile;

        // Make CPI call to hub to validate limits
        let cpi_program = ctx.accounts.hub_program.to_account_info();
        let cpi_accounts = hub::cpi::accounts::ValidateActivityLimits {
            config: ctx.accounts.hub_config.to_account_info(),
            program_id: ctx.accounts.profile_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Check if adding one more offer would exceed limits
        let new_offers_count = profile.active_offers_count.checked_add(1).unwrap_or(255);

        match hub::cpi::validate_user_activity_limits(
            cpi_ctx,
            new_offers_count,
            profile.active_trades_count,
        ) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    /// Check if user can create a new trade
    pub fn can_create_trade(ctx: Context<ValidateActivityLimits>) -> Result<bool> {
        let profile = &ctx.accounts.profile;

        // Make CPI call to hub to validate limits
        let cpi_program = ctx.accounts.hub_program.to_account_info();
        let cpi_accounts = hub::cpi::accounts::ValidateActivityLimits {
            config: ctx.accounts.hub_config.to_account_info(),
            program_id: ctx.accounts.profile_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Check if adding one more trade would exceed limits
        let new_trades_count = profile.active_trades_count.checked_add(1).unwrap_or(255);

        match hub::cpi::validate_user_activity_limits(
            cpi_ctx,
            profile.active_offers_count,
            new_trades_count,
        ) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    /// Update reputation score based on trade outcome
    pub fn update_reputation(
        ctx: Context<UpdateProfile>,
        reputation_change: ReputationChange,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;

        // Validate reputation update
        validate_reputation_update(profile, &reputation_change)?;

        match reputation_change {
            ReputationChange::TradeCompleted => {
                // Positive reputation for completing a trade
                profile.reputation_score = profile
                    .reputation_score
                    .checked_add(REPUTATION_TRADE_COMPLETED)
                    .unwrap_or(u32::MAX);
            }
            ReputationChange::TradeDisputed => {
                // Negative reputation for disputed trade
                profile.reputation_score = profile
                    .reputation_score
                    .checked_sub(REPUTATION_TRADE_DISPUTED)
                    .unwrap_or(0);
            }
            ReputationChange::TradeCanceled => {
                // Small negative reputation for canceling trade
                profile.reputation_score = profile
                    .reputation_score
                    .checked_sub(REPUTATION_TRADE_CANCELED)
                    .unwrap_or(0);
            }
            ReputationChange::FastResponse => {
                // Small positive reputation for fast response
                profile.reputation_score = profile
                    .reputation_score
                    .checked_add(REPUTATION_FAST_RESPONSE)
                    .unwrap_or(u32::MAX);
            }
            ReputationChange::SlowResponse => {
                // Small negative reputation for slow response
                profile.reputation_score = profile
                    .reputation_score
                    .checked_sub(REPUTATION_SLOW_RESPONSE)
                    .unwrap_or(0);
            }
        }

        // Update last activity timestamp
        profile.last_trade = Clock::get()?.unix_timestamp;

        msg!(
            "Reputation updated for user {}: {:?} -> {}",
            ctx.accounts.owner.key(),
            reputation_change,
            profile.reputation_score
        );

        Ok(())
    }

    /// Get user reputation tier based on score
    pub fn get_reputation_tier(ctx: Context<GetProfile>) -> Result<ReputationTier> {
        let profile = &ctx.accounts.profile;
        let tier = profile.get_reputation_tier();
        Ok(tier)
    }

    /// Get detailed reputation metrics
    pub fn get_reputation_metrics(ctx: Context<GetProfile>) -> Result<ReputationMetrics> {
        let profile = &ctx.accounts.profile;

        let completion_rate = if profile.requested_trades_count > 0 {
            (profile.released_trades_count * 100) / profile.requested_trades_count
        } else {
            0
        };

        let metrics = ReputationMetrics {
            score: profile.reputation_score,
            tier: profile.get_reputation_tier(),
            completion_rate: completion_rate as u8,
            total_trades: profile.requested_trades_count,
            completed_trades: profile.released_trades_count,
            active_trades: profile.active_trades_count,
            active_offers: profile.active_offers_count,
            last_activity: profile.last_trade,
        };

        Ok(metrics)
    }

    /// Get basic profile information
    pub fn get_profile_info(ctx: Context<GetProfile>) -> Result<ProfileInfo> {
        let profile = &ctx.accounts.profile;

        let info = ProfileInfo {
            owner: profile.owner,
            created_at: profile.created_at,
            contact: profile.contact.clone(),
            encryption_key: profile.encryption_key.clone(),
            reputation_score: profile.reputation_score,
            reputation_tier: profile.get_reputation_tier(),
        };

        Ok(info)
    }

    /// Get trading statistics
    pub fn get_trading_stats(ctx: Context<GetProfile>) -> Result<TradingStats> {
        let profile = &ctx.accounts.profile;

        let completion_rate = if profile.requested_trades_count > 0 {
            (profile.released_trades_count * 100) / profile.requested_trades_count
        } else {
            0
        };

        let stats = TradingStats {
            requested_trades_count: profile.requested_trades_count,
            active_trades_count: profile.active_trades_count,
            released_trades_count: profile.released_trades_count,
            active_offers_count: profile.active_offers_count,
            completion_rate: completion_rate as u8,
            last_trade: profile.last_trade,
        };

        Ok(stats)
    }

    /// Check if profile exists for a given owner
    pub fn profile_exists(ctx: Context<GetProfile>) -> Result<bool> {
        // If we can access the profile account, it exists
        let profile = &ctx.accounts.profile;
        Ok(profile.created_at > 0)
    }

    /// Get profile activity summary
    pub fn get_activity_summary(ctx: Context<GetProfile>) -> Result<ActivitySummary> {
        let profile = &ctx.accounts.profile;

        let days_since_creation = if profile.created_at > 0 {
            let current_time = Clock::get()?.unix_timestamp;
            ((current_time - profile.created_at) / 86400) as u32 // 86400 seconds in a day
        } else {
            0
        };

        let days_since_last_trade = if profile.last_trade > 0 {
            let current_time = Clock::get()?.unix_timestamp;
            ((current_time - profile.last_trade) / 86400) as u32
        } else {
            days_since_creation
        };

        let summary = ActivitySummary {
            days_since_creation,
            days_since_last_trade,
            total_activity_score: profile.reputation_score,
            is_active: profile.active_trades_count > 0 || profile.active_offers_count > 0,
            activity_level: get_activity_level(profile),
        };

        Ok(summary)
    }

    /// Get contact information (if available)
    pub fn get_contact_info(ctx: Context<GetProfile>) -> Result<ContactInfo> {
        let profile = &ctx.accounts.profile;

        let contact_info = ContactInfo {
            contact: profile.contact.clone(),
            encryption_key: profile.encryption_key.clone(),
            has_contact: profile.contact.is_some(),
            has_encryption_key: profile.encryption_key.is_some(),
        };

        Ok(contact_info)
    }
}

/// Validation Functions

/// Validate profile creation parameters
fn validate_profile_creation(
    contact: &Option<String>,
    encryption_key: &Option<String>,
) -> Result<()> {
    // Validate contact information length
    if let Some(ref contact_info) = contact {
        require!(
            !contact_info.is_empty(),
            LocalMoneyErrorCode::InvalidParameter
        );
        require!(
            contact_info.len() <= MAX_DESCRIPTION_LENGTH,
            LocalMoneyErrorCode::ContactInfoTooLong
        );

        // Basic validation for contact format (no special characters that could be harmful)
        require!(
            is_valid_contact_format(contact_info),
            LocalMoneyErrorCode::InvalidParameter
        );
    }

    // Validate encryption key format
    if let Some(ref key) = encryption_key {
        require!(
            key.len() >= 32 && key.len() <= 200,
            LocalMoneyErrorCode::InvalidEncryptionKey
        );

        // Basic validation for encryption key format (should be alphanumeric)
        require!(
            is_valid_encryption_key_format(key),
            LocalMoneyErrorCode::InvalidEncryptionKey
        );
    }

    Ok(())
}

/// Validate contact update parameters
fn validate_contact_update(
    contact: &Option<String>,
    encryption_key: &Option<String>,
) -> Result<()> {
    // Same validation as profile creation
    validate_profile_creation(contact, encryption_key)
}

/// Validate trade statistics update
fn validate_trade_stats_update(
    profile: &Profile,
    stat_type: &TradeStatType,
    increment: bool,
) -> Result<()> {
    match stat_type {
        TradeStatType::RequestedTrades => {
            // Can only increment requested trades
            require!(increment, LocalMoneyErrorCode::InvalidParameter);
        }
        TradeStatType::ActiveTrades => {
            if increment {
                // Basic overflow protection - detailed limits checked via CPI to hub
                require!(
                    profile.active_trades_count < 255,
                    LocalMoneyErrorCode::ActiveTradesLimitReached
                );
            } else {
                // Can only decrement if there are active trades
                require!(
                    profile.active_trades_count > 0,
                    LocalMoneyErrorCode::InvalidParameter
                );
            }
        }
        TradeStatType::ReleasedTrades => {
            // Can only increment released trades
            require!(increment, LocalMoneyErrorCode::InvalidParameter);

            // Can't release more trades than requested
            require!(
                profile.released_trades_count < profile.requested_trades_count,
                LocalMoneyErrorCode::InvalidParameter
            );
        }
    }

    Ok(())
}

/// Validate offer statistics update
fn validate_offer_stats_update(profile: &Profile, increment: bool) -> Result<()> {
    if increment {
        // Basic overflow protection - detailed limits checked via CPI to hub
        require!(
            profile.active_offers_count < 255,
            LocalMoneyErrorCode::ActiveOffersLimitReached
        );
    } else {
        // Can only decrement if there are active offers
        require!(
            profile.active_offers_count > 0,
            LocalMoneyErrorCode::InvalidParameter
        );
    }

    Ok(())
}

/// Validate contact information format
fn is_valid_contact_format(contact: &str) -> bool {
    // Basic validation: no null bytes, control characters, or excessive whitespace
    !contact.contains('\0')
        && !contact
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
        && contact.trim().len() > 0
}

/// Validate encryption key format
fn is_valid_encryption_key_format(key: &str) -> bool {
    // Basic validation: should be alphanumeric with some special characters allowed
    key.chars()
        .all(|c| c.is_alphanumeric() || "+=/-_".contains(c))
}

/// Validate reputation update
fn validate_reputation_update(
    profile: &Profile,
    reputation_change: &ReputationChange,
) -> Result<()> {
    // Basic validation - ensure profile exists and is valid
    require!(
        profile.created_at > 0,
        LocalMoneyErrorCode::InvalidParameter
    );

    // Validate reputation change type based on profile state
    match reputation_change {
        ReputationChange::TradeCompleted => {
            // Can only complete trades if there are active trades
            require!(
                profile.active_trades_count > 0 || profile.released_trades_count > 0,
                LocalMoneyErrorCode::InvalidParameter
            );
        }
        ReputationChange::TradeDisputed => {
            // Can only dispute if there are trades
            require!(
                profile.requested_trades_count > 0,
                LocalMoneyErrorCode::InvalidParameter
            );
        }
        ReputationChange::TradeCanceled => {
            // Can only cancel if there are active trades
            require!(
                profile.active_trades_count > 0,
                LocalMoneyErrorCode::InvalidParameter
            );
        }
        ReputationChange::FastResponse | ReputationChange::SlowResponse => {
            // Response time changes can happen anytime
        }
    }

    Ok(())
}

/// Determine activity level based on profile data
fn get_activity_level(profile: &Profile) -> ActivityLevel {
    if profile.last_trade == 0 {
        return ActivityLevel::Inactive;
    }

    let current_time = Clock::get().unwrap().unix_timestamp;
    let time_since_last_trade = current_time - profile.last_trade;

    // Time constants in seconds
    const DAY: i64 = 86400;
    const WEEK: i64 = 7 * DAY;
    const MONTH: i64 = 30 * DAY;

    match time_since_last_trade {
        0..=DAY => {
            // Check if very active (multiple active trades/offers)
            if profile.active_trades_count > 1 || profile.active_offers_count > 2 {
                ActivityLevel::VeryHigh
            } else {
                ActivityLevel::High
            }
        }
        t if t <= WEEK => ActivityLevel::Medium,
        t if t <= MONTH => ActivityLevel::Low,
        _ => ActivityLevel::Inactive,
    }
}

/// Profile Account (PDA)
#[account]
pub struct Profile {
    /// Profile owner
    pub owner: Pubkey, // 32 bytes
    /// Profile creation timestamp
    pub created_at: i64, // 8 bytes
    /// Total trade requests made
    pub requested_trades_count: u64, // 8 bytes
    /// Current active trades count
    pub active_trades_count: u8, // 1 byte
    /// Successfully completed trades count
    pub released_trades_count: u64, // 8 bytes
    /// Last trade timestamp
    pub last_trade: i64, // 8 bytes
    /// Contact information (encrypted or plain)
    pub contact: Option<String>, // 4 + up to 140 bytes
    /// Public encryption key for secure communication
    pub encryption_key: Option<String>, // 4 + up to 200 bytes
    /// Current active offers count
    pub active_offers_count: u8, // 1 byte
    /// Reputation score (0-4294967295)
    pub reputation_score: u32, // 4 bytes
    /// PDA bump seed
    pub bump: u8, // 1 byte
}

impl Profile {
    // Account size calculation: 8 (discriminator) + 74 (fixed) + 348 (variable) = 430 bytes
    pub const INIT_SPACE: usize =
        8 + 32 + 8 + 8 + 1 + 8 + 8 + 4 + MAX_DESCRIPTION_LENGTH + 4 + 200 + 1 + 4 + 1;

    /// Calculate reputation score based on trading history (deprecated - use reputation_score field)
    pub fn reputation_score(&self) -> u32 {
        // Return the stored reputation score instead of calculating
        self.reputation_score
    }

    /// Get reputation tier based on current score
    pub fn get_reputation_tier(&self) -> ReputationTier {
        match self.reputation_score {
            0..=99 => ReputationTier::Newcomer,
            100..=499 => ReputationTier::Bronze,
            500..=999 => ReputationTier::Silver,
            1000..=2499 => ReputationTier::Gold,
            2500..=4999 => ReputationTier::Platinum,
            _ => ReputationTier::Diamond,
        }
    }

    /// Check if user can create more offers (deprecated - use CPI to hub instead)
    /// This method is kept for backward compatibility but should use hub validation
    pub fn can_create_offer(&self, max_offers: u8) -> bool {
        self.active_offers_count < max_offers
    }

    /// Check if user can create more trades (deprecated - use CPI to hub instead)
    /// This method is kept for backward compatibility but should use hub validation
    pub fn can_create_trade(&self, max_trades: u8) -> bool {
        self.active_trades_count < max_trades
    }
}

/// Trade statistics type for updates
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum TradeStatType {
    RequestedTrades,
    ActiveTrades,
    ReleasedTrades,
}

/// Reputation change types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ReputationChange {
    TradeCompleted,
    TradeDisputed,
    TradeCanceled,
    FastResponse,
    SlowResponse,
}

/// Reputation tiers based on score
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ReputationTier {
    Newcomer, // 0-99
    Bronze,   // 100-499
    Silver,   // 500-999
    Gold,     // 1000-2499
    Platinum, // 2500-4999
    Diamond,  // 5000+
}

/// Detailed reputation metrics
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ReputationMetrics {
    pub score: u32,
    pub tier: ReputationTier,
    pub completion_rate: u8,
    pub total_trades: u64,
    pub completed_trades: u64,
    pub active_trades: u8,
    pub active_offers: u8,
    pub last_activity: i64,
}

/// Basic profile information
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProfileInfo {
    pub owner: Pubkey,
    pub created_at: i64,
    pub contact: Option<String>,
    pub encryption_key: Option<String>,
    pub reputation_score: u32,
    pub reputation_tier: ReputationTier,
}

/// Trading statistics
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TradingStats {
    pub requested_trades_count: u64,
    pub active_trades_count: u8,
    pub released_trades_count: u64,
    pub active_offers_count: u8,
    pub completion_rate: u8,
    pub last_trade: i64,
}

/// Activity summary
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ActivitySummary {
    pub days_since_creation: u32,
    pub days_since_last_trade: u32,
    pub total_activity_score: u32,
    pub is_active: bool,
    pub activity_level: ActivityLevel,
}

/// Contact information
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ContactInfo {
    pub contact: Option<String>,
    pub encryption_key: Option<String>,
    pub has_contact: bool,
    pub has_encryption_key: bool,
}

/// Activity level based on recent activity
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ActivityLevel {
    Inactive, // No activity in 30+ days
    Low,      // Activity in last 30 days
    Medium,   // Activity in last 7 days
    High,     // Activity in last 24 hours
    VeryHigh, // Multiple activities in last 24 hours
}

// Reputation score constants
pub const REPUTATION_TRADE_COMPLETED: u32 = 10;
pub const REPUTATION_TRADE_DISPUTED: u32 = 20;
pub const REPUTATION_TRADE_CANCELED: u32 = 5;
pub const REPUTATION_FAST_RESPONSE: u32 = 2;
pub const REPUTATION_SLOW_RESPONSE: u32 = 1;

#[derive(Accounts)]
pub struct CreateProfile<'info> {
    #[account(
        init,
        payer = owner,
        space = Profile::INIT_SPACE,
        seeds = [b"profile", owner.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, Profile>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    #[account(
        mut,
        seeds = [b"profile", owner.key().as_ref()],
        bump = profile.bump,
        has_one = owner
    )]
    pub profile: Account<'info, Profile>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ValidateActivityLimits<'info> {
    #[account(
        seeds = [b"profile", profile.owner.as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,

    /// Hub program for CPI calls
    /// CHECK: This is the hub program ID, validated by CPI
    pub hub_program: AccountInfo<'info>,

    /// Hub configuration account
    /// CHECK: This is validated by the hub program during CPI
    pub hub_config: AccountInfo<'info>,

    /// Profile program signer for CPI
    /// CHECK: This is the profile program ID
    pub profile_program: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetProfile<'info> {
    #[account(
        seeds = [b"profile", profile.owner.as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
}
