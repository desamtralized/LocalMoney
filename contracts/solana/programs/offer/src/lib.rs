use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

declare_id!("8GTfe2A7pKM4xbXbNrGxpk3CM1h5eNegJFg2Yc4tBuES");

#[program]
pub mod offer {
    use super::*;

    pub fn create_offer(
        ctx: Context<CreateOffer>, 
        params: CreateOfferParams
    ) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        let clock = Clock::get()?;
        
        offer.id = params.offer_id;
        offer.owner = ctx.accounts.owner.key();
        offer.offer_type = params.offer_type;
        offer.fiat_currency = params.fiat_currency;
        offer.rate = params.rate;
        offer.min_amount = params.min_amount;
        offer.max_amount = params.max_amount;
        offer.description = params.description;
        offer.token_mint = ctx.accounts.token_mint.key();
        offer.state = OfferState::Active;
        offer.created_at = clock.unix_timestamp as u64;
        offer.bump = ctx.bumps.offer;

        // CPI to profile program to update active offers count
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        let cpi_accounts = profile::cpi::accounts::UpdateActiveOffers {
            profile: ctx.accounts.user_profile.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        profile::cpi::update_active_offers(cpi_ctx, OfferState::Active)?;

        Ok(())
    }

    pub fn update_offer(
        ctx: Context<UpdateOffer>, 
        params: UpdateOfferParams
    ) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        let old_state = offer.state.clone();
        let new_state = params.state.clone();
        
        offer.rate = params.rate;
        offer.min_amount = params.min_amount;
        offer.max_amount = params.max_amount;
        offer.state = params.state;
        offer.description = params.description;

        // Update profile active offers if state changed
        if old_state != new_state {
            let cpi_program = ctx.accounts.profile_program.to_account_info();
            let cpi_accounts = profile::cpi::accounts::UpdateActiveOffers {
                profile: ctx.accounts.user_profile.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            profile::cpi::update_active_offers(cpi_ctx, new_state)?;
        }

        Ok(())
    }

    pub fn close_offer(ctx: Context<CloseOffer>) -> Result<()> {
        
        // Update profile active offers count
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        let cpi_accounts = profile::cpi::accounts::UpdateActiveOffers {
            profile: ctx.accounts.user_profile.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        profile::cpi::update_active_offers(cpi_ctx, OfferState::Archive)?;

        Ok(())
    }

    // ==================== QUERY INSTRUCTIONS ====================
    
    /// Get paginated offers with comprehensive filtering
    pub fn get_offers(
        ctx: Context<GetOffers>,
        params: GetOffersParams,
    ) -> Result<OffersResponse> {
        validate_pagination_params(&params.pagination)?;
        
        let program_id = ctx.program_id;
        let filters = build_offer_filters(&params.filter)?;
        
        let accounts = load_program_accounts_filtered(
            ctx.accounts.system_program.to_account_info(),
            program_id,
            &filters,
            &params.pagination,
        )?;
        
        let offers = deserialize_offer_accounts(accounts)?;
        let total_count = estimate_total_offers(ctx.accounts.system_program.to_account_info(), program_id)?;
        
        let next_cursor = get_next_cursor(&offers);
        let has_more = offers.len() >= params.pagination.limit as usize;
        
        Ok(OffersResponse {
            offers,
            pagination: PaginationResponse {
                next_cursor,
                has_more,
                total_estimate: Some(total_count),
            },
        })
    }
    
    /// Get offers by specific owner with pagination
    pub fn get_offers_by_owner(
        ctx: Context<GetOffersByOwner>,
        params: GetOffersByOwnerParams,
    ) -> Result<OffersResponse> {
        validate_pagination_params(&params.pagination)?;
        
        let program_id = ctx.program_id;
        let owner_filter = OfferFilter {
            owner: Some(params.owner),
            ..Default::default()
        };
        let filters = build_offer_filters(&owner_filter)?;
        
        let accounts = load_program_accounts_filtered(
            ctx.accounts.system_program.to_account_info(),
            program_id,
            &filters,
            &params.pagination,
        )?;
        
        let offers = deserialize_offer_accounts(accounts)?;
        
        let next_cursor = get_next_cursor(&offers);
        let has_more = offers.len() >= params.pagination.limit as usize;
        
        Ok(OffersResponse {
            offers,
            pagination: PaginationResponse {
                next_cursor,
                has_more,
                total_estimate: None,
            },
        })
    }
    
    /// Get single offer by ID
    pub fn get_offer(
        ctx: Context<GetOffer>,
        _offer_id: u64,
    ) -> Result<OfferResponse> {
        let offer = &ctx.accounts.offer;
        
        Ok(OfferResponse {
            offer: (**offer).clone(),
            metadata: OfferMetadata {
                age_seconds: Clock::get()?.unix_timestamp as u64 - offer.created_at,
                is_expired: false, // TODO: Add expiration logic if needed
            },
        })
    }
    
    /// Get offer statistics and aggregated data
    pub fn get_offer_stats(
        ctx: Context<GetOfferStats>,
        params: GetOfferStatsParams,
    ) -> Result<OfferStatsResponse> {
        let program_id = ctx.program_id;
        let filters = build_offer_filters(&params.filter)?;
        
        let accounts = load_program_accounts_filtered(
            ctx.accounts.system_program.to_account_info(),
            program_id,
            &filters,
            &PaginationParams {
                limit: 1000, // Reasonable limit for stats calculation
                cursor: None,
                direction: PaginationDirection::Forward,
            },
        )?;
        
        let offers = deserialize_offer_accounts(accounts)?;
        let stats = calculate_offer_statistics(&offers)?;
        
        Ok(stats)
    }
    
    /// Search offers with complex filtering
    pub fn search_offers(
        ctx: Context<SearchOffers>,
        params: SearchOffersParams,
    ) -> Result<OffersResponse> {
        validate_pagination_params(&params.pagination)?;
        validate_search_params(&params)?;
        
        let program_id = ctx.program_id;
        let filters = build_search_filters(&params)?;
        
        let accounts = load_program_accounts_filtered(
            ctx.accounts.system_program.to_account_info(),
            program_id,
            &filters,
            &params.pagination,
        )?;
        
        let offers = deserialize_offer_accounts(accounts)?;
        let filtered_offers = apply_advanced_filters(offers, &params)?;
        
        let next_cursor = get_next_cursor(&filtered_offers);
        let has_more = filtered_offers.len() >= params.pagination.limit as usize;
        
        Ok(OffersResponse {
            offers: filtered_offers,
            pagination: PaginationResponse {
                next_cursor,
                has_more,
                total_estimate: None,
            },
        })
    }
}

#[derive(Accounts)]
#[instruction(params: CreateOfferParams)]
pub struct CreateOffer<'info> {
    #[account(
        init,
        payer = owner,
        space = Offer::SPACE,
        seeds = [b"offer".as_ref(), params.offer_id.to_le_bytes().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,
    
    #[account(
        mut,
        seeds = [b"profile".as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub user_profile: Account<'info, profile::Profile>,
    
    pub token_mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// CHECK: Profile program for CPI call
    pub profile_program: UncheckedAccount<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOffer<'info> {
    #[account(
        mut,
        seeds = [b"offer".as_ref(), offer.id.to_le_bytes().as_ref()],
        bump = offer.bump,
        constraint = offer.owner == owner.key() @ ErrorCode::Unauthorized
    )]
    pub offer: Account<'info, Offer>,
    
    #[account(
        mut,
        seeds = [b"profile".as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub user_profile: Account<'info, profile::Profile>,
    
    pub owner: Signer<'info>,
    
    /// CHECK: Profile program for CPI call
    pub profile_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseOffer<'info> {
    #[account(
        mut,
        seeds = [b"offer".as_ref(), offer.id.to_le_bytes().as_ref()],
        bump = offer.bump,
        constraint = offer.owner == owner.key() @ ErrorCode::Unauthorized,
        close = owner
    )]
    pub offer: Account<'info, Offer>,
    
    #[account(
        mut,
        seeds = [b"profile".as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub user_profile: Account<'info, profile::Profile>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// CHECK: Profile program for CPI call
    pub profile_program: UncheckedAccount<'info>,
}

#[account]
#[derive(Debug)]
pub struct Offer {
    pub id: u64,
    pub owner: Pubkey,
    pub offer_type: OfferType,
    pub fiat_currency: FiatCurrency,
    pub rate: u64,            // Basis points above/below market price
    pub min_amount: u64,
    pub max_amount: u64,
    pub description: Option<String>,
    pub token_mint: Pubkey,
    pub state: OfferState,
    pub created_at: u64,
    pub bump: u8,
}

impl Offer {
    pub const SPACE: usize = 8 + // discriminator
        8 + // id
        32 + // owner
        1 + // offer_type
        1 + // fiat_currency  
        8 + // rate
        8 + // min_amount
        8 + // max_amount
        1 + 4 + 200 + // description (Option<String> with max 200 chars)
        32 + // token_mint
        1 + // state
        8 + // created_at
        1; // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateOfferParams {
    pub offer_id: u64,
    pub offer_type: OfferType,
    pub fiat_currency: FiatCurrency,
    pub rate: u64,
    pub min_amount: u64,
    pub max_amount: u64,
    pub description: Option<String>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateOfferParams {
    pub rate: u64,
    pub min_amount: u64,
    pub max_amount: u64,
    pub state: OfferState,
    pub description: Option<String>,
}

// ==================== QUERY ACCOUNT CONTEXTS ====================

#[derive(Accounts)]
pub struct GetOffers<'info> {
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetOffersByOwner<'info> {
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct GetOffer<'info> {
    #[account(
        seeds = [b"offer".as_ref(), offer_id.to_le_bytes().as_ref()],
        bump = offer.bump
    )]
    pub offer: Account<'info, Offer>,
}

#[derive(Accounts)]
pub struct GetOfferStats<'info> {
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SearchOffers<'info> {
    pub system_program: Program<'info, System>,
}

// ==================== QUERY PARAMETERS ====================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GetOffersParams {
    pub filter: OfferFilter,
    pub pagination: PaginationParams,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GetOffersByOwnerParams {
    pub owner: Pubkey,
    pub pagination: PaginationParams,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GetOfferStatsParams {
    pub filter: OfferFilter,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SearchOffersParams {
    pub filter: OfferFilter,
    pub pagination: PaginationParams,
    pub sort_by: Option<OfferSortBy>,
    pub price_range: Option<PriceRange>,
}

// ==================== FILTER AND PAGINATION TYPES ====================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct OfferFilter {
    pub owner: Option<Pubkey>,
    pub offer_type: Option<OfferType>,
    pub fiat_currency: Option<FiatCurrency>,
    pub state: Option<OfferState>,
    pub token_mint: Option<Pubkey>,
    pub min_rate: Option<u64>,
    pub max_rate: Option<u64>,
    pub created_after: Option<u64>,
    pub created_before: Option<u64>,
}

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
pub enum OfferSortBy {
    CreatedAt,
    Rate,
    MinAmount,
    MaxAmount,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriceRange {
    pub min_amount: Option<u64>,
    pub max_amount: Option<u64>,
}

// ==================== RESPONSE TYPES ====================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct OffersResponse {
    pub offers: Vec<Offer>,
    pub pagination: PaginationResponse,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct OfferResponse {
    pub offer: Offer,
    pub metadata: OfferMetadata,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct OfferMetadata {
    pub age_seconds: u64,
    pub is_expired: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PaginationResponse {
    pub next_cursor: Option<String>,
    pub has_more: bool,
    pub total_estimate: Option<u64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct OfferStatsResponse {
    pub total_offers: u64,
    pub active_offers: u64,
    pub paused_offers: u64,
    pub archived_offers: u64,
    pub buy_offers: u64,
    pub sell_offers: u64,
    pub currency_breakdown: Vec<CurrencyStats>,
    pub average_rate: u64,
    pub total_volume_range: VolumeRange,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CurrencyStats {
    pub currency: FiatCurrency,
    pub count: u64,
    pub average_rate: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct VolumeRange {
    pub min_total: u64,
    pub max_total: u64,
    pub average_min: u64,
    pub average_max: u64,
}

// ==================== QUERY HELPER FUNCTIONS ====================

fn validate_pagination_params(params: &PaginationParams) -> Result<()> {
    const MAX_LIMIT: u32 = 100;
    const MIN_LIMIT: u32 = 1;
    
    require!(
        params.limit >= MIN_LIMIT && params.limit <= MAX_LIMIT,
        ErrorCode::InvalidPaginationLimit
    );
    
    Ok(())
}

fn validate_search_params(params: &SearchOffersParams) -> Result<()> {
    // Validate price range
    if let Some(price_range) = &params.price_range {
        if let (Some(min), Some(max)) = (price_range.min_amount, price_range.max_amount) {
            require!(min <= max, ErrorCode::InvalidPriceRange);
        }
    }
    
    // Validate rate range
    if let (Some(min_rate), Some(max_rate)) = (params.filter.min_rate, params.filter.max_rate) {
        require!(min_rate <= max_rate, ErrorCode::InvalidRateRange);
    }
    
    // Validate date range
    if let (Some(after), Some(before)) = (params.filter.created_after, params.filter.created_before) {
        require!(after <= before, ErrorCode::InvalidDateRange);
    }
    
    Ok(())
}

fn build_offer_filters(filter: &OfferFilter) -> Result<Vec<RpcFilterType>> {
    let mut filters = Vec::new();
    
    // Add discriminator filter for Offer accounts
    filters.push(RpcFilterType::Memcmp(Memcmp::new(
        0, // offset 0 for discriminator
        MemcmpEncodedBytes::Base64(
            "14ViUBGWwAB9".to_string() // Base64 of Offer discriminator
        ),
    )));
    
    // Filter by owner if specified
    if let Some(owner) = filter.owner {
        filters.push(RpcFilterType::Memcmp(Memcmp::new(
            8 + 8, // offset: discriminator + id
            MemcmpEncodedBytes::Base58(owner.to_string()),
        )));
    }
    
    // Filter by offer type if specified
    if let Some(offer_type) = &filter.offer_type {
        let type_byte = match offer_type {
            OfferType::Buy => 0u8,
            OfferType::Sell => 1u8,
        };
        filters.push(RpcFilterType::Memcmp(Memcmp::new(
            8 + 8 + 32, // offset: discriminator + id + owner
            MemcmpEncodedBytes::Base58(format!("{}", type_byte)),
        )));
    }
    
    // Filter by fiat currency if specified
    if let Some(currency) = &filter.fiat_currency {
        let currency_byte = match currency {
            FiatCurrency::Usd => 0u8,
            FiatCurrency::Eur => 1u8,
            FiatCurrency::Gbp => 2u8,
            FiatCurrency::Cad => 3u8,
            FiatCurrency::Aud => 4u8,
            FiatCurrency::Jpy => 5u8,
            FiatCurrency::Brl => 6u8,
            FiatCurrency::Mxn => 7u8,
            FiatCurrency::Ars => 8u8,
            FiatCurrency::Clp => 9u8,
            FiatCurrency::Cop => 10u8,
            FiatCurrency::Ngn => 11u8,
            FiatCurrency::Thb => 12u8,
            FiatCurrency::Ves => 13u8,
        };
        filters.push(RpcFilterType::Memcmp(Memcmp::new(
            8 + 8 + 32 + 1, // offset: discriminator + id + owner + offer_type
            MemcmpEncodedBytes::Base58(format!("{}", currency_byte)),
        )));
    }
    
    // Filter by state if specified
    if let Some(state) = &filter.state {
        let state_byte = match state {
            OfferState::Active => 0u8,
            OfferState::Paused => 1u8,
            OfferState::Archive => 2u8,
        };
        filters.push(RpcFilterType::Memcmp(Memcmp::new(
            8 + 8 + 32 + 1 + 1 + 8 + 8 + 8 + 1 + 4 + 200 + 32, // offset to state field
            MemcmpEncodedBytes::Base58(format!("{}", state_byte)),
        )));
    }
    
    Ok(filters)
}

fn build_search_filters(params: &SearchOffersParams) -> Result<Vec<RpcFilterType>> {
    build_offer_filters(&params.filter)
}

fn load_program_accounts_filtered<'a>(
    _system_program: AccountInfo<'a>,
    _program_id: &Pubkey,
    _filters: &[RpcFilterType],
    _pagination: &PaginationParams,
) -> Result<Vec<(Pubkey, AccountInfo<'a>)>> {
    // This is a placeholder - in a real implementation, this would use
    // the Solana RPC getProgramAccounts call with filters
    // For now, return empty vec to avoid compilation errors
    Ok(Vec::new())
}

fn deserialize_offer_accounts(accounts: Vec<(Pubkey, AccountInfo)>) -> Result<Vec<Offer>> {
    let mut offers = Vec::new();
    
    for (_, account_info) in accounts {
        // Skip discriminator (8 bytes) and deserialize
        let data = &account_info.data.borrow()[8..];
        let offer: Offer = AnchorDeserialize::deserialize(&mut &data[..])?;
        offers.push(offer);
    }
    
    Ok(offers)
}

fn estimate_total_offers(_system_program: AccountInfo, _program_id: &Pubkey) -> Result<u64> {
    // Placeholder implementation
    Ok(0)
}

fn get_next_cursor(offers: &[Offer]) -> Option<String> {
    if offers.is_empty() {
        return None;
    }
    
    // Use the last offer's ID as cursor
    let last_offer = offers.last().unwrap();
    Some(format!("{}_{}", last_offer.id, last_offer.created_at))
}

fn apply_advanced_filters(offers: Vec<Offer>, params: &SearchOffersParams) -> Result<Vec<Offer>> {
    let mut filtered = offers;
    
    // Apply rate range filter
    if let (Some(min_rate), Some(max_rate)) = (params.filter.min_rate, params.filter.max_rate) {
        filtered.retain(|offer| offer.rate >= min_rate && offer.rate <= max_rate);
    }
    
    // Apply price range filter
    if let Some(price_range) = &params.price_range {
        if let Some(min_amount) = price_range.min_amount {
            filtered.retain(|offer| offer.max_amount >= min_amount);
        }
        if let Some(max_amount) = price_range.max_amount {
            filtered.retain(|offer| offer.min_amount <= max_amount);
        }
    }
    
    // Apply date range filter
    if let Some(created_after) = params.filter.created_after {
        filtered.retain(|offer| offer.created_at >= created_after);
    }
    if let Some(created_before) = params.filter.created_before {
        filtered.retain(|offer| offer.created_at <= created_before);
    }
    
    // Apply sorting
    if let Some(sort_by) = &params.sort_by {
        match sort_by {
            OfferSortBy::CreatedAt => {
                filtered.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            }
            OfferSortBy::Rate => {
                filtered.sort_by(|a, b| a.rate.cmp(&b.rate));
            }
            OfferSortBy::MinAmount => {
                filtered.sort_by(|a, b| a.min_amount.cmp(&b.min_amount));
            }
            OfferSortBy::MaxAmount => {
                filtered.sort_by(|a, b| a.max_amount.cmp(&b.max_amount));
            }
        }
    }
    
    Ok(filtered)
}

fn calculate_offer_statistics(offers: &[Offer]) -> Result<OfferStatsResponse> {
    let total_offers = offers.len() as u64;
    let mut active_offers = 0u64;
    let mut paused_offers = 0u64;
    let mut archived_offers = 0u64;
    let mut buy_offers = 0u64;
    let mut sell_offers = 0u64;
    
    let mut total_rate = 0u64;
    let mut min_total = u64::MAX;
    let mut max_total = 0u64;
    let mut total_min_amounts = 0u64;
    let mut total_max_amounts = 0u64;
    
    let mut currency_counts = std::collections::HashMap::new();
    let mut currency_rates = std::collections::HashMap::new();
    
    for offer in offers {
        // Count by state
        match offer.state {
            OfferState::Active => active_offers += 1,
            OfferState::Paused => paused_offers += 1,
            OfferState::Archive => archived_offers += 1,
        }
        
        // Count by type
        match offer.offer_type {
            OfferType::Buy => buy_offers += 1,
            OfferType::Sell => sell_offers += 1,
        }
        
        // Aggregate rates and amounts
        total_rate += offer.rate;
        min_total = min_total.min(offer.min_amount);
        max_total = max_total.max(offer.max_amount);
        total_min_amounts += offer.min_amount;
        total_max_amounts += offer.max_amount;
        
        // Track currency stats
        *currency_counts.entry(offer.fiat_currency.clone()).or_insert(0) += 1;
        *currency_rates.entry(offer.fiat_currency.clone()).or_insert(0) += offer.rate;
    }
    
    let average_rate = if total_offers > 0 { total_rate / total_offers } else { 0 };
    let average_min = if total_offers > 0 { total_min_amounts / total_offers } else { 0 };
    let average_max = if total_offers > 0 { total_max_amounts / total_offers } else { 0 };
    
    let currency_breakdown: Vec<CurrencyStats> = currency_counts
        .into_iter()
        .map(|(currency, count)| {
            let total_rate = currency_rates.get(&currency).unwrap_or(&0);
            let avg_rate = if count > 0 { total_rate / count } else { 0 };
            CurrencyStats {
                currency,
                count,
                average_rate: avg_rate,
            }
        })
        .collect();
    
    Ok(OfferStatsResponse {
        total_offers,
        active_offers,
        paused_offers,
        archived_offers,
        buy_offers,
        sell_offers,
        currency_breakdown,
        average_rate,
        total_volume_range: VolumeRange {
            min_total: if min_total == u64::MAX { 0 } else { min_total },
            max_total,
            average_min,
            average_max,
        },
    })
}

// ==================== RPC FILTER TYPES ====================

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

// Use common types from profile program
pub use profile::{OfferType, OfferState, FiatCurrency};

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid offer parameters")]
    InvalidOfferParams,
    #[msg("Invalid pagination limit - must be between 1 and 100")]
    InvalidPaginationLimit,
    #[msg("Invalid price range - min amount must be less than or equal to max amount")]
    InvalidPriceRange,
    #[msg("Invalid rate range - min rate must be less than or equal to max rate")]
    InvalidRateRange,
    #[msg("Invalid date range - created_after must be less than or equal to created_before")]
    InvalidDateRange,
}