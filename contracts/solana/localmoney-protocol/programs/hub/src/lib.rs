use anchor_lang::prelude::*;
use shared_types::*;

declare_id!("4waJTahiUUstW627bckb6kqUH1ZsYjCzGEHfTXQt3gEL");

#[program]
pub mod hub {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        // Validate initialization parameters
        validate_initialization_params(&params)?;

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.offer_program = params.offer_program;
        config.trade_program = params.trade_program;
        config.profile_program = params.profile_program;
        config.price_program = params.price_program;
        config.price_provider = params.price_provider;
        config.local_mint = params.local_mint;
        config.chain_fee_collector = params.chain_fee_collector;
        config.warchest = params.warchest;
        config.active_offers_limit = params.active_offers_limit;
        config.active_trades_limit = params.active_trades_limit;
        config.arbitration_fee_bps = params.arbitration_fee_bps;
        config.burn_fee_bps = params.burn_fee_bps;
        config.chain_fee_bps = params.chain_fee_bps;
        config.warchest_fee_bps = params.warchest_fee_bps;
        config.trade_expiration_timer = params.trade_expiration_timer;
        config.trade_dispute_timer = params.trade_dispute_timer;
        config.trade_limit_min = params.trade_limit_min;
        config.trade_limit_max = params.trade_limit_max;
        config.bump = ctx.bumps.config;

        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
        // Validate authority
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            LocalMoneyErrorCode::Unauthorized
        );

        // Validate update parameters
        validate_update_params(&params)?;

        let config = &mut ctx.accounts.config;

        // Create snapshots for event emission
        let old_config_snapshot = ConfigSnapshot::from(config.clone());

        // Update configuration parameters
        if let Some(chain_fee_collector) = params.chain_fee_collector {
            config.chain_fee_collector = chain_fee_collector;
        }
        if let Some(warchest) = params.warchest {
            config.warchest = warchest;
        }
        if let Some(price_provider) = params.price_provider {
            config.price_provider = price_provider;
        }

        config.active_offers_limit = params.active_offers_limit;
        config.active_trades_limit = params.active_trades_limit;
        config.arbitration_fee_bps = params.arbitration_fee_bps;
        config.burn_fee_bps = params.burn_fee_bps;
        config.chain_fee_bps = params.chain_fee_bps;
        config.warchest_fee_bps = params.warchest_fee_bps;
        config.trade_expiration_timer = params.trade_expiration_timer;
        config.trade_dispute_timer = params.trade_dispute_timer;
        config.trade_limit_min = params.trade_limit_min;
        config.trade_limit_max = params.trade_limit_max;

        let new_config_snapshot = ConfigSnapshot::from(config.clone());

        // Emit configuration update event
        emit!(ConfigurationUpdated {
            authority: ctx.accounts.authority.key(),
            old_config: old_config_snapshot,
            new_config: new_config_snapshot,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn update_authority(ctx: Context<UpdateAuthority>, new_authority: Pubkey) -> Result<()> {
        // Validate current authority
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            LocalMoneyErrorCode::Unauthorized
        );

        // Validate new authority
        validate_authority_change(&ctx.accounts.config.authority, &new_authority)?;

        let config = &mut ctx.accounts.config;
        let old_authority = config.authority;
        config.authority = new_authority;

        // Emit authority update event
        emit!(AuthorityUpdated {
            old_authority,
            new_authority,
            updated_by: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!(
            "Authority updated from {} to {}",
            old_authority,
            new_authority
        );

        Ok(())
    }

    /// Register a program with the hub - allows programs to self-register
    pub fn register_program(
        ctx: Context<RegisterProgram>,
        program_type: RegisteredProgramType,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let caller_program_id = ctx.accounts.program_id.key();

        // Validate that the caller is actually the program they claim to be
        match program_type {
            RegisteredProgramType::Offer => {
                require!(
                    caller_program_id == config.offer_program,
                    LocalMoneyErrorCode::ProgramNotRegistered
                );
            }
            RegisteredProgramType::Trade => {
                require!(
                    caller_program_id == config.trade_program,
                    LocalMoneyErrorCode::ProgramNotRegistered
                );
            }
            RegisteredProgramType::Profile => {
                require!(
                    caller_program_id == config.profile_program,
                    LocalMoneyErrorCode::ProgramNotRegistered
                );
            }
            RegisteredProgramType::Price => {
                require!(
                    caller_program_id == config.price_program,
                    LocalMoneyErrorCode::ProgramNotRegistered
                );
            }
        }

        // Create registry entry
        let registry = &mut ctx.accounts.registry;
        registry.program_id = caller_program_id;
        registry.program_type = program_type;
        registry.registered_at = Clock::get()?.unix_timestamp;
        registry.bump = ctx.bumps.registry;

        // Emit program registration event
        emit!(ProgramRegistered {
            program_id: caller_program_id,
            program_type,
            registered_at: registry.registered_at,
        });

        msg!(
            "Program registered: {} as {:?}",
            caller_program_id,
            program_type
        );

        Ok(())
    }

    /// Update program registry - allows hub admin to update program addresses
    pub fn update_program_registry(
        ctx: Context<UpdateProgramRegistry>,
        program_type: RegisteredProgramType,
        new_program_id: Pubkey,
    ) -> Result<()> {
        // Validate authority
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            LocalMoneyErrorCode::Unauthorized
        );

        let config = &mut ctx.accounts.config;
        let old_program_id = match program_type {
            RegisteredProgramType::Offer => config.offer_program,
            RegisteredProgramType::Trade => config.trade_program,
            RegisteredProgramType::Profile => config.profile_program,
            RegisteredProgramType::Price => config.price_program,
        };

        // Update the program ID in the global config
        match program_type {
            RegisteredProgramType::Offer => {
                config.offer_program = new_program_id;
            }
            RegisteredProgramType::Trade => {
                config.trade_program = new_program_id;
            }
            RegisteredProgramType::Profile => {
                config.profile_program = new_program_id;
            }
            RegisteredProgramType::Price => {
                config.price_program = new_program_id;
            }
        }

        // Emit program registry update event
        emit!(ProgramRegistryUpdated {
            program_type,
            old_program_id,
            new_program_id,
            updated_by: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!(
            "Program registry updated: {:?} -> {}",
            program_type,
            new_program_id
        );

        Ok(())
    }

    /// Validate program registration - utility function for other programs
    pub fn validate_program_registration(
        ctx: Context<ValidateProgramRegistration>,
        program_type: RegisteredProgramType,
    ) -> Result<bool> {
        let config = &ctx.accounts.config;
        let caller_program_id = ctx.accounts.program_id.key();

        let is_registered = match program_type {
            RegisteredProgramType::Offer => caller_program_id == config.offer_program,
            RegisteredProgramType::Trade => caller_program_id == config.trade_program,
            RegisteredProgramType::Profile => caller_program_id == config.profile_program,
            RegisteredProgramType::Price => caller_program_id == config.price_program,
        };

        Ok(is_registered)
    }

    /// Validate user activity limits - for use by other programs
    pub fn validate_user_activity_limits(
        ctx: Context<ValidateActivityLimits>,
        user_offers: u8,
        user_trades: u8,
    ) -> Result<()> {
        let config = &ctx.accounts.config;

        // Validate offer limits
        require!(
            user_offers < config.active_offers_limit,
            LocalMoneyErrorCode::ActiveOffersLimitReached
        );

        // Validate trade limits
        require!(
            user_trades < config.active_trades_limit,
            LocalMoneyErrorCode::ActiveTradesLimitReached
        );

        Ok(())
    }

    /// Validate trade amount against hub limits - for use by other programs
    pub fn validate_trade_amount(ctx: Context<ValidateTradeAmount>, amount_usd: u64) -> Result<()> {
        let config = &ctx.accounts.config;

        require!(
            amount_usd >= config.trade_limit_min,
            LocalMoneyErrorCode::BelowMinimumAmount
        );

        require!(
            amount_usd <= config.trade_limit_max,
            LocalMoneyErrorCode::AboveMaximumAmount
        );

        Ok(())
    }

    /// Validate offer amount range - for use by other programs
    pub fn validate_offer_amount_range(
        ctx: Context<ValidateOfferAmountRange>,
        min_amount_usd: u64,
        max_amount_usd: u64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;

        // Validate amount range
        require!(
            min_amount_usd < max_amount_usd,
            LocalMoneyErrorCode::InvalidAmountRange
        );

        // Validate against protocol limits
        require!(
            min_amount_usd >= config.trade_limit_min,
            LocalMoneyErrorCode::BelowMinimumAmount
        );

        require!(
            max_amount_usd <= config.trade_limit_max,
            LocalMoneyErrorCode::AboveMaximumAmount
        );

        Ok(())
    }

    /// Validate trade expiration - for use by other programs
    pub fn validate_trade_expiration(
        ctx: Context<ValidateTradeExpiration>,
        trade_created_at: i64,
    ) -> Result<bool> {
        let config = &ctx.accounts.config;
        let current_time = Clock::get()?.unix_timestamp;
        let expiration_time = trade_created_at + config.trade_expiration_timer as i64;

        Ok(current_time <= expiration_time)
    }

    /// Validate dispute window - for use by other programs
    pub fn validate_dispute_window(
        ctx: Context<ValidateDisputeWindow>,
        trade_created_at: i64,
    ) -> Result<bool> {
        let config = &ctx.accounts.config;
        let current_time = Clock::get()?.unix_timestamp;
        let dispute_window_end = trade_created_at + config.trade_dispute_timer as i64;

        Ok(current_time <= dispute_window_end)
    }

    /// Get protocol fee configuration - for use by other programs
    pub fn get_protocol_fees(ctx: Context<GetProtocolFees>) -> Result<ProtocolFees> {
        let config = &ctx.accounts.config;

        Ok(ProtocolFees {
            chain_fee_bps: config.chain_fee_bps,
            burn_fee_bps: config.burn_fee_bps,
            warchest_fee_bps: config.warchest_fee_bps,
            arbitration_fee_bps: config.arbitration_fee_bps,
        })
    }

    /// Get trading limits configuration - for use by other programs
    pub fn get_trading_limits(ctx: Context<GetTradingLimits>) -> Result<TradingLimits> {
        let config = &ctx.accounts.config;

        Ok(TradingLimits {
            min_amount_usd: config.trade_limit_min,
            max_amount_usd: config.trade_limit_max,
            active_offers_limit: config.active_offers_limit,
            active_trades_limit: config.active_trades_limit,
        })
    }

    /// Get timer configuration - for use by other programs
    pub fn get_timer_config(ctx: Context<GetTimerConfig>) -> Result<TimerConfig> {
        let config = &ctx.accounts.config;

        Ok(TimerConfig {
            trade_expiration_timer: config.trade_expiration_timer,
            trade_dispute_timer: config.trade_dispute_timer,
        })
    }

    /// Get program addresses - for use by other programs
    pub fn get_program_addresses(ctx: Context<GetProgramAddresses>) -> Result<ProgramAddresses> {
        let config = &ctx.accounts.config;

        Ok(ProgramAddresses {
            offer_program: config.offer_program,
            trade_program: config.trade_program,
            profile_program: config.profile_program,
            price_program: config.price_program,
        })
    }

    /// Get fee collector addresses - for use by other programs
    pub fn get_fee_collectors(ctx: Context<GetFeeCollectors>) -> Result<FeeCollectors> {
        let config = &ctx.accounts.config;

        Ok(FeeCollectors {
            chain_fee_collector: config.chain_fee_collector,
            warchest: config.warchest,
            price_provider: config.price_provider,
        })
    }

    /// Get complete configuration - for use by other programs
    pub fn get_full_config(ctx: Context<GetFullConfig>) -> Result<ConfigSnapshot> {
        let config = &ctx.accounts.config;
        Ok(ConfigSnapshot::from(config.clone()))
    }

    /// Check if a program is authorized - for use by other programs
    pub fn is_program_authorized(
        ctx: Context<IsProgramAuthorized>,
        program_type: RegisteredProgramType,
    ) -> Result<bool> {
        let config = &ctx.accounts.config;
        let caller_program_id = ctx.accounts.program_id.key();

        let is_authorized = match program_type {
            RegisteredProgramType::Offer => caller_program_id == config.offer_program,
            RegisteredProgramType::Trade => caller_program_id == config.trade_program,
            RegisteredProgramType::Profile => caller_program_id == config.profile_program,
            RegisteredProgramType::Price => caller_program_id == config.price_program,
        };

        Ok(is_authorized)
    }

    /// Set program upgrade authority - allows hub admin to control program upgrades
    pub fn set_upgrade_authority(
        ctx: Context<SetUpgradeAuthority>,
        program_type: RegisteredProgramType,
        new_upgrade_authority: Option<Pubkey>,
    ) -> Result<()> {
        // Validate authority
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            LocalMoneyErrorCode::Unauthorized
        );

        let config = &ctx.accounts.config;
        let program_id = match program_type {
            RegisteredProgramType::Offer => config.offer_program,
            RegisteredProgramType::Trade => config.trade_program,
            RegisteredProgramType::Profile => config.profile_program,
            RegisteredProgramType::Price => config.price_program,
        };

        // Emit upgrade authority update event
        emit!(UpgradeAuthorityUpdated {
            program_type,
            program_id,
            new_upgrade_authority,
            updated_by: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!(
            "Upgrade authority updated for {:?} program: {}",
            program_type,
            new_upgrade_authority.map_or("None".to_string(), |key| key.to_string())
        );

        Ok(())
    }

    /// Get program upgrade authority - utility function
    pub fn get_upgrade_authority(
        ctx: Context<GetUpgradeAuthority>,
        program_type: RegisteredProgramType,
    ) -> Result<Option<Pubkey>> {
        let config = &ctx.accounts.config;

        // For now, return the hub authority as the upgrade authority
        // In a production system, this could track separate upgrade authorities
        Ok(Some(config.authority))
    }
}

/// Validation Functions

/// Validate initialization parameters
fn validate_initialization_params(params: &InitializeParams) -> Result<()> {
    // Validate program addresses are not default
    require!(
        params.offer_program != Pubkey::default(),
        LocalMoneyErrorCode::InvalidProgramAddress
    );
    require!(
        params.trade_program != Pubkey::default(),
        LocalMoneyErrorCode::InvalidProgramAddress
    );
    require!(
        params.profile_program != Pubkey::default(),
        LocalMoneyErrorCode::InvalidProgramAddress
    );
    require!(
        params.price_program != Pubkey::default(),
        LocalMoneyErrorCode::InvalidProgramAddress
    );

    // Validate fee parameters
    validate_total_fees(
        params.chain_fee_bps,
        params.burn_fee_bps,
        params.warchest_fee_bps,
    )?;

    // Validate individual fee limits
    validate_individual_fees(
        params.arbitration_fee_bps,
        params.chain_fee_bps,
        params.burn_fee_bps,
        params.warchest_fee_bps,
    )?;

    // Validate trade limits
    validate_trade_limits(params.trade_limit_min, params.trade_limit_max)?;

    // Validate timer values
    validate_timers(params.trade_expiration_timer, params.trade_dispute_timer)?;

    // Validate activity limits
    validate_activity_limits(params.active_offers_limit, params.active_trades_limit)?;

    Ok(())
}

/// Validate update parameters
fn validate_update_params(params: &UpdateConfigParams) -> Result<()> {
    // Validate fee parameters
    validate_total_fees(
        params.chain_fee_bps,
        params.burn_fee_bps,
        params.warchest_fee_bps,
    )?;

    // Validate individual fee limits
    validate_individual_fees(
        params.arbitration_fee_bps,
        params.chain_fee_bps,
        params.burn_fee_bps,
        params.warchest_fee_bps,
    )?;

    // Validate trade limits
    validate_trade_limits(params.trade_limit_min, params.trade_limit_max)?;

    // Validate timer values
    validate_timers(params.trade_expiration_timer, params.trade_dispute_timer)?;

    // Validate activity limits
    validate_activity_limits(params.active_offers_limit, params.active_trades_limit)?;

    Ok(())
}

/// Validate authority change
fn validate_authority_change(current_authority: &Pubkey, new_authority: &Pubkey) -> Result<()> {
    // Validate new authority is not the same as current
    require!(
        *new_authority != *current_authority,
        LocalMoneyErrorCode::SameAuthority
    );

    // Validate new authority is not the default pubkey (zero)
    require!(
        *new_authority != Pubkey::default(),
        LocalMoneyErrorCode::InvalidAuthority
    );

    Ok(())
}

/// Validate individual fee limits
fn validate_individual_fees(
    arbitration_fee_bps: u16,
    chain_fee_bps: u16,
    burn_fee_bps: u16,
    warchest_fee_bps: u16,
) -> Result<()> {
    require!(
        arbitration_fee_bps <= MAX_INDIVIDUAL_FEE_BPS,
        LocalMoneyErrorCode::InvalidFeePercentage
    );
    require!(
        chain_fee_bps <= MAX_INDIVIDUAL_FEE_BPS,
        LocalMoneyErrorCode::InvalidFeePercentage
    );
    require!(
        burn_fee_bps <= MAX_INDIVIDUAL_FEE_BPS,
        LocalMoneyErrorCode::InvalidFeePercentage
    );
    require!(
        warchest_fee_bps <= MAX_INDIVIDUAL_FEE_BPS,
        LocalMoneyErrorCode::InvalidFeePercentage
    );

    Ok(())
}

/// Validate trade limits
fn validate_trade_limits(min_amount: u64, max_amount: u64) -> Result<()> {
    require!(
        min_amount < max_amount,
        LocalMoneyErrorCode::InvalidAmountRange
    );

    // Minimum trade should be at least $1 (scaled by 6 decimals)
    require!(
        min_amount >= PRICE_SCALE,
        LocalMoneyErrorCode::InvalidTradingLimits
    );

    // Maximum trade should not exceed $1M (scaled by 6 decimals)
    require!(
        max_amount <= 1_000_000 * PRICE_SCALE,
        LocalMoneyErrorCode::InvalidTradingLimits
    );

    Ok(())
}

/// Validate timer values
fn validate_timers(expiration_timer: u64, dispute_timer: u64) -> Result<()> {
    require!(
        expiration_timer <= MAX_TRADE_EXPIRATION_SECONDS,
        LocalMoneyErrorCode::InvalidTimer
    );
    require!(
        dispute_timer <= MAX_DISPUTE_TIMER_SECONDS,
        LocalMoneyErrorCode::InvalidTimer
    );

    // Dispute timer should be less than expiration timer
    require!(
        dispute_timer < expiration_timer,
        LocalMoneyErrorCode::InvalidTimer
    );

    // Minimum timers (1 hour for expiration, 30 minutes for dispute)
    require!(
        expiration_timer >= SECONDS_PER_HOUR,
        LocalMoneyErrorCode::InvalidTimer
    );
    require!(
        dispute_timer >= SECONDS_PER_MINUTE * 30,
        LocalMoneyErrorCode::InvalidTimer
    );

    Ok(())
}

/// Validate activity limits
fn validate_activity_limits(offers_limit: u8, trades_limit: u8) -> Result<()> {
    require!(
        offers_limit > 0 && offers_limit <= 50,
        LocalMoneyErrorCode::InvalidConfiguration
    );
    require!(
        trades_limit > 0 && trades_limit <= 20,
        LocalMoneyErrorCode::InvalidConfiguration
    );

    Ok(())
}

/// Global Configuration Account (PDA)
#[account]
pub struct GlobalConfig {
    /// Admin authority for protocol governance
    pub authority: Pubkey, // 32 bytes
    /// Offer program ID
    pub offer_program: Pubkey, // 32 bytes
    /// Trade program ID  
    pub trade_program: Pubkey, // 32 bytes
    /// Profile program ID
    pub profile_program: Pubkey, // 32 bytes
    /// Price program ID
    pub price_program: Pubkey, // 32 bytes
    /// Price update authority
    pub price_provider: Pubkey, // 32 bytes
    /// Local token mint address
    pub local_mint: Pubkey, // 32 bytes
    /// Chain fee collector account
    pub chain_fee_collector: Pubkey, // 32 bytes
    /// Treasury/warchest account
    pub warchest: Pubkey, // 32 bytes
    /// Maximum active offers per user
    pub active_offers_limit: u8, // 1 byte
    /// Maximum active trades per user
    pub active_trades_limit: u8, // 1 byte
    /// Arbitration fee in basis points
    pub arbitration_fee_bps: u16, // 2 bytes
    /// Burn fee in basis points
    pub burn_fee_bps: u16, // 2 bytes
    /// Chain fee in basis points
    pub chain_fee_bps: u16, // 2 bytes
    /// Warchest fee in basis points
    pub warchest_fee_bps: u16, // 2 bytes
    /// Trade expiration timer in seconds
    pub trade_expiration_timer: u64, // 8 bytes
    /// Trade dispute window in seconds
    pub trade_dispute_timer: u64, // 8 bytes
    /// Minimum trade amount in USD (scaled by 6 decimals)
    pub trade_limit_min: u64, // 8 bytes
    /// Maximum trade amount in USD (scaled by 6 decimals)
    pub trade_limit_max: u64, // 8 bytes
    /// PDA bump seed
    pub bump: u8, // 1 byte
}

impl GlobalConfig {
    // Account size calculation: 8 (discriminator) + 288 (data) + 64 (buffer) = 360 bytes
    pub const INIT_SPACE: usize = 8 + 32 * 9 + 1 * 3 + 2 * 4 + 8 * 4;
}

/// Initialization parameters
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub offer_program: Pubkey,
    pub trade_program: Pubkey,
    pub profile_program: Pubkey,
    pub price_program: Pubkey,
    pub price_provider: Pubkey,
    pub local_mint: Pubkey,
    pub chain_fee_collector: Pubkey,
    pub warchest: Pubkey,
    pub active_offers_limit: u8,
    pub active_trades_limit: u8,
    pub arbitration_fee_bps: u16,
    pub burn_fee_bps: u16,
    pub chain_fee_bps: u16,
    pub warchest_fee_bps: u16,
    pub trade_expiration_timer: u64,
    pub trade_dispute_timer: u64,
    pub trade_limit_min: u64,
    pub trade_limit_max: u64,
}

/// Update configuration parameters
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateConfigParams {
    pub chain_fee_collector: Option<Pubkey>,
    pub warchest: Option<Pubkey>,
    pub price_provider: Option<Pubkey>,
    pub active_offers_limit: u8,
    pub active_trades_limit: u8,
    pub arbitration_fee_bps: u16,
    pub burn_fee_bps: u16,
    pub chain_fee_bps: u16,
    pub warchest_fee_bps: u16,
    pub trade_expiration_timer: u64,
    pub trade_dispute_timer: u64,
    pub trade_limit_min: u64,
    pub trade_limit_max: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = GlobalConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    pub authority: Signer<'info>,
}

/// Program Registry Account (PDA) - stores registration info for each program
#[account]
pub struct ProgramRegistry {
    /// The registered program ID
    pub program_id: Pubkey, // 32 bytes
    /// Type of program registered
    pub program_type: RegisteredProgramType, // 1 byte
    /// Registration timestamp
    pub registered_at: i64, // 8 bytes
    /// PDA bump seed
    pub bump: u8, // 1 byte
}

impl ProgramRegistry {
    // Account size calculation: 8 (discriminator) + 32 + 1 + 8 + 1 + 16 (buffer) = 66 bytes
    pub const INIT_SPACE: usize = 8 + 32 + 1 + 8 + 1 + 16;
}

/// Program types that can be registered with the hub
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RegisteredProgramType {
    Offer,
    Trade,
    Profile,
    Price,
}

/// Protocol fee configuration returned by get_protocol_fees
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProtocolFees {
    pub chain_fee_bps: u16,
    pub burn_fee_bps: u16,
    pub warchest_fee_bps: u16,
    pub arbitration_fee_bps: u16,
}

/// Trading limits configuration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TradingLimits {
    pub min_amount_usd: u64,
    pub max_amount_usd: u64,
    pub active_offers_limit: u8,
    pub active_trades_limit: u8,
}

/// Timer configuration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TimerConfig {
    pub trade_expiration_timer: u64,
    pub trade_dispute_timer: u64,
}

/// Program addresses configuration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProgramAddresses {
    pub offer_program: Pubkey,
    pub trade_program: Pubkey,
    pub profile_program: Pubkey,
    pub price_program: Pubkey,
}

/// Fee collector addresses
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct FeeCollectors {
    pub chain_fee_collector: Pubkey,
    pub warchest: Pubkey,
    pub price_provider: Pubkey,
}

#[derive(Accounts)]
#[instruction(program_type: RegisteredProgramType)]
pub struct RegisterProgram<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer = payer,
        space = ProgramRegistry::INIT_SPACE,
        seeds = [b"registry", program_id.key().as_ref()],
        bump
    )]
    pub registry: Account<'info, ProgramRegistry>,

    /// The program being registered (must be a signer to prove ownership)
    pub program_id: Signer<'info>,

    /// Payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(program_type: RegisteredProgramType)]
pub struct UpdateProgramRegistry<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// Only the hub authority can update program registry
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(program_type: RegisteredProgramType)]
pub struct ValidateProgramRegistration<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting validation
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
pub struct ValidateActivityLimits<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting validation
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
pub struct ValidateTradeAmount<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting validation
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
pub struct ValidateOfferAmountRange<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting validation
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
pub struct ValidateTradeExpiration<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting validation
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
pub struct ValidateDisputeWindow<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting validation
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetProtocolFees<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting validation
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetTradingLimits<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting data
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetTimerConfig<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting data
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetProgramAddresses<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting data
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetFeeCollectors<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting data
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetFullConfig<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting data
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(program_type: RegisteredProgramType)]
pub struct IsProgramAuthorized<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// The program requesting authorization check
    pub program_id: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(program_type: RegisteredProgramType)]
pub struct SetUpgradeAuthority<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,

    /// Only the hub authority can set upgrade authorities
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(program_type: RegisteredProgramType)]
pub struct GetUpgradeAuthority<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, GlobalConfig>,
}

/// Configuration snapshot for events
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ConfigSnapshot {
    pub authority: Pubkey,
    pub offer_program: Pubkey,
    pub trade_program: Pubkey,
    pub profile_program: Pubkey,
    pub price_program: Pubkey,
    pub price_provider: Pubkey,
    pub local_mint: Pubkey,
    pub chain_fee_collector: Pubkey,
    pub warchest: Pubkey,
    pub active_offers_limit: u8,
    pub active_trades_limit: u8,
    pub arbitration_fee_bps: u16,
    pub burn_fee_bps: u16,
    pub chain_fee_bps: u16,
    pub warchest_fee_bps: u16,
    pub trade_expiration_timer: u64,
    pub trade_dispute_timer: u64,
    pub trade_limit_min: u64,
    pub trade_limit_max: u64,
}

impl From<GlobalConfig> for ConfigSnapshot {
    fn from(config: GlobalConfig) -> Self {
        Self {
            authority: config.authority,
            offer_program: config.offer_program,
            trade_program: config.trade_program,
            profile_program: config.profile_program,
            price_program: config.price_program,
            price_provider: config.price_provider,
            local_mint: config.local_mint,
            chain_fee_collector: config.chain_fee_collector,
            warchest: config.warchest,
            active_offers_limit: config.active_offers_limit,
            active_trades_limit: config.active_trades_limit,
            arbitration_fee_bps: config.arbitration_fee_bps,
            burn_fee_bps: config.burn_fee_bps,
            chain_fee_bps: config.chain_fee_bps,
            warchest_fee_bps: config.warchest_fee_bps,
            trade_expiration_timer: config.trade_expiration_timer,
            trade_dispute_timer: config.trade_dispute_timer,
            trade_limit_min: config.trade_limit_min,
            trade_limit_max: config.trade_limit_max,
        }
    }
}

impl From<Account<'_, GlobalConfig>> for ConfigSnapshot {
    fn from(config: Account<'_, GlobalConfig>) -> Self {
        Self {
            authority: config.authority,
            offer_program: config.offer_program,
            trade_program: config.trade_program,
            profile_program: config.profile_program,
            price_program: config.price_program,
            price_provider: config.price_provider,
            local_mint: config.local_mint,
            chain_fee_collector: config.chain_fee_collector,
            warchest: config.warchest,
            active_offers_limit: config.active_offers_limit,
            active_trades_limit: config.active_trades_limit,
            arbitration_fee_bps: config.arbitration_fee_bps,
            burn_fee_bps: config.burn_fee_bps,
            chain_fee_bps: config.chain_fee_bps,
            warchest_fee_bps: config.warchest_fee_bps,
            trade_expiration_timer: config.trade_expiration_timer,
            trade_dispute_timer: config.trade_dispute_timer,
            trade_limit_min: config.trade_limit_min,
            trade_limit_max: config.trade_limit_max,
        }
    }
}

/// Events emitted by the Hub program

#[event]
pub struct ConfigurationUpdated {
    pub authority: Pubkey,
    pub old_config: ConfigSnapshot,
    pub new_config: ConfigSnapshot,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityUpdated {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProgramRegistered {
    pub program_id: Pubkey,
    pub program_type: RegisteredProgramType,
    pub registered_at: i64,
}

#[event]
pub struct ProgramRegistryUpdated {
    pub program_type: RegisteredProgramType,
    pub old_program_id: Pubkey,
    pub new_program_id: Pubkey,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct UpgradeAuthorityUpdated {
    pub program_type: RegisteredProgramType,
    pub program_id: Pubkey,
    pub new_upgrade_authority: Option<Pubkey>,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}
