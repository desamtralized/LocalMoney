name: "LocalMoney Solana: Complete Arbitration System Implementation"
description: |

## Purpose
Complete implementation of the arbitration system for the Solana LocalMoney protocol, enabling secure dispute resolution with automated arbitrator selection, comprehensive fee distribution, and seamless integration with existing trade lifecycle management.

## Core Principles
1. **Security First**: Cryptographically secure arbitrator selection using Switchboard VRF to prevent gaming
2. **Seamless Integration**: Build on existing trade program structure with minimal disruption
3. **Economic Incentives**: Proper fee distribution to incentivize fair dispute resolution
4. **State Consistency**: Maintain coherent state transitions across all cross-program interactions
5. **Gas Optimization**: Minimize transaction costs while ensuring security and functionality
6. **Comprehensive Coverage**: Handle all dispute scenarios including edge cases and error conditions

---

## Goal
Implement a complete arbitration system that enables trustless dispute resolution in the LocalMoney protocol through random arbitrator assignment, dispute initiation mechanisms, arbitrator settlement with proper fund distribution, and full integration with existing Hub, Trade, and Profile programs.

## Why
- **Trust Minimization**: Enable P2P trading without requiring trusted intermediaries
- **Fair Resolution**: Random arbitrator selection prevents bias and gaming
- **Economic Efficiency**: Automated settlement reduces dispute resolution costs and time
- **Protocol Completeness**: Arbitration is essential for production-ready P2P trading platform
- **User Protection**: Provides recourse mechanism for trade disputes and failed transactions

## What
Complete arbitration system implementation including:
- **Arbitrator Registration**: Admin-controlled arbitrator onboarding with authority validation
- **Random Selection Engine**: Cryptographically secure arbitrator assignment per trade
- **Dispute Initiation**: User-triggered dispute process with timing controls
- **Settlement Logic**: Arbitrator-controlled resolution with automated fund distribution
- **Fee Distribution**: Multi-destination fee splits (arbitrator + protocol fees)
- **Cross-Program Integration**: Seamless CPI calls to Trade, Profile, and Hub programs
- **State Management**: Complete dispute lifecycle state transitions
- **Security Hardening**: Comprehensive validation and error handling

### Success Criteria
- [ ] Arbitrator registration and management functions work correctly
- [ ] Random arbitrator selection integrates with Switchboard VRF
- [ ] Dispute initiation respects timing windows and authorization
- [ ] Settlement logic distributes funds correctly to all parties
- [ ] Cross-program invocations update trade states and profile stats
- [ ] All dispute-related TradeState transitions function properly
- [ ] Fee calculations match CosmWasm implementation accuracy
- [ ] Integration tests pass for all arbitration scenarios
- [ ] Gas costs remain reasonable for typical dispute resolution
- [ ] Security audit reveals no critical vulnerabilities

## All Needed Context

### Critical Documentation Sources
```yaml
# SOLANA CORE CONCEPTS
solana_pda: https://solana.com/docs/core/pda
solana_cpi: https://solana.com/docs/core/cpi
solana_programs: https://solana.com/docs/programs/anchor/pda
solana_randomness: https://docs.solana.com/developing/programming-model/runtime#random-seed-generation

# ANCHOR 0.31.1 FRAMEWORK
anchor_framework: https://www.anchor-lang.com/docs
anchor_cpi: https://www.anchor-lang.com/docs/basics/cpi
anchor_pdas: https://www.anchor-lang.com/docs/pdas
anchor_security: https://www.anchor-lang.com/docs/security

# VERIFIABLE RANDOMNESS (SECURITY CRITICAL)
switchboard_vrf: https://solana.com/developers/courses/connecting-to-offchain-data/verifiable-randomness-functions
orao_vrf: https://github.com/orao-network/solana-vrf
vrf_patterns: https://solana.stackexchange.com/questions/14667/how-can-i-generate-a-random-number-on-solana

# CROSS-PROGRAM INVOCATION PATTERNS
cpi_mastery: https://medium.com/@ancilartech/mastering-cross-program-invocations-in-anchor-a-developers-guide-to-solana-s-cpi-patterns-0f29a5734a3e
cpi_security: https://blog.asymmetric.re/invocation-security-navigating-vulnerabilities-in-solana-cpis/
cpi_quicknode: https://www.quicknode.com/guides/solana-development/anchor/what-are-cpis

# ESCROW AND DISPUTE PATTERNS
anchor_escrow: https://github.com/ironaddicteddog/anchor-escrow
kleros_arbitration: https://kleros.io/whitepaper.pdf
blockchain_arbitration: https://digitalcommons.pepperdine.edu/drlj/vol24/iss1/2/
```

### Current CosmWasm Arbitration Implementation Analysis

**Arbitrator Data Structure** (from `contracts/cosmwasm/packages/protocol/src/offer.rs:309-312`):
```rust
// Simple but effective arbitrator model - ADAPT for Solana PDAs  
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Arbitrator {
    pub arbitrator: Addr,        // Convert to Pubkey
    pub fiat: FiatCurrency,      // Preserve enum for currency specialization
}
```

**Random Selection Algorithm** (from `contracts/cosmwasm/packages/protocol/src/trade.rs:583-606`):
```rust
// Proven random selection logic - SECURITY CRITICAL to preserve
pub fn get_arbitrator_random<T: CustomQuery>(
    deps: Deps<T>,
    random_value: usize,           // 0-99 range from blockhash % 100
    fiat: FiatCurrency,
) -> Arbitrator {
    assert_range_0_to_99(random_value).unwrap();
    let storage = deps.storage;
    let result: Vec<Arbitrator> = arbitrators()
        .idx
        .fiat
        .prefix(fiat.to_string())
        .range(storage, None, None, Order::Descending)
        .take(10)                  // Limit pool size for gas efficiency
        .flat_map(|item| item.and_then(|(_, arbitrator)| Ok(arbitrator)))
        .collect();
    let arbitrator_count = result.len();

    // Secure mapping: RandomValue * (MaxMappedRange + 1) / (MaxRandomRange + 1)
    let random_index = random_value * arbitrator_count / (99 + 1);
    result[random_index].clone()
}
```

**Dispute Resolution Flow** (from `contracts/cosmwasm/contracts/trade/src/contract.rs:855-903`):
```rust
// Complete dispute initiation - PRESERVE business logic
fn dispute_escrow(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    trade_id: u64,
    buyer_contact: String,
    seller_contact: String,
) -> Result<Response, ContractError> {
    let mut trade = TradeModel::from_store(deps.storage, trade_id);
    
    // CRITICAL: Only buyer or seller can start dispute
    assert_sender_is_buyer_or_seller(
        info.sender.clone(),
        trade.buyer.clone(),
        trade.seller.clone(),
    ).unwrap();

    // CRITICAL: Validate state transition
    assert_trade_state_change_is_valid(
        trade.get_state(),
        TradeState::FiatDeposited,      // Must be in FiatDeposited state
        TradeState::EscrowDisputed,     // Transitions to EscrowDisputed
    ).unwrap();

    // CRITICAL: Respect dispute timing window
    let enables_dispute_at = trade.enables_dispute_at.unwrap();
    let current_block_time = env.block.time.seconds();
    if enables_dispute_at > current_block_time {
        let time_to_dispute = enables_dispute_at - current_block_time;
        return Err(ContractError::PrematureDisputeRequest { time_to_dispute });
    }

    // Update trade state and store contact info for arbitrator
    trade.set_state(TradeState::EscrowDisputed, &env, &info);
    trade.arbitrator_buyer_contact = Some(buyer_contact);
    trade.arbitrator_seller_contact = Some(seller_contact);
    TradeModel::store(deps.storage, &trade).unwrap();
}
```

**Settlement and Fee Distribution** (from `contracts/cosmwasm/contracts/trade/src/contract.rs:905-999`):
```rust
// Complex fee distribution - CRITICAL to preserve accuracy
fn settle_dispute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    trade_id: u64,
    winner: Addr,
) -> Result<Response, ContractError> {
    let hub_config = get_hub_config(deps.as_ref());
    let mut trade = TradeModel::from_store(deps.storage, trade_id);

    // SECURITY: Only arbitrator can settle
    if trade.arbitrator.ne(&info.sender) {
        return Err(ContractError::Unauthorized {
            owner: trade.arbitrator.clone(),
            caller: info.sender,
        });
    }

    // SECURITY: Must be in disputed state
    if TradeState::EscrowDisputed.ne(&trade.get_state()) {
        return Err(InvalidTradeState {
            current: trade.get_state(),
            expected: TradeState::EscrowDisputed,
        });
    }

    // CRITICAL: Winner must be maker or taker (not arbitrary address)
    let offer = load_offer(&deps.querier, trade.offer_id.clone(), 
                          trade.offer_contract.to_string()).unwrap().offer;
    let maker = offer.owner.clone();
    let taker = if trade.seller.eq(&maker) { 
        trade.buyer.clone() 
    } else { 
        trade.seller.clone() 
    };

    if winner.eq(&maker) {
        trade.set_state(TradeState::SettledForMaker, &env, &info);
    } else if winner.eq(&taker) {
        trade.set_state(TradeState::SettledForTaker, &env, &info)
    } else {
        return Err(ContractError::InvalidSender { 
            sender: winner, buyer: trade.buyer, seller: trade.seller 
        });
    }

    // CRITICAL: Complex fee distribution logic
    let arbitration_fee_amount = (hub_config.arbitration_fee_pct
        * Decimal::from_ratio(trade.amount.u128(), 1u128)).atomics();
    let mut release_amount = trade.amount.sub(Uint128::from(arbitration_fee_amount));
    
    // Protocol fees only deducted if maker is buyer
    if trade.buyer.eq(&offer.owner) {
        release_amount = release_amount.sub(fee_info.total_fees());
    }

    // Send funds: winner gets release_amount, arbitrator gets arbitration fee
    send_msgs.push(SubMsg::new(create_send_msg(winner.clone(), winner_amount)));
    send_msgs.push(SubMsg::new(create_send_msg(trade.arbitrator.clone(), arbitration_fee)));
}
```

### Existing Solana Trade Program Integration Points

**Current Trade Account Structure** (from `contracts/solana/programs/trade/src/lib.rs:420-438`):
```rust
// ALREADY HAS arbitration infrastructure - build on this
#[account]
pub struct Trade {
    pub id: u64,
    pub offer_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub arbitrator: Pubkey,          // ✅ ALREADY EXISTS - populate with random selection
    pub token_mint: Pubkey,
    pub amount: u64,
    pub fiat_currency: FiatCurrency,
    pub locked_price: u64,
    pub state: TradeState,
    pub created_at: u64,
    pub expires_at: u64,
    pub dispute_window_at: Option<u64>, // ✅ ALREADY EXISTS - used for timing validation
    pub state_history: Vec<TradeStateItem>,
    pub buyer_contact: Option<String>,
    pub seller_contact: Option<String>,
    pub bump: u8,
}
```

**Existing TradeState Enum** (from `contracts/solana/programs/profile/src/lib.rs:175-188`):
```rust
// ✅ DISPUTE STATES ALREADY DEFINED - just need to implement transitions
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TradeState {
    RequestCreated,      // ✅ Implemented
    RequestCanceled,     // ✅ Implemented  
    RequestExpired,      // TODO: Implement expiration logic
    RequestAccepted,     // ✅ Implemented
    EscrowFunded,        // ✅ Implemented
    EscrowCanceled,      // TODO: Implement cancellation
    EscrowRefunded,      // TODO: Implement refund logic
    FiatDeposited,       // ✅ Implemented
    EscrowReleased,      // ✅ Implemented
    EscrowDisputed,      // 🎯 NEED TO IMPLEMENT - main arbitration state
    SettledForMaker,     // 🎯 NEED TO IMPLEMENT - arbitrator settles for seller
    SettledForTaker,     // 🎯 NEED TO IMPLEMENT - arbitrator settles for buyer
}
```

**Current CPI Pattern** (from `contracts/solana/programs/trade/src/lib.rs:42-47`):
```rust
// ✅ EXISTING CPI PATTERN - extend for arbitration program updates
// Update buyer profile stats via CPI
let cpi_program = ctx.accounts.profile_program.to_account_info();
let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
    profile: ctx.accounts.buyer_profile.to_account_info(),
};
let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
profile::cpi::update_trade_stats(cpi_ctx, TradeState::RequestCreated)?;
```

### Modern Solana Arbitration Architecture

**Program Structure Decision**:
Based on analysis, **extend the existing Trade program** rather than create separate arbitration program:
- Arbitrator management functions in Trade program (admin-only)
- Dispute functions in Trade program (user-facing)  
- VRF integration in Trade program (for random selection)
- Cross-program calls to Profile program (for stats updates)

**Secure VRF Integration Pattern** (Based on Switchboard VRF 2024):
```rust
// SECURITY CRITICAL: Use Switchboard VRF for cryptographically secure randomness
use switchboard_v2::VrfAccountData;

#[derive(Accounts)]
pub struct RequestRandomArbitrator<'info> {
    #[account(mut)]
    pub vrf: AccountLoader<'info, VrfAccountData>,
    #[account(mut)]
    pub trade: Account<'info, Trade>,
    #[account(signer)]
    pub authority: Signer<'info>,
    pub vrf_program: Program<'info, switchboard_v2::program::Switchboard>,
}

// Callback instruction for VRF result
#[derive(Accounts)]
pub struct ConsumeRandomness<'info> {
    #[account(mut)]
    pub trade: Account<'info, Trade>,
    #[account(
        mut,
        seeds = [b"arbitrator-pool", trade.fiat_currency.to_string().as_bytes()],
        bump
    )]
    pub arbitrator_pool: Account<'info, ArbitratorPool>,
}
```

**Account Structure for Arbitrator Management**:
```rust
// PDA: seeds = [b"arbitrator-pool", fiat_currency.as_bytes()]
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

// PDA: seeds = [b"arbitrator", arbitrator_pubkey, fiat_currency.as_bytes()]
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
```

### Security Patterns and Known Gotchas

**1. VRF Security Requirements**:
- **NEVER** use blockhash, timestamps, or slot numbers for randomness (easily manipulated)
- **ALWAYS** use callback pattern - randomness is not immediately available
- **VALIDATE** VRF result using Switchboard verification
- **HANDLE** VRF failures gracefully with retry mechanisms

**2. CPI Security Patterns** (from 2024 security research):
```rust
// CORRECT: Validate program IDs to prevent arbitrary CPI attacks
#[derive(Accounts)]
pub struct UpdateProfileViaCPI<'info> {
    /// CHECK: This is the profile program
    #[account(constraint = profile_program.key == &profile::ID)]
    pub profile_program: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub profile: Account<'info, Profile>,
}

// CORRECT: Reload accounts after CPI to prevent stale data usage
pub fn settle_dispute_with_profile_update(ctx: Context<SettleDispute>) -> Result<()> {
    // Perform settlement logic
    settle_dispute_internal(&mut ctx.accounts.trade, winner)?;
    
    // Update profile via CPI
    update_profile_stats_cpi(&ctx)?;
    
    // CRITICAL: Reload trade account after CPI
    ctx.accounts.trade.reload()?;
    
    // Continue with post-CPI logic using fresh data
    finalize_settlement(&ctx.accounts.trade)?;
    Ok(())
}
```

**3. Account Validation Patterns**:
```rust
// SECURITY: Comprehensive authorization checks
pub fn initiate_dispute(ctx: Context<InitiateDispute>) -> Result<()> {
    let trade = &ctx.accounts.trade;
    
    // CRITICAL: Only buyer or seller can initiate dispute
    require!(
        ctx.accounts.user.key() == trade.buyer || ctx.accounts.user.key() == trade.seller,
        ArbitrationError::Unauthorized
    );
    
    // CRITICAL: Must be in FiatDeposited state
    require!(
        trade.state == TradeState::FiatDeposited,
        ArbitrationError::InvalidTradeState
    );
    
    // CRITICAL: Dispute window must be open
    let clock = Clock::get()?;
    let dispute_window = trade.dispute_window_at.ok_or(ArbitrationError::NoDisputeWindow)?;
    require!(
        clock.unix_timestamp >= dispute_window,
        ArbitrationError::DisputeWindowNotOpen
    );
}
```

### Fee Distribution Architecture

**Multi-Destination Fee Split Pattern**:
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ArbitrationFees {
    pub arbitrator_fee: u64,        // Goes to arbitrator
    pub protocol_fee: u64,          // Goes to protocol treasury  
    pub burn_fee: u64,              // Burned (if applicable)
}

pub fn calculate_arbitration_fees(
    trade_amount: u64,
    hub_config: &HubConfig,
) -> Result<ArbitrationFees> {
    // Match CosmWasm fee calculation exactly
    let arbitrator_basis_points = hub_config.arbitration_fee_pct; // e.g., 200 = 2%
    let protocol_basis_points = hub_config.protocol_fee_pct;      // e.g., 100 = 1%
    
    let arbitrator_fee = (trade_amount as u128 * arbitrator_basis_points as u128 / 10000) as u64;
    let protocol_fee = (trade_amount as u128 * protocol_basis_points as u128 / 10000) as u64;
    
    Ok(ArbitrationFees {
        arbitrator_fee,
        protocol_fee,
        burn_fee: 0, // Not used in arbitration
    })
}
```

## Implementation Blueprint

### Phase 1: Arbitrator Management Infrastructure
**Duration**: 3-4 hours

**Tasks**:
1. **Extend Trade Program with Arbitrator Functions**:
   ```rust
   // Add to contracts/solana/programs/trade/src/lib.rs
   pub fn register_arbitrator(
       ctx: Context<RegisterArbitrator>,
       fiat_currency: FiatCurrency,
   ) -> Result<()> {
       // Admin-only function to register new arbitrators
   }
   
   pub fn deactivate_arbitrator(
       ctx: Context<DeactivateArbitrator>,
       arbitrator: Pubkey,
       fiat_currency: FiatCurrency,
   ) -> Result<()> {
       // Admin-only function to deactivate arbitrators
   }
   ```

2. **Implement Account Structures**:
   - Create `ArbitratorPool` account for each fiat currency
   - Create `ArbitratorInfo` account for arbitrator metadata
   - Add proper space calculations and PDA derivations

3. **Add Admin Authorization**:
   ```rust
   // Query hub config for admin validation
   #[derive(Accounts)]
   pub struct RegisterArbitrator<'info> {
       #[account(
           constraint = hub_config.authority == authority.key() @ ArbitrationError::Unauthorized
       )]
       pub hub_config: Account<'info, HubConfig>,
       pub authority: Signer<'info>,
       // ... other accounts
   }
   ```

**Validation**: 
```bash
cd contracts/solana
anchor build --program trade
anchor test --skip-deploy -t "arbitrator management"
```

### Phase 2: Secure Random Selection with VRF
**Duration**: 4-5 hours

**Tasks**:
1. **Add Switchboard VRF Dependencies**:
   ```toml
   # In programs/trade/Cargo.toml
   [dependencies]
   switchboard-v2 = "0.4"
   ```

2. **Implement VRF Request Function**:
   ```rust
   pub fn request_random_arbitrator(
       ctx: Context<RequestRandomArbitrator>,
       trade_id: u64,
   ) -> Result<()> {
       // Request VRF randomness for arbitrator selection
       let vrf_request = VrfRequestRandomness {
           authority: ctx.accounts.trade.to_account_info(),
           vrf: ctx.accounts.vrf.to_account_info(),
           oracle_queue: ctx.accounts.oracle_queue.to_account_info(),
           queue_authority: ctx.accounts.queue_authority.to_account_info(),
           data_buffer: ctx.accounts.data_buffer.to_account_info(),
           permission: ctx.accounts.permission.to_account_info(),
           escrow: ctx.accounts.escrow.to_account_info(),
           payer_wallet: ctx.accounts.payer_wallet.to_account_info(),
           payer_authority: ctx.accounts.payer_authority.to_account_info(),
           recent_blockhashes: ctx.accounts.recent_blockhashes.to_account_info(),
           program_state: ctx.accounts.program_state.to_account_info(),
           token_program: ctx.accounts.token_program.to_account_info(),
       };
       
       switchboard_v2::VrfRequestRandomness::invoke_signed(
           vrf_request,
           &[&[b"trade", trade_id.to_le_bytes().as_ref(), &[ctx.accounts.trade.bump]]],
       )?;
   }
   ```

3. **Implement VRF Callback Function**:
   ```rust
   pub fn consume_randomness(
       ctx: Context<ConsumeRandomness>,
       trade_id: u64,
   ) -> Result<()> {
       // Called by Switchboard with VRF result
       let vrf_result = &ctx.accounts.vrf.load()?.get_result()?;
       let randomness_bytes = vrf_result.value;
       
       // Convert bytes to selection index (matching CosmWasm algorithm)
       let random_u64 = u64::from_le_bytes([
           randomness_bytes[0], randomness_bytes[1], randomness_bytes[2], randomness_bytes[3],
           randomness_bytes[4], randomness_bytes[5], randomness_bytes[6], randomness_bytes[7],
       ]);
       let random_index = (random_u64 % 100) as usize; // 0-99 range
       
       // Select arbitrator using CosmWasm algorithm
       let selected_arbitrator = select_arbitrator_from_pool(
           &ctx.accounts.arbitrator_pool,
           random_index,
       )?;
       
       // Update trade with selected arbitrator
       ctx.accounts.trade.arbitrator = selected_arbitrator;
   }
   ```

**Validation**:
```bash
# Test VRF integration on devnet (requires actual VRF setup)
anchor test --provider.cluster devnet -t "random arbitrator selection"
```

### Phase 3: Dispute Initiation and State Management  
**Duration**: 3-4 hours

**Tasks**:
1. **Implement Dispute Initiation**:
   ```rust
   pub fn initiate_dispute(
       ctx: Context<InitiateDispute>,
       buyer_contact: String,
       seller_contact: String,
   ) -> Result<()> {
       let trade = &mut ctx.accounts.trade;
       let clock = Clock::get()?;
       
       // All validation logic from CosmWasm implementation
       // Update state to EscrowDisputed
       // Store contact information for arbitrator
       // Emit dispute event
   }
   ```

2. **Add State Validation Helpers**:
   ```rust
   pub fn validate_dispute_initiation(trade: &Trade, user: &Pubkey, clock: &Clock) -> Result<()> {
       // Port all validation logic from CosmWasm
   }
   ```

3. **Update Profile Stats via CPI**:
   ```rust
   // Call profile program to update dispute-related statistics
   profile::cpi::update_dispute_stats(cpi_ctx, trade.buyer, trade.seller)?;
   ```

**Validation**:
```bash
anchor test -t "dispute initiation" 
anchor test -t "dispute timing validation"
anchor test -t "dispute authorization checks"
```

### Phase 4: Settlement Logic and Fee Distribution
**Duration**: 4-5 hours

**Tasks**:
1. **Implement Settlement Function**:
   ```rust
   pub fn settle_dispute(
       ctx: Context<SettleDispute>,
       winner: Pubkey,
   ) -> Result<()> {
       let trade = &mut ctx.accounts.trade;
       
       // Validate arbitrator authority
       // Validate winner is maker or taker
       // Calculate complex fee distribution
       // Transfer funds to winner and arbitrator
       // Update trade state to SettledForMaker/SettledForTaker
       // Update profile stats via CPI
   }
   ```

2. **Implement Multi-Destination Token Transfers**:
   ```rust
   // Transfer net amount to winner
   transfer_checked(
       CpiContext::new_with_signer(/* ... */),
       winner_amount,
       ctx.accounts.token_mint.decimals,
   )?;
   
   // Transfer arbitrator fee  
   transfer_checked(
       CpiContext::new_with_signer(/* ... */),
       arbitrator_fee,
       ctx.accounts.token_mint.decimals,
   )?;
   
   // Transfer protocol fee to treasury
   transfer_checked(
       CpiContext::new_with_signer(/* ... */),
       protocol_fee,
       ctx.accounts.token_mint.decimals,
   )?;
   ```

3. **Add Comprehensive Fee Calculation**:
   ```rust
   pub fn calculate_settlement_amounts(
       trade: &Trade,
       offer: &Offer,
       hub_config: &HubConfig,
   ) -> Result<SettlementAmounts> {
       // Port exact CosmWasm fee calculation logic
   }
   ```

**Validation**:
```bash
anchor test -t "settlement authorization"
anchor test -t "fee calculation accuracy" 
anchor test -t "multi-destination transfers"
```

### Phase 5: Integration Testing and Security Hardening
**Duration**: 3-4 hours

**Tasks**:
1. **End-to-End Integration Tests**:
   ```typescript
   describe("Complete Arbitration Flow", () => {
     it("handles full dispute resolution cycle", async () => {
       // 1. Register arbitrators for USD
       await registerArbitrator(arbitrator1, "USD");
       await registerArbitrator(arbitrator2, "USD");
       
       // 2. Create trade with random arbitrator assignment
       const tradeId = await createTradeWithArbitrator({
         fiatCurrency: "USD",
         amount: 1000_000_000, // 1000 USDC
       });
       
       // 3. Complete trade flow to FiatDeposited state
       await fundEscrow(tradeId);
       await markFiatDeposited(tradeId);
       
       // 4. Wait for dispute window to open
       await sleep(DISPUTE_WINDOW_SECONDS * 1000);
       
       // 5. Initiate dispute
       await initiateDispute(tradeId, {
         buyerContact: "buyer@email.com",
         sellerContact: "seller@email.com"
       });
       
       // 6. Arbitrator settles dispute
       await settleDispute(tradeId, {
         winner: buyerWallet.publicKey, // Buyer wins
         arbitrator: assignedArbitrator
       });
       
       // 7. Verify all balances and state updates
       await verifySettlementResults(tradeId);
     });
   });
   ```

2. **Security Edge Case Testing**:
   ```typescript
   describe("Arbitration Security", () => {
     it("prevents unauthorized dispute initiation", async () => {
       // Test with non-participant trying to initiate dispute
     });
     
     it("prevents premature dispute initiation", async () => {
       // Test dispute before window opens
     });
     
     it("prevents unauthorized settlement", async () => {
       // Test with non-arbitrator trying to settle
     });
     
     it("prevents invalid winner selection", async () => {
       // Test settlement with arbitrary winner address  
     });
   });
   ```

3. **Gas Optimization Analysis**:
   ```bash
   # Measure actual gas costs for arbitration functions
   anchor test --show-logs -t "gas cost analysis"
   ```

**Validation**:
```bash
anchor test                           # All tests pass
anchor test -t "security edge cases"  # Security tests pass
anchor test -t "integration"          # E2E integration tests pass
```

## Validation Gates (Must be Executable)

### Phase Validation Commands
```bash
# Phase 1: Arbitrator Management 
cd contracts/solana
anchor build --program trade
anchor test --skip-deploy -t "arbitrator.*management"

# Phase 2: VRF Integration
anchor test --provider.cluster devnet -t "random.*arbitrator"
anchor test -t "vrf.*callback"

# Phase 3: Dispute Initiation
anchor test -t "dispute.*initiation"
anchor test -t "dispute.*validation" 
anchor test -t "state.*transition"

# Phase 4: Settlement Logic
anchor test -t "settlement.*calculation"
anchor test -t "fee.*distribution"
anchor test -t "multi.*transfer"

# Phase 5: Integration and Security
anchor test -t "arbitration.*integration"
anchor test -t "security.*edge.*cases"
anchor test -t "gas.*optimization"
```

### Final Validation Checklist
```bash
# Complete system validation
anchor test                               # All arbitration tests pass
anchor build --verifiable                 # Reproducible builds
npm run lint                              # Code quality validation
npm run type-check                        # TypeScript validation

# Security validation
anchor test -t "unauthorized.*access"     # Authorization tests pass
anchor test -t "invalid.*state"           # State transition tests pass  
anchor test -t "fee.*accuracy"            # Fee calculation accuracy tests pass

# Performance validation
anchor test --show-logs | grep "Gas used" # Gas usage within acceptable limits
```

### Manual Security Checklist
```bash
# Critical security verifications (manual review required)
echo "✅ VRF randomness cannot be manipulated by validators"
echo "✅ Only authorized arbitrators can settle disputes"  
echo "✅ Only trade participants can initiate disputes"
echo "✅ Fee calculations match CosmWasm implementation exactly"
echo "✅ CPI calls properly validate target program IDs"
echo "✅ Account data is reloaded after CPI calls"
echo "✅ All state transitions follow business logic rules"
echo "✅ Arbitrator selection is cryptographically secure"
```

## Quality Confidence Score

**Confidence Level: 9/10** for one-pass implementation success

**Reasoning**:
- ✅ **Comprehensive Context**: Complete analysis of CosmWasm reference implementation with exact business logic
- ✅ **Security-First Approach**: VRF-based randomness, comprehensive CPI security patterns, authorization validation
- ✅ **Existing Infrastructure**: Building on established Trade program structure with minimal disruption
- ✅ **Proven Patterns**: All implementation patterns based on production-tested approaches and official documentation
- ✅ **Detailed Implementation**: Step-by-step blueprint with specific code examples and error handling
- ✅ **Executable Validation**: Comprehensive test suite covering happy path and security edge cases
- ✅ **Integration-Ready**: Full CPI integration with existing Profile and Hub programs

**Risk Factors** (-1 point):
- **VRF Integration Complexity**: First-time VRF implementation requires careful callback handling and error management

**Mitigation**:
- **Proven VRF Patterns**: Using official Switchboard documentation and established callback patterns
- **Comprehensive Testing**: VRF integration tested on devnet with actual randomness oracle
- **Fallback Mechanisms**: Graceful handling of VRF failures with retry logic
- **Security Review**: Manual security checklist ensures all critical paths are validated

This PRP provides everything needed for successful one-pass implementation of a secure, production-ready arbitration system that seamlessly integrates with the existing LocalMoney Solana protocol while maintaining all business logic and security properties from the proven CosmWasm implementation.