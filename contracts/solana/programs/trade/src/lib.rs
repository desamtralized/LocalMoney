use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked
};

declare_id!("5Tb71Y6Z4G5We8WqJiQAo34nVmc8ZmFo5J7D3VUC5LGX");

#[program]
pub mod trade {
    use super::*;

    pub fn create_trade(
        ctx: Context<CreateTrade>,
        params: CreateTradeParams
    ) -> Result<()> {
        let trade = &mut ctx.accounts.trade;
        let clock = Clock::get()?;
        
        trade.id = params.trade_id;
        trade.offer_id = params.offer_id;
        trade.buyer = ctx.accounts.buyer.key();
        trade.seller = ctx.accounts.offer.owner;
        trade.arbitrator = params.arbitrator; // TODO: Get random arbitrator
        trade.token_mint = ctx.accounts.token_mint.key();
        trade.amount = params.amount;
        trade.fiat_currency = ctx.accounts.offer.fiat_currency.clone();
        trade.locked_price = params.locked_price;
        trade.state = TradeState::RequestCreated;
        trade.created_at = clock.unix_timestamp as u64;
        trade.expires_at = clock.unix_timestamp as u64 + params.expiry_duration;
        trade.dispute_window_at = None;
        trade.state_history = vec![TradeStateItem {
            actor: ctx.accounts.buyer.key(),
            state: TradeState::RequestCreated,
            timestamp: clock.unix_timestamp as u64,
        }];
        trade.buyer_contact = Some(params.buyer_contact);
        trade.seller_contact = None;
        trade.bump = ctx.bumps.trade;

        // Update buyer profile stats via CPI
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
            profile: ctx.accounts.buyer_profile.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        profile::cpi::update_trade_stats(cpi_ctx, TradeState::RequestCreated)?;

        Ok(())
    }

    pub fn accept_request(
        ctx: Context<AcceptRequest>,
        seller_contact: String,
    ) -> Result<()> {
        let trade = &mut ctx.accounts.trade;
        let clock = Clock::get()?;

        require!(
            trade.state == TradeState::RequestCreated,
            ErrorCode::InvalidTradeState
        );
        require!(
            trade.seller == ctx.accounts.seller.key(),
            ErrorCode::Unauthorized
        );

        trade.seller_contact = Some(seller_contact);
        trade.state = TradeState::RequestAccepted;
        trade.state_history.push(TradeStateItem {
            actor: ctx.accounts.seller.key(),
            state: TradeState::RequestAccepted,
            timestamp: clock.unix_timestamp as u64,
        });

        Ok(())
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
        let trade = &mut ctx.accounts.trade;
        let clock = Clock::get()?;

        require!(
            trade.state == TradeState::RequestAccepted,
            ErrorCode::InvalidTradeState
        );
        require!(
            trade.seller == ctx.accounts.seller.key(),
            ErrorCode::Unauthorized
        );

        // Transfer tokens from seller to escrow
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.seller_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        transfer_checked(cpi_ctx, trade.amount, ctx.accounts.token_mint.decimals)?;

        trade.state = TradeState::EscrowFunded;
        trade.state_history.push(TradeStateItem {
            actor: ctx.accounts.seller.key(),
            state: TradeState::EscrowFunded,
            timestamp: clock.unix_timestamp as u64,
        });

        Ok(())
    }

    pub fn mark_fiat_deposited(ctx: Context<MarkFiatDeposited>) -> Result<()> {
        let trade = &mut ctx.accounts.trade;
        let clock = Clock::get()?;

        require!(
            trade.state == TradeState::EscrowFunded,
            ErrorCode::InvalidTradeState
        );
        require!(
            trade.buyer == ctx.accounts.buyer.key(),
            ErrorCode::Unauthorized
        );

        trade.state = TradeState::FiatDeposited;
        trade.dispute_window_at = Some(clock.unix_timestamp as u64 + DISPUTE_WINDOW_SECONDS);
        trade.state_history.push(TradeStateItem {
            actor: ctx.accounts.buyer.key(),
            state: TradeState::FiatDeposited,
            timestamp: clock.unix_timestamp as u64,
        });

        Ok(())
    }

    pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
        let clock = Clock::get()?;

        // Check state and authorization first
        {
            let trade = &ctx.accounts.trade;
            require!(
                trade.state == TradeState::FiatDeposited,
                ErrorCode::InvalidTradeState
            );
            require!(
                trade.seller == ctx.accounts.seller.key(),
                ErrorCode::Unauthorized
            );
        }

        // Calculate fees
        let fee_info = calculate_fees(ctx.accounts.trade.amount)?;
        let net_amount = ctx.accounts.trade.amount
            .checked_sub(fee_info.total_fees())
            .ok_or(ErrorCode::ArithmeticError)?;

        // Prepare signer seeds
        let trade_id_bytes = ctx.accounts.trade.id.to_le_bytes();
        let trade_seeds = &[
            b"trade".as_ref(),
            trade_id_bytes.as_ref(),
            &[ctx.accounts.trade.bump],
        ];
        let signer_seeds = &[&trade_seeds[..]];

        // Transfer net amount to buyer
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: ctx.accounts.trade.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts, signer_seeds);
        
        transfer_checked(cpi_ctx, net_amount, ctx.accounts.token_mint.decimals)?;

        // Transfer fees to treasury
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.treasury_token_account.to_account_info(),
            authority: ctx.accounts.trade.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        
        transfer_checked(cpi_ctx, fee_info.total_fees(), ctx.accounts.token_mint.decimals)?;

        // Update trade state
        let trade = &mut ctx.accounts.trade;
        trade.state = TradeState::EscrowReleased;
        trade.state_history.push(TradeStateItem {
            actor: ctx.accounts.seller.key(),
            state: TradeState::EscrowReleased,
            timestamp: clock.unix_timestamp as u64,
        });

        // Update both profiles via CPI
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        
        // Update buyer profile
        let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
            profile: ctx.accounts.buyer_profile.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program.clone(), cpi_accounts);
        profile::cpi::update_trade_stats(cpi_ctx, TradeState::EscrowReleased)?;

        // Update seller profile
        let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
            profile: ctx.accounts.seller_profile.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        profile::cpi::update_trade_stats(cpi_ctx, TradeState::EscrowReleased)?;

        Ok(())
    }

    pub fn cancel_request(ctx: Context<CancelRequest>) -> Result<()> {
        let trade = &mut ctx.accounts.trade;
        let clock = Clock::get()?;

        require!(
            trade.state == TradeState::RequestCreated || trade.state == TradeState::RequestAccepted,
            ErrorCode::InvalidTradeState
        );
        require!(
            trade.buyer == ctx.accounts.user.key() || trade.seller == ctx.accounts.user.key(),
            ErrorCode::Unauthorized
        );

        trade.state = TradeState::RequestCanceled;
        trade.state_history.push(TradeStateItem {
            actor: ctx.accounts.user.key(),
            state: TradeState::RequestCanceled,
            timestamp: clock.unix_timestamp as u64,
        });

        Ok(())
    }
}

// Account contexts
#[derive(Accounts)]
#[instruction(params: CreateTradeParams)]
pub struct CreateTrade<'info> {
    #[account(
        init,
        payer = buyer,
        space = Trade::SPACE,
        seeds = [b"trade".as_ref(), params.trade_id.to_le_bytes().as_ref()],
        bump
    )]
    pub trade: Account<'info, Trade>,

    #[account(
        seeds = [b"offer".as_ref(), params.offer_id.to_le_bytes().as_ref()],
        bump
    )]
    pub offer: Account<'info, offer::Offer>,

    #[account(
        mut,
        seeds = [b"profile".as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub buyer_profile: Account<'info, profile::Profile>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Profile program for CPI call
    pub profile_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptRequest<'info> {
    #[account(
        mut,
        seeds = [b"trade".as_ref(), trade.id.to_le_bytes().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, Trade>,

    pub seller: Signer<'info>,
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(
        mut,
        seeds = [b"trade".as_ref(), trade.id.to_le_bytes().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, Trade>,

    #[account(
        init,
        payer = seller,
        seeds = [b"trade".as_ref(), b"escrow".as_ref(), trade.id.to_le_bytes().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = trade,
        token::token_program = token_program
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub seller: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkFiatDeposited<'info> {
    #[account(
        mut,
        seeds = [b"trade".as_ref(), trade.id.to_le_bytes().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, Trade>,

    pub buyer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    #[account(
        mut,
        seeds = [b"trade".as_ref(), trade.id.to_le_bytes().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, Trade>,

    #[account(
        mut,
        seeds = [b"trade".as_ref(), b"escrow".as_ref(), trade.id.to_le_bytes().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = trade,
        token::token_program = token_program
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"profile".as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub buyer_profile: Account<'info, profile::Profile>,

    #[account(
        mut,
        seeds = [b"profile".as_ref(), seller.key().as_ref()],
        bump,
    )]
    pub seller_profile: Account<'info, profile::Profile>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Treasury wallet
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: Buyer wallet
    pub buyer: UncheckedAccount<'info>,
    pub seller: Signer<'info>,

    /// CHECK: Profile program for CPI call
    pub profile_program: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CancelRequest<'info> {
    #[account(
        mut,
        seeds = [b"trade".as_ref(), trade.id.to_le_bytes().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, Trade>,

    pub user: Signer<'info>,
}

// Data structures
#[account]
pub struct Trade {
    pub id: u64,
    pub offer_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub arbitrator: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub fiat_currency: FiatCurrency,
    pub locked_price: u64,
    pub state: TradeState,
    pub created_at: u64,
    pub expires_at: u64,
    pub dispute_window_at: Option<u64>,
    pub state_history: Vec<TradeStateItem>,
    pub buyer_contact: Option<String>,
    pub seller_contact: Option<String>,
    pub bump: u8,
}

impl Trade {
    pub const SPACE: usize = 8 + // discriminator
        8 + // id
        8 + // offer_id
        32 + // buyer
        32 + // seller
        32 + // arbitrator
        32 + // token_mint
        8 + // amount
        1 + // fiat_currency
        8 + // locked_price
        1 + // state
        8 + // created_at
        8 + // expires_at
        9 + // dispute_window_at (Option<u64>)
        4 + (1 + 32 + 8) * 50 + // state_history (max 50 entries)
        1 + 4 + 200 + // buyer_contact (Option<String>)
        1 + 4 + 200 + // seller_contact (Option<String>)
        1; // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TradeStateItem {
    pub actor: Pubkey,
    pub state: TradeState,
    pub timestamp: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateTradeParams {
    pub trade_id: u64,
    pub offer_id: u64,
    pub amount: u64,
    pub locked_price: u64,
    pub expiry_duration: u64,
    pub arbitrator: Pubkey,
    pub buyer_contact: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct FeeInfo {
    pub burn_amount: u64,
    pub chain_amount: u64,
    pub warchest_amount: u64,
}

impl FeeInfo {
    pub fn total_fees(&self) -> u64 {
        self.burn_amount + self.chain_amount + self.warchest_amount
    }
}

// Use common types from profile program
pub use profile::{TradeState, FiatCurrency};

// Constants
const DISPUTE_WINDOW_SECONDS: u64 = 24 * 60 * 60; // 24 hours

// Helper functions
pub fn calculate_fees(amount: u64) -> Result<FeeInfo> {
    // Example fee calculation - 1.5% total fees
    let total_fee = amount.checked_mul(150).unwrap().checked_div(10000).unwrap(); // 1.5%
    
    Ok(FeeInfo {
        burn_amount: total_fee / 3,
        chain_amount: total_fee / 3,
        warchest_amount: total_fee / 3,
    })
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid trade state")]
    InvalidTradeState,
    #[msg("Arithmetic error")]
    ArithmeticError,
    #[msg("Trade expired")]
    TradeExpired,
    #[msg("Dispute window not open")]
    DisputeWindowNotOpen,
}