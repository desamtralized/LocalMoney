# PRP: Circuit Breaker Emergency Pause System Implementation

## Objective
Implement a comprehensive protocol-wide emergency pause mechanism in the hub program with granular controls, multi-sig guardian system, time-locked resume functionality, and proper event emission to protect users during critical incidents.

## Context and Research Findings

### Current Codebase State
- **Hub Program Location**: `/contracts/solana/programs/hub/src/lib.rs`
- **HubConfig Structure**: Already exists with configuration fields at lines 230-266
  - Has `authority` field for admin control
  - Uses PDA seeds `[b"hub", b"config"]`
  - Space calculation at line 269-304
  - Update mechanism exists via `update_config` instruction
- **Error Handling Pattern**: Uses `#[error_code]` attribute with `HubError` enum (lines 385-397)
- **State Validation**: Programs use `require!` macro for validation
- **Event System**: Currently NO events are emitted in any program (must implement from scratch)
- **Related Programs**: trade, offer, profile, price programs all depend on hub config

### Existing Patterns to Follow
1. **Account Validation**: `has_one = authority` constraint in UpdateConfig (line 209)
2. **Error Definition**: 
   ```rust
   #[error_code]
   pub enum HubError {
       #[msg("Description")]
       ErrorName,
   }
   ```
3. **State Updates**: Mutable reference pattern `let hub_config = &mut ctx.accounts.hub_config;`
4. **Validation Pattern**: `require!(condition, ErrorCode::ErrorVariant);`

### External Resources and Documentation
- **Multi-sig Pattern Reference**: https://github.com/coral-xyz/multisig/blob/master/programs/multisig/src/lib.rs
  - Uses threshold signatures (M of N)
  - Stores approval state in separate account
- **Circuit Breaker Pattern**: https://martinfowler.com/bliki/CircuitBreaker.html
  - Half-open state for gradual recovery
  - Automatic timeout mechanism
- **Anchor Events**: https://book.anchor-lang.com/anchor_in_depth/events.html
  - Use `#[event]` attribute for event structs
  - Emit with `emit!()` macro
- **Time Management**: Use `Clock::get()?` for timestamp access

## Implementation Blueprint

### Task Order
1. Extend HubConfig struct with circuit breaker fields
2. Create guardian management instructions
3. Implement pause/resume logic with multi-sig
4. Add pause check macro for use across programs
5. Integrate pause checks into critical operations
6. Add event definitions and emission
7. Create emergency response tests
8. Update SDK with circuit breaker support
9. Document emergency procedures

### Architecture Design

```rust
// Step 1: Extend HubConfig (add to existing struct at line 230)
pub struct HubConfig {
    // ... existing fields ...
    
    // Circuit breaker fields (add after line 265)
    pub emergency_council: [Pubkey; 5],  // Fixed array for guardians
    pub guardian_count: u8,               // Active guardian count (1-5)
    pub required_signatures: u8,          // M of N threshold
    
    pub global_pause: bool,               // Master switch
    pub pause_new_trades: bool,          // Granular controls
    pub pause_deposits: bool,
    pub pause_withdrawals: bool,
    pub pause_new_offers: bool,
    
    pub pause_timestamp: i64,            // 0 = not paused
    pub auto_resume_after: i64,          // 0 = no auto-resume
    pub pause_reason: [u8; 32],          // Fixed size for reason
    
    pub pause_count: u32,                // Audit trail
    pub last_pause_by: Pubkey,           // Zero = never paused
}

// Step 2: Create pause approval account (PDA)
#[account]
pub struct PauseApproval {
    pub pause_type: PauseType,
    pub signatures: [Pubkey; 5],         // Who signed
    pub signature_count: u8,             // How many signed
    pub created_at: i64,
    pub expires_at: i64,                 // Approval timeout
    pub executed: bool,
    pub bump: u8,
}

// Step 3: Add events (new - programs don't have any yet)
#[event]
pub struct EmergencyPauseEvent {
    pub pause_type: PauseType,
    pub guardian: Pubkey,
    pub timestamp: i64,
    pub reason: [u8; 32],
    pub auto_resume_after: i64,
}

// Step 4: Create pause check macro for reuse
#[macro_export]
macro_rules! require_not_paused {
    ($config:expr, $operation:expr) => {{
        // Check global pause first
        require!(!$config.global_pause, HubError::GlobalPause);
        
        // Check specific operation pause
        match $operation {
            Operation::CreateTrade => {
                require!(!$config.pause_new_trades, HubError::TradingPaused);
            },
            Operation::FundEscrow => {
                require!(!$config.pause_deposits, HubError::DepositsPaused);
            },
            // ... other operations
        }
        
        // Auto-resume check
        if $config.pause_timestamp > 0 && $config.auto_resume_after > 0 {
            let clock = Clock::get()?;
            if clock.unix_timestamp >= $config.pause_timestamp + $config.auto_resume_after {
                // Clear all pauses (auto-resume triggered)
                $config.global_pause = false;
                $config.pause_new_trades = false;
                $config.pause_deposits = false;
                $config.pause_withdrawals = false;
                $config.pause_new_offers = false;
                $config.pause_timestamp = 0;
            }
        }
    }};
}
```

## Specific Implementation Details

### 1. Update HubConfig Space Calculation
**File**: `/contracts/solana/programs/hub/src/lib.rs`
**Line**: 269-304 (update SPACE constant)

```rust
impl HubConfig {
    pub const SPACE: usize = 8 + // discriminator
        // ... existing fields ...
        
        // Circuit breaker additions
        (32 * 5) + // emergency_council array
        1 +        // guardian_count
        1 +        // required_signatures
        1 +        // global_pause
        1 +        // pause_new_trades
        1 +        // pause_deposits
        1 +        // pause_withdrawals  
        1 +        // pause_new_offers
        8 +        // pause_timestamp
        8 +        // auto_resume_after
        32 +       // pause_reason
        4 +        // pause_count
        32;        // last_pause_by
}
```

### 2. Guardian Management Instructions

```rust
// Add guardian (authority only)
pub fn add_guardian(
    ctx: Context<ManageGuardian>,
    guardian: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.hub_config;
    
    require!(
        config.guardian_count < 5,
        HubError::MaxGuardiansReached
    );
    
    // Find empty slot and add
    for i in 0..5 {
        if config.emergency_council[i] == Pubkey::default() {
            config.emergency_council[i] = guardian;
            config.guardian_count += 1;
            break;
        }
    }
    
    Ok(())
}

// Initiate pause (guardian creates approval)
pub fn initiate_pause(
    ctx: Context<InitiatePause>,
    pause_type: PauseType,
    reason: [u8; 32],
    auto_resume_seconds: i64,
) -> Result<()> {
    let config = &ctx.accounts.hub_config;
    let approval = &mut ctx.accounts.pause_approval;
    
    // Verify guardian
    let mut is_guardian = false;
    for i in 0..config.guardian_count as usize {
        if config.emergency_council[i] == ctx.accounts.guardian.key() {
            is_guardian = true;
            break;
        }
    }
    require!(is_guardian, HubError::NotGuardian);
    
    // Initialize approval
    let clock = Clock::get()?;
    approval.pause_type = pause_type;
    approval.signatures[0] = ctx.accounts.guardian.key();
    approval.signature_count = 1;
    approval.created_at = clock.unix_timestamp;
    approval.expires_at = clock.unix_timestamp + 3600; // 1 hour expiry
    approval.executed = false;
    approval.bump = ctx.bumps.pause_approval;
    
    // Check if threshold met
    if approval.signature_count >= config.required_signatures {
        // Execute pause immediately
        execute_pause_internal(config, approval, reason, auto_resume_seconds)?;
    }
    
    Ok(())
}
```

### 3. Integration Points

**Trade Program** (`/contracts/solana/programs/trade/src/lib.rs`):
- Import macro: `use hub::require_not_paused;`
- Add at start of `create_trade` (line 17): `require_not_paused!(ctx.accounts.hub_config, Operation::CreateTrade);`
- Add at start of `fund_escrow` (line 143): `require_not_paused!(ctx.accounts.hub_config, Operation::FundEscrow);`

**Offer Program** (`/contracts/solana/programs/offer/src/lib.rs`):
- Add pause check in `create_offer` instruction

### 4. Error Definitions

Add to HubError enum (line 385-397):
```rust
#[error_code]
pub enum HubError {
    // ... existing errors ...
    
    #[msg("Protocol is globally paused")]
    GlobalPause,
    #[msg("Trading is temporarily paused")]
    TradingPaused,
    #[msg("Deposits are temporarily paused")]
    DepositsPaused,
    #[msg("Withdrawals are temporarily paused")]
    WithdrawalsPaused,
    #[msg("Offer creation is temporarily paused")]
    OffersPaused,
    #[msg("Not an authorized guardian")]
    NotGuardian,
    #[msg("Maximum guardians reached")]
    MaxGuardiansReached,
    #[msg("Insufficient guardian signatures")]
    InsufficientSignatures,
    #[msg("Resume time not reached")]
    ResumeTooEarly,
    #[msg("Invalid pause type")]
    InvalidPauseType,
    #[msg("Approval expired")]
    ApprovalExpired,
}
```

### 5. Event Implementation

Since no programs currently emit events, we need to:
1. Add event definitions with `#[event]` attribute
2. Import `emit` macro where needed
3. Emit events after state changes

```rust
// In hub program after pause execution
emit!(EmergencyPauseEvent {
    pause_type: pause_type.clone(),
    guardian: ctx.accounts.guardian.key(),
    timestamp: clock.unix_timestamp,
    reason,
    auto_resume_after,
});
```

## Testing Strategy

### Unit Tests
Create `/contracts/solana/tests/circuit_breaker.ts`:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";

describe("circuit-breaker", () => {
  // Test guardian management
  it("allows authority to add guardians", async () => {
    // Add 3 guardians
    // Verify guardian_count = 3
    // Verify emergency_council array
  });
  
  // Test pause initiation
  it("allows guardian to initiate pause", async () => {
    // Guardian creates pause approval
    // Verify approval account created
    // Check signature recorded
  });
  
  // Test multi-sig threshold
  it("executes pause when threshold met", async () => {
    // Set threshold to 2 of 3
    // First guardian initiates
    // Second guardian approves
    // Verify pause executed
    // Check pause state in config
  });
  
  // Test pause enforcement
  it("blocks operations when paused", async () => {
    // Pause trading
    // Attempt create_trade
    // Expect TradingPaused error
  });
  
  // Test auto-resume
  it("auto-resumes after timeout", async () => {
    // Pause with 60 second auto-resume
    // Warp time forward 61 seconds
    // Call any operation
    // Verify pause cleared
  });
});
```

### Integration Tests
Update `/contracts/solana/sdk/tests/integration/trading-flow.test.ts`:
- Add pause scenarios to existing flows
- Test SDK handling of pause errors

## Validation Gates

```bash
# Build all programs
anchor build

# Run tests
anchor test

# Check for compilation errors
cargo check --workspace

# Run SDK tests
cd sdk && npm test

# Verify no event compilation issues
grep -r "emit!" programs/ | wc -l  # Should be > 0 after implementation
```

## SDK Updates

Add to `/contracts/solana/sdk/src/index.ts`:

```typescript
// Circuit breaker status check
async getCircuitBreakerStatus(): Promise<{
  globalPause: boolean;
  pausedOperations: string[];
  pauseReason?: string;
  autoResumeAt?: Date;
}> {
  const hubConfig = await this.program.hub.account.hubConfig.fetch(this.hubConfigPda);
  
  const pausedOps = [];
  if (hubConfig.pauseNewTrades) pausedOps.push('trading');
  if (hubConfig.pauseDeposits) pausedOps.push('deposits');
  // ... etc
  
  return {
    globalPause: hubConfig.globalPause,
    pausedOperations: pausedOps,
    pauseReason: hubConfig.pauseTimestamp > 0 ? 
      new TextDecoder().decode(hubConfig.pauseReason) : undefined,
    autoResumeAt: hubConfig.autoResumeAfter > 0 ?
      new Date((hubConfig.pauseTimestamp + hubConfig.autoResumeAfter) * 1000) : undefined
  };
}

// Guardian management helpers
async addGuardian(guardian: PublicKey): Promise<string> { /* ... */ }
async removeGuardian(guardian: PublicKey): Promise<string> { /* ... */ }
async initiatePause(params: PauseParams): Promise<string> { /* ... */ }
```

## Emergency Response Procedures

### Documentation to Create
File: `/contracts/solana/EMERGENCY_PROCEDURES.md`

1. **Detection Phase**
   - Monitor for anomalies (unusual volume, price manipulation)
   - Guardian notification channels (Telegram, Discord)
   - Severity assessment criteria

2. **Response Phase**
   - Gather M of N guardians
   - Initiate appropriate pause type
   - Communicate with users (Twitter, Discord announcement)

3. **Investigation Phase**
   - Analyze root cause
   - Prepare fix if needed
   - Test fix on devnet

4. **Recovery Phase**
   - Deploy fix if needed
   - Gradual unpause (offers first, then trades)
   - Monitor for issues

5. **Post-Mortem**
   - Document incident
   - Update procedures
   - Adjust thresholds if needed

## Implementation Considerations

### Security
- Store guardian keys in hardware wallets
- Use different guardians for mainnet vs devnet
- Regular guardian availability checks
- Implement guardian rotation mechanism

### Performance
- Pause checks add minimal overhead (~10 instructions)
- Auto-resume check only on first operation after pause
- Event emission is asynchronous (no blocking)

### Upgradability
- Circuit breaker can be upgraded without affecting paused state
- Guardian list can be modified by authority
- Threshold can be adjusted based on threat level

## Related Changes

### Dependencies
- Requires FIX_08_EVENT_EMISSION to be partially complete (event infrastructure)
- Benefits from FIX_03_ACCOUNT_VALIDATION (guardian account validation)

### Affected Components
- All instruction handlers in trade, offer programs
- SDK needs pause status methods
- UI needs pause status indicators
- Monitoring needs pause alerting

## Success Metrics

1. **Functional**
   - All pause types work independently
   - Multi-sig threshold enforced correctly
   - Auto-resume functions properly
   - Events emitted for all state changes

2. **Security**
   - Only guardians can initiate pause
   - Only authority can manage guardians
   - Threshold prevents single guardian abuse
   - Time-lock prevents permanent freeze

3. **Operational**
   - Response time < 2 minutes from detection
   - Clear audit trail of all pauses
   - User communication automated
   - Recovery procedures documented

## Confidence Score: 9/10

This PRP provides comprehensive implementation details with:
- ✅ Complete code structure and placement
- ✅ Specific line numbers and file locations
- ✅ External documentation links
- ✅ Existing pattern references
- ✅ Full testing strategy
- ✅ SDK integration approach
- ✅ Emergency procedures
- ✅ Validation gates

The only uncertainty (-1 point) is around event emission since the codebase doesn't currently use events, requiring careful implementation of the event infrastructure.