use anchor_lang::prelude::*; // Added to help macro resolution

declare_id!("PricEZqVjG9t7LzLQjWJyYj1isrg6T3m21jXW3sWJGQ"); // Replace with actual Price Program ID

#[program]
pub mod price {
    use super::*;
    use crate::PriceError; // This one should be kept

    pub fn initialize_price_global_state(
        ctx: Context<InitializePriceGlobalState>,
        initial_price_provider: Pubkey,
    ) -> Result<()> {
        let global_state = &mut ctx.accounts.price_global_state;
        global_state.hub_address = Pubkey::default(); // Signifies not yet registered
        global_state.price_provider_authority = initial_price_provider;
        global_state.bump = ctx.bumps.price_global_state;
        Ok(())
    }

    pub fn register_hub_for_price(
        ctx: Context<RegisterHubForPrice>,
        hub_address_arg: Pubkey,
    ) -> Result<()> {
        require!(
            ctx.accounts.price_global_state.hub_address == Pubkey::default(),
            PriceError::HubAlreadyRegistered
        );
        // TODO: Add authority checks for who can call this (e.g., Hub program via CPI or Hub admin).
        // For now, assumes the 'authority' in RegisterHubForPrice context is authorized.
        ctx.accounts.price_global_state.hub_address = hub_address_arg;
        Ok(())
    }

    pub fn update_fiat_price(
        ctx: Context<UpdateFiatPrice>,
        fiat_currency_arg: String,
        usd_price_arg: u64,
        decimals_arg: u8,
    ) -> Result<()> {
        require!(
            ctx.accounts.price_global_state.hub_address != Pubkey::default(),
            PriceError::HubNotRegistered
        );
        require_keys_eq!(
            ctx.accounts.price_provider.key(),
            ctx.accounts.price_global_state.price_provider_authority,
            PriceError::NotPriceProvider
        );

        let fiat_price_account = &mut ctx.accounts.fiat_price_account;

        // If the account is being initialized by init_if_needed
        if fiat_price_account.updated_at_timestamp == 0 {
            // A common way to check if it's fresh from init
            fiat_price_account.fiat_currency = fiat_currency_arg;
            fiat_price_account.bump = ctx.bumps.fiat_price_account;
        } else {
            // Ensure the provided fiat_currency_arg matches the one in the existing account (important for PDA derivation)
            if fiat_price_account.fiat_currency != fiat_currency_arg {
                msg!("Fiat currency mismatch for update.");
                return err!(PriceError::FiatCurrencyTooLong);
            }
        }

        fiat_price_account.usd_price = usd_price_arg;
        fiat_price_account.decimals = decimals_arg;
        fiat_price_account.updated_at_timestamp = Clock::get()?.unix_timestamp as u64;

        msg!(
            "Fiat price updated for {}: {} ({} decimals) at {}",
            fiat_price_account.fiat_currency,
            fiat_price_account.usd_price,
            fiat_price_account.decimals,
            fiat_price_account.updated_at_timestamp
        );
        Ok(())
    }

    pub fn register_price_route_for_denom(
        ctx: Context<RegisterPriceRouteForDenom>,
        denom_arg: String,
        route_steps_arg: Vec<PriceRouteStep>,
    ) -> Result<()> {
        require!(
            ctx.accounts.price_global_state.hub_address != Pubkey::default(),
            PriceError::HubNotRegistered
        );
        // TODO: Authorization: Verify ctx.accounts.hub_admin_authority.key() is the actual Hub Admin.
        // This might involve checking against a list/PDA in the Hub program, or if Hub program CPIs, checking its signature.
        // For now, we assume hub_admin_authority signer is the authorized Hub Admin.

        // Validate route_steps_arg length against DenomPriceRoute::INIT_SPACE constraints if not using realloc
        // The #[max_len(5)] on DenomPriceRoute.route_steps in struct definition handles this for InitSpace.
        if route_steps_arg.len() > 5 {
            // Max 5 steps as defined in DenomPriceRoute struct with InitSpace
            return err!(PriceError::PriceRouteTooLong);
        }

        let denom_price_route_account = &mut ctx.accounts.denom_price_route_account;

        if denom_price_route_account.route_steps.is_empty()
            && denom_price_route_account.denom.is_empty()
        {
            // Heuristic for first init by init_if_needed
            denom_price_route_account.denom = denom_arg;
            denom_price_route_account.bump = ctx.bumps.denom_price_route_account;
        } else {
            // require_string_eq!(
            //     &denom_price_route_account.denom,
            //     &denom_arg,
            //     PriceError::DenomTooLong,
            //     "Denom mismatch for update."
            // );
            if denom_price_route_account.denom != denom_arg {
                msg!("Denom mismatch for update.");
                return err!(PriceError::DenomTooLong);
            }
        }

        denom_price_route_account.route_steps = route_steps_arg;

        msg!(
            "Price route registered for denom {}: with {} steps",
            denom_price_route_account.denom,
            denom_price_route_account.route_steps.len()
        );
        Ok(())
    }

    pub fn calculate_and_store_price(
        ctx: Context<CalculateAndStorePrice>,
        denom_symbol_arg: String,
        fiat_symbol_arg: String,
    ) -> Result<()> {
        let denom_price_route = &ctx.accounts.denom_price_route;

        let route_step = denom_price_route
            .route_steps
            .get(0)
            .ok_or_else(|| error!(PriceError::PriceRouteStepNotFound))?;

        require!(
            denom_price_route.denom == denom_symbol_arg,
            PriceError::DenomMismatch
        );

        let base_asset_on_chain_symbol = &route_step.ask_asset_denom;

        // Placeholder for actual CPI to the DEX pool (route_step.pool_address)
        let dex_output_price: u64 = 50000_000000; // e.g., 50,000 units of base_asset_on_chain per unit of denom_symbol_arg, scaled by 10^6
        let dex_output_decimals: u8 = 6;

        let base_asset_fiat_price_account = &ctx.accounts.base_asset_fiat_price;
        require!(
            base_asset_fiat_price_account.fiat_currency == *base_asset_on_chain_symbol,
            PriceError::CurrencyMismatch
        );
        let usd_per_base_asset: u64 = base_asset_fiat_price_account.usd_price;
        let base_asset_usd_decimals: u8 = base_asset_fiat_price_account.decimals;

        let target_fiat_price_account = &ctx.accounts.target_fiat_price;
        require!(
            target_fiat_price_account.fiat_currency == fiat_symbol_arg,
            PriceError::CurrencyMismatch
        );
        let usd_per_target_fiat: u64 = target_fiat_price_account.usd_price;
        let target_fiat_usd_decimals: u8 = target_fiat_price_account.decimals;

        let final_price_decimals: u8 = 6;

        let numerator_p1: u128 = (dex_output_price as u128)
            .checked_mul(usd_per_base_asset as u128)
            .ok_or_else(|| error!(PriceError::NumericError))?;
        let numerator_p2: u128 = u128::pow(10, target_fiat_usd_decimals as u32)
            .checked_mul(u128::pow(10, final_price_decimals as u32))
            .ok_or_else(|| error!(PriceError::NumericError))?;
        let numerator: u128 = numerator_p1
            .checked_mul(numerator_p2)
            .ok_or_else(|| error!(PriceError::NumericError))?;

        let denominator_p1: u128 = usd_per_target_fiat as u128;
        let denominator_p2: u128 = u128::pow(10, dex_output_decimals as u32)
            .checked_mul(u128::pow(10, base_asset_usd_decimals as u32))
            .ok_or_else(|| error!(PriceError::NumericError))?;
        let denominator: u128 = denominator_p1
            .checked_mul(denominator_p2)
            .ok_or_else(|| error!(PriceError::NumericError))?;

        require!(denominator != 0, PriceError::NumericError);

        let final_calculated_price_u128 = numerator
            .checked_div(denominator)
            .ok_or_else(|| error!(PriceError::NumericError))?;

        require!(
            final_calculated_price_u128 <= u64::MAX as u128,
            PriceError::NumericError
        );
        let final_calculated_price = final_calculated_price_u128 as u64;

        let calculated_price_account = &mut ctx.accounts.calculated_price_account;
        if calculated_price_account.last_updated_at_timestamp == 0 {
            calculated_price_account.denom_symbol = denom_symbol_arg.clone(); // Use clone if original is moved/borrowed elsewhere
            calculated_price_account.fiat_symbol = fiat_symbol_arg.clone();
            calculated_price_account.bump = ctx.bumps.calculated_price_account;
        } else {
            require!(
                calculated_price_account.denom_symbol == denom_symbol_arg,
                PriceError::DenomMismatch
            );
            require!(
                calculated_price_account.fiat_symbol == fiat_symbol_arg,
                PriceError::CurrencyMismatch
            );
        }

        calculated_price_account.price = final_calculated_price;
        calculated_price_account.decimals = final_price_decimals;
        calculated_price_account.last_updated_at_timestamp = Clock::get()?.unix_timestamp as u64;
        calculated_price_account.source_dex_pool = route_step.pool_address;

        msg!(
            "Calculated price for {}/{}: {} ({} decimals) using pool {}. Updated at: {}",
            calculated_price_account.denom_symbol,
            calculated_price_account.fiat_symbol,
            calculated_price_account.price,
            calculated_price_account.decimals,
            calculated_price_account.source_dex_pool,
            calculated_price_account.last_updated_at_timestamp
        );

        Ok(())
    }

    // Instructions like update_prices, register_price_route_for_denom
    // will be added in subsequent tasks.
}

// Account to store global state for the Price program, like the Hub address.
// PDA seeds: [b"price_global_state"]
#[account]
pub struct PriceGlobalState {
    pub hub_address: Pubkey, // Address of the central Hub program, Pubkey::default() if not registered
    pub price_provider_authority: Pubkey, // Authority allowed to call UpdatePrices
    pub bump: u8,            // PDA bump seed
}

impl PriceGlobalState {
    // Anchor discriminator + Pubkey (hub) + Pubkey (provider) + u8 (bump)
    pub const SPACE: usize = 8 + 32 + 32 + 1;
}

// Account storing the USD price for a specific fiat currency.
// PDA seeds: [b"fiat_price", fiat_currency.as_bytes()]
#[account]
#[derive(InitSpace)]
pub struct FiatPrice {
    #[max_len(8)] // e.g., "USD", "EUR"
    pub fiat_currency: String, // The fiat currency code (also part of seed)
    pub usd_price: u64, // Price in USD, scaled (e.g., 1 EUR = 1.08 USD, store 1080000 if 6 decimal places)
    pub decimals: u8,   // Number of decimal places for usd_price
    pub updated_at_timestamp: u64, // Last update timestamp (Unix)
    pub bump: u8,
}

// A single step in a price conversion route through a DEX pool.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq, InitSpace)]
pub struct PriceRouteStep {
    pub pool_address: Pubkey, // Address of the liquidity pool/DEX program
    #[max_len(16)] // e.g., "SOL", "USDC"
    pub offer_asset_denom: String, // Denom of the asset being offered to the pool
    #[max_len(16)]
    pub ask_asset_denom: String, // Denom of the asset being asked from the pool
}

// Account storing the conversion route for a specific on-chain asset (denom).
// PDA seeds: [b"denom_route", denom.as_bytes()]
#[account]
#[derive(InitSpace)]
pub struct DenomPriceRoute {
    #[max_len(16)] // e.g., "USDC", "wETH"
    pub denom: String, // The on-chain asset (also part of seed)
    #[max_len(5)] // Max 5 steps in a route
    pub route_steps: Vec<PriceRouteStep>,
    pub bump: u8,
}

// Add new CalculatedPriceAccount struct here
#[account]
#[derive(InitSpace)]
pub struct CalculatedPriceAccount {
    #[max_len(16)] // Should match DenomPriceRoute.denom max_len
    pub denom_symbol: String,
    #[max_len(8)] // Should match FiatPrice.fiat_currency max_len
    pub fiat_symbol: String,
    pub price: u64,
    pub decimals: u8,
    pub last_updated_at_timestamp: u64,
    pub source_dex_pool: Pubkey,
    pub bump: u8,
}

#[error_code]
pub enum PriceError {
    #[msg("Hub already registered for Price program.")]
    HubAlreadyRegistered,
    #[msg("Hub not registered for Price program. Cannot perform action.")]
    HubNotRegistered,
    #[msg("Unauthorized: Caller is not the price provider authority.")]
    NotPriceProvider,
    #[msg("Unauthorized: Caller is not the Hub admin.")]
    NotHubAdmin,
    #[msg("Fiat currency string is too long.")]
    FiatCurrencyTooLong,
    #[msg("Denom string is too long.")]
    DenomTooLong,
    #[msg("Price route steps vector is too long.")]
    PriceRouteTooLong,
    #[msg("Invalid price route step configuration.")]
    InvalidPriceRouteStep,
    #[msg("Numeric overflow/underflow operation failed.")]
    NumericError,
    #[msg("Failed to simulate swap via CPI.")]
    SwapSimulationFailed,
    // Add new error variants here
    #[msg("Input denom symbol does not match the route's denom symbol.")]
    DenomMismatch,
    #[msg("Currency symbol mismatch in provided price accounts.")]
    CurrencyMismatch,
    #[msg("Price route step not found or route is empty.")]
    PriceRouteStepNotFound,
}

#[derive(Accounts)]
#[instruction(initial_price_provider: Pubkey)]
pub struct InitializePriceGlobalState<'info> {
    #[account(
        init,
        payer = authority,
        space = PriceGlobalState::SPACE,
        seeds = [b"price_global_state"],
        bump
    )]
    pub price_global_state: Account<'info, PriceGlobalState>,
    #[account(mut)]
    pub authority: Signer<'info>, // Typically the overall system deployer/admin
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterHubForPrice<'info> {
    #[account(
        mut,
        seeds = [b"price_global_state"],
        bump = price_global_state.bump
    )]
    pub price_global_state: Account<'info, PriceGlobalState>,
    // This authority should be the Hub program admin or the Hub program via CPI.
    // For now, a generic signer is used.
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(fiat_currency_arg: String, usd_price_arg: u64, decimals_arg: u8)]
pub struct UpdateFiatPrice<'info> {
    #[account(
        init_if_needed,
        payer = price_provider, // The price provider pays for account creation/rent
        space = 8 + FiatPrice::INIT_SPACE, // 8 for discriminator
        seeds = [b"fiat_price", fiat_currency_arg.as_bytes()],
        bump
    )]
    pub fiat_price_account: Account<'info, FiatPrice>,

    #[account(mut)] // Provider needs to sign and pay
    pub price_provider: Signer<'info>,

    #[account(
        seeds = [b"price_global_state"],
        bump = price_global_state.bump
    )]
    pub price_global_state: Account<'info, PriceGlobalState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(denom_arg: String, route_steps_arg: Vec<PriceRouteStep>)]
pub struct RegisterPriceRouteForDenom<'info> {
    #[account(
        init_if_needed,
        payer = hub_admin_authority, // Hub admin pays for account creation/rent
        space = 8 + DenomPriceRoute::INIT_SPACE, // Adjust if Vec realloc is complex; INIT_SPACE assumes max_len for Vec
        seeds = [b"denom_route", denom_arg.as_bytes()],
        bump
    )]
    pub denom_price_route_account: Account<'info, DenomPriceRoute>,

    #[account(mut)] // Hub Admin needs to sign and pay
    pub hub_admin_authority: Signer<'info>,

    #[account(
        seeds = [b"price_global_state"],
        bump = price_global_state.bump
    )]
    pub price_global_state: Account<'info, PriceGlobalState>,
    pub system_program: Program<'info, System>,
}

// Add new CalculateAndStorePrice Accounts struct here
#[derive(Accounts)]
#[instruction(denom_symbol_arg: String, fiat_symbol_arg: String)]
pub struct CalculateAndStorePrice<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [b"denom_route", denom_symbol_arg.as_bytes()],
        bump = denom_price_route.bump
    )]
    pub denom_price_route: Account<'info, DenomPriceRoute>,

    // Client must provide the FiatPrice account for the base_asset_on_chain (from denom_price_route.route_steps[0].ask_asset_denom).
    // Instruction will verify base_asset_fiat_price.fiat_currency == route_step.ask_asset_denom.
    pub base_asset_fiat_price: Account<'info, FiatPrice>,

    #[account(
        seeds = [b"fiat_price", fiat_symbol_arg.as_bytes()],
        bump = target_fiat_price.bump
    )]
    pub target_fiat_price: Account<'info, FiatPrice>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + CalculatedPriceAccount::INIT_SPACE,
        seeds = [
            b"calc_price",
            denom_symbol_arg.as_bytes(),
            fiat_symbol_arg.as_bytes()
        ],
        bump
    )]
    pub calculated_price_account: Account<'info, CalculatedPriceAccount>,

    // TODO: Add accounts for DEX CPI if/when implemented
    // pub dex_program: Program<'info, InterfaceToDex>,
    // pub dex_pool_account: AccountInfo<'info>, // Needs to match route_step.pool_address
    pub system_program: Program<'info, System>,
}
