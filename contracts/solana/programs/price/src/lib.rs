#![deny(arithmetic_overflow)]
#![deny(unused_must_use)]
#![deny(clippy::arithmetic_side_effects)]
#![forbid(unsafe_code)]
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use localmoney_shared::{calculate_rent_with_margin, FiatCurrency, RentError, RentValidation, PriceUpdatedEvent};
// Oracle SDK imports removed due to version conflicts
// Using basic account data parsing instead

declare_id!("GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL");

#[program]
pub mod price {
    use super::*;

    pub fn initialize(ctx: Context<InitializePrices>) -> Result<()> {
        // Validate rent exemption before initialization
        ctx.accounts.validate_rent_exemption()?;

        let price_config = &mut ctx.accounts.price_config;
        price_config.authority = ctx.accounts.authority.key();
        price_config.bump = ctx.bumps.price_config;
        Ok(())
    }

    pub fn update_price(
        ctx: Context<UpdatePrice>,
        fiat_currency: FiatCurrency,
        price_per_token: u64,
        decimals: u8,
    ) -> Result<()> {
        // Validate rent exemption before update
        ctx.accounts.validate_rent_exemption()?;

        let price_feed = &mut ctx.accounts.price_feed;
        let old_price = price_feed.price_per_token;
        
        price_feed.authority = ctx.accounts.authority.key();
        price_feed.fiat_currency = fiat_currency.clone();
        price_feed.price_per_token = price_per_token;
        price_feed.decimals = decimals;
        price_feed.last_updated = Clock::get()?.unix_timestamp as u64;
        price_feed.bump = ctx.bumps.price_feed;

        // Emit price updated event
        emit!(PriceUpdatedEvent {
            token_mint: Pubkey::default(), // Price program doesn't have specific token context
            fiat_currency: format!("{:?}", fiat_currency),
            old_price: old_price,
            new_price: price_per_token,
            oracle: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
            token_index: Pubkey::default(),
        });

        Ok(())
    }

    pub fn get_price(
        ctx: Context<GetPrice>,
        _mint: Pubkey,
        fiat_currency: FiatCurrency,
    ) -> Result<()> {
        let price_feed = &ctx.accounts.price_feed;
        require!(
            price_feed.fiat_currency == fiat_currency,
            ErrorCode::InvalidCurrency
        );

        // Note: Anchor entrypoints cannot return values. Consumers should read
        // the `price_feed` account directly or use return data via sysvar if implemented.
        Ok(())
    }

    pub fn initialize_enhanced(
        ctx: Context<InitializeEnhanced>,
        max_price_age_seconds: u64,
        max_deviation_bps: u16,
        min_required_sources: u8,
        twap_window_seconds: u64,
    ) -> Result<()> {
        ctx.accounts.validate_rent_exemption()?;

        let config = &mut ctx.accounts.price_config;
        config.authority = ctx.accounts.authority.key();
        config.oracle_sources = Vec::new();
        config.max_price_age_seconds = max_price_age_seconds;
        config.max_deviation_bps = max_deviation_bps;
        config.min_required_sources = min_required_sources;
        config.twap_window_seconds = twap_window_seconds;
        config.emergency_fallback_price = None;
        config.price_pause = false;
        config.pause_reason = [0; 32];
        config.pause_timestamp = 0;
        config.auto_resume_after = 0;
        config.bump = ctx.bumps.price_config;
        Ok(())
    }

    // pub fn update_price_aggregate(
    //     ctx: Context<UpdatePriceAggregate>,
    //     fiat_currency: FiatCurrency,
    // ) -> Result<()> {
    //     let _config = &ctx.accounts.price_config;
    //     let price_feed = &mut ctx.accounts.price_feed;
    //     let clock = Clock::get()?;
        
    //     // Simplified implementation to get build working
    //     // Initialize price feed if needed
    //     price_feed.token_mint = ctx.accounts.token_mint.key();
    //     price_feed.fiat_currency = fiat_currency.clone();
    //     price_feed.current_price = 50000; // Mock price
    //     price_feed.current_confidence = 95;
    //     price_feed.last_update = clock.unix_timestamp;
    //     price_feed.total_updates += 1;
    //     price_feed.anomaly_count = 0;
    //     price_feed.consecutive_failures = 0;
    //     price_feed.bump = ctx.bumps.price_feed;
        
    //     // Initialize price history if needed
    //     if price_feed.price_history.count == 0 {
    //         price_feed.price_history = BoundedPriceHistory::new();
    //     }
        
    //     Ok(())
    // }

    pub fn calculate_twap(
        ctx: Context<CalculateTwap>,
        _fiat_currency: FiatCurrency,
        _window_seconds: u64,
    ) -> Result<()> {
        let price_feed = &ctx.accounts.price_feed;
        
        // Simplified TWAP calculation - just return current price
        let twap = price_feed.current_price;
        
        // Store TWAP result in return data
        anchor_lang::solana_program::program::set_return_data(&twap.to_le_bytes());
        
        Ok(())
    }

    pub fn toggle_price_circuit_breaker(
        ctx: Context<ToggleCircuitBreaker>,
        pause: bool,
        reason: [u8; 32],
        auto_resume_seconds: i64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.price_config;
        let clock = Clock::get()?;
        
        require!(
            ctx.accounts.authority.key() == config.authority,
            ErrorCode::Unauthorized
        );
        
        config.price_pause = pause;
        config.pause_reason = reason;
        config.pause_timestamp = clock.unix_timestamp;
        config.auto_resume_after = auto_resume_seconds;
        
        Ok(())
    }

    pub fn add_oracle_source(
        ctx: Context<ManageOracleSource>,
        source_type: OracleType,
        address: Pubkey,
        weight: u16,
    ) -> Result<()> {
        let config = &mut ctx.accounts.price_config;
        
        require!(
            config.oracle_sources.len() < 5,
            ErrorCode::MaxOracleSourcesReached
        );
        
        let new_source = OracleSource {
            source_type,
            address,
            weight,
            is_active: true,
            last_update: 0,
            last_price: 0,
            failure_count: 0,
        };
        
        config.oracle_sources.push(new_source);
        
        Ok(())
    }
}

// Oracle Type Definitions
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum OracleType {
    Pyth,
    Switchboard,
    Internal,      // Manual/admin price
    Chainlink,     // Future support
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OracleSource {
    pub source_type: OracleType,
    pub address: Pubkey,           // Oracle account address
    pub weight: u16,               // Basis points (10000 = 100%)
    pub is_active: bool,
    pub last_update: i64,
    pub last_price: u64,
    pub failure_count: u8,         // Track consecutive failures
}

// Bounded circular buffer for TWAP
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BoundedPriceHistory {
    pub prices: [PricePoint; 24],  // 24 hourly prices
    pub head: u8,                  // Current position
    pub count: u8,                 // Total entries
}

impl BoundedPriceHistory {
    pub fn new() -> Self {
        Self {
            prices: [PricePoint::default(); 24],
            head: 0,
            count: 0,
        }
    }

    pub fn push(&mut self, point: PricePoint) {
        self.prices[self.head as usize] = point;
        self.head = (self.head + 1) % 24;
        if self.count < 24 {
            self.count += 1;
        }
    }
    
    pub fn get_recent_prices(&self) -> Vec<PricePoint> {
        let mut result = Vec::new();
        let start = if self.count < 24 {
            0
        } else {
            self.head as usize
        };
        
        for i in 0..self.count as usize {
            let idx = (start + i) % 24;
            result.push(self.prices[idx]);
        }
        result
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct PricePoint {
    pub price: u64,
    pub timestamp: i64,
    pub source_count: u8,
    pub confidence: u64,
}

#[derive(Debug)]
struct PriceData {
    value: u64,
    confidence: u64,
    timestamp: i64,
}

#[derive(Accounts)]
pub struct InitializePrices<'info> {
    #[account(
        init,
        payer = authority,
        space = PriceConfig::SPACE,
        seeds = [b"price".as_ref(), b"config".as_ref()],
        bump
    )]
    pub price_config: Account<'info, PriceConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> RentValidation for InitializePrices<'info> {
    fn validate_rent_exemption(&self) -> Result<()> {
        // Calculate required rent with 10% margin (1000 basis points)
        let required_rent = calculate_rent_with_margin(PriceConfig::SPACE, 1000)?;

        // Ensure payer has sufficient balance
        require!(
            self.authority.lamports() >= required_rent,
            RentError::InsufficientFunds
        );

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(fiat_currency: FiatCurrency, price_per_token: u64, decimals: u8)]
pub struct UpdatePrice<'info> {
    #[account(
        seeds = [b"price".as_ref(), b"config".as_ref()],
        bump = price_config.bump,
        constraint = price_config.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub price_config: Account<'info, PriceConfig>,

    #[account(
        init,
        payer = authority,
        space = PriceFeed::SPACE,
        seeds = [b"price".as_ref(), fiat_currency.to_seed_bytes()],
        bump
    )]
    pub price_feed: Account<'info, PriceFeed>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> RentValidation for UpdatePrice<'info> {
    fn validate_rent_exemption(&self) -> Result<()> {
        // Calculate required rent with 10% margin (1000 basis points)
        let required_rent = calculate_rent_with_margin(PriceFeed::SPACE, 1000)?;

        // Ensure payer has sufficient balance
        require!(
            self.authority.lamports() >= required_rent,
            RentError::InsufficientFunds
        );

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(_mint: Pubkey, fiat_currency: FiatCurrency)]
pub struct GetPrice<'info> {
    #[account(
        seeds = [b"price".as_ref(), fiat_currency.to_seed_bytes()],
        bump = price_feed.bump
    )]
    pub price_feed: Account<'info, PriceFeed>,
}

#[derive(Accounts)]
pub struct InitializeEnhanced<'info> {
    #[account(
        init,
        payer = authority,
        space = EnhancedPriceConfig::SPACE,
        seeds = [b"price".as_ref(), b"config".as_ref()],
        bump
    )]
    pub price_config: Account<'info, EnhancedPriceConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> RentValidation for InitializeEnhanced<'info> {
    fn validate_rent_exemption(&self) -> Result<()> {
        let required_rent = calculate_rent_with_margin(EnhancedPriceConfig::SPACE, 1000)?;
        require!(
            self.authority.lamports() >= required_rent,
            RentError::InsufficientFunds
        );
        Ok(())
    }
}

// #[derive(Accounts)]
// #[instruction(fiat_currency: FiatCurrency)]
// pub struct UpdatePriceAggregate<'info> {
//     #[account(
//         mut,
//         seeds = [b"price", b"config"],
//         bump = price_config.bump,
//     )]
//     pub price_config: Account<'info, EnhancedPriceConfig>,
    
//     #[account(
//         init_if_needed,
//         payer = payer,
//         space = PriceFeedAggregate::SPACE,
//         seeds = [b"price", b"feed", token_mint.key().as_ref()],
//         bump
//     )]
//     pub price_feed: Account<'info, PriceFeedAggregate>,
    
//     pub token_mint: Account<'info, Mint>,
    
//     #[account(mut)]
//     pub payer: Signer<'info>,
    
//     pub system_program: Program<'info, System>,
// }

// impl<'info> RentValidation for UpdatePriceAggregate<'info> {
//     fn validate_rent_exemption(&self) -> Result<()> {
//         let required_rent = calculate_rent_with_margin(PriceFeedAggregate::SPACE, 1000)?;
//         require!(
//             self.payer.lamports() >= required_rent,
//             RentError::InsufficientFunds
//         );
//         Ok(())
//     }
// }

#[derive(Accounts)]
#[instruction(fiat_currency: FiatCurrency, window_seconds: u64)]
pub struct CalculateTwap<'info> {
    #[account(
        seeds = [b"price", b"feed", token_mint.key().as_ref()],
        bump = price_feed.bump,
    )]
    pub price_feed: Account<'info, PriceFeedAggregate>,
    
    pub token_mint: Account<'info, Mint>,
}

#[derive(Accounts)]
pub struct ToggleCircuitBreaker<'info> {
    #[account(
        mut,
        seeds = [b"price", b"config"],
        bump = price_config.bump,
        has_one = authority,
    )]
    pub price_config: Account<'info, EnhancedPriceConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ManageOracleSource<'info> {
    #[account(
        mut,
        seeds = [b"price", b"config"],
        bump = price_config.bump,
        has_one = authority,
    )]
    pub price_config: Account<'info, EnhancedPriceConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[account]
pub struct PriceConfig {
    pub authority: Pubkey,
    pub bump: u8,
}

impl PriceConfig {
    pub const SPACE: usize = 8 + // discriminator
        32 + // authority
        1; // bump
}

#[account]
pub struct EnhancedPriceConfig {
    pub authority: Pubkey,
    pub oracle_sources: Vec<OracleSource>,      // Dynamic array of sources
    pub max_price_age_seconds: u64,             // Default: 60 seconds
    pub max_deviation_bps: u16,                 // Default: 500 (5%)
    pub min_required_sources: u8,               // Default: 2
    pub twap_window_seconds: u64,               // Default: 300 (5 min)
    pub emergency_fallback_price: Option<u64>,  // Manual fallback
    pub price_pause: bool,                      // Circuit breaker
    pub pause_reason: [u8; 32],                 // Fixed size reason
    pub pause_timestamp: i64,
    pub auto_resume_after: i64,                 // 0 = manual resume only
    pub bump: u8,
}

impl EnhancedPriceConfig {
    pub const SPACE: usize = 8 +         // discriminator
        32 +                              // authority
        4 + (32 + 32 + 2 + 1 + 8 + 8 + 1) * 5 + // oracle_sources (max 5)
        8 +                               // max_price_age_seconds
        2 +                               // max_deviation_bps
        1 +                               // min_required_sources
        8 +                               // twap_window_seconds
        1 + 8 +                           // emergency_fallback_price (Option<u64>)
        1 +                               // price_pause
        32 +                              // pause_reason
        8 +                               // pause_timestamp
        8 +                               // auto_resume_after
        1;                                // bump
}

#[account]
pub struct PriceFeed {
    pub authority: Pubkey,
    pub fiat_currency: FiatCurrency,
    pub price_per_token: u64, // Price in smallest fiat unit (e.g., cents for USD)
    pub decimals: u8,         // Token decimals for scaling
    pub last_updated: u64,    // Unix timestamp
    pub bump: u8,
}

impl PriceFeed {
    pub const SPACE: usize = 8 + // discriminator
        32 + // authority
        1 + // fiat_currency enum (max 1 byte)
        8 + // price_per_token
        1 + // decimals
        8 + // last_updated
        1; // bump
}

#[account]
pub struct PriceFeedAggregate {
    pub token_mint: Pubkey,
    pub fiat_currency: FiatCurrency,
    pub price_history: BoundedPriceHistory,
    pub current_price: u64,
    pub current_confidence: u64,
    pub last_update: i64,
    pub total_updates: u64,
    pub anomaly_count: u32,
    pub consecutive_failures: u8,
    pub bump: u8,
}

impl PriceFeedAggregate {
    pub const SPACE: usize = 8 +         // discriminator
        32 +                              // token_mint
        1 +                               // fiat_currency
        (8 + 8 + 1 + 8) * 24 + 1 + 1 +  // price_history (bounded)
        8 +                               // current_price
        8 +                               // current_confidence
        8 +                               // last_update
        8 +                               // total_updates
        4 +                               // anomaly_count
        1 +                               // consecutive_failures
        1;                                // bump
}

// FiatCurrency is now imported from localmoney_shared

// Oracle Events
#[event]
pub struct PriceUpdateEvent {
    pub token_mint: Pubkey,
    pub fiat_currency: FiatCurrency,
    pub price: u64,
    pub confidence: u64,
    pub sources_used: u8,
    pub timestamp: i64,
}

#[event]
pub struct PriceAnomalyEvent {
    pub token_mint: Pubkey,
    pub fiat_currency: FiatCurrency,
    pub old_price: u64,
    pub new_price: u64,
    pub change_bps: u64,
    pub timestamp: i64,
}

#[event]
pub struct PriceCircuitBreakerEvent {
    pub action: String,
    pub reason: [u8; 32],
    pub authority: Pubkey,
    pub auto_resume_after: i64,
    pub timestamp: i64,
}

#[event]
pub struct TwapCalculatedEvent {
    pub token_mint: Pubkey,
    pub fiat_currency: FiatCurrency,
    pub twap_price: u64,
    pub window_seconds: u64,
    pub data_points: u8,
    pub timestamp: i64,
}

#[event]
pub struct OracleSourceUpdatedEvent {
    pub source_type: OracleType,
    pub address: Pubkey,
    pub weight: u16,
    pub is_active: bool,
    pub action: String, // "added", "updated", "removed"
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid currency for this price feed")]
    InvalidCurrency,
    #[msg("Price updates are currently paused")]
    PriceUpdatesPaused,
    #[msg("Insufficient price sources available")]
    InsufficientPriceSources,
    #[msg("Excessive price deviation between sources")]
    ExcessivePriceDeviation,
    #[msg("Arithmetic overflow in calculation")]
    ArithmeticOverflow,
    #[msg("Arithmetic underflow")]
    ArithmeticUnderflow,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("Price data is stale")]
    StalePrice,
    #[msg("Too many price anomalies detected")]
    TooManyPriceAnomalies,
    #[msg("Insufficient price history for TWAP")]
    InsufficientPriceHistory,
    #[msg("Oracle data is invalid")]
    InvalidOracleData,
    #[msg("Prices are currently paused")]
    PricesPaused,
    #[msg("Too many oracle failures")]
    OracleFailures,
    #[msg("Invalid oracle configuration")]
    InvalidOracleConfig,
    #[msg("Maximum oracle sources reached")]
    MaxOracleSourcesReached,
    #[msg("String exceeds maximum length")]
    StringTooLong,
    #[msg("Collection is full")]
    CollectionFull,
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    #[msg("Page is full")]
    PageFull,
    #[msg("Invalid page number")]
    InvalidPageNumber,
}

// Oracle Helper Functions
fn fetch_pyth_price(
    _account: &AccountInfo,
    clock: &Clock,
) -> Result<PriceData> {
    // For now, return mock data since Pyth integration requires proper setup
    // In production, this would deserialize actual Pyth price data
    Ok(PriceData {
        value: 50000, // Mock SOL price in cents ($500.00)
        confidence: 95,
        timestamp: clock.unix_timestamp,
    })
}

fn fetch_switchboard_price(
    _account: &AccountInfo,
    clock: &Clock,
) -> Result<PriceData> {
    // For now, return mock data since Switchboard integration requires proper setup
    // In production, this would deserialize actual Switchboard aggregator data
    Ok(PriceData {
        value: 49800, // Mock SOL price in cents ($498.00)
        confidence: 90,
        timestamp: clock.unix_timestamp,
    })
}

fn is_price_fresh(
    price_timestamp: i64,
    current_time: i64,
    max_age: u64,
) -> bool {
    let age = (current_time - price_timestamp) as u64;
    age <= max_age
}
