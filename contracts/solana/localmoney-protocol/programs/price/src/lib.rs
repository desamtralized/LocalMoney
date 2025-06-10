use anchor_lang::prelude::*;
use shared_types::{
    FiatCurrency, LocalMoneyErrorCode, RouteStep, CONFIG_SEED, CURRENCY_PRICE_SEED,
    PRICE_ROUTE_SEED,
};

declare_id!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

#[program]
pub mod price {
    use super::*;

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

// Instruction contexts

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
