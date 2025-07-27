# LocalMoney Protocol: CosmWasm to Solana Migration Guide

## Overview

This document outlines the translation of the LocalMoney P2P trading protocol from CosmWasm to Solana using the latest stable Anchor framework. The migration maintains the core protocol functionality while leveraging Solana's unique features like Program Derived Addresses (PDAs), Cross-Program Invocations (CPIs), and the SPL Token program.

## Migration Strategy

### Architecture Translation

**CosmWasm → Solana Mapping:**
- **Smart Contracts** → **Anchor Programs** 
- **Contract Calls** → **Cross-Program Invocations (CPIs)**
- **Contract Storage** → **Program Derived Addresses (PDAs)**
- **CW20 Tokens** → **SPL Token Program**
- **Native Tokens** → **SOL and SPL Tokens**

### Program Structure

The protocol will be implemented as 5 separate Anchor programs deployed to Solana:

```
contracts/solana/
├── programs/
│   ├── hub/           # Central configuration and orchestration
│   ├── offer/         # Offer creation and management  
│   ├── trade/         # Escrow and trading execution
│   ├── profile/       # User profiles and reputation
│   └── price/         # Price oracle and feeds
├── sdk/               # TypeScript SDK for client integration
└── tests/             # End-to-end integration tests
```

## Program-by-Program Migration

### 1. Hub Program

**Purpose**: Central configuration manager and cross-program coordinator

**Anchor Implementation**:
```rust
#[program]
pub mod hub {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, config: HubConfig) -> Result<()> {
        // Initialize hub configuration PDA
    }

    pub fn update_config(ctx: Context<UpdateConfig>, config: HubConfig) -> Result<()> {
        // Update protocol configuration
    }

    pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
        // Transfer administrative control
    }
}

#[account]
pub struct HubConfigAccount {
    pub admin: Pubkey,
    pub offer_program: Pubkey,
    pub trade_program: Pubkey,
    pub profile_program: Pubkey,
    pub price_program: Pubkey,
    pub local_mint: Pubkey,
    pub fee_collector: Pubkey,
    pub warchest: Pubkey,
    pub burn_fee_bps: u16,        // Basis points (1/10000)
    pub chain_fee_bps: u16,
    pub warchest_fee_bps: u16,
    pub arbitration_fee_bps: u16,
    pub active_offers_limit: u8,
    pub active_trades_limit: u8,
    pub trade_expiration_seconds: u64,
    pub dispute_window_seconds: u64,
    pub trade_limit_min_usd: u64,
    pub trade_limit_max_usd: u64,
}
```

**Key PDAs**:
- Hub Config: `["hub", "config"]`
- Program Registry: `["hub", "programs"]`

### 2. Offer Program

**Purpose**: Decentralized offer marketplace with SPL token integration

**Anchor Implementation**:
```rust
#[program]
pub mod offer {
    use super::*;

    pub fn create_offer(ctx: Context<CreateOffer>, params: CreateOfferParams) -> Result<()> {
        // Create new trading offer
        // Update user profile via CPI
    }

    pub fn update_offer(ctx: Context<UpdateOffer>, params: UpdateOfferParams) -> Result<()> {
        // Modify existing offer
        // Update profile statistics via CPI
    }

    pub fn pause_offer(ctx: Context<PauseOffer>) -> Result<()> {
        // Pause/resume offer
    }
}

#[account]
pub struct OfferAccount {
    pub id: u64,
    pub owner: Pubkey,
    pub offer_type: OfferType,     // Buy or Sell
    pub mint: Pubkey,              // SPL token mint
    pub fiat_currency: FiatCurrency,
    pub rate: u64,                 // Rate in basis points
    pub min_amount: u64,
    pub max_amount: u64,
    pub state: OfferState,
    pub description: String,
    pub created_at: i64,
    pub bump: u8,
}
```

**Key PDAs**:
- Offer Account: `["offer", offer_id.to_le_bytes()]`
- Offer Counter: `["offer", "counter"]`
- User Offers: `["offer", "user", user_pubkey]`

### 3. Trade Program

**Purpose**: Escrow management, trade execution, and dispute resolution using SPL tokens

**Anchor Implementation**:
```rust
#[program]
pub mod trade {
    use super::*;

    pub fn create_trade(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
        // Initialize trade from offer
        // Validate amounts and pricing
        // Assign random arbitrator
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
        // Transfer SPL tokens to escrow PDA
        // Update trade state to EscrowFunded
    }

    pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
        // Transfer tokens from escrow to buyer
        // Deduct and distribute protocol fees
        // Update profiles via CPI
    }

    pub fn dispute_trade(ctx: Context<DisputeTrade>, contacts: DisputeContacts) -> Result<()> {
        // Initiate dispute resolution
        // Lock escrow for arbitrator decision
    }

    pub fn settle_dispute(ctx: Context<SettleDispute>, winner: Pubkey) -> Result<()> {
        // Arbitrator settles dispute
        // Distribute funds and fees
    }
}

#[account]
pub struct TradeAccount {
    pub id: u64,
    pub offer_id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub arbitrator: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub fiat_currency: FiatCurrency,
    pub locked_price: u64,
    pub state: TradeState,
    pub created_at: i64,
    pub expires_at: i64,
    pub dispute_window_at: Option<i64>,
    pub state_history: Vec<TradeStateItem>,
    pub buyer_contact: Option<String>,
    pub seller_contact: Option<String>,
    pub bump: u8,
}
```

**Key PDAs**:
- Trade Account: `["trade", trade_id.to_le_bytes()]`
- Trade Escrow: `["trade", "escrow", trade_id.to_le_bytes()]`
- Trade Counter: `["trade", "counter"]`
- Arbitrator Registry: `["trade", "arbitrator", arbitrator_pubkey]`

### 4. Profile Program

**Purpose**: User profile management and reputation tracking

**Anchor Implementation**:
```rust
#[program]
pub mod profile {
    use super::*;

    pub fn create_profile(ctx: Context<CreateProfile>, username: String, contact: String) -> Result<()> {
        // Initialize user profile
    }

    pub fn update_contact(ctx: Context<UpdateContact>, contact: String, encryption_key: String) -> Result<()> {
        // Update contact information
    }

    pub fn update_trade_stats(ctx: Context<UpdateTradeStats>, trade_state: TradeState) -> Result<()> {
        // Update trading statistics (called via CPI)
    }

    pub fn update_offer_stats(ctx: Context<UpdateOfferStats>, offer_state: OfferState) -> Result<()> {
        // Update offer statistics (called via CPI)
    }
}

#[account]
pub struct ProfileAccount {
    pub owner: Pubkey,
    pub username: Option<String>,
    pub contact: Option<String>,
    pub encryption_key: Option<String>,
    pub created_at: i64,
    pub last_trade_at: i64,
    pub requested_trades_count: u32,
    pub released_trades_count: u32,
    pub active_trades_count: u8,
    pub active_offers_count: u8,
    pub bump: u8,
}
```

**Key PDAs**:
- Profile Account: `["profile", user_pubkey]`

### 5. Price Program

**Purpose**: Price oracle integration and fiat currency rates

**Anchor Implementation**:
```rust
#[program]
pub mod price {
    use super::*;

    pub fn update_prices(ctx: Context<UpdatePrices>, prices: Vec<CurrencyPrice>) -> Result<()> {
        // Update fiat currency prices (admin only)
    }

    pub fn register_price_route(ctx: Context<RegisterPriceRoute>, mint: Pubkey, route: PriceRoute) -> Result<()> {
        // Configure price discovery for SPL tokens
    }

    pub fn get_price(ctx: Context<GetPrice>, mint: Pubkey, fiat: FiatCurrency) -> Result<u64> {
        // Query current price for mint in fiat currency
    }
}

#[account]
pub struct PriceAccount {
    pub currency: FiatCurrency,
    pub usd_price: u64,           // Price in micro-dollars (6 decimals)
    pub updated_at: i64,
    pub bump: u8,
}

#[account]
pub struct PriceRouteAccount {
    pub mint: Pubkey,
    pub route_type: RouteType,    // Direct, DEX, Oracle
    pub route_data: Vec<u8>,      // Serialized route configuration
    pub bump: u8,
}
```

**Key PDAs**:
- Price Feed: `["price", fiat_currency.to_string()]`
- Price Route: `["price", "route", mint]`

## Solana-Specific Adaptations

### 1. Account Rent and Space Management

```rust
// Calculate account space for dynamic data
impl TradeAccount {
    pub const SPACE: usize = 8 + // discriminator
        8 + // id
        8 + // offer_id  
        32 + // buyer
        32 + // seller
        32 + // arbitrator
        32 + // mint
        8 + // amount
        1 + // fiat_currency enum
        8 + // locked_price
        1 + // state enum
        8 + // created_at
        8 + // expires_at
        9 + // dispute_window_at (Option<i64>)
        4 + (32 * 50) + // state_history vector (max 50 entries)
        4 + 256 + // buyer_contact (Option<String>)
        4 + 256 + // seller_contact (Option<String>)
        1; // bump
}
```

### 2. Cross-Program Invocation (CPI) Patterns

```rust
// Example: Trade program calling Profile program
pub fn update_profile_trade_count(
    ctx: &Context<UpdateTradeStats>,
    trade_state: TradeState,
) -> Result<()> {
    let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
        profile: ctx.accounts.buyer_profile.to_account_info(),
        authority: ctx.accounts.trade_program.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.profile_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    profile::cpi::update_trade_stats(cpi_ctx, trade_state)?;
    Ok(())
}
```

### 3. SPL Token Integration

```rust
// Escrow funding with SPL tokens
pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
    let amount = ctx.accounts.trade.amount;
    let fee_amount = calculate_fees(&ctx.accounts.hub_config, amount)?;
    let total_amount = amount + fee_amount;

    // Transfer tokens to escrow PDA
    let cpi_accounts = Transfer {
        from: ctx.accounts.seller_token_account.to_account_info(),
        to: ctx.accounts.escrow_token_account.to_account_info(),
        authority: ctx.accounts.seller.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    
    token::transfer(cpi_ctx, total_amount)?;
    
    // Update trade state
    ctx.accounts.trade.state = TradeState::EscrowFunded;
    ctx.accounts.trade.state_history.push(TradeStateItem {
        actor: ctx.accounts.seller.key(),
        state: TradeState::EscrowFunded,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}
```

### 4. Program Derived Address (PDA) Management

```rust
// Derive PDAs with proper seeds and bumps
#[derive(Accounts)]
#[instruction(trade_id: u64)]
pub struct CreateTrade<'info> {
    #[account(
        init,
        payer = taker,
        space = TradeAccount::SPACE,
        seeds = [b"trade", trade_id.to_le_bytes().as_ref()],
        bump
    )]
    pub trade: Account<'info, TradeAccount>,
    
    #[account(
        init,
        payer = taker,
        seeds = [b"trade", b"escrow", trade_id.to_le_bytes().as_ref()],
        bump,
        token::mint = mint,
        token::authority = escrow_authority,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    
    // ... other accounts
}
```

## Testing Strategy

### Integration Test Framework

Building upon the existing `SOLANA_E2E_TESTING.md` approach:

```typescript
// tests/integration/happy-path.test.ts
describe("LocalMoney Happy Path Integration", () => {
  before(async () => {
    // Deploy all 5 programs to local validator
    await deployPrograms();
    
    // Initialize hub configuration
    await initializeHub();
    
    // Create test wallets and fund with SOL + SPL tokens
    await setupTestWallets();
  });

  it("completes full trading flow", async () => {
    // 1. Create user profiles
    await createProfiles();
    
    // 2. Create sell offer
    const offerId = await createOffer({
      offerType: "sell",
      mint: USDC_MINT,
      amount: 1000_000_000, // 1000 USDC
      rate: 150_00, // 1.5% above market
      fiatCurrency: "USD"
    });
    
    // 3. Accept offer and create trade  
    const tradeId = await createTrade(offerId, {
      amount: 500_000_000, // 500 USDC
      taker: buyerWallet.publicKey
    });
    
    // 4. Fund escrow
    await fundEscrow(tradeId, sellerWallet);
    
    // 5. Mark fiat deposited
    await markFiatDeposited(tradeId, buyerWallet);
    
    // 6. Release escrow
    await releaseEscrow(tradeId, sellerWallet);
    
    // 7. Verify final balances and state
    await verifyCompletedTrade(tradeId);
  });
});
```

### Cross-Program Testing

```typescript
// Verify CPI calls between programs
it("updates profile stats via CPI", async () => {
  const profileBefore = await getProfile(buyerWallet.publicKey);
  
  await createTrade(offerId, {
    amount: 100_000_000,
    taker: buyerWallet.publicKey
  });
  
  const profileAfter = await getProfile(buyerWallet.publicKey);
  expect(profileAfter.requestedTradesCount).to.equal(
    profileBefore.requestedTradesCount + 1
  );
});
```

## Migration Checklist

### Development Setup
- [ ] Install latest stable Anchor CLI
- [ ] Configure Solana CLI for localnet/devnet
- [ ] Set up TypeScript SDK structure
- [ ] Initialize Anchor workspace with 5 programs

### Program Implementation
- [ ] Implement Hub program with configuration management
- [ ] Implement Offer program with SPL token integration  
- [ ] Implement Trade program with escrow and dispute resolution
- [ ] Implement Profile program with CPI interfaces
- [ ] Implement Price program with oracle integration

### Integration & Testing
- [ ] Deploy programs to localnet
- [ ] Implement TypeScript SDK for client integration
- [ ] Create comprehensive integration test suite
- [ ] Test cross-program invocations and state consistency
- [ ] Validate SPL token flows and fee calculations

## Key Technical Considerations

### Solana Constraints
- **Transaction Size Limits**: Design CPIs to fit within transaction size limits
- **Compute Budget**: Optimize instructions for compute unit efficiency  
- **Account Data Limits**: Use efficient serialization for large data structures
- **Rent Exemption**: Ensure all accounts maintain minimum rent exemption

### Security Adaptations
- **Signer Validation**: Replace CosmWasm sender validation with Solana signer checks
- **PDA Authority**: Use PDAs as program authorities for escrow management
- **Reentrancy Protection**: Implement Solana-specific reentrancy guards
- **Oracle Security**: Validate price feed authenticity and freshness

This migration guide provides a comprehensive roadmap for translating the LocalMoney protocol from CosmWasm to Solana while leveraging the unique capabilities of the Solana blockchain and the Anchor development framework.
