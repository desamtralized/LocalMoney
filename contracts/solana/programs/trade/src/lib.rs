use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};

declare_id!("446vbrbtBptN2YoU2GP5MBdx7kt6tUUTomWiKwAuQNM4");

#[program]
pub mod localmoney_trade {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Initializing LocalMoney Trade program");
        Ok(())
    }

    pub fn register_hub(ctx: Context<RegisterHub>, hub_addr: Pubkey) -> Result<()> {
        msg!("Registering Hub: {}", hub_addr);
        Ok(())
    }

    pub fn create(ctx: Context<CreateTrade>, offer_id: u64, amount: u64) -> Result<()> {
        msg!("Creating trade for offer {}, amount {}", offer_id, amount);
        Ok(())
    }

    pub fn accept_request(
        ctx: Context<AcceptRequest>,
        trade_id: u64,
        maker_contact: String,
    ) -> Result<()> {
        msg!("Accepting trade request: {}", trade_id);
        Ok(())
    }

    pub fn fund_escrow(
        ctx: Context<FundEscrow>,
        trade_id: u64,
        maker_contact: Option<String>,
    ) -> Result<()> {
        msg!("Funding escrow for trade: {}", trade_id);
        Ok(())
    }

    pub fn fiat_deposited(ctx: Context<FiatDeposited>, trade_id: u64) -> Result<()> {
        msg!("Fiat deposit confirmed for trade: {}", trade_id);
        Ok(())
    }

    pub fn release_escrow(ctx: Context<ReleaseEscrow>, trade_id: u64) -> Result<()> {
        msg!("Releasing escrow for trade: {}", trade_id);
        Ok(())
    }

    pub fn dispute_escrow(
        ctx: Context<DisputeEscrow>,
        trade_id: u64,
        buyer_contact: String,
        seller_contact: String,
    ) -> Result<()> {
        msg!("Dispute opened for trade: {}", trade_id);
        Ok(())
    }

    pub fn settle_dispute(
        ctx: Context<SettleDispute>,
        trade_id: u64,
        winner: Pubkey,
    ) -> Result<()> {
        msg!(
            "Settling dispute for trade: {}, winner: {}",
            trade_id,
            winner
        );
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
pub struct CreateTrade<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptRequest<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FiatDeposited<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DisputeEscrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleDispute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Trade {
    pub id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub arbitrator: Option<Pubkey>,
    pub fiat_currency: [u8; 3],
    pub amount: u64,
    pub denom_fiat_price: u64,
    pub state: u8, // Trade state enum as u8
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FeeInfo {
    pub burn_amount: u64,
    pub chain_amount: u64,
    pub warchest_amount: u64,
}
