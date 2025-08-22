# PRP: VRF-Based Arbitrator Selection Implementation

## Context
The LocalMoney P2P trading platform currently uses a predictable pseudo-random arbitrator selection mechanism in `contracts/solana/programs/trade/src/lib.rs` (line 452-456). This deterministic approach using `trade_id + timestamp` is vulnerable to manipulation and gaming. The codebase has a TODO comment (line 450) explicitly stating: "Replace with proper VRF once dependency issues are resolved".

**Current Implementation Problems:**
- Predictable selection: `pseudo_random = (trade_id.wrapping_add(clock.unix_timestamp as u64)) as usize`
- Vulnerable to timing attacks and manipulation
- No true randomness source
- Limited to simple round-robin style distribution

## Goal
Replace the predictable arbitrator selection with a Verifiable Random Function (VRF) implementation using Switchboard VRF as the primary solution, with a commit-reveal scheme as fallback. This will ensure fair, unpredictable, and verifiable arbitrator assignment with reputation-based weighting.

## Architecture Overview

### Current Architecture
- **Trade Program**: `contracts/solana/programs/trade/src/lib.rs`
  - `assign_arbitrator` function (line 433-462)
  - `select_arbitrator_from_pool` function (line 2442-2466)
  - ArbitratorPool and ArbitratorInfo accounts
- **Testing**: TypeScript tests in `contracts/solana/sdk/tests/`

### Target Architecture
```
┌──────────────────┐
│   Trade Program  │
├──────────────────┤
│  VRF Module      │──────► Switchboard VRF Oracle
│  - Request       │        (External Oracle Network)
│  - Process       │
│  - Fallback      │
├──────────────────┤
│  Selection Logic │
│  - Weighting     │
│  - Reputation    │
│  - Availability  │
└──────────────────┘
```

## External Dependencies & Documentation

### Primary: Switchboard VRF
- **Crate**: `switchboard-solana = "0.31.*"` (matches anchor version)
- **Docs**: https://docs.switchboard.xyz/solana/vrf
- **Program ID**: `SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f`
- **Key Features**:
  - On-chain verifiable randomness
  - Oracle network validation
  - ~2-3 slot latency for response

### Alternative: ORAO Network VRF
- **GitHub**: https://github.com/orao-network/solana-vrf
- **Docs**: https://docs.orao.network/
- **Simpler integration, lower cost

### Fallback: Commit-Reveal Scheme
- Pure on-chain implementation
- No external dependencies
- Higher latency (2-phase process)

## Implementation Blueprint

### Phase 1: Add VRF Dependencies

**File**: `contracts/solana/programs/trade/Cargo.toml`
```toml
[dependencies]
anchor-lang = { workspace = true, features = ["init-if-needed"] }
anchor-spl = { workspace = true }
switchboard-solana = "0.31.1"  # Match anchor version
hex = "0.4"
profile = { path = "../profile", features = ["cpi"] }
offer = { path = "../offer", features = ["cpi"] }
hub = { path = "../hub", features = ["cpi"] }
```

### Phase 2: Create VRF Module

**File**: `contracts/solana/programs/trade/src/vrf.rs`
```rust
use anchor_lang::prelude::*;
use switchboard_solana::{VrfAccountData, VrfRequestRandomness};

// VRF-based arbitrator selection account
#[account]
pub struct VrfArbitratorSelection {
    pub trade_id: u64,
    pub vrf_account: Pubkey,
    pub randomness_request: Option<[u8; 32]>,
    pub randomness_result: Option<[u8; 32]>,
    pub selected_arbitrator: Option<Pubkey>,
    pub request_timestamp: i64,
    pub selection_status: SelectionStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Debug)]
pub enum SelectionStatus {
    Pending,
    RandomnessRequested,
    RandomnessReceived,
    ArbitratorSelected,
    Failed,
}

// Weighted selection implementation
pub fn calculate_arbitrator_weight(info: &ArbitratorInfo) -> u64 {
    let mut weight = 1000u64; // Base weight
    
    // Reputation multiplier (0-10000 basis points)
    weight = weight
        .saturating_mul(info.reputation_score as u64)
        .saturating_div(10000);
    
    // Availability bonus
    let availability_ratio = info.max_concurrent_cases
        .saturating_sub(info.current_cases) as u64;
    weight = weight.saturating_add(availability_ratio.saturating_mul(100));
    
    // Experience bonus (capped at 100 cases)
    let experience_bonus = info.resolved_cases.min(100).saturating_mul(10);
    weight = weight.saturating_add(experience_bonus);
    
    weight
}

// Commit-reveal fallback
#[account]
pub struct CommitRevealRandomness {
    pub trade_id: u64,
    pub commits: Vec<CommitData>,
    pub reveals: Vec<RevealData>,
    pub final_seed: Option<[u8; 32]>,
    pub reveal_deadline: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CommitData {
    pub committer: Pubkey,
    pub commitment: [u8; 32],
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RevealData {
    pub revealer: Pubkey,
    pub value: [u8; 32],
    pub nonce: [u8; 32],
}
```

### Phase 3: Update Trade Program

**File**: `contracts/solana/programs/trade/src/lib.rs`

**Add at top (after line 10):**
```rust
pub mod vrf;
use vrf::*;
```

**Replace assign_arbitrator function (lines 433-462):**
```rust
pub fn request_arbitrator_vrf(
    ctx: Context<RequestArbitratorVrf>,
    trade_id: u64,
) -> Result<()> {
    let selection = &mut ctx.accounts.selection;
    let clock = Clock::get()?;
    
    // Initialize VRF selection account
    selection.trade_id = trade_id;
    selection.vrf_account = ctx.accounts.vrf.key();
    selection.request_timestamp = clock.unix_timestamp;
    selection.selection_status = SelectionStatus::Pending;
    selection.bump = ctx.bumps.selection;
    
    // Request randomness from Switchboard
    let vrf_request_ctx = VrfRequestRandomness {
        authority: ctx.accounts.vrf_authority.to_account_info(),
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
    
    vrf_request_ctx.invoke()?;
    selection.selection_status = SelectionStatus::RandomnessRequested;
    
    emit!(VrfRequestedEvent {
        trade_id,
        vrf_account: ctx.accounts.vrf.key(),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

pub fn process_vrf_result(
    ctx: Context<ProcessVrfResult>,
) -> Result<()> {
    let selection = &mut ctx.accounts.selection;
    let arbitrator_pool = &ctx.accounts.arbitrator_pool;
    let clock = Clock::get()?;
    
    // Verify VRF has new randomness
    let vrf = ctx.accounts.vrf.load()?;
    require!(
        vrf.num_callbacks_processed > 0,
        ErrorCode::NoRandomnessAvailable
    );
    
    // Get randomness result
    let randomness = vrf.get_result()?;
    selection.randomness_result = Some(randomness);
    selection.selection_status = SelectionStatus::RandomnessReceived;
    
    // Select weighted arbitrator
    let selected = select_weighted_arbitrator(
        &randomness,
        arbitrator_pool,
        &ctx.remaining_accounts,
    )?;
    
    selection.selected_arbitrator = Some(selected);
    selection.selection_status = SelectionStatus::ArbitratorSelected;
    
    // Update trade
    let trade = &mut ctx.accounts.trade;
    trade.arbitrator = selected;
    
    emit!(ArbitratorSelectedEvent {
        trade_id: selection.trade_id,
        arbitrator: selected,
        randomness: hex::encode(&randomness),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

fn select_weighted_arbitrator(
    randomness: &[u8; 32],
    pool: &ArbitratorPool,
    arbitrator_infos: &[AccountInfo],
) -> Result<Pubkey> {
    require!(!pool.arbitrators.is_empty(), ErrorCode::NoArbitratorsAvailable);
    
    // Calculate weights
    let mut weights = Vec::new();
    let mut total_weight = 0u64;
    
    for (i, arbitrator_pubkey) in pool.arbitrators.iter().enumerate() {
        if i < arbitrator_infos.len() {
            let info_account = &arbitrator_infos[i];
            let info = ArbitratorInfo::try_from_slice(&info_account.data.borrow())?;
            
            if info.is_active && info.current_cases < info.max_concurrent_cases {
                let weight = calculate_arbitrator_weight(&info);
                weights.push((arbitrator_pubkey, weight));
                total_weight = total_weight.saturating_add(weight);
            }
        }
    }
    
    require!(total_weight > 0, ErrorCode::NoEligibleArbitrators);
    
    // Convert randomness to selection
    let random_value = u64::from_le_bytes(randomness[0..8].try_into().unwrap());
    let selection_point = random_value % total_weight;
    
    // Select based on weighted distribution
    let mut cumulative = 0u64;
    for (arbitrator, weight) in weights {
        cumulative = cumulative.saturating_add(weight);
        if selection_point < cumulative {
            return Ok(*arbitrator);
        }
    }
    
    Ok(*pool.arbitrators.last().unwrap())
}

// Fallback function (keep existing assign_arbitrator renamed)
pub fn assign_arbitrator_fallback(
    ctx: Context<AssignArbitrator>,
    trade_id: u64,
) -> Result<()> {
    // Keep existing implementation as fallback
    // ... existing code ...
}
```

### Phase 4: Add Context Structs

**File**: `contracts/solana/programs/trade/src/lib.rs` (add after existing contexts)
```rust
#[derive(Accounts)]
#[instruction(trade_id: u64)]
pub struct RequestArbitratorVrf<'info> {
    #[account(mut)]
    pub trade: Account<'info, Trade>,
    
    #[account(
        init,
        payer = payer,
        space = 8 + VrfArbitratorSelection::INIT_SPACE,
        seeds = [b"vrf_selection", trade_id.to_le_bytes().as_ref()],
        bump
    )]
    pub selection: Account<'info, VrfArbitratorSelection>,
    
    pub arbitrator_pool: Account<'info, ArbitratorPool>,
    
    // Switchboard accounts
    /// CHECK: Switchboard VRF account
    pub vrf: AccountLoader<'info, VrfAccountData>,
    /// CHECK: VRF authority
    pub vrf_authority: AccountInfo<'info>,
    /// CHECK: Oracle queue
    pub oracle_queue: AccountInfo<'info>,
    /// CHECK: Queue authority
    pub queue_authority: AccountInfo<'info>,
    /// CHECK: Data buffer
    pub data_buffer: AccountInfo<'info>,
    /// CHECK: Permission account
    pub permission: AccountInfo<'info>,
    /// CHECK: Escrow account
    pub escrow: AccountInfo<'info>,
    /// CHECK: Payer wallet
    pub payer_wallet: AccountInfo<'info>,
    /// CHECK: Payer authority
    pub payer_authority: Signer<'info>,
    /// CHECK: Recent blockhashes
    pub recent_blockhashes: AccountInfo<'info>,
    /// CHECK: Program state
    pub program_state: AccountInfo<'info>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ProcessVrfResult<'info> {
    #[account(mut)]
    pub trade: Account<'info, Trade>,
    
    #[account(
        mut,
        seeds = [b"vrf_selection", trade.id.to_le_bytes().as_ref()],
        bump = selection.bump
    )]
    pub selection: Account<'info, VrfArbitratorSelection>,
    
    pub arbitrator_pool: Account<'info, ArbitratorPool>,
    
    /// CHECK: Switchboard VRF account
    pub vrf: AccountLoader<'info, VrfAccountData>,
    
    pub authority: Signer<'info>,
}
```

### Phase 5: Add Error Codes

**File**: `contracts/solana/programs/trade/src/lib.rs` (in ErrorCode enum)
```rust
#[error_code]
pub enum ErrorCode {
    // ... existing errors ...
    
    #[msg("No randomness available from VRF")]
    NoRandomnessAvailable,
    
    #[msg("No eligible arbitrators available")]
    NoEligibleArbitrators,
    
    #[msg("VRF request failed")]
    VrfRequestFailed,
    
    #[msg("Invalid reveal in commit-reveal scheme")]
    InvalidReveal,
    
    #[msg("Not in reveal phase")]
    NotInRevealPhase,
    
    #[msg("Commitment not found")]
    NoCommitmentFound,
    
    #[msg("Already committed randomness")]
    AlreadyCommitted,
    
    #[msg("Commit phase has ended")]
    CommitPhaseEnded,
}
```

### Phase 6: Update SDK

**File**: `contracts/solana/sdk/src/index.ts`
```typescript
// Add VRF interfaces
export interface VrfSelectionAccount {
  tradeId: BN;
  vrfAccount: PublicKey;
  randomnessResult?: Buffer;
  selectedArbitrator?: PublicKey;
  selectionStatus: 'pending' | 'requested' | 'received' | 'selected' | 'failed';
}

// Add VRF methods to SDK
export class LocalMoneySDK {
  // ... existing methods ...
  
  async requestArbitratorVrf(
    tradeId: number,
    vrfAccount: PublicKey,
    oracleQueue: PublicKey,
  ): Promise<string> {
    const trade = await this.getTrade(tradeId);
    const [selection] = PublicKey.findProgramAddressSync(
      [Buffer.from('vrf_selection'), new BN(tradeId).toArrayLike(Buffer, 'le', 8)],
      this.programs.trade.programId
    );
    
    const tx = await this.programs.trade.methods
      .requestArbitratorVrf(new BN(tradeId))
      .accounts({
        trade: trade.pubkey,
        selection,
        arbitratorPool: this.getArbitratorPoolPDA(trade.fiatCurrency),
        vrf: vrfAccount,
        // ... other Switchboard accounts
      })
      .transaction();
    
    return this.sendTransaction(tx);
  }
  
  async processVrfResult(tradeId: number): Promise<string> {
    const trade = await this.getTrade(tradeId);
    const [selection] = PublicKey.findProgramAddressSync(
      [Buffer.from('vrf_selection'), new BN(tradeId).toArrayLike(Buffer, 'le', 8)],
      this.programs.trade.programId
    );
    
    const selectionAccount = await this.programs.trade.account
      .vrfArbitratorSelection.fetch(selection);
    
    const tx = await this.programs.trade.methods
      .processVrfResult()
      .accounts({
        trade: trade.pubkey,
        selection,
        arbitratorPool: this.getArbitratorPoolPDA(trade.fiatCurrency),
        vrf: selectionAccount.vrfAccount,
        authority: this.wallet.publicKey,
      })
      .transaction();
    
    return this.sendTransaction(tx);
  }
}
```

## Testing Strategy

### Unit Tests (Rust)

**File**: `contracts/solana/programs/trade/tests/vrf_tests.rs`
```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_arbitrator_weight_calculation() {
        let info = ArbitratorInfo {
            reputation_score: 7500, // 75%
            resolved_cases: 50,
            current_cases: 2,
            max_concurrent_cases: 5,
            is_active: true,
            // ... other fields
        };
        
        let weight = calculate_arbitrator_weight(&info);
        // Base: 1000 * 0.75 = 750
        // Availability: (5-2) * 100 = 300
        // Experience: 50 * 10 = 500
        // Total: 1550
        assert_eq!(weight, 1550);
    }
    
    #[test]
    fn test_weighted_selection() {
        // Test distribution fairness
        let randomness = [0u8; 32];
        // ... test implementation
    }
}
```

### Integration Tests (TypeScript)

**File**: `contracts/solana/sdk/tests/vrf-arbitrator.test.ts`
```typescript
import { describe, it, expect, beforeAll } from '@jest/globals';
import { LocalMoneySDK } from '../src';
import { PublicKey, Keypair } from '@solana/web3.js';

describe('VRF Arbitrator Selection', () => {
  let sdk: LocalMoneySDK;
  let vrfAccount: PublicKey;
  
  beforeAll(async () => {
    // Setup SDK and create test VRF account
    // Note: In tests, we can mock VRF responses
  });
  
  it('should request VRF randomness for arbitrator selection', async () => {
    const tradeId = 12345;
    const txId = await sdk.requestArbitratorVrf(
      tradeId,
      vrfAccount,
      oracleQueue
    );
    expect(txId).toBeTruthy();
    
    // Check selection account created
    const selection = await sdk.getVrfSelection(tradeId);
    expect(selection.selectionStatus).toBe('requested');
  });
  
  it('should process VRF result and select weighted arbitrator', async () => {
    // Mock VRF callback
    await mockVrfCallback(vrfAccount, randomValue);
    
    const txId = await sdk.processVrfResult(tradeId);
    const selection = await sdk.getVrfSelection(tradeId);
    
    expect(selection.selectionStatus).toBe('selected');
    expect(selection.selectedArbitrator).toBeTruthy();
  });
  
  it('should handle VRF timeout with fallback', async () => {
    // Test commit-reveal fallback
    const commitment = createCommitment(value, nonce);
    await sdk.commitRandomness(tradeId, commitment);
    
    // Wait for reveal phase
    await waitForRevealPhase();
    
    await sdk.revealRandomness(tradeId, value, nonce);
    const selection = await sdk.getFallbackSelection(tradeId);
    expect(selection.finalSeed).toBeTruthy();
  });
});
```

## Implementation Tasks

1. **Setup VRF Infrastructure** ✅
   - Add Switchboard dependency to Cargo.toml
   - Create vrf.rs module with data structures
   - Implement weight calculation logic

2. **Core VRF Integration** ✅
   - Implement request_arbitrator_vrf instruction
   - Implement process_vrf_result instruction
   - Add VRF context structs and validation

3. **Fallback Mechanism** ✅
   - Implement commit-reveal scheme
   - Add timeout handling
   - Keep existing method as emergency fallback

4. **SDK Updates** ✅
   - Add VRF methods to TypeScript SDK
   - Create helper functions for VRF accounts
   - Add proper error handling

5. **Testing** ✅
   - Unit tests for weight calculations
   - Integration tests with mock VRF
   - E2E tests with devnet Switchboard

6. **Documentation** ✅
   - Update API documentation
   - Add VRF setup guide
   - Document cost implications

## Validation Gates

```bash
# Build and test Rust programs
cd contracts/solana
anchor build
cargo test --all-features

# Test TypeScript SDK
cd sdk
npm run build
npm run test
npm run test:integration

# Run E2E tests
cd ..
./run-e2e-test.sh

# Verify on localnet
solana-test-validator --reset
anchor deploy
anchor test
```

## Security Considerations

1. **VRF Validation**
   - Always verify VRF proofs on-chain
   - Check oracle signatures
   - Validate timestamp freshness

2. **Gaming Prevention**
   - Prevent arbitrator from influencing selection
   - Rate limit VRF requests
   - Monitor for unusual patterns

3. **Cost Management**
   - VRF calls cost ~0.002 SOL
   - Implement fee sharing mechanism
   - Consider batching for efficiency

4. **Fallback Security**
   - Commit-reveal requires minimum participants
   - Time-lock between phases
   - Slash mechanism for no-reveals

## Migration Plan

1. **Phase 1**: Deploy with feature flag (keep old method)
2. **Phase 2**: Test on devnet with real Switchboard
3. **Phase 3**: Gradual rollout (10% → 50% → 100%)
4. **Phase 4**: Remove old pseudo-random method

## Cost Analysis

- **Switchboard VRF**: ~0.002 SOL per request
- **Account Rent**: ~0.003 SOL for selection account
- **Total per trade**: ~0.005 SOL
- **Fallback (commit-reveal)**: Only transaction fees

## External Resources

- **Switchboard Docs**: https://docs.switchboard.xyz/solana/vrf
- **Switchboard SDK**: https://docs.rs/switchboard-solana/latest/
- **Example Implementation**: https://github.com/switchboard-xyz/solana-sdk/tree/main/examples/vrf
- **ORAO Alternative**: https://github.com/orao-network/solana-vrf
- **Commit-Reveal Theory**: https://en.wikipedia.org/wiki/Commitment_scheme

## Success Metrics

- Zero predictable arbitrator assignments
- < 5 second selection latency
- 99.9% VRF success rate (1% fallback usage)
- Fair distribution across arbitrator pool
- Reputation-weighted selection working correctly

## PRP Confidence Score: 9/10

High confidence due to:
- Clear existing implementation to replace
- Well-documented external dependencies
- Comprehensive fallback mechanism
- Detailed implementation blueprint with exact code locations
- Complete testing strategy

Minor uncertainty around:
- Exact Switchboard account setup (well documented but needs testing)
- Integration testing complexity with oracle network