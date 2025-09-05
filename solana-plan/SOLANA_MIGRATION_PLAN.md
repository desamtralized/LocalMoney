# EVM to Solana/Anchor Migration Plan

## Overview
This document outlines a comprehensive plan to migrate the LocalMoney protocol from EVM (Ethereum/BSC) to Solana using Anchor Framework v0.31.1.

## Technology Stack
- **Target Framework**: Anchor v0.31.1 (Latest as of January 2025)
- **Solana CLI**: v2.1.21+
- **Rust**: v1.86.0+
- **Development Environment**: Solana Testnet/Devnet → Mainnet-beta

## Architecture Analysis

### Current EVM Contract Structure
```
contracts/evm/
├── Core Contracts
│   ├── Hub.sol         - Central orchestrator, configuration & access control
│   ├── Trade.sol       - Core trading logic & state management
│   ├── Offer.sol       - P2P offer management
│   ├── Escrow.sol      - Fund custody & release logic
│   ├── Profile.sol     - User profiles & reputation
│   ├── ArbitratorManager.sol - Dispute resolution
│   └── PriceOracle.sol - Price feeds & market data
├── Libraries
│   ├── TradeUtils.sol  - Trade utility functions
│   └── FeeCalculations.sol - Fee computation logic
└── Interfaces
    └── I*.sol          - Contract interfaces
```

### Key Design Patterns to Migrate
1. **Upgradeable Proxy Pattern** → Solana's Program Upgrade Authority
2. **Access Control (Roles)** → Anchor's `access_control` and custom constraints
3. **Reentrancy Guards** → Not needed (Solana's single-threaded execution)
4. **Timelock Controller** → Custom implementation with Clock sysvar
5. **Event Emission** → Anchor Events & CPI logging

---

## Phase 1: Foundation & Infrastructure (Weeks 1-3)

### Milestone 1.1: Development Environment Setup
- [ ] Install Solana CLI v2.1.21+
- [ ] Install Anchor v0.31.1 via AVM
- [ ] Setup local validator and testing environment
- [ ] Configure IDE with Rust analyzer and Anchor extensions
- [ ] Initialize Anchor workspace structure

### Milestone 1.2: Core Data Models & Accounts
- [ ] Define PDA (Program Derived Address) schemas for:
  - `HubConfig` - Global protocol configuration
  - `UserProfile` - User profiles and stats
  - `Offer` - Trading offers
  - `Trade` - Active trade states
  - `Escrow` - Token custody accounts
  - `Arbitrator` - Arbitrator profiles
  - `PriceOracle` - Price feed configuration

### Milestone 1.3: Access Control Framework
- [ ] Implement role-based access using Anchor constraints:
  ```rust
  #[access_control(is_admin(&ctx.accounts.hub))]
  pub fn admin_function(ctx: Context<AdminContext>) -> Result<()>
  ```
- [ ] Create custom constraints for:
  - Admin operations
  - Emergency pause
  - Trade participant validation
  - Arbitrator authorization

---

## Phase 2: Core Program Migration (Weeks 4-7)

### Milestone 2.1: Hub Program
- [ ] Migrate `Hub.sol` to `hub` Anchor program
- [ ] Implement instructions:
  - `initialize` - Deploy & configure hub
  - `update_config` - Modify protocol parameters
  - `pause_operations` - Circuit breaker functionality
  - `set_fees` - Fee configuration
  - `manage_roles` - Access control management

### Milestone 2.2: Profile Program
- [ ] Migrate `Profile.sol` to `profile` program
- [ ] Implement instructions:
  - `create_profile` - Initialize user profile
  - `update_contact` - Modify contact information
  - `update_stats` - Trade statistics tracking
  - `update_reputation` - Reputation management

### Milestone 2.3: Offer Program
- [ ] Migrate `Offer.sol` to `offer` program
- [ ] Implement instructions:
  - `create_offer` - Create new P2P offer
  - `update_offer` - Modify offer parameters
  - `toggle_offer` - Activate/deactivate offer
  - `delete_offer` - Remove offer

---

## Phase 3: Trading & Escrow Logic (Weeks 8-11)

### Milestone 3.1: Trade Program
- [ ] Migrate `Trade.sol` to `trade` program
- [ ] Implement core instructions:
  - `initiate_trade` - Start new trade
  - `accept_trade` - Buyer accepts terms
  - `fund_trade` - Seller deposits tokens
  - `mark_paid` - Buyer marks fiat sent
  - `release_funds` - Seller releases crypto
  - `cancel_trade` - Cancel before funding
  - `dispute_trade` - Initiate dispute

### Milestone 3.2: Escrow Program
- [ ] Migrate `Escrow.sol` to `escrow` program
- [ ] Implement token custody:
  - Use Token Program for SPL tokens
  - PDA-based escrow accounts
  - Atomic fund transfers
- [ ] Instructions:
  - `deposit` - Lock funds in escrow
  - `release` - Transfer to buyer
  - `refund` - Return to seller
  - `arbitrator_release` - Dispute resolution

### Milestone 3.3: Fee Management
- [ ] Port `FeeCalculations.sol` library
- [ ] Implement fee distribution:
  - Platform fees to treasury
  - Burn mechanism (if applicable)
  - Arbitrator compensation
  - Chain-specific fees

---

## Phase 4: Advanced Features (Weeks 12-14)

### Milestone 4.1: Arbitrator Management
- [ ] Migrate `ArbitratorManager.sol`
- [ ] Implement Chainlink VRF alternative:
  - Use Switchboard VRF for randomness
  - Or implement commit-reveal scheme
- [ ] Instructions:
  - `register_arbitrator` - Stake & register
  - `assign_arbitrator` - Random selection
  - `resolve_dispute` - Make decision
  - `withdraw_stake` - Exit protocol

### Milestone 4.2: Price Oracle Integration
- [ ] Migrate `PriceOracle.sol`
- [ ] Integrate with Solana oracles:
  - Pyth Network (primary)
  - Switchboard (backup)
  - Chainlink (if available)
- [ ] Implement price feed validation
- [ ] Create fallback mechanisms

### Milestone 4.3: Timelock Implementation
- [ ] Design custom timelock using:
  - Clock sysvar for timestamps
  - PDA-based proposal queue
  - Multi-sig integration (Squads Protocol)
- [ ] Implement delay mechanisms for:
  - Protocol upgrades
  - Critical parameter changes
  - Emergency actions

---

## Phase 5: Testing & Security (Weeks 15-17)

### Milestone 5.1: Unit Testing
- [ ] Write comprehensive Anchor tests:
  - Individual instruction tests
  - State transition validation
  - Error condition coverage
  - Edge case scenarios

### Milestone 5.2: Integration Testing
- [ ] End-to-end trade flows
- [ ] Multi-user scenarios
- [ ] Dispute resolution paths
- [ ] Fee calculation verification
- [ ] Oracle price feed testing

### Milestone 5.3: Security Audit Preparation
- [ ] Static analysis with:
  - `anchor-security-cli`
  - `soteria` (Solana auditing tool)
  - Custom invariant checks
- [ ] Fuzzing critical paths
- [ ] Economic attack simulations
- [ ] Prepare audit documentation

---

## Phase 6: Deployment & Migration (Weeks 18-20)

### Milestone 6.1: Devnet Deployment
- [ ] Deploy all programs to Devnet
- [ ] Initialize protocol configuration
- [ ] Run smoke tests
- [ ] Monitor performance metrics

### Milestone 6.2: Testnet Beta
- [ ] Deploy to Testnet
- [ ] Invite beta testers
- [ ] Stress testing with high TPS
- [ ] Collect feedback & iterate

### Milestone 6.3: Mainnet Preparation
- [ ] Security audit completion
- [ ] Bug bounty program
- [ ] Upgrade authority setup (multi-sig)
- [ ] Documentation finalization
- [ ] Emergency response procedures

### Milestone 6.4: Mainnet Launch
- [ ] Phased rollout strategy
- [ ] Liquidity migration plan
- [ ] User migration tools
- [ ] Monitoring & alerting setup

---

## Technical Considerations

### Key Differences from EVM

1. **Account Model**
   - EVM: Contract storage in mappings
   - Solana: Explicit account data structures

2. **Fees**
   - EVM: Gas fees paid by transaction sender
   - Solana: Rent exemption + transaction fees

3. **Concurrency**
   - EVM: Sequential execution, reentrancy concerns
   - Solana: Parallel execution, no reentrancy

4. **Upgradability**
   - EVM: Proxy patterns (UUPS, Transparent)
   - Solana: Native program upgrade authority

5. **Cross-Program Invocation**
   - EVM: External calls with gas forwarding
   - Solana: CPI with explicit account passing

### Performance Optimizations

1. **Account Size Management**
   - Use zero-copy deserialization for large accounts
   - Implement account recycling for trades
   - Optimize PDA seed generation

2. **Compute Unit Optimization**
   - Use `LazyAccount` (Anchor 0.31.0+) for partial deserialization
   - Batch operations where possible
   - Minimize CPI calls

3. **Transaction Size**
   - Keep under 1232 bytes limit
   - Use lookup tables for frequently accessed accounts
   - Compress instruction data

### Risk Mitigation

1. **Migration Risks**
   - Run parallel systems during transition
   - Implement rollback procedures
   - Maintain EVM contracts as fallback

2. **Solana-Specific Risks**
   - Network congestion handling
   - RPC node reliability
   - Account rent management

3. **Security Considerations**
   - PDA collision prevention
   - Signer verification patterns
   - Clock drift tolerance

---

## Resource Requirements

### Team Composition
- 2 Senior Rust/Solana developers
- 1 Security engineer
- 1 DevOps engineer
- 1 QA engineer
- 1 Technical writer

### Budget Estimates
- Development: 20 weeks @ $50k/week = $1M
- Security audits: $150-250k
- Infrastructure: $50k
- Bug bounty: $100k
- **Total: ~$1.5M**

### Tools & Services
- Anchor Framework v0.31.1
- Solana Program Library (SPL)
- Pyth/Switchboard oracles
- Squads Protocol (multi-sig)
- Jito Labs (MEV protection)
- QuickNode/Helius (RPC providers)

---

## Success Metrics

### Technical KPIs
- Transaction success rate > 99.5%
- Average confirmation time < 1 second
- Program CU usage < 200k per transaction
- Zero critical vulnerabilities in audit

### Business KPIs
- User migration rate > 80%
- Trading volume retention > 90%
- Cost reduction > 50% vs EVM
- User satisfaction score > 4.5/5

---

## Appendix A: Contract Mapping

| EVM Contract | Solana Program | Key Changes |
|-------------|---------------|-------------|
| Hub.sol | hub | Timelock via PDA queue |
| Trade.sol | trade | State machine via account flags |
| Offer.sol | offer | PDA-based offer lookup |
| Escrow.sol | escrow | SPL Token integration |
| Profile.sol | profile | Compressed NFT for avatars |
| ArbitratorManager.sol | arbitrator | Switchboard VRF |
| PriceOracle.sol | oracle | Pyth integration |

## Appendix B: Instruction Naming Convention

```rust
// Standard CRUD operations
create_[entity]
update_[entity]
delete_[entity]
get_[entity]

// State transitions
initiate_[action]
confirm_[action]
cancel_[action]
complete_[action]

// Admin operations
admin_[action]
emergency_[action]
```

## Appendix C: Error Codes

Define consistent error codes across all programs:
```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized = 6000,
    #[msg("Invalid parameter")]
    InvalidParameter = 6001,
    #[msg("Insufficient funds")]
    InsufficientFunds = 6002,
    // ... etc
}
```

---

*This migration plan is a living document and should be updated as the project progresses.*