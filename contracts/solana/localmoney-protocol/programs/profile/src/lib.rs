use anchor_lang::prelude::*;
use shared_types::*;

declare_id!("6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k");

#[program]
pub mod profile {
    use super::*;

    /// Creates a new user profile with enhanced validation and initialization
    /// 
    /// This method creates a comprehensive user profile with proper validation,
    /// security checks, and initialization of all profile metrics.
    pub fn create_profile(
        ctx: Context<CreateProfile>,
        contact: Option<String>,
        encryption_key: Option<String>,
    ) -> Result<()> {
        // Enhanced validation with comprehensive security checks
        validate_profile_creation(&contact, &encryption_key)?;
        
        // Additional validation for encryption consistency
        validate_encryption_contact_relationship(&contact, &encryption_key)?;

        let profile = &mut ctx.accounts.profile;
        let current_timestamp = Clock::get()?.unix_timestamp;
        
        // Initialize core profile data
        profile.owner = ctx.accounts.owner.key();
        profile.created_at = current_timestamp;
        profile.last_trade = 0; // No trades yet
        profile.bump = ctx.bumps.profile;

        // Initialize contact and encryption
        profile.contact = contact.clone();
        profile.encryption_key = encryption_key.clone();

        // Initialize all counters to zero
        profile.requested_trades_count = 0;
        profile.active_trades_count = 0;
        profile.released_trades_count = 0;
        profile.active_offers_count = 0;

        // Initialize reputation system
        profile.reputation_score = 0;

        // Log profile creation with security context
        let has_contact = contact.is_some();
        let has_encryption = encryption_key.is_some();
        let appears_encrypted = contact.as_ref()
            .map(|c| appears_encrypted(c))
            .unwrap_or(false);

        msg!(
            "Profile created for user: {} | Contact: {} | Encryption: {} | Encrypted: {}",
            ctx.accounts.owner.key(),
            has_contact,
            has_encryption,
            appears_encrypted
        );

        Ok(())
    }

    /// Updates user contact information with comprehensive validation and security checks
    /// 
    /// This method provides secure contact information updates with encryption validation,
    /// change tracking, and proper security recommendations.
    pub fn update_contact(
        ctx: Context<UpdateProfile>,
        contact: Option<String>,
        encryption_key: Option<String>,
    ) -> Result<()> {
        // Comprehensive validation with security checks
        validate_contact_update(&contact, &encryption_key)?;
        validate_encryption_contact_relationship(&contact, &encryption_key)?;

        let profile = &mut ctx.accounts.profile;
        
        // Track changes for logging
        let old_has_contact = profile.contact.is_some();
        let old_has_encryption = profile.encryption_key.is_some();
        let old_appears_encrypted = profile.contact.as_ref()
            .map(|c| appears_encrypted(c))
            .unwrap_or(false);

        // Perform updates
        profile.contact = contact.clone();
        profile.encryption_key = encryption_key.clone();

        // Log changes with security context
        let new_has_contact = contact.is_some();
        let new_has_encryption = encryption_key.is_some();
        let new_appears_encrypted = contact.as_ref()
            .map(|c| appears_encrypted(c))
            .unwrap_or(false);

        // Security warning for encryption downgrade
        if old_appears_encrypted && !new_appears_encrypted {
            msg!(
                "WARNING: Contact encryption downgrade detected for user: {}",
                ctx.accounts.owner.key()
            );
        }

        msg!(
            "Contact updated for user: {} | Contact: {} -> {} | Encryption: {} -> {} | Encrypted: {} -> {}",
            ctx.accounts.owner.key(),
            old_has_contact,
            new_has_contact,
            old_has_encryption,
            new_has_encryption,
            old_appears_encrypted,
            new_appears_encrypted
        );

        Ok(())
    }

    /// Updates trading statistics with comprehensive validation and consistency checks
    /// 
    /// This method safely updates trade counters with overflow protection, 
    /// state validation, and automatic timestamp updates for trade completion.
    pub fn update_trade_stats(
        ctx: Context<UpdateProfile>,
        stat_type: TradeStatType,
        increment: bool,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        let current_timestamp = Clock::get()?.unix_timestamp;

        // Enhanced validation with state consistency checks
        validate_trade_stats_update(profile, &stat_type, increment)?;

        // Store old values for logging and validation
        let old_requested = profile.requested_trades_count;
        let old_active = profile.active_trades_count;
        let old_released = profile.released_trades_count;

        match stat_type {
            TradeStatType::RequestedTrades => {
                if increment {
                    profile.requested_trades_count = profile
                        .requested_trades_count
                        .checked_add(1)
                        .ok_or(LocalMoneyErrorCode::MathOverflow)?;
                    
                    msg!(
                        "Trade requested by user: {} | Total requests: {} -> {}",
                        ctx.accounts.owner.key(),
                        old_requested,
                        profile.requested_trades_count
                    );
                }
            }
            TradeStatType::ActiveTrades => {
                if increment {
                    profile.active_trades_count = profile
                        .active_trades_count
                        .checked_add(1)
                        .ok_or(LocalMoneyErrorCode::MathOverflow)?;
                    
                    msg!(
                        "Active trade added for user: {} | Active trades: {} -> {}",
                        ctx.accounts.owner.key(),
                        old_active,
                        profile.active_trades_count
                    );
                } else {
                    profile.active_trades_count = profile.active_trades_count
                        .checked_sub(1)
                        .unwrap_or(0);
                    
                    msg!(
                        "Active trade removed for user: {} | Active trades: {} -> {}",
                        ctx.accounts.owner.key(),
                        old_active,
                        profile.active_trades_count
                    );
                }
            }
            TradeStatType::ReleasedTrades => {
                if increment {
                    profile.released_trades_count = profile
                        .released_trades_count
                        .checked_add(1)
                        .ok_or(LocalMoneyErrorCode::MathOverflow)?;
                    
                    // Update last trade timestamp for completed trades
                    profile.last_trade = current_timestamp;
                    
                    // Calculate and log completion rate
                    let completion_rate = if profile.requested_trades_count > 0 {
                        (profile.released_trades_count * 100) / profile.requested_trades_count
                    } else {
                        0
                    };
                    
                    msg!(
                        "Trade completed by user: {} | Completed: {} -> {} | Completion rate: {}%",
                        ctx.accounts.owner.key(),
                        old_released,
                        profile.released_trades_count,
                        completion_rate
                    );
                }
            }
        }

        // Validate state consistency after update
        require!(
            profile.released_trades_count <= profile.requested_trades_count,
            LocalMoneyErrorCode::ProfileStatsUpdateFailed
        );

        Ok(())
    }

    /// Updates offer statistics with validation, overflow protection, and activity tracking
    /// 
    /// This method safely manages offer counters with comprehensive validation,
    /// activity limits checking, and detailed logging for offer lifecycle management.
    pub fn update_offer_stats(ctx: Context<UpdateProfile>, increment: bool) -> Result<()> {
        let profile = &mut ctx.accounts.profile;

        // Enhanced validation with activity limits checking
        validate_offer_stats_update(profile, increment)?;

        // Store old value for logging
        let old_offers_count = profile.active_offers_count;

        if increment {
            profile.active_offers_count = profile
                .active_offers_count
                .checked_add(1)
                .ok_or(LocalMoneyErrorCode::MathOverflow)?;
            
            msg!(
                "Offer created by user: {} | Active offers: {} -> {}",
                ctx.accounts.owner.key(),
                old_offers_count,
                profile.active_offers_count
            );
        } else {
            profile.active_offers_count = profile.active_offers_count
                .checked_sub(1)
                .unwrap_or(0);
            
            msg!(
                "Offer removed for user: {} | Active offers: {} -> {}",
                ctx.accounts.owner.key(),
                old_offers_count,
                profile.active_offers_count
            );
        }

        // Log activity status change
        let is_active_maker = profile.active_offers_count > 0;
        let is_active_trader = profile.active_trades_count > 0;
        let overall_active = is_active_maker || is_active_trader;

        if old_offers_count == 0 && profile.active_offers_count > 0 {
            msg!(
                "User {} became active maker | Overall active: {}",
                ctx.accounts.owner.key(),
                overall_active
            );
        } else if old_offers_count > 0 && profile.active_offers_count == 0 {
            msg!(
                "User {} no longer active maker | Overall active: {}",
                ctx.accounts.owner.key(),
                overall_active
            );
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

    /// Updates reputation score with comprehensive tracking and tier progression analysis
    /// 
    /// This method manages reputation changes with detailed logging, tier tracking,
    /// and activity timestamp updates. It provides comprehensive reputation analytics
    /// and prevents overflow/underflow conditions.
    pub fn update_reputation(
        ctx: Context<UpdateProfile>,
        reputation_change: ReputationChange,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        let current_timestamp = Clock::get()?.unix_timestamp;

        // Enhanced validation with comprehensive checks
        validate_reputation_update(profile, &reputation_change)?;

        // Store old values for tier change detection
        let old_score = profile.reputation_score;
        let old_tier = profile.get_reputation_tier();

        // Apply reputation change with proper bounds checking
        match reputation_change {
            ReputationChange::TradeCompleted => {
                profile.reputation_score = profile
                    .reputation_score
                    .checked_add(REPUTATION_TRADE_COMPLETED)
                    .unwrap_or(u32::MAX);
            }
            ReputationChange::TradeDisputed => {
                profile.reputation_score = profile
                    .reputation_score
                    .checked_sub(REPUTATION_TRADE_DISPUTED)
                    .unwrap_or(0);
            }
            ReputationChange::TradeCanceled => {
                profile.reputation_score = profile
                    .reputation_score
                    .checked_sub(REPUTATION_TRADE_CANCELED)
                    .unwrap_or(0);
            }
            ReputationChange::FastResponse => {
                profile.reputation_score = profile
                    .reputation_score
                    .checked_add(REPUTATION_FAST_RESPONSE)
                    .unwrap_or(u32::MAX);
            }
            ReputationChange::SlowResponse => {
                profile.reputation_score = profile
                    .reputation_score
                    .checked_sub(REPUTATION_SLOW_RESPONSE)
                    .unwrap_or(0);
            }
        }

        // Update activity timestamp
        profile.last_trade = current_timestamp;

        // Check for tier changes
        let new_tier = profile.get_reputation_tier();
        let tier_changed = old_tier != new_tier;

        // Calculate score change
        let score_change = if profile.reputation_score >= old_score {
            profile.reputation_score - old_score
        } else {
            old_score - profile.reputation_score
        };

        // Enhanced logging with tier information
        if tier_changed {
            msg!(
                "Reputation tier change for user {}: {:?} -> {:?} | Score: {} -> {} ({:+}) | Change: {:?}",
                ctx.accounts.owner.key(),
                old_tier,
                new_tier,
                old_score,
                profile.reputation_score,
                score_change as i32 * if profile.reputation_score >= old_score { 1 } else { -1 },
                reputation_change
            );
        } else {
            msg!(
                "Reputation updated for user {}: {} -> {} ({:+}) | Tier: {:?} | Change: {:?}",
                ctx.accounts.owner.key(),
                old_score,
                profile.reputation_score,
                score_change as i32 * if profile.reputation_score >= old_score { 1 } else { -1 },
                new_tier,
                reputation_change
            );
        }

        // Log milestone achievements
        match new_tier {
            ReputationTier::Bronze if old_tier == ReputationTier::Newcomer => {
                msg!("🥉 User {} achieved Bronze tier!", ctx.accounts.owner.key());
            }
            ReputationTier::Silver if old_tier == ReputationTier::Bronze => {
                msg!("🥈 User {} achieved Silver tier!", ctx.accounts.owner.key());
            }
            ReputationTier::Gold if old_tier == ReputationTier::Silver => {
                msg!("🥇 User {} achieved Gold tier!", ctx.accounts.owner.key());
            }
            ReputationTier::Platinum if old_tier == ReputationTier::Gold => {
                msg!("🏆 User {} achieved Platinum tier!", ctx.accounts.owner.key());
            }
            ReputationTier::Diamond if old_tier == ReputationTier::Platinum => {
                msg!("💎 User {} achieved Diamond tier!", ctx.accounts.owner.key());
            }
            _ => {} // No milestone achieved
        }

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

    /// Validate if contact information appears to be encrypted
    pub fn validate_contact_encryption(
        ctx: Context<GetProfile>,
    ) -> Result<ContactEncryptionStatus> {
        let profile = &ctx.accounts.profile;

        let status = match &profile.contact {
            Some(contact) => {
                let appears_encrypted = appears_encrypted(contact);
                let has_encryption_key = profile.encryption_key.is_some();

                ContactEncryptionStatus {
                    has_contact: true,
                    appears_encrypted,
                    has_encryption_key,
                    is_properly_configured: appears_encrypted == has_encryption_key,
                    recommendation: get_encryption_recommendation(
                        appears_encrypted,
                        has_encryption_key,
                    ),
                }
            }
            None => ContactEncryptionStatus {
                has_contact: false,
                appears_encrypted: false,
                has_encryption_key: profile.encryption_key.is_some(),
                is_properly_configured: true, // No contact is fine
                recommendation: EncryptionRecommendation::AddContactInfo,
            },
        };

        Ok(status)
    }

    /// Update contact with encryption validation
    pub fn update_contact_secure(
        ctx: Context<UpdateProfile>,
        contact: Option<String>,
        encryption_key: Option<String>,
        force_update: bool,
    ) -> Result<()> {
        // Enhanced validation with security checks
        validate_contact_update(&contact, &encryption_key)?;

        let profile = &mut ctx.accounts.profile;

        // Additional security check: if contact appears encrypted, require encryption key
        if let Some(ref contact_info) = contact {
            if appears_encrypted(contact_info) && encryption_key.is_none() && !force_update {
                return Err(LocalMoneyErrorCode::EncryptionKeyRequired.into());
            }
        }

        // Update profile
        profile.contact = contact;
        profile.encryption_key = encryption_key;

        msg!(
            "Secure contact information updated for user: {}",
            ctx.accounts.owner.key()
        );

        Ok(())
    }

    /// Get encryption recommendations for user
    pub fn get_encryption_recommendations(
        ctx: Context<GetProfile>,
    ) -> Result<Vec<EncryptionRecommendation>> {
        let profile = &ctx.accounts.profile;
        let mut recommendations = Vec::new();

        match (&profile.contact, &profile.encryption_key) {
            (None, None) => {
                recommendations.push(EncryptionRecommendation::AddContactInfo);
                recommendations.push(EncryptionRecommendation::AddEncryptionKey);
            }
            (Some(contact), None) => {
                if appears_encrypted(contact) {
                    recommendations.push(EncryptionRecommendation::AddEncryptionKey);
                } else {
                    recommendations.push(EncryptionRecommendation::EncryptContact);
                    recommendations.push(EncryptionRecommendation::AddEncryptionKey);
                }
            }
            (None, Some(_)) => {
                recommendations.push(EncryptionRecommendation::AddContactInfo);
            }
            (Some(contact), Some(_)) => {
                if !appears_encrypted(contact) {
                    recommendations.push(EncryptionRecommendation::EncryptContact);
                }
                // All good if contact appears encrypted and key is present
            }
        }

        Ok(recommendations)
    }

    /// Get comprehensive profile statistics aggregation
    pub fn get_profile_statistics(ctx: Context<GetProfile>) -> Result<ProfileStatistics> {
        let profile = &ctx.accounts.profile;
        let current_time = Clock::get()?.unix_timestamp;

        // Calculate completion rate
        let completion_rate = if profile.requested_trades_count > 0 {
            (profile.released_trades_count * 100) / profile.requested_trades_count
        } else {
            0
        };

        // Calculate activity metrics
        let days_since_creation = if profile.created_at > 0 {
            ((current_time - profile.created_at) / 86400) as u32
        } else {
            0
        };

        let days_since_last_trade = if profile.last_trade > 0 {
            ((current_time - profile.last_trade) / 86400) as u32
        } else {
            days_since_creation
        };

        // Calculate trading velocity (trades per month)
        let trading_velocity = if days_since_creation > 0 {
            (profile.requested_trades_count * 30) / (days_since_creation as u64).max(1)
        } else {
            0
        };

        // Calculate success rate (completed vs total)
        let success_rate = if profile.requested_trades_count > 0 {
            (profile.released_trades_count * 100) / profile.requested_trades_count
        } else {
            0
        };

        // Calculate activity score based on various factors
        let activity_score = calculate_activity_score(profile, current_time);

        let statistics = ProfileStatistics {
            // Basic counts
            total_trades_requested: profile.requested_trades_count,
            total_trades_completed: profile.released_trades_count,
            active_trades: profile.active_trades_count,
            active_offers: profile.active_offers_count,

            // Rates and percentages
            completion_rate: completion_rate as u8,
            success_rate: success_rate as u8,
            trading_velocity,

            // Time-based metrics
            days_since_creation,
            days_since_last_trade,
            account_age_category: get_account_age_category(days_since_creation),

            // Reputation and activity
            reputation_score: profile.reputation_score,
            reputation_tier: profile.get_reputation_tier(),
            activity_level: get_activity_level(profile),
            activity_score,

            // Status indicators
            is_active_trader: profile.active_trades_count > 0,
            is_active_maker: profile.active_offers_count > 0,
            has_recent_activity: days_since_last_trade <= 7,

            // Security and setup
            has_contact_info: profile.contact.is_some(),
            has_encryption_setup: profile.encryption_key.is_some(),
            profile_completeness: calculate_profile_completeness(profile),
        };

        Ok(statistics)
    }

    /// Get trading performance analytics
    pub fn get_trading_performance(ctx: Context<GetProfile>) -> Result<TradingPerformance> {
        let profile = &ctx.accounts.profile;
        let current_time = Clock::get()?.unix_timestamp;

        // Calculate performance metrics
        let completion_rate = if profile.requested_trades_count > 0 {
            (profile.released_trades_count * 100) / profile.requested_trades_count
        } else {
            0
        };

        let cancellation_rate = if profile.requested_trades_count > 0 {
            let canceled_trades = profile
                .requested_trades_count
                .saturating_sub(profile.released_trades_count)
                .saturating_sub(profile.active_trades_count as u64);
            (canceled_trades * 100) / profile.requested_trades_count
        } else {
            0
        };

        // Calculate trading frequency
        let days_active = if profile.created_at > 0 {
            ((current_time - profile.created_at) / 86400).max(1)
        } else {
            1
        };

        let trades_per_day = profile.requested_trades_count as f64 / days_active as f64;
        let trades_per_week = trades_per_day * 7.0;
        let trades_per_month = trades_per_day * 30.0;

        // Determine performance tier
        let performance_tier = get_performance_tier(
            completion_rate as u8,
            profile.reputation_score,
            profile.requested_trades_count,
        );

        // Calculate reliability score
        let reliability_score = calculate_reliability_score(profile);

        let performance = TradingPerformance {
            // Core metrics
            total_trades: profile.requested_trades_count,
            completed_trades: profile.released_trades_count,
            active_trades: profile.active_trades_count,

            // Performance rates
            completion_rate: completion_rate as u8,
            cancellation_rate: cancellation_rate as u8,
            reliability_score,

            // Frequency metrics
            trades_per_day: (trades_per_day * 100.0) as u32, // Store as basis points for precision
            trades_per_week: (trades_per_week * 100.0) as u32,
            trades_per_month: (trades_per_month * 100.0) as u32,

            // Classification
            performance_tier,
            trader_type: get_trader_type(profile),

            // Time-based analysis
            days_active: days_active as u32,
            last_activity: profile.last_trade,
            activity_consistency: calculate_activity_consistency(profile, current_time),

            // Reputation impact
            reputation_trend: get_reputation_trend(profile),
            reputation_per_trade: if profile.requested_trades_count > 0 {
                profile.reputation_score / (profile.requested_trades_count as u32)
            } else {
                0
            },
        };

        Ok(performance)
    }

    /// Get activity analytics with detailed insights
    pub fn get_activity_analytics(ctx: Context<GetProfile>) -> Result<ActivityAnalytics> {
        let profile = &ctx.accounts.profile;
        let current_time = Clock::get()?.unix_timestamp;

        // Calculate time-based metrics
        let account_age_days = if profile.created_at > 0 {
            ((current_time - profile.created_at) / 86400) as u32
        } else {
            0
        };

        let days_since_last_activity = if profile.last_trade > 0 {
            ((current_time - profile.last_trade) / 86400) as u32
        } else {
            account_age_days
        };

        // Calculate engagement metrics
        let engagement_score = calculate_engagement_score(profile, current_time);
        let activity_consistency = calculate_activity_consistency(profile, current_time);

        // Determine activity patterns
        let activity_pattern = get_activity_pattern(profile, current_time);
        let engagement_level = get_engagement_level(engagement_score);

        // Calculate growth metrics
        let growth_rate = calculate_growth_rate(profile, account_age_days);
        let momentum_score = calculate_momentum_score(profile, current_time);

        let analytics = ActivityAnalytics {
            // Time metrics
            account_age_days,
            days_since_last_activity,
            activity_streak: calculate_activity_streak(profile, current_time),

            // Engagement metrics
            engagement_score,
            engagement_level,
            activity_consistency,
            momentum_score,

            // Pattern analysis
            activity_pattern,
            peak_activity_period: get_peak_activity_period(profile),

            // Growth and trends
            growth_rate,
            trend_direction: get_trend_direction(profile, current_time),

            // Comparative metrics
            activity_percentile: calculate_activity_percentile(profile),
            reputation_velocity: calculate_reputation_velocity(profile, account_age_days),

            // Predictive indicators
            churn_risk: calculate_churn_risk(profile, current_time),
            reactivation_potential: calculate_reactivation_potential(profile, current_time),

            // Current status
            current_activity_level: get_activity_level(profile),
            is_trending_up: is_trending_up(profile, current_time),
            needs_attention: needs_attention(profile, current_time),
        };

        Ok(analytics)
    }

    /// Get profile health score and recommendations
    pub fn get_profile_health(ctx: Context<GetProfile>) -> Result<ProfileHealth> {
        let profile = &ctx.accounts.profile;
        let current_time = Clock::get()?.unix_timestamp;

        // Calculate various health metrics
        let completeness_score = calculate_profile_completeness(profile);
        let activity_health = calculate_activity_health(profile, current_time);
        let reputation_health = calculate_reputation_health(profile);
        let security_score = calculate_security_score(profile);
        let engagement_health = calculate_engagement_health(profile, current_time);

        // Calculate overall health score (weighted average)
        let overall_health = (completeness_score * 20
            + activity_health * 25
            + reputation_health * 25
            + security_score * 15
            + engagement_health * 15)
            / 100;

        // Generate recommendations
        let recommendations = generate_health_recommendations(
            profile,
            completeness_score,
            activity_health,
            reputation_health,
            security_score,
            engagement_health,
        );

        // Determine health status
        let health_status = match overall_health {
            90..=100 => ProfileHealthStatus::Excellent,
            75..=89 => ProfileHealthStatus::Good,
            60..=74 => ProfileHealthStatus::Fair,
            40..=59 => ProfileHealthStatus::Poor,
            _ => ProfileHealthStatus::Critical,
        };

        let health = ProfileHealth {
            overall_score: overall_health,
            health_status,

            // Component scores
            completeness_score,
            activity_health,
            reputation_health,
            security_score,
            engagement_health,

            // Specific indicators
            has_critical_issues: overall_health < 40,
            needs_improvement: overall_health < 75,
            is_well_maintained: overall_health >= 90,

            // Recommendations
            recommendations,
            priority_actions: get_priority_actions(profile, overall_health),

            // Risk assessment
            account_risk_level: get_account_risk_level(profile, overall_health),
            improvement_potential: calculate_improvement_potential(profile),
        };

        Ok(health)
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

        // Enhanced validation for contact format
        require!(
            is_valid_contact_format(contact_info),
            LocalMoneyErrorCode::InvalidParameter
        );
    }

    // Enhanced validation for encryption key format
    if let Some(ref key) = encryption_key {
        require!(
            key.len() >= 32 && key.len() <= 200,
            LocalMoneyErrorCode::InvalidEncryptionKey
        );

        // Enhanced validation for encryption key format (should be valid base64 or hex)
        require!(
            is_valid_encryption_key_format(key),
            LocalMoneyErrorCode::InvalidEncryptionKey
        );
    }

    // Validate encryption key and contact relationship
    validate_encryption_contact_relationship(contact, encryption_key)?;

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
    // Enhanced validation: no null bytes, control characters, or excessive whitespace
    // Also check for potential injection patterns
    !contact.contains('\0')
        && !contact
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
        && contact.trim().len() > 0
        && contact.len() <= MAX_DESCRIPTION_LENGTH
        && !contains_suspicious_patterns(contact)
}

/// Validate encryption key format
fn is_valid_encryption_key_format(key: &str) -> bool {
    // Enhanced validation: should be valid base64, hex, or Solana public key format
    is_valid_base64(key) || is_valid_hex(key) || is_valid_solana_pubkey(key)
}

/// Validate encryption key and contact relationship
fn validate_encryption_contact_relationship(
    contact: &Option<String>,
    encryption_key: &Option<String>,
) -> Result<()> {
    match (contact, encryption_key) {
        (Some(_), Some(_)) => {
            // Both contact and encryption key provided - this is the preferred secure setup
            Ok(())
        }
        (Some(contact_info), None) => {
            // Contact provided without encryption key
            // Check if contact appears to be encrypted (base64-like pattern)
            if appears_encrypted(contact_info) {
                // If contact appears encrypted but no key provided, this might be an error
                msg!("Warning: Contact appears encrypted but no encryption key provided");
            }
            Ok(())
        }
        (None, Some(_)) => {
            // Encryption key provided without contact - this is allowed for future use
            Ok(())
        }
        (None, None) => {
            // Neither provided - this is allowed (user can add later)
            Ok(())
        }
    }
}

/// Check if contact contains suspicious patterns that might indicate injection attempts
fn contains_suspicious_patterns(contact: &str) -> bool {
    let suspicious_patterns = [
        "<script",
        "</script",
        "javascript:",
        "data:",
        "vbscript:",
        "onload=",
        "onerror=",
        "onclick=",
        "eval(",
        "alert(",
    ];

    let contact_lower = contact.to_lowercase();
    suspicious_patterns
        .iter()
        .any(|pattern| contact_lower.contains(pattern))
}

/// Check if string is valid base64
fn is_valid_base64(s: &str) -> bool {
    // Basic base64 validation - should only contain base64 characters
    if s.is_empty() {
        return false;
    }

    // Check if all characters are valid base64 characters
    let valid_chars = s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=');

    // Check if length is appropriate for base64 (multiple of 4 when padding is considered)
    let proper_length = s.len() % 4 == 0 || s.trim_end_matches('=').len() % 4 != 1;

    valid_chars && proper_length
}

/// Check if string is valid hexadecimal
fn is_valid_hex(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }

    // Remove optional 0x prefix
    let hex_str = if s.starts_with("0x") || s.starts_with("0X") {
        &s[2..]
    } else {
        s
    };

    // Check if all characters are valid hex and length is even
    hex_str.len() % 2 == 0 && hex_str.chars().all(|c| c.is_ascii_hexdigit())
}

/// Check if string is a valid Solana public key format
fn is_valid_solana_pubkey(s: &str) -> bool {
    // Solana public keys are 32 bytes encoded in base58
    // They should be 32-44 characters long in base58 format
    if s.len() < 32 || s.len() > 44 {
        return false;
    }

    // Check if all characters are valid base58 characters
    // Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
    s.chars()
        .all(|c| c.is_ascii_alphanumeric() && c != '0' && c != 'O' && c != 'I' && c != 'l')
}

/// Check if contact information appears to be encrypted
fn appears_encrypted(contact: &str) -> bool {
    // Heuristic to detect if contact might be encrypted:
    // 1. Mostly base64-like characters
    // 2. No common readable patterns
    // 3. Appropriate length for encrypted data

    if contact.len() < 20 {
        return false; // Too short to be meaningful encrypted data
    }

    let base64_char_count = contact
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '+' || *c == '/' || *c == '=')
        .count();

    let base64_ratio = base64_char_count as f32 / contact.len() as f32;

    // If more than 80% of characters are base64-like, it might be encrypted
    base64_ratio > 0.8 && !contains_common_words(contact)
}

/// Check if text contains common readable words (indicating it's not encrypted)
fn contains_common_words(text: &str) -> bool {
    let common_words = [
        "email", "phone", "telegram", "discord", "twitter", "contact", "message", "call", "text",
        "whatsapp", "signal", "the", "and", "for", "you", "me", "my", "at", "com", "org", "net",
    ];

    let text_lower = text.to_lowercase();
    common_words.iter().any(|word| text_lower.contains(word))
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

/// Contact encryption status information
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ContactEncryptionStatus {
    pub has_contact: bool,
    pub appears_encrypted: bool,
    pub has_encryption_key: bool,
    pub is_properly_configured: bool,
    pub recommendation: EncryptionRecommendation,
}

/// Encryption recommendations for users
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum EncryptionRecommendation {
    AllGood,             // Contact is encrypted and key is present
    AddContactInfo,      // User should add contact information
    AddEncryptionKey,    // User should add encryption key
    EncryptContact,      // User should encrypt their contact information
    UpdateEncryptionKey, // User should update their encryption key
}

// Reputation score constants
pub const REPUTATION_TRADE_COMPLETED: u32 = 10;
pub const REPUTATION_TRADE_DISPUTED: u32 = 20;
pub const REPUTATION_TRADE_CANCELED: u32 = 5;
pub const REPUTATION_FAST_RESPONSE: u32 = 2;
pub const REPUTATION_SLOW_RESPONSE: u32 = 1;

/// Get encryption recommendation based on current state
fn get_encryption_recommendation(
    appears_encrypted: bool,
    has_encryption_key: bool,
) -> EncryptionRecommendation {
    match (appears_encrypted, has_encryption_key) {
        (true, true) => EncryptionRecommendation::AllGood,
        (true, false) => EncryptionRecommendation::AddEncryptionKey,
        (false, true) => EncryptionRecommendation::EncryptContact,
        (false, false) => EncryptionRecommendation::EncryptContact,
    }
}

/// Calculate comprehensive activity score based on multiple factors
fn calculate_activity_score(profile: &Profile, current_time: i64) -> u32 {
    let mut score = 0u32;

    // Base score from reputation
    score += profile.reputation_score / 10; // Scale down reputation contribution

    // Score from trade completion rate
    if profile.requested_trades_count > 0 {
        let completion_rate =
            (profile.released_trades_count * 100) / profile.requested_trades_count;
        score += completion_rate as u32;
    }

    // Score from recent activity
    if profile.last_trade > 0 {
        let days_since_last_trade = ((current_time - profile.last_trade) / 86400) as u32;
        match days_since_last_trade {
            0..=1 => score += 50,  // Very recent activity
            2..=7 => score += 30,  // Recent activity
            8..=30 => score += 15, // Moderate recency
            31..=90 => score += 5, // Old activity
            _ => {}                // No bonus for very old activity
        }
    }

    // Score from active engagement
    score += (profile.active_trades_count as u32) * 10;
    score += (profile.active_offers_count as u32) * 5;

    // Score from profile completeness
    score += calculate_profile_completeness(profile) as u32;

    score
}

/// Get account age category based on days since creation
fn get_account_age_category(days_since_creation: u32) -> AccountAgeCategory {
    match days_since_creation {
        0..=7 => AccountAgeCategory::New,
        8..=30 => AccountAgeCategory::Fresh,
        31..=90 => AccountAgeCategory::Established,
        91..=365 => AccountAgeCategory::Mature,
        _ => AccountAgeCategory::Veteran,
    }
}

/// Calculate profile completeness percentage
fn calculate_profile_completeness(profile: &Profile) -> u8 {
    let mut score = 0u16; // Use u16 to prevent overflow
    let total_components = 5u16;

    // Basic profile exists
    if profile.created_at > 0 {
        score += 1;
    }

    // Has contact information
    if profile.contact.is_some() {
        score += 1;
    }

    // Has encryption key
    if profile.encryption_key.is_some() {
        score += 1;
    }

    // Has trading activity
    if profile.requested_trades_count > 0 {
        score += 1;
    }

    // Has reputation
    if profile.reputation_score > 0 {
        score += 1;
    }

    ((score * 100) / total_components) as u8
}

/// Get performance tier based on metrics
fn get_performance_tier(
    completion_rate: u8,
    reputation_score: u32,
    total_trades: u64,
) -> PerformanceTier {
    // Consider multiple factors for performance tier
    let reputation_factor = match reputation_score {
        0..=99 => 0,
        100..=499 => 1,
        500..=999 => 2,
        1000..=2499 => 3,
        _ => 4,
    };

    let completion_factor = match completion_rate {
        0..=49 => 0,
        50..=69 => 1,
        70..=84 => 2,
        85..=94 => 3,
        _ => 4,
    };

    let experience_factor = match total_trades {
        0..=2 => 0,
        3..=9 => 1,
        10..=24 => 2,
        25..=49 => 3,
        _ => 4,
    };

    let combined_score = (reputation_factor + completion_factor + experience_factor) / 3;

    match combined_score {
        0 => PerformanceTier::Beginner,
        1 => PerformanceTier::Developing,
        2 => PerformanceTier::Competent,
        3 => PerformanceTier::Proficient,
        _ => PerformanceTier::Expert,
    }
}

/// Calculate reliability score based on trading history
fn calculate_reliability_score(profile: &Profile) -> u8 {
    if profile.requested_trades_count == 0 {
        return 50; // Neutral score for new users
    }

    let completion_rate = (profile.released_trades_count * 100) / profile.requested_trades_count;
    let reputation_factor = (profile.reputation_score / 100).min(50) as u64;

    // Combine completion rate with reputation factor
    let reliability = (completion_rate + reputation_factor).min(100);
    reliability as u8
}

/// Get trader type based on activity patterns
fn get_trader_type(profile: &Profile) -> TraderType {
    let current_time = Clock::get().unwrap().unix_timestamp;
    let days_active = if profile.created_at > 0 {
        ((current_time - profile.created_at) / 86400).max(1)
    } else {
        1
    };

    let trades_per_month = (profile.requested_trades_count * 30) / (days_active as u64);

    // Check for recent activity
    let days_since_last_trade = if profile.last_trade > 0 {
        ((current_time - profile.last_trade) / 86400) as u32
    } else {
        u32::MAX
    };

    if days_since_last_trade > 90 {
        return TraderType::Inactive;
    }

    match trades_per_month {
        0..=1 => TraderType::Casual,
        2..=5 => TraderType::Regular,
        6..=15 => TraderType::Active,
        _ => TraderType::Professional,
    }
}

/// Calculate activity consistency score
fn calculate_activity_consistency(profile: &Profile, current_time: i64) -> u8 {
    // This is a simplified calculation - in a real implementation,
    // you might track activity over time periods
    if profile.requested_trades_count == 0 {
        return 0;
    }

    let days_active = if profile.created_at > 0 {
        ((current_time - profile.created_at) / 86400).max(1)
    } else {
        1
    };

    let expected_activity = days_active / 30; // Expected trades per month
    let actual_activity = profile.requested_trades_count as i64;

    if expected_activity == 0 {
        return 50; // Neutral for very new accounts
    }

    let consistency_ratio = (actual_activity * 100) / expected_activity;
    consistency_ratio.min(100).max(0) as u8
}

/// Get reputation trend based on current state
fn get_reputation_trend(profile: &Profile) -> ReputationTrend {
    // This is simplified - in a real implementation, you'd track reputation over time
    if profile.requested_trades_count < 3 {
        return ReputationTrend::Unknown;
    }

    let reputation_per_trade = if profile.requested_trades_count > 0 {
        profile.reputation_score / (profile.requested_trades_count as u32)
    } else {
        0
    };

    match reputation_per_trade {
        0..=5 => ReputationTrend::Declining,
        6..=15 => ReputationTrend::Stable,
        16..=25 => ReputationTrend::Improving,
        _ => ReputationTrend::Volatile,
    }
}

/// Calculate engagement score
fn calculate_engagement_score(profile: &Profile, current_time: i64) -> u32 {
    let mut score = 0u32;

    // Active participation score
    score += (profile.active_trades_count as u32) * 20;
    score += (profile.active_offers_count as u32) * 10;

    // Historical engagement
    score += (profile.requested_trades_count as u32).min(100);
    score += (profile.released_trades_count as u32).min(100);

    // Recent activity bonus
    if profile.last_trade > 0 {
        let days_since_last_trade = ((current_time - profile.last_trade) / 86400) as u32;
        match days_since_last_trade {
            0..=7 => score += 50,
            8..=30 => score += 25,
            31..=90 => score += 10,
            _ => {}
        }
    }

    // Profile setup engagement
    if profile.contact.is_some() {
        score += 15;
    }
    if profile.encryption_key.is_some() {
        score += 10;
    }

    score
}

/// Get engagement level from score
fn get_engagement_level(engagement_score: u32) -> EngagementLevel {
    match engagement_score {
        0..=50 => EngagementLevel::Disengaged,
        51..=150 => EngagementLevel::Low,
        151..=300 => EngagementLevel::Moderate,
        301..=500 => EngagementLevel::High,
        _ => EngagementLevel::VeryHigh,
    }
}

/// Get activity pattern based on trading history
fn get_activity_pattern(profile: &Profile, _current_time: i64) -> ActivityPattern {
    // Simplified pattern detection - in reality, you'd analyze time series data
    if profile.requested_trades_count < 5 {
        return ActivityPattern::Sporadic;
    }

    let completion_rate = if profile.requested_trades_count > 0 {
        (profile.released_trades_count * 100) / profile.requested_trades_count
    } else {
        0
    };

    match completion_rate {
        0..=30 => ActivityPattern::Declining,
        31..=60 => ActivityPattern::Sporadic,
        61..=80 => ActivityPattern::Consistent,
        81..=95 => ActivityPattern::Growing,
        _ => ActivityPattern::Bursty,
    }
}

/// Get peak activity period (simplified)
fn get_peak_activity_period(_profile: &Profile) -> ActivityPeriod {
    // This would require time-series data in a real implementation
    ActivityPeriod::Unknown
}

/// Calculate growth rate
fn calculate_growth_rate(profile: &Profile, account_age_days: u32) -> i32 {
    if account_age_days == 0 || profile.requested_trades_count == 0 {
        return 0;
    }

    let trades_per_day = (profile.requested_trades_count as f64) / (account_age_days as f64);
    let monthly_rate = (trades_per_day * 30.0 * 100.0) as i32; // Convert to basis points

    monthly_rate
}

/// Get trend direction
fn get_trend_direction(profile: &Profile, current_time: i64) -> TrendDirection {
    let days_since_last_trade = if profile.last_trade > 0 {
        ((current_time - profile.last_trade) / 86400) as u32
    } else {
        u32::MAX
    };

    match days_since_last_trade {
        0..=7 => TrendDirection::Up,
        8..=30 => TrendDirection::Stable,
        31..=90 => TrendDirection::Down,
        _ => TrendDirection::Volatile,
    }
}

/// Calculate activity percentile (simplified)
fn calculate_activity_percentile(profile: &Profile) -> u8 {
    // This would require comparison with other users in a real implementation
    let activity_score = profile.requested_trades_count + (profile.reputation_score as u64 / 10);

    match activity_score {
        0..=5 => 10,
        6..=15 => 25,
        16..=35 => 50,
        36..=75 => 75,
        _ => 90,
    }
}

/// Calculate reputation velocity
fn calculate_reputation_velocity(profile: &Profile, account_age_days: u32) -> u32 {
    if account_age_days == 0 {
        return 0;
    }

    (profile.reputation_score * 30) / account_age_days.max(1)
}

/// Calculate activity streak (simplified)
fn calculate_activity_streak(_profile: &Profile, _current_time: i64) -> u32 {
    // This would require detailed activity tracking in a real implementation
    0
}

/// Calculate momentum score
fn calculate_momentum_score(profile: &Profile, current_time: i64) -> u32 {
    let mut momentum = 0u32;

    // Recent activity momentum
    if profile.last_trade > 0 {
        let days_since_last_trade = ((current_time - profile.last_trade) / 86400) as u32;
        match days_since_last_trade {
            0..=1 => momentum += 100,
            2..=7 => momentum += 75,
            8..=30 => momentum += 50,
            31..=90 => momentum += 25,
            _ => {}
        }
    }

    // Active engagement momentum
    momentum += (profile.active_trades_count as u32) * 25;
    momentum += (profile.active_offers_count as u32) * 15;

    momentum
}

/// Calculate churn risk
fn calculate_churn_risk(profile: &Profile, current_time: i64) -> ChurnRisk {
    let days_since_last_trade = if profile.last_trade > 0 {
        ((current_time - profile.last_trade) / 86400) as u32
    } else {
        u32::MAX
    };

    let completion_rate = if profile.requested_trades_count > 0 {
        (profile.released_trades_count * 100) / profile.requested_trades_count
    } else {
        0
    };

    // High churn risk factors
    if days_since_last_trade > 180 || completion_rate < 30 {
        return ChurnRisk::Critical;
    }

    if days_since_last_trade > 90 || completion_rate < 50 {
        return ChurnRisk::High;
    }

    if days_since_last_trade > 30 || completion_rate < 70 {
        return ChurnRisk::Medium;
    }

    ChurnRisk::Low
}

/// Calculate reactivation potential
fn calculate_reactivation_potential(profile: &Profile, current_time: i64) -> u8 {
    let days_since_last_trade = if profile.last_trade > 0 {
        ((current_time - profile.last_trade) / 86400) as u32
    } else {
        u32::MAX
    };

    let mut potential = 0u8;

    // Historical activity indicates potential
    if profile.released_trades_count > 5 {
        potential += 30;
    }

    // Good reputation indicates potential
    if profile.reputation_score > 500 {
        potential += 25;
    }

    // Profile completeness indicates engagement
    potential += calculate_profile_completeness(profile) / 4;

    // Reduce potential based on inactivity duration
    match days_since_last_trade {
        0..=30 => potential += 20,
        31..=90 => potential += 10,
        91..=180 => potential += 5,
        _ => {}
    }

    potential.min(100)
}

/// Check if profile is trending up
fn is_trending_up(profile: &Profile, current_time: i64) -> bool {
    let days_since_last_trade = if profile.last_trade > 0 {
        ((current_time - profile.last_trade) / 86400) as u32
    } else {
        u32::MAX
    };

    // Recent activity and good performance indicate upward trend
    days_since_last_trade <= 7 && profile.active_trades_count > 0 && profile.reputation_score > 100
}

/// Check if profile needs attention
fn needs_attention(profile: &Profile, current_time: i64) -> bool {
    let days_since_last_trade = if profile.last_trade > 0 {
        ((current_time - profile.last_trade) / 86400) as u32
    } else {
        u32::MAX
    };

    // Needs attention if inactive for too long or has issues
    days_since_last_trade > 60
        || profile.reputation_score < 50
        || (profile.requested_trades_count > 0 && profile.released_trades_count == 0)
}

/// Calculate activity health score
fn calculate_activity_health(profile: &Profile, current_time: i64) -> u8 {
    let days_since_last_trade = if profile.last_trade > 0 {
        ((current_time - profile.last_trade) / 86400) as u32
    } else {
        u32::MAX
    };

    let mut health = 0u8;

    // Recent activity health
    match days_since_last_trade {
        0..=7 => health += 40,
        8..=30 => health += 30,
        31..=90 => health += 20,
        91..=180 => health += 10,
        _ => {}
    }

    // Active engagement health
    health += (profile.active_trades_count as u8).min(20) * 2;
    health += (profile.active_offers_count as u8).min(10) * 2;

    // Historical activity health
    if profile.requested_trades_count > 0 {
        health += 20;
    }

    health.min(100)
}

/// Calculate reputation health score
fn calculate_reputation_health(profile: &Profile) -> u8 {
    let reputation_tier_score = match profile.get_reputation_tier() {
        ReputationTier::Newcomer => 20,
        ReputationTier::Bronze => 40,
        ReputationTier::Silver => 60,
        ReputationTier::Gold => 80,
        ReputationTier::Platinum => 90,
        ReputationTier::Diamond => 100,
    };

    let completion_rate = if profile.requested_trades_count > 0 {
        ((profile.released_trades_count * 100) / profile.requested_trades_count) as u8
    } else {
        50 // Neutral for new users
    };

    // Weighted average of reputation tier and completion rate
    (reputation_tier_score * 60 + completion_rate * 40) / 100
}

/// Calculate security score
fn calculate_security_score(profile: &Profile) -> u8 {
    let mut score = 0u8;

    // Contact information setup
    if profile.contact.is_some() {
        score += 30;

        // Bonus for encrypted contact
        if let Some(ref contact) = profile.contact {
            if appears_encrypted(contact) {
                score += 20;
            }
        }
    }

    // Encryption key setup
    if profile.encryption_key.is_some() {
        score += 30;
    }

    // Account age contributes to security (established accounts are more secure)
    let current_time = Clock::get().unwrap().unix_timestamp;
    let days_since_creation = if profile.created_at > 0 {
        ((current_time - profile.created_at) / 86400) as u32
    } else {
        0
    };

    match days_since_creation {
        0..=7 => score += 5,
        8..=30 => score += 10,
        31..=90 => score += 15,
        _ => score += 20,
    }

    score.min(100)
}

/// Calculate engagement health score
fn calculate_engagement_health(profile: &Profile, current_time: i64) -> u8 {
    let engagement_score = calculate_engagement_score(profile, current_time);

    // Convert engagement score to health percentage
    match engagement_score {
        0..=50 => 20,
        51..=150 => 40,
        151..=300 => 60,
        301..=500 => 80,
        _ => 100,
    }
}

/// Generate health recommendations based on component scores
fn generate_health_recommendations(
    profile: &Profile,
    completeness_score: u8,
    activity_health: u8,
    reputation_health: u8,
    security_score: u8,
    engagement_health: u8,
) -> Vec<HealthRecommendation> {
    let mut recommendations = Vec::new();

    if completeness_score < 80 {
        recommendations.push(HealthRecommendation::CompleteProfile);
    }

    if security_score < 70 {
        if profile.contact.is_none() {
            recommendations.push(HealthRecommendation::AddContactInfo);
        }
        recommendations.push(HealthRecommendation::UpdateSecurity);
    }

    if activity_health < 60 {
        recommendations.push(HealthRecommendation::IncreaseActivity);
    }

    if reputation_health < 70 {
        recommendations.push(HealthRecommendation::ImproveReliability);
    }

    if engagement_health < 60 {
        recommendations.push(HealthRecommendation::EngageMore);
    }

    // Add consistency recommendation if needed
    if profile.requested_trades_count > 0 {
        let completion_rate =
            (profile.released_trades_count * 100) / profile.requested_trades_count;
        if completion_rate < 80 {
            recommendations.push(HealthRecommendation::MaintainConsistency);
        }
    }

    recommendations
}

/// Get priority actions based on profile state
fn get_priority_actions(profile: &Profile, overall_health: u8) -> Vec<PriorityAction> {
    let mut actions = Vec::new();

    // Critical actions for low health scores
    if overall_health < 40 {
        if profile.contact.is_none() {
            actions.push(PriorityAction::UpdateContactInfo);
        }
        if profile.encryption_key.is_none() {
            actions.push(PriorityAction::SetupEncryption);
        }
        if profile.requested_trades_count == 0 {
            actions.push(PriorityAction::CompleteFirstTrade);
        }
    }

    // Improvement actions for medium health scores
    if overall_health < 75 {
        if profile.requested_trades_count < 5 {
            actions.push(PriorityAction::IncreaseTradeVolume);
        }
        if profile.reputation_score < 100 {
            actions.push(PriorityAction::BuildReputation);
        }
    }

    // Maintenance actions for good health scores
    if overall_health >= 75 {
        actions.push(PriorityAction::MaintainActivity);
        if profile.requested_trades_count > 0 {
            let completion_rate =
                (profile.released_trades_count * 100) / profile.requested_trades_count;
            if completion_rate < 90 {
                actions.push(PriorityAction::ImproveResponseTime);
            }
        }
    }

    actions
}

/// Get account risk level based on health score
fn get_account_risk_level(profile: &Profile, overall_health: u8) -> RiskLevel {
    let current_time = Clock::get().unwrap().unix_timestamp;
    let days_since_last_trade = if profile.last_trade > 0 {
        ((current_time - profile.last_trade) / 86400) as u32
    } else {
        u32::MAX
    };

    // High risk factors
    if overall_health < 30 || days_since_last_trade > 180 {
        return RiskLevel::VeryHigh;
    }

    if overall_health < 50 || days_since_last_trade > 90 {
        return RiskLevel::High;
    }

    if overall_health < 70 || days_since_last_trade > 30 {
        return RiskLevel::Medium;
    }

    if overall_health < 85 {
        return RiskLevel::Low;
    }

    RiskLevel::VeryLow
}

/// Calculate improvement potential
fn calculate_improvement_potential(profile: &Profile) -> u8 {
    let mut potential = 0u8;

    // New accounts have high improvement potential
    let current_time = Clock::get().unwrap().unix_timestamp;
    let days_since_creation = if profile.created_at > 0 {
        ((current_time - profile.created_at) / 86400) as u32
    } else {
        0
    };

    if days_since_creation < 30 {
        potential += 30;
    }

    // Incomplete profiles have improvement potential
    let completeness = calculate_profile_completeness(profile);
    potential += (100 - completeness) / 2;

    // Low activity accounts have potential
    if profile.requested_trades_count < 10 {
        potential += 25;
    }

    // Accounts with room for reputation growth
    if profile.reputation_score < 1000 {
        potential += 20;
    }

    potential.min(100)
}

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

/// Comprehensive profile statistics
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProfileStatistics {
    // Basic counts
    pub total_trades_requested: u64,
    pub total_trades_completed: u64,
    pub active_trades: u8,
    pub active_offers: u8,

    // Rates and percentages
    pub completion_rate: u8,
    pub success_rate: u8,
    pub trading_velocity: u64, // trades per month

    // Time-based metrics
    pub days_since_creation: u32,
    pub days_since_last_trade: u32,
    pub account_age_category: AccountAgeCategory,

    // Reputation and activity
    pub reputation_score: u32,
    pub reputation_tier: ReputationTier,
    pub activity_level: ActivityLevel,
    pub activity_score: u32,

    // Status indicators
    pub is_active_trader: bool,
    pub is_active_maker: bool,
    pub has_recent_activity: bool,

    // Security and setup
    pub has_contact_info: bool,
    pub has_encryption_setup: bool,
    pub profile_completeness: u8, // percentage
}

/// Trading performance analytics
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TradingPerformance {
    // Core metrics
    pub total_trades: u64,
    pub completed_trades: u64,
    pub active_trades: u8,

    // Performance rates
    pub completion_rate: u8,
    pub cancellation_rate: u8,
    pub reliability_score: u8,

    // Frequency metrics (stored as basis points for precision)
    pub trades_per_day: u32,
    pub trades_per_week: u32,
    pub trades_per_month: u32,

    // Classification
    pub performance_tier: PerformanceTier,
    pub trader_type: TraderType,

    // Time-based analysis
    pub days_active: u32,
    pub last_activity: i64,
    pub activity_consistency: u8,

    // Reputation impact
    pub reputation_trend: ReputationTrend,
    pub reputation_per_trade: u32,
}

/// Activity analytics with detailed insights
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ActivityAnalytics {
    // Time metrics
    pub account_age_days: u32,
    pub days_since_last_activity: u32,
    pub activity_streak: u32,

    // Engagement metrics
    pub engagement_score: u32,
    pub engagement_level: EngagementLevel,
    pub activity_consistency: u8,
    pub momentum_score: u32,

    // Pattern analysis
    pub activity_pattern: ActivityPattern,
    pub peak_activity_period: ActivityPeriod,

    // Growth and trends
    pub growth_rate: i32, // can be negative
    pub trend_direction: TrendDirection,

    // Comparative metrics
    pub activity_percentile: u8,
    pub reputation_velocity: u32,

    // Predictive indicators
    pub churn_risk: ChurnRisk,
    pub reactivation_potential: u8,

    // Current status
    pub current_activity_level: ActivityLevel,
    pub is_trending_up: bool,
    pub needs_attention: bool,
}

/// Profile health assessment
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProfileHealth {
    pub overall_score: u8,
    pub health_status: ProfileHealthStatus,

    // Component scores
    pub completeness_score: u8,
    pub activity_health: u8,
    pub reputation_health: u8,
    pub security_score: u8,
    pub engagement_health: u8,

    // Specific indicators
    pub has_critical_issues: bool,
    pub needs_improvement: bool,
    pub is_well_maintained: bool,

    // Recommendations
    pub recommendations: Vec<HealthRecommendation>,
    pub priority_actions: Vec<PriorityAction>,

    // Risk assessment
    pub account_risk_level: RiskLevel,
    pub improvement_potential: u8,
}

/// Account age categories
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum AccountAgeCategory {
    New,         // 0-7 days
    Fresh,       // 8-30 days
    Established, // 31-90 days
    Mature,      // 91-365 days
    Veteran,     // 365+ days
}

/// Performance tiers based on completion rate and reputation
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum PerformanceTier {
    Beginner,   // New or low performance
    Developing, // Improving performance
    Competent,  // Good performance
    Proficient, // Very good performance
    Expert,     // Excellent performance
}

/// Trader type classification
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum TraderType {
    Casual,       // Low frequency, occasional trades
    Regular,      // Moderate frequency, consistent activity
    Active,       // High frequency, very active
    Professional, // Very high frequency, professional level
    Inactive,     // No recent activity
}

/// Engagement level classification
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum EngagementLevel {
    Disengaged, // Very low engagement
    Low,        // Low engagement
    Moderate,   // Moderate engagement
    High,       // High engagement
    VeryHigh,   // Very high engagement
}

/// Activity pattern classification
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ActivityPattern {
    Sporadic,   // Irregular activity
    Consistent, // Regular, steady activity
    Bursty,     // Periods of high activity followed by low activity
    Declining,  // Decreasing activity over time
    Growing,    // Increasing activity over time
}

/// Activity period classification
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ActivityPeriod {
    Morning,   // Peak activity in morning hours
    Afternoon, // Peak activity in afternoon
    Evening,   // Peak activity in evening
    Night,     // Peak activity at night
    Weekdays,  // Peak activity on weekdays
    Weekends,  // Peak activity on weekends
    Unknown,   // Cannot determine pattern
}

/// Reputation trend direction
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ReputationTrend {
    Improving, // Reputation increasing
    Stable,    // Reputation stable
    Declining, // Reputation decreasing
    Volatile,  // Reputation fluctuating
    Unknown,   // Insufficient data
}

/// Trend direction
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum TrendDirection {
    Up,       // Trending upward
    Down,     // Trending downward
    Stable,   // No clear trend
    Volatile, // Highly variable
}

/// Churn risk assessment
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ChurnRisk {
    Low,      // Low risk of churning
    Medium,   // Medium risk of churning
    High,     // High risk of churning
    Critical, // Very high risk of churning
}

/// Profile health status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum ProfileHealthStatus {
    Excellent, // 90-100%
    Good,      // 75-89%
    Fair,      // 60-74%
    Poor,      // 40-59%
    Critical,  // 0-39%
}

/// Health recommendations
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum HealthRecommendation {
    CompleteProfile,
    AddContactInfo,
    IncreaseActivity,
    ImproveReliability,
    UpdateSecurity,
    EngageMore,
    ReduceDisputes,
    MaintainConsistency,
}

/// Priority actions for profile improvement
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum PriorityAction {
    SetupEncryption,
    CompleteFirstTrade,
    UpdateContactInfo,
    IncreaseTradeVolume,
    ImproveResponseTime,
    ReduceCancellations,
    BuildReputation,
    MaintainActivity,
}

/// Risk level assessment
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum RiskLevel {
    VeryLow,  // Minimal risk
    Low,      // Low risk
    Medium,   // Medium risk
    High,     // High risk
    VeryHigh, // Very high risk
}
