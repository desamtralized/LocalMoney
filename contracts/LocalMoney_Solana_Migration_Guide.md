# LocalMoney Protocol Migration Guide: CosmWasm to Solana with Anchor Framework

## Overview

This guide provides a comprehensive roadmap for migrating the LocalMoney protocol from CosmWasm (Cosmos ecosystem) to Solana using the latest Anchor Framework (v0.30+). The migration involves translating five interconnected smart contracts while adapting to Solana's unique architecture and programming model.

## Key Architectural Differences

### CosmWasm vs Solana/Anchor

| Aspect | CosmWasm | Solana/Anchor |
|--------|----------|---------------|
| **Language** | Rust with CosmWasm SDK | Rust with Anchor Framework |
| **Account Model** | Contract-based storage | Account-based architecture |
| **State Management** | Internal contract storage | External account storage |
| **Cross-contract Calls** | Direct contract calls | Cross-Program Invocations (CPI) |
| **Fee Model** | Gas-based | Rent + transaction fees |
| **Upgrades** | Migration functions | Program upgrades via authority |
| **Data Serialization** | JSON/Binary | Borsh serialization |

## Migration Strategy

### 1. Program Architecture Design

#### Hub-and-Spoke to Program-Account Model

**CosmWasm Approach:**
- Single hub contract managing all other contracts
- Direct contract-to-contract communication
- Centralized configuration storage

**Solana/Anchor Approach:**
- Multiple programs with shared state accounts
- Cross-Program Invocations (CPI) for inter-program communication
- Distributed configuration through Program Derived Addresses (PDAs)

#### Recommended Program Structure:

```
localmoney-protocol/
├── programs/
│   ├── hub/                 # Central configuration program
│   ├── offer/               # Offer management program
│   ├── trade/               # Trade execution program
│   ├── profile/             # User profile program
│   └── price/               # Price oracle program
├── app/                     # Frontend application
└── tests/                   # Integration tests
```

### 2. Account Design Patterns

#### 2.1 Hub Program Accounts

**Global Config Account (PDA)**
```rust
#[account]
pub struct GlobalConfig {
    pub authority: Pubkey,           // Admin authority
    pub offer_program: Pubkey,       // Offer program ID
    pub trade_program: Pubkey,       // Trade program ID
    pub profile_program: Pubkey,     // Profile program ID
    pub price_program: Pubkey,       // Price program ID
    pub price_provider: Pubkey,      // Price update authority
    pub local_mint: Pubkey,          // Local token mint
    pub chain_fee_collector: Pubkey, // Fee collector
    pub warchest: Pubkey,            // Treasury account
    pub active_offers_limit: u8,     // Max active offers per user
    pub active_trades_limit: u8,     // Max active trades per user
    pub arbitration_fee_bps: u16,    // Arbitration fee in basis points
    pub burn_fee_bps: u16,           // Burn fee in basis points
    pub chain_fee_bps: u16,          // Chain fee in basis points
    pub warchest_fee_bps: u16,       // Warchest fee in basis points
    pub trade_expiration_timer: u64, // Trade expiration in seconds
    pub trade_dispute_timer: u64,    // Dispute window in seconds
    pub trade_limit_min: u64,        // Min trade amount in USD
    pub trade_limit_max: u64,        // Max trade amount in USD
    pub bump: u8,                    // PDA bump
}
```

#### 2.2 Offer Program Accounts

**Offer Account (PDA)**
```rust
#[account]
pub struct Offer {
    pub id: u64,                     // Unique offer ID
    pub owner: Pubkey,               // Offer creator
    pub offer_type: OfferType,       // Buy or Sell
    pub fiat_currency: FiatCurrency, // Target fiat currency
    pub rate: u64,                   // Exchange rate (basis points)
    pub min_amount: u64,             // Minimum trade amount
    pub max_amount: u64,             // Maximum trade amount
    pub description: Option<String>, // Optional description
    pub mint: Pubkey,                // Token mint address
    pub state: OfferState,           // Current offer state
    pub created_at: i64,             // Creation timestamp
    pub bump: u8,                    // PDA bump
}

#[account]
pub struct OfferCounter {
    pub count: u64,                  // Global offer counter
    pub bump: u8,                    // PDA bump
}
```

#### 2.3 Trade Program Accounts

**Trade Account (PDA)**
```rust
#[account]
pub struct Trade {
    pub id: u64,                     // Unique trade ID
    pub buyer: Pubkey,               // Crypto buyer
    pub seller: Pubkey,              // Crypto seller
    pub arbitrator: Pubkey,          // Assigned arbitrator
    pub offer_id: u64,               // Source offer ID
    pub created_at: i64,             // Creation timestamp
    pub expires_at: i64,             // Expiration timestamp
    pub enables_dispute_at: Option<i64>, // Dispute window start
    pub mint: Pubkey,                // Trading token mint
    pub amount: u64,                 // Trade amount
    pub fiat_currency: FiatCurrency, // Fiat currency
    pub locked_price: u64,           // Locked exchange rate
    pub escrow_account: Pubkey,      // Escrow token account
    pub state: TradeState,           // Current state
    pub state_history: Vec<TradeStateItem>, // State change history
    pub bump: u8,                    // PDA bump
}

#[account]
pub struct TradeCounter {
    pub count: u64,                  // Global trade counter
    pub bump: u8,                    // PDA bump
}
```

#### 2.4 Profile Program Accounts

**Profile Account (PDA)**
```rust
#[account]
pub struct Profile {
    pub owner: Pubkey,               // Profile owner
    pub created_at: i64,             // Profile creation time
    pub requested_trades_count: u64, // Total trade requests
    pub active_trades_count: u8,     // Current active trades
    pub released_trades_count: u64,  // Successfully completed trades
    pub last_trade: i64,             // Last trade timestamp
    pub contact: Option<String>,     // Contact information
    pub encryption_key: Option<String>, // Public encryption key
    pub active_offers_count: u8,     // Current active offers
    pub bump: u8,                    // PDA bump
}
```

#### 2.5 Price Program Accounts

**Currency Price Account (PDA)**
```rust
#[account]
pub struct CurrencyPrice {
    pub currency: FiatCurrency,      // Fiat currency
    pub usd_price: u64,              // Price in USD (scaled)
    pub updated_at: i64,             // Last update timestamp
    pub bump: u8,                    // PDA bump
}

#[account]
pub struct PriceRoute {
    pub mint: Pubkey,                // Token mint
    pub route_steps: Vec<RouteStep>, // Price conversion steps
    pub bump: u8,                    // PDA bump
}
```

### 3. Program Implementation Guide

#### 3.1 Hub Program

**Key Instructions:**
- `initialize`: Initialize global configuration
- `update_config`: Update protocol parameters
- `update_authority`: Transfer admin authority

**Example Implementation:**
```rust
use anchor_lang::prelude::*;

#[program]
pub mod hub {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        params: InitializeParams,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.offer_program = params.offer_program;
        config.trade_program = params.trade_program;
        config.profile_program = params.profile_program;
        config.price_program = params.price_program;
        // ... set other parameters
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        params: UpdateConfigParams,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            ErrorCode::Unauthorized
        );
        
        let config = &mut ctx.accounts.config;
        // Validate fee constraints
        let total_fees = params.chain_fee_bps + params.burn_fee_bps + params.warchest_fee_bps;
        require!(total_fees <= 1000, ErrorCode::ExcessiveFees); // Max 10%
        
        // Update configuration
        config.chain_fee_bps = params.chain_fee_bps;
        config.burn_fee_bps = params.burn_fee_bps;
        config.warchest_fee_bps = params.warchest_fee_bps;
        // ... update other parameters
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, GlobalConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
```

#### 3.2 Offer Program

**Key Instructions:**
- `create_offer`: Create new buy/sell offer
- `update_offer`: Update existing offer
- `close_offer`: Archive offer

**Cross-Program Invocation Example:**
```rust
pub fn create_offer(
    ctx: Context<CreateOffer>,
    params: CreateOfferParams,
) -> Result<()> {
    // Validate offer parameters
    require!(params.min_amount <= params.max_amount, ErrorCode::InvalidAmountRange);
    
    // Update offer counter
    let counter = &mut ctx.accounts.offer_counter;
    counter.count += 1;
    
    // Initialize offer
    let offer = &mut ctx.accounts.offer;
    offer.id = counter.count;
    offer.owner = ctx.accounts.owner.key();
    offer.offer_type = params.offer_type;
    offer.fiat_currency = params.fiat_currency;
    offer.rate = params.rate;
    offer.min_amount = params.min_amount;
    offer.max_amount = params.max_amount;
    offer.description = params.description;
    offer.mint = params.mint;
    offer.state = OfferState::Active;
    offer.created_at = Clock::get()?.unix_timestamp;
    offer.bump = ctx.bumps.offer;
    
    // CPI to profile program to update active offers count
    let cpi_program = ctx.accounts.profile_program.to_account_info();
    let cpi_accounts = profile::cpi::accounts::UpdateActiveOffers {
        profile: ctx.accounts.profile.to_account_info(),
        owner: ctx.accounts.owner.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    profile::cpi::increment_active_offers(cpi_ctx)?;
    
    Ok(())
}
```

#### 3.3 Trade Program

**Key Instructions:**
- `create_trade`: Initialize trade from offer
- `accept_trade`: Maker accepts trade request
- `fund_escrow`: Deposit crypto to escrow
- `release_escrow`: Release crypto to buyer
- `dispute_trade`: Initiate dispute resolution
- `settle_dispute`: Arbitrator settles dispute

**Escrow Management:**
```rust
pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
    let trade = &mut ctx.accounts.trade;
    
    // Validate trade state
    require!(trade.state == TradeState::RequestAccepted, ErrorCode::InvalidTradeState);
    
    // Transfer tokens to escrow account
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.seller_token_account.to_account_info(),
            to: ctx.accounts.escrow_account.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        },
    );
    transfer(transfer_ctx, trade.amount)?;
    
    // Update trade state
    trade.state = TradeState::EscrowFunded;
    trade.state_history.push(TradeStateItem {
        actor: ctx.accounts.seller.key(),
        state: TradeState::EscrowFunded,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}
```

#### 3.4 Profile Program

**Key Instructions:**
- `create_profile`: Initialize user profile
- `update_contact`: Update contact information
- `update_trade_stats`: Update trading statistics

#### 3.5 Price Program

**Key Instructions:**
- `update_prices`: Update currency prices (oracle only)
- `register_price_route`: Configure price conversion routes
- `query_price`: Get current price for currency pair

### 4. Data Migration Strategies

#### 4.1 State Migration Approach

**Option 1: Snapshot and Recreate**
1. Take snapshot of CosmWasm contract states
2. Parse and transform data structures
3. Initialize Solana accounts with migrated data
4. Verify data integrity

**Option 2: Gradual Migration**
1. Deploy Solana programs alongside CosmWasm contracts
2. Implement bridge contracts for cross-chain state sync
3. Gradually migrate users and liquidity
4. Sunset CosmWasm contracts

#### 4.2 Data Transformation Examples

**CosmWasm Offer to Solana Account:**
```rust
// CosmWasm Offer
struct CosmOffer {
    id: u64,
    owner: String,
    offer_type: String,
    fiat_currency: String,
    rate: String,
    min_amount: String,
    max_amount: String,
    description: Option<String>,
    denom: String,
    state: String,
    timestamp: u64,
}

// Transform to Solana
fn transform_offer(cosm_offer: CosmOffer) -> Result<Offer> {
    Ok(Offer {
        id: cosm_offer.id,
        owner: Pubkey::from_str(&cosm_offer.owner)?,
        offer_type: OfferType::from_str(&cosm_offer.offer_type)?,
        fiat_currency: FiatCurrency::from_str(&cosm_offer.fiat_currency)?,
        rate: cosm_offer.rate.parse()?,
        min_amount: cosm_offer.min_amount.parse()?,
        max_amount: cosm_offer.max_amount.parse()?,
        description: cosm_offer.description,
        mint: get_mint_from_denom(&cosm_offer.denom)?,
        state: OfferState::from_str(&cosm_offer.state)?,
        created_at: cosm_offer.timestamp as i64,
        bump: 0, // Will be set during account creation
    })
}
```

### 5. Key Implementation Considerations

#### 5.1 Account Rent and Size Optimization

**Rent Considerations:**
- All accounts must maintain minimum rent balance
- Large accounts (trades with history) may require significant rent
- Consider using account compression for historical data

**Size Optimization:**
```rust
// Use compact data types
pub struct CompactTrade {
    pub id: u64,                    // 8 bytes
    pub buyer: Pubkey,              // 32 bytes
    pub seller: Pubkey,             // 32 bytes
    pub amount: u64,                // 8 bytes
    pub state: u8,                  // 1 byte (enum as u8)
    pub created_at: i64,            // 8 bytes
    // Total: ~89 bytes + discriminator
}
```

#### 5.2 Cross-Program Invocation Patterns

**CPI for Profile Updates:**
```rust
// In trade program
pub fn update_trade_count(ctx: Context<UpdateTradeCount>) -> Result<()> {
    // CPI to profile program
    let cpi_program = ctx.accounts.profile_program.to_account_info();
    let cpi_accounts = profile::cpi::accounts::UpdateTradeStats {
        profile: ctx.accounts.profile.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    profile::cpi::increment_trade_count(cpi_ctx, TradeState::EscrowReleased)?;
    Ok(())
}
```

#### 5.3 Error Handling and Validation

**Custom Error Types:**
```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid trade state transition")]
    InvalidStateTransition,
    #[msg("Trade has expired")]
    TradeExpired,
    #[msg("Insufficient escrow balance")]
    InsufficientEscrow,
    #[msg("Excessive platform fees")]
    ExcessiveFees,
    #[msg("Invalid amount range")]
    InvalidAmountRange,
    #[msg("Active trades limit exceeded")]
    ActiveTradesLimitExceeded,
    #[msg("Active offers limit exceeded")]
    ActiveOffersLimitExceeded,
}
```

#### 5.4 Security Considerations

**Access Control:**
```rust
// Authority validation
#[access_control(validate_authority(&ctx.accounts.config, &ctx.accounts.authority))]
pub fn update_config(ctx: Context<UpdateConfig>, params: UpdateConfigParams) -> Result<()> {
    // Implementation
}

fn validate_authority(config: &Account<GlobalConfig>, authority: &Signer) -> Result<()> {
    require!(
        config.authority == authority.key(),
        ErrorCode::Unauthorized
    );
    Ok(())
}
```

**PDA Validation:**
```rust
// Ensure PDA derivation is correct
#[derive(Accounts)]
#[instruction(offer_id: u64)]
pub struct CreateTrade<'info> {
    #[account(
        seeds = [b"offer", offer_id.to_le_bytes().as_ref()],
        bump = offer.bump,
        seeds::program = offer_program.key()
    )]
    pub offer: Account<'info, Offer>,
    // ... other accounts
}
```

### 6. Testing Strategy

#### 6.1 Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;

    #[test]
    fn test_create_offer() {
        // Test offer creation logic
    }

    #[test]
    fn test_trade_flow() {
        // Test complete trade execution
    }

    #[test]
    fn test_dispute_resolution() {
        // Test arbitration process
    }
}
```

#### 6.2 Integration Tests
```typescript
// TypeScript integration tests
describe("LocalMoney Protocol", () => {
  it("should create and execute a complete trade", async () => {
    // Test full trade lifecycle
  });

  it("should handle dispute resolution", async () => {
    // Test dispute flow
  });

  it("should enforce trading limits", async () => {
    // Test limit validation
  });
});
```

### 7. Deployment Strategy

#### 7.1 Program Deployment Order
1. Deploy Hub program first
2. Deploy Profile program
3. Deploy Price program
4. Deploy Offer program
5. Deploy Trade program
6. Initialize global configuration
7. Set up cross-program relationships

#### 7.2 Configuration Management
```rust
// Deployment script
pub async fn deploy_protocol(
    provider: &AnchorProvider,
    authority: &Keypair,
) -> Result<ProtocolAddresses> {
    // Deploy programs
    let hub_program = deploy_program(provider, "hub").await?;
    let profile_program = deploy_program(provider, "profile").await?;
    let price_program = deploy_program(provider, "price").await?;
    let offer_program = deploy_program(provider, "offer").await?;
    let trade_program = deploy_program(provider, "trade").await?;

    // Initialize configuration
    let config_params = InitializeParams {
        offer_program: offer_program.id(),
        trade_program: trade_program.id(),
        profile_program: profile_program.id(),
        price_program: price_program.id(),
        // ... other parameters
    };

    initialize_hub(provider, authority, config_params).await?;

    Ok(ProtocolAddresses {
        hub: hub_program.id(),
        offer: offer_program.id(),
        trade: trade_program.id(),
        profile: profile_program.id(),
        price: price_program.id(),
    })
}
```

### 8. Frontend Integration

#### 8.1 Anchor Client Setup
```typescript
import { Program, AnchorProvider, web3 } from '@coral-xyz/anchor';
import { LocalmoneyHub } from './types/localmoney_hub';
import { LocalmoneyOffer } from './types/localmoney_offer';
import { LocalmoneyTrade } from './types/localmoney_trade';

export class LocalMoneyClient {
  constructor(
    private provider: AnchorProvider,
    private hubProgram: Program<LocalmoneyHub>,
    private offerProgram: Program<LocalmoneyOffer>,
    private tradeProgram: Program<LocalmoneyTrade>,
  ) {}

  async createOffer(params: CreateOfferParams): Promise<string> {
    const [offerPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("offer"), new BN(params.id).toArrayLike(Buffer, "le", 8)],
      this.offerProgram.programId
    );

    const tx = await this.offerProgram.methods
      .createOffer(params)
      .accounts({
        offer: offerPda,
        owner: this.provider.wallet.publicKey,
        // ... other accounts
      })
      .rpc();

    return tx;
  }
}
```

Migrating LocalMoney from CosmWasm to Solana requires careful consideration of architectural differences, account models, and cross-program communication patterns. The Anchor framework provides excellent tooling for this migration, but developers must adapt to Solana's unique paradigms around account ownership, rent, and program interactions.

Key success factors:
1. **Thorough Planning**: Map all CosmWasm contracts to Solana programs
2. **Account Design**: Optimize for rent and access patterns
3. **Security First**: Implement robust validation and access controls
4. **Comprehensive Testing**: Test all cross-program interactions
5. **Gradual Migration**: Consider phased rollout strategies

This migration guide provides the foundation for a successful transition while maintaining the core functionality and security properties of the original LocalMoney protocol. 