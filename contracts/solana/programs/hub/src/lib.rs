use anchor_lang::prelude::*;

declare_id!("Gr8Kfgo4KvghW2c1rSUNtTLGhJkNkfcvgP9hm4hmRLTB");

#[program]
pub mod hub {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        let hub_config = &mut ctx.accounts.hub_config;
        hub_config.authority = ctx.accounts.authority.key();
        hub_config.profile_program = params.profile_program;
        hub_config.offer_program = params.offer_program;
        hub_config.trade_program = params.trade_program;
        hub_config.price_program = params.price_program;
        hub_config.treasury = params.treasury;
        hub_config.fee_rate = params.fee_rate; // basis points (e.g., 150 = 1.5%)
        hub_config.burn_rate = params.burn_rate; // basis points
        hub_config.warchest_rate = params.warchest_rate; // basis points
        hub_config.bump = ctx.bumps.hub_config;

        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
        let hub_config = &mut ctx.accounts.hub_config;
        
        if let Some(treasury) = params.treasury {
            hub_config.treasury = treasury;
        }
        if let Some(fee_rate) = params.fee_rate {
            hub_config.fee_rate = fee_rate;
        }
        if let Some(burn_rate) = params.burn_rate {
            hub_config.burn_rate = burn_rate;
        }
        if let Some(warchest_rate) = params.warchest_rate {
            hub_config.warchest_rate = warchest_rate;
        }

        Ok(())
    }

    pub fn register_program(ctx: Context<RegisterProgram>, program_id: Pubkey, program_type: ProgramType) -> Result<()> {
        let hub_config = &mut ctx.accounts.hub_config;
        
        match program_type {
            ProgramType::Profile => hub_config.profile_program = program_id,
            ProgramType::Offer => hub_config.offer_program = program_id,
            ProgramType::Trade => hub_config.trade_program = program_id,
            ProgramType::Price => hub_config.price_program = program_id,
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = HubConfig::SPACE,
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        bump
    )]
    pub hub_config: Account<'info, HubConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        bump = hub_config.bump,
        has_one = authority
    )]
    pub hub_config: Account<'info, HubConfig>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterProgram<'info> {
    #[account(
        mut,
        seeds = [b"hub".as_ref(), b"config".as_ref()],
        bump = hub_config.bump,
        has_one = authority
    )]
    pub hub_config: Account<'info, HubConfig>,
    
    pub authority: Signer<'info>,
}

#[account]
pub struct HubConfig {
    pub authority: Pubkey,
    pub profile_program: Pubkey,
    pub offer_program: Pubkey,
    pub trade_program: Pubkey,
    pub price_program: Pubkey,
    pub treasury: Pubkey,
    pub fee_rate: u16,      // basis points (e.g., 150 = 1.5%)
    pub burn_rate: u16,     // basis points
    pub warchest_rate: u16, // basis points
    pub bump: u8,
}

impl HubConfig {
    pub const SPACE: usize = 8 + // discriminator
        32 + // authority
        32 + // profile_program
        32 + // offer_program
        32 + // trade_program
        32 + // price_program
        32 + // treasury
        2 +  // fee_rate
        2 +  // burn_rate
        2 +  // warchest_rate
        1;   // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub profile_program: Pubkey,
    pub offer_program: Pubkey,
    pub trade_program: Pubkey,
    pub price_program: Pubkey,
    pub treasury: Pubkey,
    pub fee_rate: u16,
    pub burn_rate: u16,
    pub warchest_rate: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateConfigParams {
    pub treasury: Option<Pubkey>,
    pub fee_rate: Option<u16>,
    pub burn_rate: Option<u16>,
    pub warchest_rate: Option<u16>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum ProgramType {
    Profile,
    Offer,
    Trade,
    Price,
}

#[error_code]
pub enum HubError {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid fee rate")]
    InvalidFeeRate,
    #[msg("Invalid program type")]
    InvalidProgramType,
}