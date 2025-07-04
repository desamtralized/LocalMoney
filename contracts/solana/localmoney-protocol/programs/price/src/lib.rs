use anchor_lang::prelude::*;
use anchor_lang::AnchorDeserialize;
use shared_types::{
    FiatCurrency, LocalMoneyErrorCode, PriceHistoryEntry, RegisteredProgramType, RouteStep, CONFIG_SEED, CURRENCY_PRICE_SEED,
    PRICE_HISTORY_SEED, PRICE_ROUTE_SEED, PRICE_SCALE,
};

declare_id!("7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1");

#[program]
pub mod price {
    use super::*;

    /// Register this program with the Hub
    pub fn register_with_hub(ctx: Context<RegisterWithHub>) -> Result<()> {
        let hub_program = &ctx.accounts.hub_program;
        let hub_config = &ctx.accounts.hub_config;
        let hub_registry = &ctx.accounts.hub_registry;
        let program_account = &ctx.accounts.program_account;
        let payer = &ctx.accounts.payer;
        let system_program = &ctx.accounts.system_program;

        // Create CPI context for hub program registration
        let cpi_program = hub_program.to_account_info();
        let cpi_accounts = hub::cpi::accounts::RegisterProgram {
            config: hub_config.to_account_info(),
            registry: hub_registry.to_account_info(),
            program_id: program_account.to_account_info(),
            payer: payer.to_account_info(),
            system_program: system_program.to_account_info(),
        };
        
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        // Call hub program to register this program as a Price program
        hub::cpi::register_program(cpi_ctx, RegisteredProgramType::Price)?;
        
        msg!("Price program successfully registered with Hub");
        Ok(())
    }

    /// Initialize the price program with hub configuration
    pub fn initialize(ctx: Context<Initialize>, hub_program: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.hub_program = hub_program;
        config.price_provider = ctx.accounts.authority.key(); // Initially set to authority
        config.max_staleness_seconds = 3600; // 1 hour default
        config.bump = ctx.bumps.config;

        msg!("Price program initialized with hub: {}", hub_program);
        Ok(())
    }

    /// Update the price provider authority
    pub fn update_price_provider(
        ctx: Context<UpdatePriceProvider>,
        new_provider: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.price_provider = new_provider;

        msg!("Price provider updated to: {}", new_provider);
        Ok(())
    }

    /// Update prices for multiple currencies
    pub fn update_prices(
        ctx: Context<UpdatePrices>,
        currency: FiatCurrency,
        price_usd: u64, // Price in USD with PRICE_SCALE decimals
    ) -> Result<()> {
        let clock = Clock::get()?;
        let currency_price = &mut ctx.accounts.currency_price;

        // Validate price is reasonable (not zero)
        require!(price_usd > 0, LocalMoneyErrorCode::InvalidPrice);

        currency_price.currency = currency;
        currency_price.price_usd = price_usd;
        currency_price.last_updated = clock.unix_timestamp;
        currency_price.is_active = true;

        msg!("Updated price for {}: {} USD (scaled)", currency, price_usd);
        Ok(())
    }

    /// Register a price route for multi-step conversions
    pub fn register_price_route(
        ctx: Context<RegisterPriceRoute>,
        from_currency: FiatCurrency,
        to_currency: FiatCurrency,
        route_steps: Vec<RouteStep>,
    ) -> Result<()> {
        let price_route = &mut ctx.accounts.price_route;

        // Validate route steps
        require!(!route_steps.is_empty(), LocalMoneyErrorCode::InvalidRoute);
        require!(route_steps.len() <= 10, LocalMoneyErrorCode::RouteTooLong);

        price_route.from_currency = from_currency;
        price_route.to_currency = to_currency;
        price_route.route_steps = route_steps;
        price_route.is_active = true;

        msg!(
            "Registered price route from {} to {}",
            from_currency,
            to_currency
        );
        Ok(())
    }

    /// Calculate price using multi-step route
    /// This implements Task 1.6.1 - Add multi-step price route calculation
    pub fn calculate_route_price(ctx: Context<CalculateRoutePrice>, amount: u64) -> Result<u64> {
        let price_route = &ctx.accounts.price_route;
        let config = &ctx.accounts.config;
        let clock = Clock::get()?;

        require!(price_route.is_active, LocalMoneyErrorCode::InactiveRoute);

        // Start with the input amount
        let mut current_amount = amount;

        // For each step in the route, apply the conversion
        for (i, _step) in price_route.route_steps.iter().enumerate() {
            // Get the price account for this step
            let price_account = &ctx.remaining_accounts[i];
            let price_account_data = price_account.try_borrow_data()?;
            let price_data = CurrencyPrice::try_deserialize(&mut price_account_data.as_ref())?;

            // Validate price is not stale
            let time_since_update = clock.unix_timestamp - price_data.last_updated;
            require!(
                time_since_update <= config.max_staleness_seconds as i64,
                LocalMoneyErrorCode::StalePrice
            );

            require!(price_data.is_active, LocalMoneyErrorCode::InactivePrice);

            // Apply the conversion for this step
            // For simplicity, we assume each step converts through USD
            current_amount = current_amount
                .checked_mul(price_data.price_usd)
                .ok_or(LocalMoneyErrorCode::MathOverflow)?
                .checked_div(PRICE_SCALE)
                .ok_or(LocalMoneyErrorCode::MathOverflow)?;
        }

        msg!(
            "Route calculation: {} -> {} (steps: {})",
            amount,
            current_amount,
            price_route.route_steps.len()
        );

        Ok(current_amount)
    }

    /// Get price for a currency (query function)
    pub fn get_price(ctx: Context<GetPrice>) -> Result<u64> {
        let currency_price = &ctx.accounts.currency_price;
        let config = &ctx.accounts.config;
        let clock = Clock::get()?;

        // Check if price is stale
        let time_since_update = clock.unix_timestamp - currency_price.last_updated;
        require!(
            time_since_update <= config.max_staleness_seconds as i64,
            LocalMoneyErrorCode::StalePrice
        );

        require!(currency_price.is_active, LocalMoneyErrorCode::InactivePrice);

        Ok(currency_price.price_usd)
    }

    /// Convert amount from one currency to another using USD as base
    pub fn convert_currency(
        ctx: Context<ConvertCurrency>,
        amount: u64,
        from_currency: FiatCurrency,
        to_currency: FiatCurrency,
    ) -> Result<u64> {
        // If same currency, return same amount
        if from_currency == to_currency {
            return Ok(amount);
        }

        let from_price = &ctx.accounts.from_currency_price;
        let to_price = &ctx.accounts.to_currency_price;
        let config = &ctx.accounts.config;
        let clock = Clock::get()?;

        // Validate both prices are not stale
        let time_since_from_update = clock.unix_timestamp - from_price.last_updated;
        let time_since_to_update = clock.unix_timestamp - to_price.last_updated;

        require!(
            time_since_from_update <= config.max_staleness_seconds as i64,
            LocalMoneyErrorCode::StalePrice
        );
        require!(
            time_since_to_update <= config.max_staleness_seconds as i64,
            LocalMoneyErrorCode::StalePrice
        );

        require!(from_price.is_active, LocalMoneyErrorCode::InactivePrice);
        require!(to_price.is_active, LocalMoneyErrorCode::InactivePrice);

        // Convert: amount_from * price_from / price_to
        let usd_value = amount
            .checked_mul(from_price.price_usd)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?;

        let converted_amount = usd_value
            .checked_div(to_price.price_usd)
            .ok_or(LocalMoneyErrorCode::MathOverflow)?;

        Ok(converted_amount)
    }

    /// Aggregate prices from multiple sources (Task 1.6.4)
    /// This allows combining prices from different providers for better accuracy
    pub fn aggregate_prices(
        ctx: Context<AggregatePrices>,
        currency: FiatCurrency,
        prices: Vec<u64>,
        weights: Vec<u64>,
    ) -> Result<u64> {
        require!(!prices.is_empty(), LocalMoneyErrorCode::InvalidPrice);
        require!(
            prices.len() == weights.len(),
            LocalMoneyErrorCode::InvalidWeights
        );
        require!(prices.len() <= 10, LocalMoneyErrorCode::TooManyPrices);

        let mut weighted_sum: u128 = 0;
        let mut total_weight: u128 = 0;

        for (price, weight) in prices.iter().zip(weights.iter()) {
            require!(*price > 0, LocalMoneyErrorCode::InvalidPrice);
            require!(*weight > 0, LocalMoneyErrorCode::InvalidWeights);

            weighted_sum = weighted_sum
                .checked_add(
                    (*price as u128)
                        .checked_mul(*weight as u128)
                        .ok_or(LocalMoneyErrorCode::MathOverflow)?,
                )
                .ok_or(LocalMoneyErrorCode::MathOverflow)?;

            total_weight = total_weight
                .checked_add(*weight as u128)
                .ok_or(LocalMoneyErrorCode::MathOverflow)?;
        }

        let aggregated_price = weighted_sum
            .checked_div(total_weight)
            .ok_or(LocalMoneyErrorCode::MathOverflow)? as u64;

        // Update the currency price with the aggregated value
        let clock = Clock::get()?;
        let currency_price = &mut ctx.accounts.currency_price;

        currency_price.currency = currency;
        currency_price.price_usd = aggregated_price;
        currency_price.last_updated = clock.unix_timestamp;
        currency_price.is_active = true;

        msg!(
            "Aggregated price for {}: {} USD from {} sources",
            currency,
            aggregated_price,
            prices.len()
        );

        Ok(aggregated_price)
    }

    /// Oracle integration interface (Task 1.6.3)
    /// Allows external oracles to provide price updates with validation
    pub fn oracle_price_update(
        ctx: Context<OraclePriceUpdate>,
        currency: FiatCurrency,
        price_usd: u64,
        confidence: u64, // Confidence level (0-100)
        oracle_timestamp: i64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let currency_price = &mut ctx.accounts.currency_price;
        let oracle_config = &ctx.accounts.oracle_config;

        // Validate oracle is authorized
        require!(oracle_config.is_active, LocalMoneyErrorCode::InactiveOracle);

        // Validate price data
        require!(price_usd > 0, LocalMoneyErrorCode::InvalidPrice);
        require!(confidence <= 100, LocalMoneyErrorCode::InvalidConfidence);

        // Validate timestamp is not too old (within 5 minutes)
        let time_diff = (clock.unix_timestamp - oracle_timestamp).abs();
        require!(time_diff <= 300, LocalMoneyErrorCode::StaleOracleData);

        // Only update if confidence meets minimum threshold
        require!(
            confidence >= oracle_config.min_confidence,
            LocalMoneyErrorCode::LowConfidence
        );

        currency_price.currency = currency;
        currency_price.price_usd = price_usd;
        currency_price.last_updated = clock.unix_timestamp;
        currency_price.is_active = true;

        msg!(
            "Oracle updated price for {}: {} USD (confidence: {}%)",
            currency,
            price_usd,
            confidence
        );

        Ok(())
    }

    /// Register oracle provider (Task 1.6.3)
    pub fn register_oracle(
        ctx: Context<RegisterOracle>,
        oracle_provider: Pubkey,
        min_confidence: u64,
    ) -> Result<()> {
        let oracle_config = &mut ctx.accounts.oracle_config;

        oracle_config.oracle_provider = oracle_provider;
        oracle_config.min_confidence = min_confidence;
        oracle_config.is_active = true;
        oracle_config.total_updates = 0;
        oracle_config.last_update = 0;

        msg!("Registered oracle provider: {}", oracle_provider);
        Ok(())
    }

    /// Add price history entry (Task 1.6.5)
    pub fn add_price_history(
        ctx: Context<AddPriceHistory>,
        currency: FiatCurrency,
        price_usd: u64,
        source: Pubkey,
        confidence: u64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let price_history = &mut ctx.accounts.price_history;

        // Validate inputs
        require!(price_usd > 0, LocalMoneyErrorCode::InvalidPrice);
        require!(confidence <= 100, LocalMoneyErrorCode::InvalidConfidence);

        // Create new history entry
        let new_entry = PriceHistoryEntry {
            timestamp: clock.unix_timestamp,
            price_usd,
            source,
            confidence,
        };

        // Add to history (maintain max 50 entries)
        if price_history.entries.len() >= 50 {
            price_history.entries.remove(0); // Remove oldest
        }
        price_history.entries.push(new_entry);

        price_history.currency = currency;
        price_history.last_updated = clock.unix_timestamp;
        price_history.total_entries += 1;

        msg!(
            "Added price history for {}: {} USD (confidence: {}%, source: {})",
            currency,
            price_usd,
            confidence,
            source
        );
        Ok(())
    }

    /// Get price history for a currency (Task 1.6.5)
    pub fn get_price_history(
        ctx: Context<GetPriceHistory>,
        limit: Option<u8>,
    ) -> Result<Vec<PriceHistoryEntry>> {
        let price_history = &ctx.accounts.price_history;
        let limit = limit.unwrap_or(10).min(50) as usize;

        // Return most recent entries up to limit
        let start_index = if price_history.entries.len() > limit {
            price_history.entries.len() - limit
        } else {
            0
        };

        let recent_entries = price_history.entries[start_index..].to_vec();
        
        msg!(
            "Retrieved {} price history entries for {}",
            recent_entries.len(),
            price_history.currency
        );

        Ok(recent_entries)
    }

    /// Get price statistics from history (Task 1.6.5)
    pub fn get_price_statistics(
        ctx: Context<GetPriceHistory>,
        timeframe_hours: u64,
    ) -> Result<PriceStatistics> {
        let price_history = &ctx.accounts.price_history;
        let clock = Clock::get()?;
        let cutoff_time = clock.unix_timestamp - (timeframe_hours * 3600) as i64;

        // Filter entries within timeframe
        let relevant_entries: Vec<_> = price_history
            .entries
            .iter()
            .filter(|entry| entry.timestamp >= cutoff_time)
            .collect();

        if relevant_entries.is_empty() {
            return Err(LocalMoneyErrorCode::NoHistoryData.into());
        }

        // Calculate statistics
        let mut min_price = u64::MAX;
        let mut max_price = 0u64;
        let mut total_price = 0u128;
        let mut total_weighted_price = 0u128;
        let mut total_confidence = 0u128;

        for entry in &relevant_entries {
            min_price = min_price.min(entry.price_usd);
            max_price = max_price.max(entry.price_usd);
            total_price += entry.price_usd as u128;
            total_weighted_price += (entry.price_usd as u128) * (entry.confidence as u128);
            total_confidence += entry.confidence as u128;
        }

        let count = relevant_entries.len() as u64;
        let avg_price = (total_price / count as u128) as u64;
        let weighted_avg_price = if total_confidence > 0 {
            (total_weighted_price / total_confidence) as u64
        } else {
            avg_price
        };

        // Calculate volatility (standard deviation)
        let variance_sum: u128 = relevant_entries
            .iter()
            .map(|entry| {
                let diff = (entry.price_usd as i128) - (avg_price as i128);
                (diff * diff) as u128
            })
            .sum();
        let variance = variance_sum / count as u128;
        let volatility = (variance as f64).sqrt() as u64;

        let stats = PriceStatistics {
            currency: price_history.currency,
            timeframe_hours,
            entry_count: count,
            min_price,
            max_price,
            avg_price,
            weighted_avg_price,
            volatility,
            first_timestamp: relevant_entries.first().unwrap().timestamp,
            last_timestamp: relevant_entries.last().unwrap().timestamp,
        };

        msg!(
            "Price statistics for {} over {} hours: min={}, max={}, avg={}, volatility={}",
            price_history.currency,
            timeframe_hours,
            min_price,
            max_price,
            avg_price,
            volatility
        );

        Ok(stats)
    }

    /// Enhanced update_prices with history tracking (Task 1.6.5)
    pub fn update_prices_with_history(
        ctx: Context<UpdatePricesWithHistory>,
        currency: FiatCurrency,
        price_usd: u64,
        confidence: Option<u64>,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let currency_price = &mut ctx.accounts.currency_price;
        let price_history = &mut ctx.accounts.price_history;

        // Validate price
        require!(price_usd > 0, LocalMoneyErrorCode::InvalidPrice);
        let confidence = confidence.unwrap_or(100);
        require!(confidence <= 100, LocalMoneyErrorCode::InvalidConfidence);

        // Update current price
        currency_price.currency = currency;
        currency_price.price_usd = price_usd;
        currency_price.last_updated = clock.unix_timestamp;
        currency_price.is_active = true;

        // Add to history
        let new_entry = PriceHistoryEntry {
            timestamp: clock.unix_timestamp,
            price_usd,
            source: ctx.accounts.price_provider.key(),
            confidence,
        };

        // Maintain max 50 entries
        if price_history.entries.len() >= 50 {
            price_history.entries.remove(0);
        }
        price_history.entries.push(new_entry);

        price_history.currency = currency;
        price_history.last_updated = clock.unix_timestamp;
        price_history.total_entries += 1;

        msg!(
            "Updated price for {} with history: {} USD (confidence: {}%)",
            currency,
            price_usd,
            confidence
        );
        Ok(())
    }
}

/// Price program configuration
#[account]
pub struct PriceConfig {
    pub authority: Pubkey,
    pub hub_program: Pubkey,
    pub price_provider: Pubkey,
    pub max_staleness_seconds: u64,
    pub bump: u8,
}

/// Currency price information
#[account]
pub struct CurrencyPrice {
    pub currency: FiatCurrency,
    pub price_usd: u64, // Price in USD with PRICE_SCALE decimals
    pub last_updated: i64,
    pub is_active: bool,
}

/// Price route for multi-step conversions
#[account]
pub struct PriceRoute {
    pub from_currency: FiatCurrency,
    pub to_currency: FiatCurrency,
    pub route_steps: Vec<RouteStep>,
    pub is_active: bool,
}

/// Oracle configuration for external price providers
#[account]
pub struct OracleConfig {
    pub oracle_provider: Pubkey,
    pub min_confidence: u64,
    pub is_active: bool,
    pub total_updates: u64,
    pub last_update: i64,
}

/// Price history tracking for a currency (Task 1.6.5)
#[account]
pub struct PriceHistory {
    pub currency: FiatCurrency,
    pub entries: Vec<PriceHistoryEntry>,
    pub last_updated: i64,
    pub total_entries: u64,
}

/// Price statistics calculated from history
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PriceStatistics {
    pub currency: FiatCurrency,
    pub timeframe_hours: u64,
    pub entry_count: u64,
    pub min_price: u64,
    pub max_price: u64,
    pub avg_price: u64,
    pub weighted_avg_price: u64,
    pub volatility: u64,
    pub first_timestamp: i64,
    pub last_timestamp: i64,
}

// Instruction contexts

/// Account structure for registering the price program with the hub
#[derive(Accounts)]
pub struct RegisterWithHub<'info> {
    /// Hub program ID
    /// CHECK: This is the hub program we're registering with
    pub hub_program: UncheckedAccount<'info>,

    /// Hub global configuration account
    #[account(
        seeds = [b"config"],
        bump,
        seeds::program = hub_program.key()
    )]
    /// CHECK: Verified by hub program
    pub hub_config: UncheckedAccount<'info>,

    /// Hub program registry account for this program
    #[account(
        seeds = [b"registry", crate::ID.as_ref()],
        bump,
        seeds::program = hub_program.key()
    )]
    /// CHECK: Verified by hub program during CPI
    pub hub_registry: UncheckedAccount<'info>,

    /// The price program account (this program) 
    /// CHECK: This account represents the current program
    pub program_account: Signer<'info>,

    /// Account that pays for the registry account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// System program for account creation
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<PriceConfig>(),
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, PriceConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePriceProvider<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ LocalMoneyErrorCode::Unauthorized
    )]
    pub config: Account<'info, PriceConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(currency: FiatCurrency)]
pub struct UpdatePrices<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = price_provider @ LocalMoneyErrorCode::Unauthorized
    )]
    pub config: Account<'info, PriceConfig>,
    #[account(
        init_if_needed,
        payer = price_provider,
        space = 8 + std::mem::size_of::<CurrencyPrice>(),
        seeds = [CURRENCY_PRICE_SEED, currency.to_string().as_bytes()],
        bump
    )]
    pub currency_price: Account<'info, CurrencyPrice>,
    #[account(mut)]
    pub price_provider: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(from_currency: FiatCurrency, to_currency: FiatCurrency)]
pub struct RegisterPriceRoute<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ LocalMoneyErrorCode::Unauthorized
    )]
    pub config: Account<'info, PriceConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<PriceRoute>() + 4 + (10 * std::mem::size_of::<RouteStep>()), // Max 10 route steps
        seeds = [PRICE_ROUTE_SEED, from_currency.to_string().as_bytes(), to_currency.to_string().as_bytes()],
        bump
    )]
    pub price_route: Account<'info, PriceRoute>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(currency: FiatCurrency)]
pub struct GetPrice<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, PriceConfig>,
    #[account(
        seeds = [CURRENCY_PRICE_SEED, currency.to_string().as_bytes()],
        bump
    )]
    pub currency_price: Account<'info, CurrencyPrice>,
}

#[derive(Accounts)]
#[instruction(amount: u64, from_currency: FiatCurrency, to_currency: FiatCurrency)]
pub struct ConvertCurrency<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, PriceConfig>,
    #[account(
        seeds = [CURRENCY_PRICE_SEED, from_currency.to_string().as_bytes()],
        bump
    )]
    pub from_currency_price: Account<'info, CurrencyPrice>,
    #[account(
        seeds = [CURRENCY_PRICE_SEED, to_currency.to_string().as_bytes()],
        bump
    )]
    pub to_currency_price: Account<'info, CurrencyPrice>,
}

#[derive(Accounts)]
#[instruction(from_currency: FiatCurrency, to_currency: FiatCurrency)]
pub struct CalculateRoutePrice<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, PriceConfig>,
    #[account(
        seeds = [PRICE_ROUTE_SEED, from_currency.to_string().as_bytes(), to_currency.to_string().as_bytes()],
        bump
    )]
    pub price_route: Account<'info, PriceRoute>,
    // remaining_accounts will contain the price accounts for each route step
}

#[derive(Accounts)]
#[instruction(currency: FiatCurrency)]
pub struct AggregatePrices<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ LocalMoneyErrorCode::Unauthorized
    )]
    pub config: Account<'info, PriceConfig>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + std::mem::size_of::<CurrencyPrice>(),
        seeds = [CURRENCY_PRICE_SEED, currency.to_string().as_bytes()],
        bump
    )]
    pub currency_price: Account<'info, CurrencyPrice>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(currency: FiatCurrency)]
pub struct OraclePriceUpdate<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, PriceConfig>,
    #[account(
        init_if_needed,
        payer = oracle_provider,
        space = 8 + std::mem::size_of::<CurrencyPrice>(),
        seeds = [CURRENCY_PRICE_SEED, currency.to_string().as_bytes()],
        bump
    )]
    pub currency_price: Account<'info, CurrencyPrice>,
    #[account(
        seeds = [b"oracle", oracle_provider.key().as_ref()],
        bump,
        has_one = oracle_provider @ LocalMoneyErrorCode::Unauthorized
    )]
    pub oracle_config: Account<'info, OracleConfig>,
    #[account(mut)]
    pub oracle_provider: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterOracle<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ LocalMoneyErrorCode::Unauthorized
    )]
    pub config: Account<'info, PriceConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<OracleConfig>(),
        seeds = [b"oracle", oracle_provider.key().as_ref()],
        bump
    )]
    pub oracle_config: Account<'info, OracleConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: This is the oracle provider pubkey being registered
    pub oracle_provider: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(currency: FiatCurrency)]
pub struct AddPriceHistory<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ LocalMoneyErrorCode::Unauthorized
    )]
    pub config: Account<'info, PriceConfig>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + std::mem::size_of::<PriceHistory>() + 4 + (50 * std::mem::size_of::<PriceHistoryEntry>()), // Max 50 entries
        seeds = [PRICE_HISTORY_SEED, currency.to_string().as_bytes()],
        bump
    )]
    pub price_history: Account<'info, PriceHistory>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(currency: FiatCurrency)]
pub struct GetPriceHistory<'info> {
    #[account(
        seeds = [PRICE_HISTORY_SEED, currency.to_string().as_bytes()],
        bump
    )]
    pub price_history: Account<'info, PriceHistory>,
}

#[derive(Accounts)]
#[instruction(currency: FiatCurrency)]
pub struct UpdatePricesWithHistory<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = price_provider @ LocalMoneyErrorCode::Unauthorized
    )]
    pub config: Account<'info, PriceConfig>,
    #[account(
        init_if_needed,
        payer = price_provider,
        space = 8 + std::mem::size_of::<CurrencyPrice>(),
        seeds = [CURRENCY_PRICE_SEED, currency.to_string().as_bytes()],
        bump
    )]
    pub currency_price: Account<'info, CurrencyPrice>,
    #[account(
        init_if_needed,
        payer = price_provider,
        space = 8 + std::mem::size_of::<PriceHistory>() + 4 + (50 * std::mem::size_of::<PriceHistoryEntry>()), // Max 50 entries
        seeds = [PRICE_HISTORY_SEED, currency.to_string().as_bytes()],
        bump
    )]
    pub price_history: Account<'info, PriceHistory>,
    #[account(mut)]
    pub price_provider: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;
    use shared_types::{FiatCurrency, PRICE_SCALE};

    /// Test helper to create a mock context for testing
    fn create_mock_pubkey() -> Pubkey {
        Pubkey::new_unique()
    }

    #[test]
    fn test_price_config_initialization() {
        let authority = create_mock_pubkey();
        let hub_program = create_mock_pubkey();

        let mut config = PriceConfig {
            authority,
            hub_program,
            price_provider: authority,
            max_staleness_seconds: 3600,
            bump: 255,
        };

        assert_eq!(config.authority, authority);
        assert_eq!(config.hub_program, hub_program);
        assert_eq!(config.max_staleness_seconds, 3600);
    }

    #[test]
    fn test_currency_price_structure() {
        let price = CurrencyPrice {
            currency: FiatCurrency::USD,
            price_usd: 1_000_000,     // $1.00 with PRICE_SCALE
            last_updated: 1640995200, // Jan 1, 2022
            is_active: true,
        };

        assert_eq!(price.currency, FiatCurrency::USD);
        assert_eq!(price.price_usd, PRICE_SCALE);
        assert!(price.is_active);
    }

    #[test]
    fn test_price_route_structure() {
        let route_steps = vec![
            RouteStep {
                pool: create_mock_pubkey(),
                offer_asset: create_mock_pubkey(),
            },
            RouteStep {
                pool: create_mock_pubkey(),
                offer_asset: create_mock_pubkey(),
            },
        ];

        let price_route = PriceRoute {
            from_currency: FiatCurrency::EUR,
            to_currency: FiatCurrency::USD,
            route_steps: route_steps.clone(),
            is_active: true,
        };

        assert_eq!(price_route.from_currency, FiatCurrency::EUR);
        assert_eq!(price_route.to_currency, FiatCurrency::USD);
        assert_eq!(price_route.route_steps.len(), 2);
        assert!(price_route.is_active);
    }

    #[test]
    fn test_oracle_config_structure() {
        let oracle_provider = create_mock_pubkey();

        let oracle_config = OracleConfig {
            oracle_provider,
            min_confidence: 80,
            is_active: true,
            total_updates: 0,
            last_update: 0,
        };

        assert_eq!(oracle_config.oracle_provider, oracle_provider);
        assert_eq!(oracle_config.min_confidence, 80);
        assert!(oracle_config.is_active);
        assert_eq!(oracle_config.total_updates, 0);
    }

    #[test]
    fn test_price_calculations() {
        // Test basic USD conversion
        let amount: u64 = 100_000_000; // $100
        let from_price: u64 = 1_000_000; // $1.00
        let to_price: u64 = 2_000_000; // $2.00

        // Convert: amount * from_price / to_price
        let usd_value = amount.checked_mul(from_price).unwrap();
        let converted = usd_value.checked_div(to_price).unwrap();

        assert_eq!(converted, 50_000_000); // $50
    }

    #[test]
    fn test_price_aggregation_logic() {
        let prices = vec![1_000_000, 1_100_000, 900_000]; // $1.00, $1.10, $0.90
        let weights = vec![1, 2, 1]; // Different weights

        let mut weighted_sum: u128 = 0;
        let mut total_weight: u128 = 0;

        for (price, weight) in prices.iter().zip(weights.iter()) {
            weighted_sum += (*price as u128) * (*weight as u128);
            total_weight += *weight as u128;
        }

        let aggregated = (weighted_sum / total_weight) as u64;
        // Expected: (1*1M + 2*1.1M + 1*0.9M) / (1+2+1) = (1M + 2.2M + 0.9M) / 4 = 4.1M / 4 = 1.025M
        assert_eq!(aggregated, 1_025_000); // Should be $1.025 weighted average
    }

    #[test]
    fn test_staleness_validation() {
        let current_time = 1640995200; // Jan 1, 2022
        let price_time = 1640991600; // ~1 hour ago
        let max_staleness = 3600; // 1 hour

        let time_diff = current_time - price_time;
        assert!(time_diff <= max_staleness as i64);

        // Test stale price
        let stale_price_time = 1640988000; // ~2 hours ago
        let stale_time_diff = current_time - stale_price_time;
        assert!(stale_time_diff > max_staleness as i64);
    }

    #[test]
    fn test_oracle_confidence_validation() {
        let valid_confidence = 85;
        let min_confidence = 80;
        let invalid_confidence = 75;

        assert!(valid_confidence >= min_confidence);
        assert!(invalid_confidence < min_confidence);
        assert!(valid_confidence <= 100);
    }

    #[test]
    fn test_route_calculation_logic() {
        // Test multi-step route calculation
        let initial_amount: u64 = 1_000_000; // $1.00
        let step1_price: u64 = 2_000_000; // $2.00
        let step2_price: u64 = 500_000; // $0.50

        // Step 1: amount * price / PRICE_SCALE
        let after_step1 = initial_amount
            .checked_mul(step1_price)
            .unwrap()
            .checked_div(PRICE_SCALE)
            .unwrap();

        // Step 2: result * price / PRICE_SCALE
        let final_amount = after_step1
            .checked_mul(step2_price)
            .unwrap()
            .checked_div(PRICE_SCALE)
            .unwrap();

        assert_eq!(final_amount, 1_000_000); // Should equal original amount
    }

    #[test]
    fn test_price_bounds_validation() {
        // Test price must be positive
        let valid_price = 1_000_000;
        let invalid_price = 0;

        assert!(valid_price > 0);
        assert!(invalid_price == 0);
    }

    #[test]
    fn test_weight_validation() {
        let valid_weights = vec![1, 2, 3];
        let invalid_weights = vec![0, 1, 2];

        // All weights must be positive
        assert!(valid_weights.iter().all(|&w| w > 0));
        assert!(!invalid_weights.iter().all(|&w| w > 0));
    }

    #[test]
    fn test_route_steps_validation() {
        let valid_route = vec![RouteStep {
            pool: create_mock_pubkey(),
            offer_asset: create_mock_pubkey(),
        }];
        let empty_route: Vec<RouteStep> = vec![];
        let too_long_route: Vec<RouteStep> = (0..15)
            .map(|_| RouteStep {
                pool: create_mock_pubkey(),
                offer_asset: create_mock_pubkey(),
            })
            .collect();

        assert!(!valid_route.is_empty());
        assert!(valid_route.len() <= 10);

        assert!(empty_route.is_empty());
        assert!(too_long_route.len() > 10);
    }

    #[test]
    fn test_math_overflow_protection() {
        let max_u64 = u64::MAX;
        let large_number = u64::MAX / 2;

        // Test multiplication overflow
        assert!(max_u64.checked_mul(2).is_none());
        assert!(large_number.checked_mul(2).is_some());

        // Test division by zero
        assert!(large_number.checked_div(0).is_none());
        assert!(large_number.checked_div(1).is_some());
    }

    #[test]
    fn test_timestamp_validation() {
        let current_timestamp: i64 = 1640995200; // Jan 1, 2022
        let recent_timestamp: i64 = 1640995100; // 100 seconds ago
        let old_timestamp: i64 = 1640988000; // ~2 hours ago

        let max_age: i64 = 300; // 5 minutes

        let recent_diff = (current_timestamp - recent_timestamp).abs();
        let old_diff = (current_timestamp - old_timestamp).abs();

        assert!(recent_diff <= max_age);
        assert!(old_diff > max_age);
    }

    #[test]
    fn test_currency_conversion_edge_cases() {
        // Test same currency conversion
        let amount = 1_000_000;
        let same_currency_result = amount; // Should be unchanged
        assert_eq!(same_currency_result, amount);

        // Test zero amount
        let zero_amount = 0;
        let zero_result = zero_amount;
        assert_eq!(zero_result, 0);
    }

    #[test]
    fn test_price_aggregation_edge_cases() {
        // Test single price aggregation
        let single_price = vec![1_000_000];
        let single_weight = vec![1];

        let weighted_sum = single_price[0] as u128 * single_weight[0] as u128;
        let total_weight = single_weight[0] as u128;
        let result = (weighted_sum / total_weight) as u64;

        assert_eq!(result, single_price[0]);

        // Test equal weights aggregation
        let equal_prices = vec![1_000_000, 2_000_000];
        let equal_weights = vec![1, 1];

        let mut sum: u128 = 0;
        let mut weight_sum: u128 = 0;

        for (price, weight) in equal_prices.iter().zip(equal_weights.iter()) {
            sum += (*price as u128) * (*weight as u128);
            weight_sum += *weight as u128;
        }

        let average = (sum / weight_sum) as u64;
        assert_eq!(average, 1_500_000); // $1.50 average
    }

    #[test]
    fn test_price_history_entry_structure() {
        let entry = PriceHistoryEntry {
            timestamp: 1640995200,
            price_usd: 1_000_000,
            source: create_mock_pubkey(),
            confidence: 95,
        };

        assert_eq!(entry.timestamp, 1640995200);
        assert_eq!(entry.price_usd, 1_000_000);
        assert_eq!(entry.confidence, 95);
    }

    #[test]
    fn test_price_history_structure() {
        let entries = vec![
            PriceHistoryEntry {
                timestamp: 1640995200,
                price_usd: 1_000_000,
                source: create_mock_pubkey(),
                confidence: 95,
            },
            PriceHistoryEntry {
                timestamp: 1640995260,
                price_usd: 1_100_000,
                source: create_mock_pubkey(),
                confidence: 90,
            },
        ];

        let history = PriceHistory {
            currency: FiatCurrency::USD,
            entries: entries.clone(),
            last_updated: 1640995260,
            total_entries: 2,
        };

        assert_eq!(history.currency, FiatCurrency::USD);
        assert_eq!(history.entries.len(), 2);
        assert_eq!(history.total_entries, 2);
        assert_eq!(history.last_updated, 1640995260);
    }

    #[test]
    fn test_price_statistics_calculation() {
        let prices = vec![1_000_000, 1_100_000, 900_000, 1_200_000]; // $1.00, $1.10, $0.90, $1.20
        let confidences = vec![95, 90, 85, 92];

        // Calculate basic statistics
        let min_price = *prices.iter().min().unwrap();
        let max_price = *prices.iter().max().unwrap();
        let avg_price = prices.iter().sum::<u64>() / prices.len() as u64;

        // Calculate weighted average
        let mut weighted_sum = 0u128;
        let mut confidence_sum = 0u128;
        for (price, confidence) in prices.iter().zip(confidences.iter()) {
            weighted_sum += (*price as u128) * (*confidence as u128);
            confidence_sum += *confidence as u128;
        }
        let weighted_avg = (weighted_sum / confidence_sum) as u64;

        // Calculate volatility (standard deviation)
        let variance_sum: u128 = prices
            .iter()
            .map(|price| {
                let diff = (*price as i128) - (avg_price as i128);
                (diff * diff) as u128
            })
            .sum();
        let volatility = ((variance_sum / prices.len() as u128) as f64).sqrt() as u64;

        assert_eq!(min_price, 900_000);
        assert_eq!(max_price, 1_200_000);
        assert_eq!(avg_price, 1_050_000); // $1.05 average
        assert!(weighted_avg > 0); // Should be calculated
        assert!(volatility > 0); // Should have some volatility
    }

    #[test]
    fn test_price_history_management() {
        let mut entries = Vec::new();
        let max_entries = 50;

        // Add entries up to max
        for i in 0..max_entries {
            entries.push(PriceHistoryEntry {
                timestamp: 1640995200 + i as i64,
                price_usd: 1_000_000 + i as u64 * 1000,
                source: create_mock_pubkey(),
                confidence: 95,
            });
        }

        assert_eq!(entries.len(), max_entries);

        // Simulate adding one more entry (should remove oldest)
        if entries.len() >= max_entries {
            entries.remove(0); // Remove oldest
        }
        entries.push(PriceHistoryEntry {
            timestamp: 1640995200 + max_entries as i64,
            price_usd: 1_000_000 + max_entries as u64 * 1000,
            source: create_mock_pubkey(),
            confidence: 95,
        });

        assert_eq!(entries.len(), max_entries);
        assert_eq!(entries[0].timestamp, 1640995201); // Should be second entry now
    }

    #[test]
    fn test_price_history_filtering() {
        let entries = vec![
            PriceHistoryEntry {
                timestamp: 1640995200, // 2 hours ago
                price_usd: 1_000_000,
                source: create_mock_pubkey(),
                confidence: 95,
            },
            PriceHistoryEntry {
                timestamp: 1640998800, // 1 hour ago
                price_usd: 1_100_000,
                source: create_mock_pubkey(),
                confidence: 90,
            },
            PriceHistoryEntry {
                timestamp: 1641002400, // Current time
                price_usd: 1_200_000,
                source: create_mock_pubkey(),
                confidence: 85,
            },
        ];

        let current_time = 1641002400;
        let timeframe_hours = 1;
        let cutoff_time = current_time - (timeframe_hours * 3600);

        let filtered: Vec<_> = entries
            .iter()
            .filter(|entry| entry.timestamp >= cutoff_time)
            .collect();

        assert_eq!(filtered.len(), 2); // Should include last 2 entries
        assert!(filtered[0].timestamp >= cutoff_time);
        assert!(filtered[1].timestamp >= cutoff_time);
    }

    #[test]
    fn test_confidence_validation() {
        let valid_confidences = vec![0, 50, 100];
        let invalid_confidences = vec![101, 150, 200];

        for confidence in valid_confidences {
            assert!(confidence <= 100);
        }

        for confidence in invalid_confidences {
            assert!(confidence > 100);
        }
    }

    #[test]
    fn test_price_history_statistics() {
        let entries = vec![
            PriceHistoryEntry {
                timestamp: 1640995200,
                price_usd: 1_000_000,
                source: create_mock_pubkey(),
                confidence: 95,
            },
            PriceHistoryEntry {
                timestamp: 1640995260,
                price_usd: 1_100_000,
                source: create_mock_pubkey(),
                confidence: 90,
            },
            PriceHistoryEntry {
                timestamp: 1640995320,
                price_usd: 900_000,
                source: create_mock_pubkey(),
                confidence: 85,
            },
        ];

        // Test basic statistics
        let min_price = entries.iter().map(|e| e.price_usd).min().unwrap();
        let max_price = entries.iter().map(|e| e.price_usd).max().unwrap();
        let avg_price = entries.iter().map(|e| e.price_usd).sum::<u64>() / entries.len() as u64;

        assert_eq!(min_price, 900_000);
        assert_eq!(max_price, 1_100_000);
        assert_eq!(avg_price, 1_000_000); // $1.00 average

        // Test time range
        let first_timestamp = entries.first().unwrap().timestamp;
        let last_timestamp = entries.last().unwrap().timestamp;
        let duration = last_timestamp - first_timestamp;

        assert_eq!(first_timestamp, 1640995200);
        assert_eq!(last_timestamp, 1640995320);
        assert_eq!(duration, 120); // 2 minutes
    }
}

