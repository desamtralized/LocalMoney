# Solana/Anchor Migration Quick Start Guide

## Executive Summary

Migrating LocalMoney from EVM to Solana using **Anchor v0.31.1** will deliver:
- **99% cost reduction** in transaction fees
- **Sub-second finality** (400ms block times)
- **65,000 TPS capacity** vs 30-100 on EVM chains
- **Native program upgradability** without proxy patterns

## Timeline Overview

**Total Duration: 20 weeks**

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 1 | Weeks 1-3 | Foundation & Infrastructure |
| Phase 2 | Weeks 4-7 | Core Program Migration |
| Phase 3 | Weeks 8-11 | Trading & Escrow Logic |
| Phase 4 | Weeks 12-14 | Advanced Features |
| Phase 5 | Weeks 15-17 | Testing & Security |
| Phase 6 | Weeks 18-20 | Deployment & Launch |

## Critical Path Items

### Week 1: Immediate Actions
```bash
# Install development environment
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.31.1
avm use 0.31.1

# Initialize project
anchor init localmoney-solana
cd localmoney-solana
anchor build
```

### Core Architecture Translation

#### Example: Hub Program Structure
```rust
use anchor_lang::prelude::*;

declare_id!("Hub11111111111111111111111111111111111111");

#[program]
pub mod hub {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        config: HubConfig,
    ) -> Result<()> {
        let hub = &mut ctx.accounts.hub;
        hub.admin = ctx.accounts.admin.key();
        hub.config = config;
        hub.initialized = true;
        Ok(())
    }

    pub fn update_fees(
        ctx: Context<UpdateFees>,
        fees: FeeStructure,
    ) -> Result<()> {
        require!(fees.validate(), ErrorCode::InvalidFees);
        ctx.accounts.hub.config.fees = fees;
        emit!(FeesUpdated { fees });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + HubState::SIZE,
        seeds = [b"hub"],
        bump
    )]
    pub hub: Account<'info, HubState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct HubState {
    pub admin: Pubkey,
    pub config: HubConfig,
    pub initialized: bool,
    pub paused: bool,
    pub timelock_delay: i64,
}
```

#### Example: Trade State Machine
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum TradeStatus {
    Initiated,      // Trade created by seller
    Accepted,       // Buyer accepted terms
    Funded,         // Seller deposited crypto
    Paid,           // Buyer marked fiat sent
    Released,       // Seller released crypto
    Disputed,       // Under arbitration
    Resolved,       // Arbitrator decision made
    Cancelled,      // Trade cancelled
}

#[account]
pub struct Trade {
    pub id: [u8; 32],
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub offer: Pubkey,
    pub amount: u64,
    pub fiat_amount: u64,
    pub status: TradeStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub escrow: Pubkey,
}
```

## Key Migration Patterns

### 1. Upgradeable Contracts → Program Upgrade Authority
```rust
// Set upgrade authority (one-time during deployment)
anchor upgrade target/deploy/localmoney.so --program-id <PROGRAM_ID> --upgrade-authority <MULTISIG_ADDRESS>
```

### 2. Mappings → PDA Accounts
```rust
// EVM: mapping(address => Profile) public profiles;
// Solana: PDA-based profile lookup
let (profile_pda, bump) = Pubkey::find_program_address(
    &[b"profile", user.key().as_ref()],
    program_id
);
```

### 3. Events → Anchor Events
```rust
// EVM: event TradeCreated(uint256 indexed id, address seller, address buyer);
// Solana:
#[event]
pub struct TradeCreated {
    pub id: [u8; 32],
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub timestamp: i64,
}

// Emit event
emit!(TradeCreated {
    id: trade.id,
    seller: trade.seller,
    buyer: trade.buyer,
    timestamp: Clock::get()?.unix_timestamp,
});
```

### 4. Modifiers → Access Control
```rust
// Custom access control
pub fn require_admin(hub: &HubState, signer: &Pubkey) -> Result<()> {
    require_keys_eq!(*signer, hub.admin, ErrorCode::Unauthorized);
    Ok(())
}

// Or use Anchor's access_control attribute
#[access_control(require_admin(&ctx.accounts.hub, &ctx.accounts.signer.key()))]
pub fn admin_action(ctx: Context<AdminAction>) -> Result<()> {
    // Admin-only logic
    Ok(())
}
```

## Testing Strategy

### Local Testing Setup
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;
    use anchor_lang::solana_program::clock::Clock;
    use solana_program_test::*;

    #[tokio::test]
    async fn test_create_trade() {
        let program = ProgramTest::new(
            "localmoney",
            crate::id(),
            processor!(crate::entry),
        );
        
        let (mut banks_client, payer, recent_blockhash) = program.start().await;
        
        // Test trade creation
        let trade_id = [1u8; 32];
        let ix = create_trade_instruction(trade_id, seller, buyer, amount);
        
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&payer.pubkey()),
            &[&payer],
            recent_blockhash,
        );
        
        banks_client.process_transaction(tx).await.unwrap();
    }
}
```

## Deployment Commands

```bash
# Build all programs
anchor build

# Deploy to devnet
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet

# Deploy to mainnet-beta
solana config set --url https://api.mainnet-beta.solana.com
anchor deploy --provider.cluster mainnet-beta

# Verify deployment
anchor idl init --filepath target/idl/localmoney.json <PROGRAM_ID>
```

## Cost Comparison

| Operation | EVM Cost | Solana Cost | Savings |
|-----------|----------|-------------|---------|
| Create Trade | $5-50 | $0.002 | 99.96% |
| Accept Trade | $3-30 | $0.001 | 99.97% |
| Release Funds | $8-80 | $0.003 | 99.96% |
| Storage (1KB/year) | $50-500 | $0.70 | 99.86% |

## Risk Management

### High Priority Risks
1. **Account Size Limits** - Max 10MB per account
   - Mitigation: Use account compression, pagination
   
2. **Transaction Size** - Max 1232 bytes
   - Mitigation: Use lookup tables, compress data

3. **Compute Units** - Max 1.4M CU per transaction
   - Mitigation: Optimize with lazy loading, batch operations

4. **Network Congestion**
   - Mitigation: Priority fees, retry logic, multiple RPCs

## Next Steps

1. **Week 1-2**: Set up development environment and create initial Anchor workspace
2. **Week 2-3**: Design PDA schemas and account structures
3. **Week 4**: Begin Hub program implementation
4. **Week 5**: Start Profile and Offer programs in parallel
5. **Week 8**: Begin Trade/Escrow implementation with focus on security

## Resources

- [Anchor Book](https://www.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [Program Examples](https://github.com/coral-xyz/anchor/tree/master/examples)
- [Solana Stack Exchange](https://solana.stackexchange.com/)

## Contact Points

- **Anchor Discord**: Technical questions
- **Solana Discord**: #developers channel
- **Audit Firms**: 
  - OtterSec
  - Kudelski Security
  - Halborn
  - Neodyme

---

*For the complete detailed plan, see `SOLANA_MIGRATION_PLAN.md`*