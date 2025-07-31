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

    // Arbitrator Management Functions
    pub fn register_arbitrator(
        ctx: Context<RegisterArbitrator>,
        fiat_currency: FiatCurrency,
    ) -> Result<()> {
        let clock = Clock::get()?;
        
        // Validate admin authority
        require!(
            ctx.accounts.hub_config.authority == ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );

        // Initialize or update arbitrator pool
        let arbitrator_pool = &mut ctx.accounts.arbitrator_pool;
        if arbitrator_pool.arbitrators.is_empty() {
            arbitrator_pool.fiat_currency = fiat_currency.clone();
            arbitrator_pool.authority = ctx.accounts.hub_config.authority;
            arbitrator_pool.bump = ctx.bumps.arbitrator_pool;
        }

        // Check if arbitrator already exists
        let arbitrator_pubkey = ctx.accounts.arbitrator.key();
        require!(
            !arbitrator_pool.arbitrators.contains(&arbitrator_pubkey),
            ErrorCode::ArbitratorAlreadyExists
        );

        // Add arbitrator to pool (max 32 arbitrators)
        require!(
            arbitrator_pool.arbitrators.len() < 32,
            ErrorCode::ArbitratorPoolFull
        );
        arbitrator_pool.arbitrators.push(arbitrator_pubkey);

        // Initialize arbitrator info
        let arbitrator_info = &mut ctx.accounts.arbitrator_info;
        arbitrator_info.arbitrator = arbitrator_pubkey;
        arbitrator_info.fiat_currency = fiat_currency;
        arbitrator_info.total_cases = 0;
        arbitrator_info.resolved_cases = 0;
        arbitrator_info.reputation_score = 5000; // Start with 50% (5000 basis points)
        arbitrator_info.registration_date = clock.unix_timestamp;
        arbitrator_info.is_active = true;
        arbitrator_info.bump = ctx.bumps.arbitrator_info;

        Ok(())
    }

    pub fn deactivate_arbitrator(
        ctx: Context<DeactivateArbitrator>,
        fiat_currency: FiatCurrency,
    ) -> Result<()> {
        // Validate admin authority
        require!(
            ctx.accounts.hub_config.authority == ctx.accounts.authority.key(),
            ErrorCode::Unauthorized
        );

        // Remove arbitrator from pool
        let arbitrator_pool = &mut ctx.accounts.arbitrator_pool;
        let arbitrator_pubkey = ctx.accounts.arbitrator.key();
        
        if let Some(pos) = arbitrator_pool.arbitrators.iter().position(|&x| x == arbitrator_pubkey) {
            arbitrator_pool.arbitrators.remove(pos);
        }

        // Mark arbitrator as inactive
        let arbitrator_info = &mut ctx.accounts.arbitrator_info;
        arbitrator_info.is_active = false;

        Ok(())
    }

    // Simplified Arbitrator Assignment Functions (VRF removed due to dependency conflicts)
    pub fn assign_arbitrator(
        ctx: Context<AssignArbitrator>,
        trade_id: u64,
    ) -> Result<()> {
        // Validate trade exists and is in correct state
        let trade = &mut ctx.accounts.trade;
        require!(
            trade.state == TradeState::RequestCreated,
            ErrorCode::InvalidTradeState
        );

        // Get arbitrator pool for this trade's fiat currency
        let arbitrator_pool = &ctx.accounts.arbitrator_pool;
        require!(
            !arbitrator_pool.arbitrators.is_empty(),
            ErrorCode::NoArbitratorsAvailable
        );

        // Use simple deterministic selection based on trade_id for now
        // TODO: Replace with proper VRF once dependency issues are resolved
        let clock = Clock::get()?;
        let pseudo_random = (trade_id.wrapping_add(clock.unix_timestamp as u64)) as usize;
        let random_index = pseudo_random % 100; // 0-99 range

        // Select arbitrator using CosmWasm algorithm
        let selected_arbitrator = select_arbitrator_from_pool(
            arbitrator_pool,
            random_index,
        )?;

        // Update trade with selected arbitrator
        trade.arbitrator = selected_arbitrator;

        Ok(())
    }


    // Dispute Initiation and Resolution Functions
    pub fn initiate_dispute(
        ctx: Context<InitiateDispute>,
        buyer_contact: String,
        seller_contact: String,
    ) -> Result<()> {
        let trade = &mut ctx.accounts.trade;
        let clock = Clock::get()?;
        let user = ctx.accounts.user.key();

        // CRITICAL: Only buyer or seller can start dispute
        require!(
            user == trade.buyer || user == trade.seller,
            ErrorCode::Unauthorized
        );

        // CRITICAL: Validate state transition
        require!(
            trade.state == TradeState::FiatDeposited,
            ErrorCode::InvalidTradeState
        );

        // CRITICAL: Respect dispute timing window
        let dispute_window_at = trade.dispute_window_at
            .ok_or(ErrorCode::DisputeWindowNotOpen)?;
        let current_time = clock.unix_timestamp as u64;
        
        require!(
            current_time >= dispute_window_at,
            ErrorCode::PrematureDisputeRequest
        );

        // Update trade state and store contact info for arbitrator
        trade.state = TradeState::EscrowDisputed;
        trade.buyer_contact = Some(buyer_contact);
        trade.seller_contact = Some(seller_contact);
        trade.state_history.push(TradeStateItem {
            actor: user,
            state: TradeState::EscrowDisputed,
            timestamp: current_time,
        });

        // Update profile stats via CPI
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        
        // Update both buyer and seller profiles for dispute initiation
        let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
            profile: ctx.accounts.buyer_profile.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program.clone(), cpi_accounts);
        profile::cpi::update_trade_stats(cpi_ctx, TradeState::EscrowDisputed)?;

        let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
            profile: ctx.accounts.seller_profile.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        profile::cpi::update_trade_stats(cpi_ctx, TradeState::EscrowDisputed)?;

        Ok(())
    }

    pub fn settle_dispute(
        ctx: Context<SettleDispute>,
        winner: Pubkey,
    ) -> Result<()> {
        let clock = Clock::get()?;

        // Validate state and authorization first
        {
            let trade = &ctx.accounts.trade;
            
            // SECURITY: Only arbitrator can settle
            require!(
                trade.arbitrator == ctx.accounts.arbitrator.key(),
                ErrorCode::Unauthorized
            );

            // SECURITY: Must be in disputed state
            require!(
                trade.state == TradeState::EscrowDisputed,
                ErrorCode::InvalidTradeState
            );

            // CRITICAL: Winner must be maker or taker (not arbitrary address)
            require!(
                winner == trade.buyer || winner == trade.seller,
                ErrorCode::InvalidWinner
            );
        }

        // Calculate complex fee distribution (matching CosmWasm logic exactly)
        let arbitration_fees = calculate_arbitration_settlement_fees(
            ctx.accounts.trade.amount,
            &ctx.accounts.hub_config,
            &ctx.accounts.offer,
            &ctx.accounts.trade,
            &winner,
        )?;

        // Prepare signer seeds
        let trade_id_bytes = ctx.accounts.trade.id.to_le_bytes();
        let trade_seeds = &[
            b"trade".as_ref(),
            trade_id_bytes.as_ref(),
            &[ctx.accounts.trade.bump],
        ];
        let signer_seeds = &[&trade_seeds[..]];

        // Transfer net amount to winner
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.winner_token_account.to_account_info(),
            authority: ctx.accounts.trade.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts, signer_seeds);
        
        transfer_checked(cpi_ctx, arbitration_fees.winner_amount, ctx.accounts.token_mint.decimals)?;

        // Transfer arbitrator fee
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.arbitrator_token_account.to_account_info(),
            authority: ctx.accounts.trade.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts, signer_seeds);
        
        transfer_checked(cpi_ctx, arbitration_fees.arbitrator_fee, ctx.accounts.token_mint.decimals)?;

        // Transfer protocol fee to treasury (if applicable)
        if arbitration_fees.protocol_fee > 0 {
            let cpi_accounts = TransferChecked {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: ctx.accounts.trade.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            
            transfer_checked(cpi_ctx, arbitration_fees.protocol_fee, ctx.accounts.token_mint.decimals)?;
        }

        // Update trade state
        let trade = &mut ctx.accounts.trade;
        let new_state = if winner == trade.buyer && winner == ctx.accounts.offer.owner {
            TradeState::SettledForMaker
        } else if winner == trade.seller && winner == ctx.accounts.offer.owner {
            TradeState::SettledForMaker
        } else if winner == trade.buyer {
            TradeState::SettledForTaker
        } else {
            TradeState::SettledForTaker
        };

        trade.state = new_state.clone();
        trade.state_history.push(TradeStateItem {
            actor: ctx.accounts.arbitrator.key(),
            state: new_state,
            timestamp: clock.unix_timestamp as u64,
        });

        // Update arbitrator stats
        let arbitrator_info = &mut ctx.accounts.arbitrator_info;
        arbitrator_info.resolved_cases = arbitrator_info.resolved_cases.saturating_add(1);

        // Update both profiles via CPI
        let cpi_program = ctx.accounts.profile_program.to_account_info();
        
        // Update buyer profile
        let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
            profile: ctx.accounts.buyer_profile.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program.clone(), cpi_accounts);
        profile::cpi::update_trade_stats(cpi_ctx, trade.state.clone())?;

        // Update seller profile
        let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
            profile: ctx.accounts.seller_profile.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        profile::cpi::update_trade_stats(cpi_ctx, trade.state.clone())?;

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

#[derive(Accounts)]
#[instruction(fiat_currency: FiatCurrency)]
pub struct RegisterArbitrator<'info> {
    #[account(
        seeds = [b"hub_config".as_ref()],
        bump
    )]
    pub hub_config: Account<'info, hub::HubConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = ArbitratorPool::SPACE,
        seeds = [b"arbitrator-pool".as_ref(), match fiat_currency {
            FiatCurrency::USD => b"USD",
            FiatCurrency::EUR => b"EUR",
            FiatCurrency::GBP => b"GBP",
            FiatCurrency::CAD => b"CAD",
            FiatCurrency::AUD => b"AUD",
            FiatCurrency::JPY => b"JPY",
            FiatCurrency::BRL => b"BRL",
            FiatCurrency::MXN => b"MXN", 
            FiatCurrency::ARS => b"ARS",
            FiatCurrency::CLP => b"CLP",
            FiatCurrency::COP => b"COP",
            FiatCurrency::NGN => b"NGN",
            FiatCurrency::THB => b"THB",
            FiatCurrency::VES => b"VES",
        }],
        bump
    )]
    pub arbitrator_pool: Account<'info, ArbitratorPool>,

    #[account(
        init,
        payer = authority,
        space = ArbitratorInfo::SPACE,
        seeds = [b"arbitrator".as_ref(), arbitrator.key().as_ref(), match fiat_currency {
            FiatCurrency::USD => b"USD",
            FiatCurrency::EUR => b"EUR",
            FiatCurrency::GBP => b"GBP",
            FiatCurrency::CAD => b"CAD",
            FiatCurrency::AUD => b"AUD",
            FiatCurrency::JPY => b"JPY",
            FiatCurrency::BRL => b"BRL",
            FiatCurrency::MXN => b"MXN",
            FiatCurrency::ARS => b"ARS",
            FiatCurrency::CLP => b"CLP",
            FiatCurrency::COP => b"COP",
            FiatCurrency::NGN => b"NGN",
            FiatCurrency::THB => b"THB",
            FiatCurrency::VES => b"VES",
        }],
        bump
    )]
    pub arbitrator_info: Account<'info, ArbitratorInfo>,

    /// CHECK: Arbitrator wallet to be registered
    pub arbitrator: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(fiat_currency: FiatCurrency)]
pub struct DeactivateArbitrator<'info> {
    #[account(
        seeds = [b"hub_config".as_ref()],
        bump
    )]
    pub hub_config: Account<'info, hub::HubConfig>,

    #[account(
        mut,
        seeds = [b"arbitrator-pool".as_ref(), match fiat_currency {
            FiatCurrency::USD => b"USD",
            FiatCurrency::EUR => b"EUR",
            FiatCurrency::GBP => b"GBP",
            FiatCurrency::CAD => b"CAD",
            FiatCurrency::AUD => b"AUD",
            FiatCurrency::JPY => b"JPY",
            FiatCurrency::BRL => b"BRL",
            FiatCurrency::MXN => b"MXN",
            FiatCurrency::ARS => b"ARS",
            FiatCurrency::CLP => b"CLP",
            FiatCurrency::COP => b"COP",
            FiatCurrency::NGN => b"NGN",
            FiatCurrency::THB => b"THB",
            FiatCurrency::VES => b"VES",
        }],
        bump
    )]
    pub arbitrator_pool: Account<'info, ArbitratorPool>,

    #[account(
        mut,
        seeds = [b"arbitrator".as_ref(), arbitrator.key().as_ref(), match fiat_currency {
            FiatCurrency::USD => b"USD",
            FiatCurrency::EUR => b"EUR",
            FiatCurrency::GBP => b"GBP",
            FiatCurrency::CAD => b"CAD",
            FiatCurrency::AUD => b"AUD",
            FiatCurrency::JPY => b"JPY",
            FiatCurrency::BRL => b"BRL",
            FiatCurrency::MXN => b"MXN",
            FiatCurrency::ARS => b"ARS",
            FiatCurrency::CLP => b"CLP",
            FiatCurrency::COP => b"COP",
            FiatCurrency::NGN => b"NGN",
            FiatCurrency::THB => b"THB",
            FiatCurrency::VES => b"VES",
        }],
        bump
    )]
    pub arbitrator_info: Account<'info, ArbitratorInfo>,

    /// CHECK: Arbitrator wallet to be deactivated
    pub arbitrator: UncheckedAccount<'info>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(trade_id: u64)]
pub struct AssignArbitrator<'info> {
    #[account(
        mut,
        seeds = [b"trade".as_ref(), trade_id.to_le_bytes().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, Trade>,

    #[account(
        seeds = [b"arbitrator-pool".as_ref(), match trade.fiat_currency {
            FiatCurrency::USD => b"USD",
            FiatCurrency::EUR => b"EUR",
            FiatCurrency::GBP => b"GBP",
            FiatCurrency::CAD => b"CAD",
            FiatCurrency::AUD => b"AUD",
            FiatCurrency::JPY => b"JPY",
            FiatCurrency::BRL => b"BRL",
            FiatCurrency::MXN => b"MXN",
            FiatCurrency::ARS => b"ARS",
            FiatCurrency::CLP => b"CLP",
            FiatCurrency::COP => b"COP",
            FiatCurrency::NGN => b"NGN",
            FiatCurrency::THB => b"THB",
            FiatCurrency::VES => b"VES",
        }],
        bump
    )]
    pub arbitrator_pool: Account<'info, ArbitratorPool>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitiateDispute<'info> {
    #[account(
        mut,
        seeds = [b"trade".as_ref(), trade.id.to_le_bytes().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, Trade>,

    #[account(
        mut,
        seeds = [b"profile".as_ref(), trade.buyer.as_ref()],
        bump,
    )]
    pub buyer_profile: Account<'info, profile::Profile>,

    #[account(
        mut,
        seeds = [b"profile".as_ref(), trade.seller.as_ref()],
        bump,
    )]
    pub seller_profile: Account<'info, profile::Profile>,

    pub user: Signer<'info>,

    /// CHECK: Profile program for CPI call
    pub profile_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SettleDispute<'info> {
    #[account(
        mut,
        seeds = [b"trade".as_ref(), trade.id.to_le_bytes().as_ref()],
        bump = trade.bump
    )]
    pub trade: Account<'info, Trade>,

    #[account(
        seeds = [b"hub_config".as_ref()],
        bump
    )]
    pub hub_config: Account<'info, hub::HubConfig>,

    #[account(
        seeds = [b"offer".as_ref(), trade.offer_id.to_le_bytes().as_ref()],
        bump
    )]
    pub offer: Account<'info, offer::Offer>,

    #[account(
        mut,
        seeds = [b"arbitrator".as_ref(), arbitrator.key().as_ref(), match trade.fiat_currency {
            FiatCurrency::USD => b"USD",
            FiatCurrency::EUR => b"EUR",
            FiatCurrency::GBP => b"GBP",
            FiatCurrency::CAD => b"CAD",
            FiatCurrency::AUD => b"AUD",
            FiatCurrency::JPY => b"JPY",
            FiatCurrency::BRL => b"BRL",
            FiatCurrency::MXN => b"MXN",
            FiatCurrency::ARS => b"ARS",
            FiatCurrency::CLP => b"CLP",
            FiatCurrency::COP => b"COP",
            FiatCurrency::NGN => b"NGN",
            FiatCurrency::THB => b"THB",
            FiatCurrency::VES => b"VES",
        }],
        bump
    )]
    pub arbitrator_info: Account<'info, ArbitratorInfo>,

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
        associated_token::authority = winner,
        associated_token::token_program = token_program,
    )]
    pub winner_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = arbitrator,
        associated_token::token_program = token_program,
    )]
    pub arbitrator_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"profile".as_ref(), trade.buyer.as_ref()],
        bump,
    )]
    pub buyer_profile: Account<'info, profile::Profile>,

    #[account(
        mut,
        seeds = [b"profile".as_ref(), trade.seller.as_ref()],
        bump,
    )]
    pub seller_profile: Account<'info, profile::Profile>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Winner wallet (verified in function logic)
    pub winner: UncheckedAccount<'info>,
    /// CHECK: Treasury wallet
    pub treasury: UncheckedAccount<'info>,
    pub arbitrator: Signer<'info>,

    /// CHECK: Profile program for CPI call
    pub profile_program: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ArbitrationSettlementFees {
    pub winner_amount: u64,
    pub arbitrator_fee: u64,
    pub protocol_fee: u64,
}

impl ArbitrationSettlementFees {
    pub fn total_distributed(&self) -> u64 {
        self.winner_amount + self.arbitrator_fee + self.protocol_fee
    }
}

// Use common types from profile program
pub use profile::{TradeState, FiatCurrency};

// Constants
const DISPUTE_WINDOW_SECONDS: u64 = 24 * 60 * 60; // 24 hours

// Arbitrator account structures
#[account]
pub struct ArbitratorPool {
    pub fiat_currency: FiatCurrency,
    pub arbitrators: Vec<Pubkey>,           // Max 32 arbitrators per currency
    pub authority: Pubkey,                  // Hub admin authority
    pub bump: u8,
}

impl ArbitratorPool {
    pub const SPACE: usize = 8 +            // discriminator
        1 +                                 // fiat_currency
        4 + (32 * 32) +                    // arbitrators vec (max 32)
        32 +                                // authority
        1;                                  // bump
}

#[account]
pub struct ArbitratorInfo {
    pub arbitrator: Pubkey,
    pub fiat_currency: FiatCurrency,
    pub total_cases: u64,
    pub resolved_cases: u64,
    pub reputation_score: u16,              // Basis points (0-10000)
    pub registration_date: i64,
    pub is_active: bool,
    pub bump: u8,
}

impl ArbitratorInfo {
    pub const SPACE: usize = 8 +            // discriminator
        32 +                                // arbitrator
        1 +                                 // fiat_currency
        8 +                                 // total_cases
        8 +                                 // resolved_cases
        2 +                                 // reputation_score
        8 +                                 // registration_date
        1 +                                 // is_active
        1;                                  // bump
}

// Helper functions
pub fn fiat_currency_to_string(currency: &FiatCurrency) -> &'static str {
    match currency {
        FiatCurrency::USD => "USD",
        FiatCurrency::EUR => "EUR",
        FiatCurrency::GBP => "GBP",
        FiatCurrency::CAD => "CAD",
        FiatCurrency::AUD => "AUD",
        FiatCurrency::JPY => "JPY",
        FiatCurrency::BRL => "BRL",
        FiatCurrency::MXN => "MXN",
        FiatCurrency::ARS => "ARS",
        FiatCurrency::CLP => "CLP",
        FiatCurrency::COP => "COP",
        FiatCurrency::NGN => "NGN",
        FiatCurrency::THB => "THB",
        FiatCurrency::VES => "VES",
    }
}

// CosmWasm-compatible fee calculation for arbitration settlement
pub fn calculate_arbitration_settlement_fees(
    trade_amount: u64,
    hub_config: &hub::HubConfig,
    offer: &offer::Offer,
    trade: &Trade,
    winner: &Pubkey,
) -> Result<ArbitrationSettlementFees> {
    // Calculate arbitration fee (e.g., 2% as basis points)
    // Assuming hub_config has arbitration_fee_rate field - using fee_rate as approximation
    let arbitration_fee_basis_points = hub_config.fee_rate; // e.g., 200 = 2%
    let arbitrator_fee = (trade_amount as u128 * arbitration_fee_basis_points as u128 / 10000) as u64;
    
    // Start with full trade amount minus arbitrator fee
    let mut winner_amount = trade_amount - arbitrator_fee;
    
    // Protocol fees only deducted if buyer is the maker (matching CosmWasm logic)
    let protocol_fee = if trade.buyer == offer.owner {
        // Buyer is maker - deduct protocol fees
        // Calculate total protocol fees similar to existing calculate_fees function
        let fee_info = calculate_fees(trade_amount)?;
        let total_protocol_fees = fee_info.total_fees();
        
        winner_amount = winner_amount - total_protocol_fees;
        
        total_protocol_fees
    } else {
        // Buyer is taker - no additional protocol fees
        0
    };

    Ok(ArbitrationSettlementFees {
        winner_amount,
        arbitrator_fee,
        protocol_fee,
    })
}

// CosmWasm-compatible arbitrator selection algorithm
pub fn select_arbitrator_from_pool(
    arbitrator_pool: &ArbitratorPool, 
    random_index: usize
) -> Result<Pubkey> {
    require!(
        !arbitrator_pool.arbitrators.is_empty(),
        ErrorCode::NoArbitratorsAvailable
    );

    // Take up to 10 arbitrators from pool (gas efficiency like CosmWasm)
    let available_arbitrators: Vec<Pubkey> = arbitrator_pool.arbitrators
        .iter()
        .take(10)
        .cloned()
        .collect();
    
    let arbitrator_count = available_arbitrators.len();
    
    // Secure mapping: RandomValue * (MaxMappedRange + 1) / (MaxRandomRange + 1)
    // Matches CosmWasm algorithm exactly
    let selected_index = random_index * arbitrator_count / (99 + 1);
    
    Ok(available_arbitrators[selected_index])
}

pub fn calculate_fees(amount: u64) -> Result<FeeInfo> {
    // Example fee calculation - 1.5% total fees
    let total_fee = amount * 150 / 10000; // 1.5%
    
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
    #[msg("Arbitrator already exists")]
    ArbitratorAlreadyExists,
    #[msg("Arbitrator pool is full")]
    ArbitratorPoolFull,
    #[msg("No arbitrators available")]
    NoArbitratorsAvailable,
    #[msg("Invalid arbitrator")]
    InvalidArbitrator,
    #[msg("Premature dispute request")]
    PrematureDisputeRequest,
    #[msg("Invalid winner")]
    InvalidWinner,
}