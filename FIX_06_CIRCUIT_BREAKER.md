## FEATURE:

- Implement protocol-wide emergency pause mechanism in hub program
- Add granular pause controls for specific operations (trading, deposits, withdrawals)
- Create multi-sig guardian system for pause/unpause operations
- Add time-locked resume functionality to prevent permanent freezes
- Implement pause event emission and monitoring

## EXAMPLES:

```rust
// hub/src/lib.rs
#[account]
pub struct HubConfig {
    pub authority: Pubkey,
    pub emergency_council: Vec<Pubkey>, // Multi-sig guardians
    pub required_signatures: u8,        // M of N signatures needed
    
    // Circuit breaker states
    pub global_pause: bool,              // Pause everything
    pub pause_new_trades: bool,          // Pause new trade creation
    pub pause_deposits: bool,            // Pause escrow funding
    pub pause_withdrawals: bool,        // Pause escrow releases
    pub pause_new_offers: bool,         // Pause offer creation
    
    // Time-locked resume
    pub pause_timestamp: Option<i64>,   // When pause was activated
    pub auto_resume_after: Option<i64>, // Auto-resume after N seconds
    pub pause_reason: Option<String>,   // Reason for pause (32 chars max)
    
    // Pause history for audit
    pub pause_count: u32,               // Total number of pauses
    pub last_pause_by: Option<Pubkey>,  // Who triggered last pause
    
    // ... existing fields
}

// Emergency pause instruction
pub fn emergency_pause(
    ctx: Context<EmergencyPause>,
    pause_type: PauseType,
    reason: String,
    auto_resume_seconds: Option<u64>,
) -> Result<()> {
    let config = &mut ctx.accounts.hub_config;
    let clock = Clock::get()?;
    
    // Validate caller is guardian
    require!(
        config.emergency_council.contains(&ctx.accounts.guardian.key()),
        ErrorCode::NotGuardian
    );
    
    // Apply pause based on type
    match pause_type {
        PauseType::Global => {
            config.global_pause = true;
            msg!("EMERGENCY: Global pause activated");
        },
        PauseType::Trading => {
            config.pause_new_trades = true;
            msg!("EMERGENCY: Trading paused");
        },
        PauseType::Deposits => {
            config.pause_deposits = true;
            msg!("EMERGENCY: Deposits paused");
        },
        PauseType::Withdrawals => {
            config.pause_withdrawals = true;
            msg!("EMERGENCY: Withdrawals paused");
        },
        PauseType::Offers => {
            config.pause_new_offers = true;
            msg!("EMERGENCY: New offers paused");
        },
    }
    
    // Set pause metadata
    config.pause_timestamp = Some(clock.unix_timestamp);
    config.auto_resume_after = auto_resume_seconds.map(|s| s as i64);
    config.pause_reason = Some(reason[..32.min(reason.len())].to_string());
    config.pause_count += 1;
    config.last_pause_by = Some(ctx.accounts.guardian.key());
    
    // Emit pause event
    emit!(EmergencyPauseEvent {
        pause_type,
        guardian: ctx.accounts.guardian.key(),
        timestamp: clock.unix_timestamp,
        reason: config.pause_reason.clone(),
        auto_resume_after: config.auto_resume_after,
    });
    
    Ok(())
}

// Multi-sig resume with time-lock check
pub fn emergency_resume(
    ctx: Context<EmergencyResume>,
    pause_type: PauseType,
) -> Result<()> {
    let config = &mut ctx.accounts.hub_config;
    let clock = Clock::get()?;
    
    // Check if multi-sig threshold met
    let approval_account = &ctx.accounts.approval_account;
    require!(
        approval_account.signatures.len() >= config.required_signatures as usize,
        ErrorCode::InsufficientSignatures
    );
    
    // Check auto-resume time if set
    if let (Some(pause_time), Some(auto_resume)) = 
        (config.pause_timestamp, config.auto_resume_after) {
        let can_resume_at = pause_time + auto_resume;
        require!(
            clock.unix_timestamp >= can_resume_at,
            ErrorCode::ResumeTooEarly
        );
    }
    
    // Resume based on type
    match pause_type {
        PauseType::Global => config.global_pause = false,
        PauseType::Trading => config.pause_new_trades = false,
        PauseType::Deposits => config.pause_deposits = false,
        PauseType::Withdrawals => config.pause_withdrawals = false,
        PauseType::Offers => config.pause_new_offers = false,
    }
    
    emit!(EmergencyResumeEvent {
        pause_type,
        resumed_by: ctx.accounts.guardian.key(),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

// Pause check macro for use in instructions
#[macro_export]
macro_rules! require_not_paused {
    ($config:expr, $operation:expr) => {
        require!(!$config.global_pause, ErrorCode::GlobalPause);
        
        match $operation {
            Operation::CreateTrade => {
                require!(!$config.pause_new_trades, ErrorCode::TradingPaused);
            },
            Operation::FundEscrow => {
                require!(!$config.pause_deposits, ErrorCode::DepositsPaused);
            },
            Operation::ReleaseEscrow => {
                require!(!$config.pause_withdrawals, ErrorCode::WithdrawalsPaused);
            },
            Operation::CreateOffer => {
                require!(!$config.pause_new_offers, ErrorCode::OffersPaused);
            },
            _ => {},
        }
        
        // Check auto-resume
        if let (Some(pause_time), Some(auto_resume)) = 
            ($config.pause_timestamp, $config.auto_resume_after) {
            let clock = Clock::get()?;
            if clock.unix_timestamp >= pause_time + auto_resume {
                // Auto-resume triggered
                $config.global_pause = false;
                $config.pause_new_trades = false;
                $config.pause_deposits = false;
                $config.pause_withdrawals = false;
                $config.pause_new_offers = false;
            }
        }
    };
}

// Usage in trade creation:
pub fn create_trade(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
    // Check circuit breaker first
    require_not_paused!(ctx.accounts.hub_config, Operation::CreateTrade);
    
    // Continue with normal logic...
}
```

## DOCUMENTATION:

- Circuit breaker patterns: https://martinfowler.com/bliki/CircuitBreaker.html
- Multi-sig implementation: https://github.com/coral-xyz/multisig
- Time-lock mechanisms in smart contracts
- Emergency response procedures for DeFi protocols

## OTHER CONSIDERATIONS:

- **Guardian Selection**: Choose trustworthy, geographically distributed guardians
- **Response Time**: Balance security with ability to respond quickly
- **Communication**: Have clear channels to notify users of pauses
- **Testing**: Regularly test pause/resume in staging environment
- **Legal**: Consider regulatory implications of freezing user funds
- **Gradual Resume**: Consider phased resumption of operations
- **Monitoring**: Set up alerts for any pause activation
- **Documentation**: Clear runbook for emergency procedures

## RELATED ISSUES:

- Prerequisites: FIX_01-05 (core security fixes)
- Next: FIX_07_VECTOR_BOUNDS (prevent DOS attacks)
- Critical for: Emergency response and damage control