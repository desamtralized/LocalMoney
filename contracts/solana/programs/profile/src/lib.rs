use anchor_lang::prelude::*;

declare_id!("3rXtVS7K3Lv1RGLiDiWuKKCd2uvrsD1VxQ9agDTpofg4");

#[program]
pub mod profile {
    use super::*;

    pub fn create_profile(ctx: Context<CreateProfile>, username: String) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        let clock = Clock::get()?;
        
        profile.owner = ctx.accounts.user.key();
        profile.username = username;
        profile.created_at = clock.unix_timestamp as u64;
        profile.requested_trades_count = 0;
        profile.active_trades_count = 0;
        profile.released_trades_count = 0;
        profile.last_trade = 0;
        profile.contact = None;
        profile.encryption_key = None;
        profile.active_offers_count = 0;
        profile.bump = ctx.bumps.profile;

        Ok(())
    }

    pub fn update_contact(
        ctx: Context<UpdateContact>, 
        contact: String, 
        encryption_key: String
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.contact = Some(contact);
        profile.encryption_key = Some(encryption_key);
        Ok(())
    }

    pub fn update_active_offers(
        ctx: Context<UpdateActiveOffers>, 
        offer_state: OfferState
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        
        match offer_state {
            OfferState::Active => profile.active_offers_count += 1,
            OfferState::Paused | OfferState::Archive => {
                if profile.active_offers_count > 0 {
                    profile.active_offers_count -= 1;
                }
            }
        }

        Ok(())
    }

    pub fn update_trade_stats(
        ctx: Context<UpdateTradeStats>, 
        trade_state: TradeState
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        let clock = Clock::get()?;

        match trade_state {
            TradeState::RequestCreated => {
                profile.requested_trades_count += 1;
                profile.active_trades_count += 1;
            },
            TradeState::EscrowReleased => {
                if profile.active_trades_count > 0 {
                    profile.active_trades_count -= 1;
                }
                profile.released_trades_count += 1;
                profile.last_trade = clock.unix_timestamp as u64;
            },
            TradeState::RequestCanceled | 
            TradeState::EscrowCanceled | 
            TradeState::EscrowRefunded |
            TradeState::SettledForMaker |
            TradeState::SettledForTaker => {
                if profile.active_trades_count > 0 {
                    profile.active_trades_count -= 1;
                }
            },
            _ => {} // No change for other states
        }

        Ok(())
    }
}

// ==================== QUERY ACCOUNT CONTEXTS ====================

#[derive(Accounts)]
pub struct GetProfiles<'info> {
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(owner: Pubkey)]
pub struct GetProfile<'info> {
    #[account(
        seeds = [b"profile".as_ref(), owner.as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
}

#[derive(Accounts)]
pub struct GetProfileStats<'info> {
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetProfileLeaderboard<'info> {
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SearchProfiles<'info> {
    pub system_program: Program<'info, System>,
}

// ==================== QUERY PARAMETERS ====================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GetProfilesParams {
    pub filter: ProfileFilter,
    pub pagination: PaginationParams,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GetProfileStatsParams {
    pub filter: ProfileFilter,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GetProfileLeaderboardParams {
    pub ranking_criteria: RankingCriteria,
    pub pagination: PaginationParams,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SearchProfilesParams {
    pub username_query: Option<String>,
    pub filter: ProfileFilter,
    pub pagination: PaginationParams,
    pub sort_by: Option<ProfileSortBy>,
}

// ==================== FILTER AND PARAMETER TYPES ====================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct ProfileFilter {
    pub owner: Option<Pubkey>,
    pub min_trades: Option<u64>,
    pub max_trades: Option<u64>,
    pub min_active_offers: Option<u8>,
    pub max_active_offers: Option<u8>,
    pub has_contact: Option<bool>,
    pub created_after: Option<u64>,
    pub created_before: Option<u64>,
    pub last_trade_after: Option<u64>,
    pub last_trade_before: Option<u64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum RankingCriteria {
    TotalTrades,
    RecentActivity,
    CompletionRate,
    ReputationScore,
    ActiveOffers,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum ProfileSortBy {
    CreatedAt,
    Username,
    TotalTrades,
    LastTrade,
    ActiveOffers,
    ReputationScore,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum ActivityLevel {
    Inactive,
    Low,
    Medium,
    High,
    VeryHigh,
}

// ==================== RESPONSE TYPES ====================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProfilesResponse {
    pub profiles: Vec<Profile>,
    pub pagination: PaginationResponse,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProfileResponse {
    pub profile: Profile,
    pub metadata: ProfileMetadata,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProfileMetadata {
    pub age_seconds: u64,
    pub reputation_score: u64,
    pub activity_level: ActivityLevel,
    pub completion_rate: u64, // Basis points (10000 = 100%)
    pub last_active: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProfileStatsResponse {
    pub total_profiles: u64,
    pub active_profiles: u64, // Profiles with recent activity
    pub total_trades: u64,
    pub total_offers: u64,
    pub average_trades_per_profile: u64,
    pub top_traders: Vec<ProfileSummary>,
    pub activity_distribution: Vec<ActivityBucket>,
    pub registration_timeline: Vec<RegistrationPeriod>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProfileSummary {
    pub owner: Pubkey,
    pub username: String,
    pub total_trades: u64,
    pub active_offers: u8,
    pub reputation_score: u64,
    pub last_trade: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ActivityBucket {
    pub activity_level: ActivityLevel,
    pub count: u64,
    pub percentage: u64, // Basis points
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RegistrationPeriod {
    pub period_start: u64,
    pub period_end: u64,
    pub registrations: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProfileLeaderboardResponse {
    pub profiles: Vec<RankedProfile>,
    pub pagination: PaginationResponse,
    pub ranking_metadata: RankingMetadata,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RankedProfile {
    pub rank: u64,
    pub profile: Profile,
    pub score: u64,
    pub metadata: ProfileMetadata,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RankingMetadata {
    pub criteria: RankingCriteria,
    pub total_ranked: u64,
    pub last_updated: u64,
}

// Common pagination types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PaginationParams {
    pub limit: u32,
    pub cursor: Option<String>,
    pub direction: PaginationDirection,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum PaginationDirection {
    Forward,
    Backward,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PaginationResponse {
    pub next_cursor: Option<String>,
    pub has_more: bool,
    pub total_estimate: Option<u64>,
}

// ==================== HELPER FUNCTIONS ====================

fn validate_pagination_params(params: &PaginationParams) -> Result<()> {
    const MAX_LIMIT: u32 = 100;
    const MIN_LIMIT: u32 = 1;
    
    require!(
        params.limit >= MIN_LIMIT && params.limit <= MAX_LIMIT,
        ErrorCode::InvalidPaginationLimit
    );
    
    Ok(())
}

fn validate_search_profile_params(params: &SearchProfilesParams) -> Result<()> {
    // Validate username query length
    if let Some(query) = &params.username_query {
        require!(
            !query.trim().is_empty() && query.len() <= 50,
            ErrorCode::InvalidSearchQuery
        );
    }
    
    // Validate date ranges
    if let (Some(after), Some(before)) = (params.filter.created_after, params.filter.created_before) {
        require!(after <= before, ErrorCode::InvalidDateRange);
    }
    
    if let (Some(after), Some(before)) = (params.filter.last_trade_after, params.filter.last_trade_before) {
        require!(after <= before, ErrorCode::InvalidDateRange);
    }
    
    Ok(())
}

fn build_profile_filters(filter: &ProfileFilter) -> Result<Vec<RpcFilterType>> {
    let mut filters = Vec::new();
    
    // Add discriminator filter for Profile accounts
    filters.push(RpcFilterType::Memcmp(Memcmp::new(
        0, // offset 0 for discriminator
        MemcmpEncodedBytes::Base64(
            "ProfileDiscriminator".to_string() // Placeholder - replace with actual discriminator
        ),
    )));
    
    // Filter by owner if specified
    if let Some(owner) = filter.owner {
        filters.push(RpcFilterType::Memcmp(Memcmp::new(
            8, // offset: discriminator
            MemcmpEncodedBytes::Base58(owner.to_string()),
        )));
    }
    
    Ok(filters)
}

fn build_profile_search_filters(params: &SearchProfilesParams) -> Result<Vec<RpcFilterType>> {
    build_profile_filters(&params.filter)
}

fn deserialize_profile_accounts(accounts: Vec<(Pubkey, AccountInfo)>) -> Result<Vec<Profile>> {
    let mut profiles = Vec::new();
    
    for (_, account_info) in accounts {
        // Skip discriminator (8 bytes) and deserialize
        let data = &account_info.data.borrow()[8..];
        let profile: Profile = AnchorDeserialize::deserialize(&mut &data[..])?;
        profiles.push(profile);
    }
    
    Ok(profiles)
}

fn estimate_total_profiles(_system_program: AccountInfo, _program_id: &Pubkey) -> Result<u64> {
    // Placeholder implementation
    Ok(0)
}

fn get_next_cursor_profile(profiles: &[Profile]) -> Option<String> {
    if profiles.is_empty() {
        return None;
    }
    
    let last_profile = profiles.last().unwrap();
    Some(format!("{}_{}", last_profile.owner, last_profile.created_at))
}

fn calculate_reputation_score(profile: &Profile) -> Result<u64> {
    // Simple reputation calculation based on trade completion and activity
    let base_score = 1000u64; // Base reputation
    let trade_bonus = profile.released_trades_count * 10; // 10 points per completed trade
    let activity_bonus = if profile.last_trade > 0 { 100 } else { 0 }; // Activity bonus
    let offer_bonus = profile.active_offers_count as u64 * 5; // 5 points per active offer
    
    Ok(base_score + trade_bonus + activity_bonus + offer_bonus)
}

fn calculate_activity_level(profile: &Profile) -> Result<ActivityLevel> {
    let current_time = Clock::get()?.unix_timestamp as u64;
    let thirty_days = 30 * 24 * 60 * 60; // 30 days in seconds
    
    let recent_activity = current_time.saturating_sub(profile.last_trade) < thirty_days;
    let total_trades = profile.requested_trades_count;
    let active_offers = profile.active_offers_count;
    
    let activity_level = match (recent_activity, total_trades, active_offers) {
        (false, 0..=5, 0) => ActivityLevel::Inactive,
        (_, 0..=10, 0..=2) => ActivityLevel::Low,
        (_, 11..=50, 0..=5) => ActivityLevel::Medium,
        (true, 51..=200, 1..=10) => ActivityLevel::High,
        (true, 201.., 5..) => ActivityLevel::VeryHigh,
        _ => ActivityLevel::Low,
    };
    
    Ok(activity_level)
}

fn calculate_completion_rate(profile: &Profile) -> Result<u64> {
    if profile.requested_trades_count == 0 {
        return Ok(10000); // 100% for new profiles
    }
    
    // Calculate completion rate as basis points
    let completion_rate = (profile.released_trades_count * 10000) / profile.requested_trades_count;
    Ok(completion_rate)
}

fn calculate_profile_statistics(profiles: &[Profile]) -> Result<ProfileStatsResponse> {
    let total_profiles = profiles.len() as u64;
    let mut total_trades = 0u64;
    let mut total_offers = 0u64;
    let mut active_profiles = 0u64;
    let mut activity_counts = [0u64; 5]; // For 5 activity levels
    
    let current_time = Clock::get()?.unix_timestamp as u64;
    let thirty_days = 30 * 24 * 60 * 60;
    
    for profile in profiles {
        total_trades += profile.requested_trades_count;
        total_offers += profile.active_offers_count as u64;
        
        // Check if profile is active (traded within 30 days)
        if current_time.saturating_sub(profile.last_trade) < thirty_days {
            active_profiles += 1;
        }
        
        // Count activity levels
        let activity_level = calculate_activity_level(profile)?;
        match activity_level {
            ActivityLevel::Inactive => activity_counts[0] += 1,
            ActivityLevel::Low => activity_counts[1] += 1,
            ActivityLevel::Medium => activity_counts[2] += 1,
            ActivityLevel::High => activity_counts[3] += 1,
            ActivityLevel::VeryHigh => activity_counts[4] += 1,
        }
    }
    
    let average_trades_per_profile = if total_profiles > 0 {
        total_trades / total_profiles
    } else {
        0
    };
    
    // Get top traders (simplified - take first 10 sorted by trades)
    let mut sorted_profiles = profiles.to_vec();
    sorted_profiles.sort_by(|a, b| b.requested_trades_count.cmp(&a.requested_trades_count));
    let top_traders: Vec<ProfileSummary> = sorted_profiles
        .iter()
        .take(10)
        .map(|p| ProfileSummary {
            owner: p.owner,
            username: p.username.clone(),
            total_trades: p.requested_trades_count,
            active_offers: p.active_offers_count,
            reputation_score: calculate_reputation_score(p).unwrap_or(0),
            last_trade: p.last_trade,
        })
        .collect();
    
    // Build activity distribution
    let activity_distribution = vec![
        ActivityBucket {
            activity_level: ActivityLevel::Inactive,
            count: activity_counts[0],
            percentage: if total_profiles > 0 { (activity_counts[0] * 10000) / total_profiles } else { 0 },
        },
        ActivityBucket {
            activity_level: ActivityLevel::Low,
            count: activity_counts[1],
            percentage: if total_profiles > 0 { (activity_counts[1] * 10000) / total_profiles } else { 0 },
        },
        ActivityBucket {
            activity_level: ActivityLevel::Medium,
            count: activity_counts[2],
            percentage: if total_profiles > 0 { (activity_counts[2] * 10000) / total_profiles } else { 0 },
        },
        ActivityBucket {
            activity_level: ActivityLevel::High,
            count: activity_counts[3],
            percentage: if total_profiles > 0 { (activity_counts[3] * 10000) / total_profiles } else { 0 },
        },
        ActivityBucket {
            activity_level: ActivityLevel::VeryHigh,
            count: activity_counts[4],
            percentage: if total_profiles > 0 { (activity_counts[4] * 10000) / total_profiles } else { 0 },
        },
    ];
    
    Ok(ProfileStatsResponse {
        total_profiles,
        active_profiles,
        total_trades,
        total_offers,
        average_trades_per_profile,
        top_traders,
        activity_distribution,
        registration_timeline: vec![], // Placeholder - would need time-based analysis
    })
}

fn rank_profiles_by_criteria(profiles: &[Profile], criteria: &RankingCriteria) -> Result<Vec<RankedProfile>> {
    let mut profiles_with_scores: Vec<(Profile, u64)> = profiles
        .iter()
        .map(|profile| {
            let score = match criteria {
                RankingCriteria::TotalTrades => profile.requested_trades_count,
                RankingCriteria::RecentActivity => {
                    let current_time = Clock::get().unwrap().unix_timestamp as u64;
                    if profile.last_trade > 0 {
                        current_time.saturating_sub(profile.last_trade)
                    } else {
                        u64::MAX // Inactive profiles get lowest score
                    }
                },
                RankingCriteria::CompletionRate => calculate_completion_rate(profile).unwrap_or(0),
                RankingCriteria::ReputationScore => calculate_reputation_score(profile).unwrap_or(0),
                RankingCriteria::ActiveOffers => profile.active_offers_count as u64,
            };
            (profile.clone(), score)
        })
        .collect();
    
    // Sort by score (descending for most criteria, ascending for recent activity)
    match criteria {
        RankingCriteria::RecentActivity => {
            profiles_with_scores.sort_by(|a, b| a.1.cmp(&b.1)); // Ascending - lower time since last trade is better
        },
        _ => {
            profiles_with_scores.sort_by(|a, b| b.1.cmp(&a.1)); // Descending - higher is better
        }
    }
    
    let ranked_profiles: Vec<RankedProfile> = profiles_with_scores
        .into_iter()
        .enumerate()
        .map(|(index, (profile, score))| RankedProfile {
            rank: (index + 1) as u64,
            metadata: ProfileMetadata {
                age_seconds: Clock::get().unwrap().unix_timestamp as u64 - profile.created_at,
                reputation_score: calculate_reputation_score(&profile).unwrap_or(0),
                activity_level: calculate_activity_level(&profile).unwrap_or(ActivityLevel::Inactive),
                completion_rate: calculate_completion_rate(&profile).unwrap_or(0),
                last_active: profile.last_trade,
            },
            profile,
            score,
        })
        .collect();
    
    Ok(ranked_profiles)
}

fn apply_advanced_profile_filters(profiles: Vec<Profile>, params: &SearchProfilesParams) -> Result<Vec<Profile>> {
    let mut filtered = profiles;
    
    // Apply username search
    if let Some(query) = &params.username_query {
        let query_lower = query.to_lowercase();
        filtered.retain(|profile| profile.username.to_lowercase().contains(&query_lower));
    }
    
    // Apply trade count filters
    if let Some(min_trades) = params.filter.min_trades {
        filtered.retain(|profile| profile.requested_trades_count >= min_trades);
    }
    if let Some(max_trades) = params.filter.max_trades {
        filtered.retain(|profile| profile.requested_trades_count <= max_trades);
    }
    
    // Apply contact filter
    if let Some(has_contact) = params.filter.has_contact {
        if has_contact {
            filtered.retain(|profile| profile.contact.is_some());
        } else {
            filtered.retain(|profile| profile.contact.is_none());
        }
    }
    
    // Apply date range filters
    if let Some(created_after) = params.filter.created_after {
        filtered.retain(|profile| profile.created_at >= created_after);
    }
    if let Some(created_before) = params.filter.created_before {
        filtered.retain(|profile| profile.created_at <= created_before);
    }
    
    // Apply sorting
    if let Some(sort_by) = &params.sort_by {
        match sort_by {
            ProfileSortBy::CreatedAt => {
                filtered.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            }
            ProfileSortBy::Username => {
                filtered.sort_by(|a, b| a.username.cmp(&b.username));
            }
            ProfileSortBy::TotalTrades => {
                filtered.sort_by(|a, b| b.requested_trades_count.cmp(&a.requested_trades_count));
            }
            ProfileSortBy::LastTrade => {
                filtered.sort_by(|a, b| b.last_trade.cmp(&a.last_trade));
            }
            ProfileSortBy::ActiveOffers => {
                filtered.sort_by(|a, b| b.active_offers_count.cmp(&a.active_offers_count));
            }
            ProfileSortBy::ReputationScore => {
                filtered.sort_by(|a, b| {
                    let score_a = calculate_reputation_score(a).unwrap_or(0);
                    let score_b = calculate_reputation_score(b).unwrap_or(0);
                    score_b.cmp(&score_a)
                });
            }
        }
    }
    
    Ok(filtered)
}

// RPC filter types (shared across programs)
#[derive(Clone, Debug)]
pub enum RpcFilterType {
    Memcmp(Memcmp),
    DataSize(u64),
}

#[derive(Clone, Debug)]
pub struct Memcmp {
    pub offset: usize,
    pub bytes: MemcmpEncodedBytes,
}

impl Memcmp {
    pub fn new(offset: usize, bytes: MemcmpEncodedBytes) -> Self {
        Self { offset, bytes }
    }
}

#[derive(Clone, Debug)]
pub enum MemcmpEncodedBytes {
    Base58(String),
    Base64(String),
}

fn load_program_accounts_filtered<'a>(
    _system_program: AccountInfo<'a>,
    program_id: &Pubkey,
    _filters: &[RpcFilterType],
    _pagination: &PaginationParams,
) -> Result<Vec<(Pubkey, AccountInfo<'a>)>> {
    // Placeholder implementation
    Ok(Vec::new())
}

#[derive(Accounts)]
#[instruction(username: String)]
pub struct CreateProfile<'info> {
    #[account(
        init,
        payer = user,
        space = Profile::SPACE,
        seeds = [b"profile".as_ref(), user.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, Profile>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateContact<'info> {
    #[account(
        mut,
        seeds = [b"profile".as_ref(), user.key().as_ref()],
        bump = profile.bump,
        constraint = profile.owner == user.key() @ ErrorCode::Unauthorized
    )]
    pub profile: Account<'info, Profile>,
    
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateActiveOffers<'info> {
    #[account(
        mut,
        seeds = [b"profile".as_ref(), profile.owner.as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
}

#[derive(Accounts)]
pub struct UpdateTradeStats<'info> {
    #[account(
        mut,
        seeds = [b"profile".as_ref(), profile.owner.as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,
}

#[account]
#[derive(Debug)]
pub struct Profile {
    pub owner: Pubkey,
    pub username: String,
    pub created_at: u64,
    pub requested_trades_count: u64,
    pub active_trades_count: u8,
    pub released_trades_count: u64,
    pub last_trade: u64,
    pub contact: Option<String>,
    pub encryption_key: Option<String>,
    pub active_offers_count: u8,
    pub bump: u8,
}

impl Profile {
    pub const SPACE: usize = 8 + // discriminator
        32 + // owner
        4 + 50 + // username (String with max 50 chars)
        8 + // created_at
        8 + // requested_trades_count
        1 + // active_trades_count
        8 + // released_trades_count
        8 + // last_trade
        1 + 4 + 200 + // contact (Option<String> with max 200 chars)
        1 + 4 + 100 + // encryption_key (Option<String> with max 100 chars)
        1 + // active_offers_count
        1; // bump
}

// Common types used across programs
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum TradeState {
    RequestCreated,
    RequestCanceled,
    RequestExpired,
    RequestAccepted,
    EscrowFunded,
    EscrowCanceled,
    EscrowRefunded,
    FiatDeposited,
    EscrowReleased,
    EscrowDisputed,
    DisputeOpened,
    DisputeResolved,
    Released,
    SettledForMaker,
    SettledForTaker,
    Refunded,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum OfferState {
    Active,
    Paused,
    Archive,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum OfferType {
    Buy,
    Sell,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Hash, Debug)]
pub enum FiatCurrency {
    Usd,
    Eur, 
    Gbp,
    Cad,
    Aud,
    Jpy,
    Brl,
    Mxn,
    Ars,
    Clp,
    Cop,
    Ngn,
    Thb,
    Ves,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid pagination limit - must be between 1 and 100")]
    InvalidPaginationLimit,
    #[msg("Invalid search query - must be non-empty and max 50 characters")]
    InvalidSearchQuery,
    #[msg("Invalid date range - start date must be before or equal to end date")]
    InvalidDateRange,
}