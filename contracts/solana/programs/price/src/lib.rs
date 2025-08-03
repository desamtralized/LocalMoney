#![allow(unexpected_cfgs)]
#![allow(deprecated)]
use anchor_lang::prelude::*;

declare_id!("GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL");

#[program]
pub mod price {
    use super::*;

    pub fn initialize(ctx: Context<InitializePrices>) -> Result<()> {
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
        let price_feed = &mut ctx.accounts.price_feed;
        price_feed.authority = ctx.accounts.authority.key();
        price_feed.fiat_currency = fiat_currency;
        price_feed.price_per_token = price_per_token;
        price_feed.decimals = decimals;
        price_feed.last_updated = Clock::get()?.unix_timestamp as u64;
        price_feed.bump = ctx.bumps.price_feed;

        Ok(())
    }

    pub fn get_price(
        ctx: Context<GetPrice>,
        _mint: Pubkey,
        fiat_currency: FiatCurrency,
    ) -> Result<u64> {
        let price_feed = &ctx.accounts.price_feed;
        require!(
            price_feed.fiat_currency == fiat_currency,
            ErrorCode::InvalidCurrency
        );

        // Return price scaled by decimals
        Ok(price_feed.price_per_token)
    }
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
        seeds = [b"price".as_ref(), fiat_currency.to_string().as_bytes()],
        bump
    )]
    pub price_feed: Account<'info, PriceFeed>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(_mint: Pubkey, fiat_currency: FiatCurrency)]
pub struct GetPrice<'info> {
    #[account(
        seeds = [b"price".as_ref(), fiat_currency.to_string().as_bytes()],
        bump = price_feed.bump
    )]
    pub price_feed: Account<'info, PriceFeed>,
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

// Reuse common types from profile program
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum FiatCurrency {
    USD,
    EUR,
    GBP,
    CAD,
    AUD,
    JPY,
    BRL,
    MXN,
    ARS,
    CLP,
    COP,
    NGN,
    THB,
    VES,
}

impl std::fmt::Display for FiatCurrency {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FiatCurrency::USD => write!(f, "USD"),
            FiatCurrency::EUR => write!(f, "EUR"),
            FiatCurrency::GBP => write!(f, "GBP"),
            FiatCurrency::CAD => write!(f, "CAD"),
            FiatCurrency::AUD => write!(f, "AUD"),
            FiatCurrency::JPY => write!(f, "JPY"),
            FiatCurrency::BRL => write!(f, "BRL"),
            FiatCurrency::MXN => write!(f, "MXN"),
            FiatCurrency::ARS => write!(f, "ARS"),
            FiatCurrency::CLP => write!(f, "CLP"),
            FiatCurrency::COP => write!(f, "COP"),
            FiatCurrency::NGN => write!(f, "NGN"),
            FiatCurrency::THB => write!(f, "THB"),
            FiatCurrency::VES => write!(f, "VES"),
        }
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid currency for this price feed")]
    InvalidCurrency,
}
