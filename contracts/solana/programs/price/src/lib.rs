use anchor_lang::prelude::*;

declare_id!("FG8y6dbLj9jxitE9jbairdd79XkiyNoj8u7gRjothJiC");

#[program]
pub mod localmoney_price {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Initializing LocalMoney Price program");
        Ok(())
    }

    pub fn register_hub(ctx: Context<RegisterHub>, hub_addr: Pubkey) -> Result<()> {
        msg!("Registering Hub: {}", hub_addr);
        Ok(())
    }

    pub fn update_prices(ctx: Context<UpdatePrices>, prices: Vec<CurrencyPrice>) -> Result<()> {
        msg!("Updating prices for {} currencies", prices.len());
        Ok(())
    }

    pub fn register_price_route(
        ctx: Context<RegisterPriceRoute>,
        denom: String,
        route: Vec<PriceRoute>,
    ) -> Result<()> {
        msg!("Registering price route for denom: {}", denom);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterHub<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePrices<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterPriceRoute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CurrencyPrice {
    pub currency: [u8; 3], // 3-letter currency code
    pub usd_price: u64,    // USD price with 6 decimals
    pub updated_at: i64,   // Unix timestamp
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PriceRoute {
    pub pool: Pubkey,
    pub ask_asset: String,
    pub offer_asset: String,
}

#[account]
pub struct FiatPrice {
    pub currency: [u8; 3],
    pub usd_price: u64,
    pub updated_at: i64,
}
