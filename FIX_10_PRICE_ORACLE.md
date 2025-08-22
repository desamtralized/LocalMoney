## FEATURE:

- Implement multi-source price aggregation with median/TWAP calculation
- Add staleness checks with configurable maximum age
- Implement price deviation thresholds and circuit breakers
- Add Pyth Network or Switchboard oracle integration
- Create fallback price sources and validation layers

## EXAMPLES:

```rust
// price/src/lib.rs
use anchor_lang::prelude::*;
use pyth_sdk_solana::{Price, PriceFeed};
use switchboard_v2::AggregatorAccountData;

#[account]
pub struct EnhancedPriceConfig {
    pub authority: Pubkey,
    pub oracle_sources: Vec<OracleSource>,
    pub max_price_age_seconds: u64,      // Maximum staleness allowed
    pub max_deviation_bps: u16,          // Max deviation between sources (basis points)
    pub min_required_sources: u8,        // Minimum sources for valid price
    pub twap_window_seconds: u64,        // Time window for TWAP calculation
    pub emergency_fallback_price: Option<u64>, // Emergency fallback
    pub price_pause: bool,                // Circuit breaker
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OracleSource {
    pub source_type: OracleType,
    pub address: Pubkey,
    pub weight: u16,              // Weight for weighted average (basis points)
    pub is_active: bool,
    pub last_update: i64,
    pub last_price: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum OracleType {
    Pyth,
    Switchboard,
    Internal,
    Chainlink,
}

#[account]
pub struct PriceFeedAggregate {
    pub token_mint: Pubkey,
    pub fiat_currency: FiatCurrency,
    pub price_history: BoundedPriceHistory,  // Circular buffer of recent prices
    pub current_price: u64,
    pub current_confidence: u64,
    pub last_update: i64,
    pub total_updates: u64,
    pub anomaly_count: u32,          // Track suspicious price movements
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BoundedPriceHistory {
    pub prices: [PricePoint; 24],    // 24 hours of hourly prices
    pub head: u8,
    pub count: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PricePoint {
    pub price: u64,
    pub timestamp: i64,
    pub source_count: u8,
}

// Update price with multi-source validation
pub fn update_price_aggregate(
    ctx: Context<UpdatePriceAggregate>,
    fiat_currency: FiatCurrency,
) -> Result<()> {
    let config = &ctx.accounts.price_config;
    let price_feed = &mut ctx.accounts.price_feed;
    let clock = Clock::get()?;
    
    // Check circuit breaker
    require!(!config.price_pause, ErrorCode::PriceUpdatesPaused);
    
    // Collect prices from all sources
    let mut valid_prices = Vec::new();
    let mut total_weight = 0u16;
    
    // Fetch Pyth price
    if let Some(pyth_account) = ctx.remaining_accounts.get(0) {
        if let Ok(price) = fetch_pyth_price(pyth_account, &clock) {
            if is_price_fresh(price.timestamp, clock.unix_timestamp, config.max_price_age_seconds) {
                valid_prices.push((price.value, price.confidence, 3000)); // 30% weight
                total_weight += 3000;
            }
        }
    }
    
    // Fetch Switchboard price
    if let Some(switchboard_account) = ctx.remaining_accounts.get(1) {
        if let Ok(price) = fetch_switchboard_price(switchboard_account, &clock) {
            if is_price_fresh(price.timestamp, clock.unix_timestamp, config.max_price_age_seconds) {
                valid_prices.push((price.value, price.confidence, 3000)); // 30% weight
                total_weight += 3000;
            }
        }
    }
    
    // Include internal price if provided
    if let Some(internal_price) = ctx.accounts.internal_price_account {
        let price = internal_price.load()?;
        if is_price_fresh(price.last_update, clock.unix_timestamp, config.max_price_age_seconds) {
            valid_prices.push((price.price_per_token, 100, 4000)); // 40% weight, lower confidence
            total_weight += 4000;
        }
    }
    
    // Validate minimum sources
    require!(
        valid_prices.len() >= config.min_required_sources as usize,
        ErrorCode::InsufficientPriceSources
    );
    
    // Check price deviation
    let (min_price, max_price) = valid_prices.iter()
        .map(|(p, _, _)| *p)
        .fold((u64::MAX, 0), |(min, max), p| (min.min(p), max.max(p)));
    
    let deviation_bps = ((max_price - min_price) * 10000) / min_price;
    require!(
        deviation_bps <= config.max_deviation_bps as u64,
        ErrorCode::ExcessivePriceDeviation
    );
    
    // Calculate weighted average price
    let weighted_sum: u64 = valid_prices.iter()
        .map(|(price, _, weight)| (*price as u128) * (*weight as u128))
        .sum::<u128>()
        .try_into()
        .map_err(|_| ErrorCode::ArithmeticOverflow)?;
    
    let final_price = weighted_sum / (total_weight as u64);
    
    // Calculate aggregate confidence
    let avg_confidence: u64 = valid_prices.iter()
        .map(|(_, conf, _)| *conf)
        .sum::<u64>() / valid_prices.len() as u64;
    
    // Detect anomalies
    if let Some(last_price) = price_feed.get_last_price() {
        let price_change_bps = if final_price > last_price {
            ((final_price - last_price) * 10000) / last_price
        } else {
            ((last_price - final_price) * 10000) / last_price
        };
        
        // Flag if price changed more than 10%
        if price_change_bps > 1000 {
            price_feed.anomaly_count += 1;
            
            emit!(PriceAnomalyEvent {
                token_mint: ctx.accounts.token_mint.key(),
                fiat_currency: format!("{:?}", fiat_currency),
                old_price: last_price,
                new_price: final_price,
                change_bps: price_change_bps,
                timestamp: clock.unix_timestamp,
            });
        }
    }
    
    // Update price history for TWAP
    price_feed.price_history.push(PricePoint {
        price: final_price,
        timestamp: clock.unix_timestamp,
        source_count: valid_prices.len() as u8,
    });
    
    // Update current price
    price_feed.current_price = final_price;
    price_feed.current_confidence = avg_confidence;
    price_feed.last_update = clock.unix_timestamp;
    price_feed.total_updates += 1;
    
    emit!(PriceUpdateEvent {
        token_mint: ctx.accounts.token_mint.key(),
        fiat_currency: format!("{:?}", fiat_currency),
        price: final_price,
        confidence: avg_confidence,
        sources_used: valid_prices.len() as u8,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

// Calculate TWAP (Time-Weighted Average Price)
pub fn calculate_twap(
    price_feed: &PriceFeedAggregate,
    window_seconds: u64,
) -> Result<u64> {
    let clock = Clock::get()?;
    let cutoff_time = clock.unix_timestamp - window_seconds as i64;
    
    let mut weighted_sum = 0u128;
    let mut total_weight = 0u128;
    let prices = price_feed.price_history.get_recent_prices();
    
    for i in 0..prices.len() {
        if prices[i].timestamp >= cutoff_time {
            let weight = if i == prices.len() - 1 {
                // Last price, weight by time until now
                (clock.unix_timestamp - prices[i].timestamp) as u128
            } else {
                // Weight by time until next price
                (prices[i + 1].timestamp - prices[i].timestamp) as u128
            };
            
            weighted_sum += prices[i].price as u128 * weight;
            total_weight += weight;
        }
    }
    
    require!(total_weight > 0, ErrorCode::InsufficientPriceHistory);
    
    Ok((weighted_sum / total_weight) as u64)
}

// Helper functions
fn fetch_pyth_price(
    account: &AccountInfo,
    clock: &Clock,
) -> Result<PriceData> {
    let price_feed = PriceFeed::try_from_slice(&account.data.borrow())?;
    let price = price_feed.get_price_unchecked();
    
    Ok(PriceData {
        value: price.price as u64,
        confidence: price.conf as u64,
        timestamp: price.publish_time,
    })
}

fn fetch_switchboard_price(
    account: &AccountInfo,
    clock: &Clock,
) -> Result<PriceData> {
    let aggregator = AggregatorAccountData::try_from_slice(&account.data.borrow())?;
    let result = aggregator.get_result()?;
    
    Ok(PriceData {
        value: result.mantissa as u64 * 10u64.pow(result.scale as u32),
        confidence: 100, // Switchboard doesn't provide confidence
        timestamp: aggregator.latest_confirmed_round.round_open_timestamp,
    })
}

fn is_price_fresh(
    price_timestamp: i64,
    current_time: i64,
    max_age: u64,
) -> bool {
    (current_time - price_timestamp) as u64 <= max_age
}

#[derive(Debug)]
struct PriceData {
    value: u64,
    confidence: u64,
    timestamp: i64,
}

// Circuit breaker for extreme market conditions
pub fn toggle_price_circuit_breaker(
    ctx: Context<ToggleCircuitBreaker>,
    pause: bool,
    reason: String,
) -> Result<()> {
    let config = &mut ctx.accounts.price_config;
    let clock = Clock::get()?;
    
    require!(
        ctx.accounts.authority.key() == config.authority,
        ErrorCode::Unauthorized
    );
    
    config.price_pause = pause;
    
    emit!(PriceCircuitBreakerEvent {
        action: if pause { "pause" } else { "resume" },
        reason,
        authority: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

// Get validated price for trade with safety checks
pub fn get_safe_price(
    ctx: Context<GetSafePrice>,
    fiat_currency: FiatCurrency,
    max_age_override: Option<u64>,
) -> Result<u64> {
    let config = &ctx.accounts.price_config;
    let price_feed = &ctx.accounts.price_feed;
    let clock = Clock::get()?;
    
    // Check circuit breaker
    require!(!config.price_pause, ErrorCode::PricesPaused);
    
    // Check staleness
    let max_age = max_age_override.unwrap_or(config.max_price_age_seconds);
    require!(
        (clock.unix_timestamp - price_feed.last_update) as u64 <= max_age,
        ErrorCode::StalePrice
    );
    
    // Check for recent anomalies
    require!(
        price_feed.anomaly_count < 3,
        ErrorCode::TooManyPriceAnomalies
    );
    
    // Return TWAP if configured, otherwise current price
    if config.twap_window_seconds > 0 {
        calculate_twap(price_feed, config.twap_window_seconds)
    } else {
        Ok(price_feed.current_price)
    }
}
```

## DOCUMENTATION:

- Pyth Network: https://pyth.network/developers/price-feed-ids
- Switchboard: https://docs.switchboard.xyz/
- TWAP calculation: https://en.wikipedia.org/wiki/Time-weighted_average_price
- Oracle manipulation attacks: https://www.certik.com/resources/blog/oracle-manipulation-attacks

## OTHER CONSIDERATIONS:

- **Oracle Costs**: External oracles may charge fees - budget accordingly
- **Latency**: Price updates may lag - design for eventual consistency
- **Manipulation**: Consider flash loan attacks on price sources
- **Redundancy**: Always have multiple independent price sources
- **Testing**: Simulate extreme market conditions in tests
- **Monitoring**: Set up alerts for price anomalies
- **Documentation**: Document price methodology for transparency
- **Compliance**: Some jurisdictions require specific price sources

## RELATED ISSUES:

- Prerequisites: All previous fixes (FIX_01-09)
- Completes critical security fixes
- Critical for: Fair trading and preventing price manipulation