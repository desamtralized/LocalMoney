name: "LocalMoney Protocol: CosmWasm to Solana Migration"
description: |

## Purpose
Complete migration of the LocalMoney P2P trading protocol from CosmWasm to Solana using modern Anchor 0.31.1 framework. This migration implements 5 interconnected programs (Hub, Offer, Trade, Profile, Price) with proper SPL token integration, Cross-Program Invocations (CPIs), and Program Derived Addresses (PDAs) while maintaining protocol functionality.

## Core Principles
1. **Protocol Preservation**: Maintain all business logic and state transitions from CosmWasm implementation
2. **Modern Solana Patterns**: Use Anchor 0.31.1 best practices with token_interface and Token-2022 compatibility
3. **Cross-Program Architecture**: Implement proper CPI patterns between programs for modularity
4. **PDA-Based State Management**: Use PDAs for escrow, configuration, and account derivation
5. **SPL Token Integration**: Support both SPL Token and Token-2022 with transfer_checked safety
6. **Comprehensive Testing**: End-to-end integration tests validating complete trading flows

---

## Goal
Implement a complete Solana-native version of the LocalMoney protocol across 5 Anchor programs that replicate all functionality from the existing CosmWasm contracts while leveraging Solana's unique features for enhanced security and performance.

## Why
- **Solana Performance**: Leverage Solana's high throughput and low transaction costs for P2P trading
- **SPL Token Ecosystem**: Native integration with SPL tokens and Token-2022 extensions
- **Composability**: Enable cross-program interactions for protocol upgrades and integrations
- **Developer Experience**: Modern Anchor framework provides better tooling and TypeScript SDK generation
- **Future-Proofing**: Token-2022 support enables advanced token features and extensions

## What
Complete protocol migration including:
- **Hub Program**: Central configuration and cross-program coordination
- **Offer Program**: Decentralized marketplace for trading offers
- **Trade Program**: Escrow management and trade execution with dispute resolution
- **Profile Program**: User reputation and profile management
- **Price Program**: Fiat currency price feeds and oracle integration
- **TypeScript SDK**: Client library for web application integration
- **Integration Tests**: Comprehensive test suite validating all trading scenarios

### Success Criteria
- [ ] All 5 programs compile and deploy successfully to localnet
- [ ] Complete trading flow: offer creation → trade request → escrow funding → completion
- [ ] Cross-program invocations work correctly between all programs
- [ ] TypeScript SDK generates properly from IDLs
- [ ] Integration tests pass for happy path and error scenarios
- [ ] Fee calculations and distributions match CosmWasm implementation
- [ ] Dispute resolution and arbitrator assignment functions correctly

## All Needed Context

### Critical Documentation Sources
```yaml
# ANCHOR 0.31.1 OFFICIAL DOCUMENTATION
anchor_framework: https://www.anchor-lang.com/docs
token_integration: https://www.anchor-lang.com/docs/tokens
anchor_cpi: https://www.anchor-lang.com/docs/basics/cpi
anchor_pdas: https://www.anchor-lang.com/docs/pdas
anchor_workspace: https://www.anchor-lang.com/docs/references/anchor-toml

# SOLANA CORE CONCEPTS
solana_pda: https://solana.com/docs/core/pda
solana_cpi: https://solana.com/docs/core/cpi
solana_programs: https://solana.com/docs/programs/anchor/pda

# TOKEN DEVELOPMENT
token2022_guide: https://www.quicknode.com/guides/solana-development/anchor/token-2022
token_interface_examples: https://www.quicknode.com/guides/solana-development/anchor/how-to-use-program-derived-addresses
spl_token_anchor: https://betterprogramming.pub/using-pdas-and-spl-token-in-anchor-and-solana-df05c57ccd04

# ESCROW AND CPI PATTERNS
escrow_examples: https://hackmd.io/@ironaddicteddog/anchor_example_escrow
cpi_mastery: https://medium.com/@ancilartech/mastering-cross-program-invocations-in-anchor-a-developers-guide-to-solana-s-cpi-patterns-0f29a5734a3e
rareskills_cpi: https://rareskills.io/post/cross-program-invocation
```

### Current CosmWasm Implementation Analysis

**Business Logic Patterns from `/contracts/cosmwasm/packages/protocol/src/`**:

**Trade States** (from `trade.rs:171-184`):
```rust
// CosmWasm trade states - PRESERVE in Solana
pub enum TradeState {
    RequestCreated,      // Initial trade request
    RequestCanceled,     // Cancelled before acceptance
    RequestExpired,      // Expired timeout
    RequestAccepted,     // Seller accepted request
    EscrowFunded,        // Funds locked in escrow
    EscrowCanceled,      // Escrow cancelled
    EscrowRefunded,      // Funds returned to seller
    FiatDeposited,       // Buyer confirms fiat payment
    EscrowReleased,      // Crypto released to buyer
    EscrowDisputed,      // Dispute initiated
    SettledForMaker,     // Dispute resolved for seller
    SettledForTaker,     // Dispute resolved for buyer
}
```

**Trade Structure** (from `trade.rs:193-214`):
```rust
// Core trade data structure - ADAPT for Solana PDAs
pub struct Trade {
    pub id: u64,
    pub buyer: Addr,           // Convert to Pubkey
    pub seller: Addr,          // Convert to Pubkey
    pub arbitrator: Addr,      // Convert to Pubkey
    pub offer_id: u64,
    pub amount: Uint128,       // Convert to u64
    pub denom: Denom,          // Convert to SPL Mint Pubkey
    pub fiat: FiatCurrency,    // Preserve enum
    pub denom_fiat_price: Uint256, // Convert to u64
    pub state_history: Vec<TradeStateItem>,
    pub created_at: u64,
    pub expires_at: u64,
    // ... contact and dispute fields
}
```

**Offer Types** (from `offer.rs:62-71`):
```rust
// Offer creation message - ADAPT for Anchor
pub struct OfferMsg {
    pub offer_type: OfferType,        // Buy/Sell enum
    pub fiat_currency: FiatCurrency,  // USD, EUR, etc.
    pub rate: Uint128,                // Basis points above/below market
    pub denom: Denom,                 // Convert to SPL Mint
    pub min_amount: Uint128,          // Min trade amount
    pub max_amount: Uint128,          // Max trade amount
    pub description: Option<String>,   // Offer description
}
```

**Fee Structure** (from `trade.rs:98-102`):
```rust
// Fee calculation - PRESERVE for Solana
pub struct FeeInfo {
    pub burn_amount: Uint128,     // Tokens to burn
    pub chain_amount: Uint128,    // Network fees
    pub warchest_amount: Uint128, // Protocol treasury
}
```

### Modern Anchor 0.31.1 Implementation Patterns

**Token Interface Setup** (Based on QuickNode Token-2022 Guide):
```toml
# Cargo.toml dependencies for each program
[dependencies]
anchor-lang = "0.31.1"
anchor-spl = { version = "0.31.1", features = ["token", "idl-build"] }

[features]
default = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
```

**Modern Token Account Types**:
```rust
// Use token_interface for Token-2022 compatibility
use anchor_spl::token_interface::{
    Mint, TokenAccount, TokenInterface,
    TransferChecked, transfer_checked
};

#[derive(Accounts)]
pub struct TokenAccounts<'info> {
    pub token_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = authority,
        associated_token::token_program = token_program,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}
```

**PDA Derivation Patterns**:
```rust
// Standard PDA seeds for each program
// Hub: ["hub", "config"]
// Offer: ["offer", offer_id.to_le_bytes()]
// Trade: ["trade", trade_id.to_le_bytes()]
// Trade Escrow: ["trade", "escrow", trade_id.to_le_bytes()]
// Profile: ["profile", user_pubkey]
// Price: ["price", fiat_currency.as_bytes()]

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
}
```

**Cross-Program Invocation Pattern**:
```rust
// CPI from Trade program to Profile program
pub fn update_profile_stats(
    ctx: &Context<UpdateStats>,
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

**Safe Token Transfer Pattern**:
```rust
// Use transfer_checked for decimals validation
transfer_checked(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        TransferChecked {
            from: seller_token_account.to_account_info(),
            to: escrow_token_account.to_account_info(),
            authority: trade.to_account_info(),
            mint: token_mint.to_account_info(),
        },
        signer_seeds,
    ),
    amount,
    token_mint.decimals,
)?;
```

### Workspace Structure Based on Migration Guide

**Directory Structure** (from `SOLANA_PROTOCOL_MIGRATION.md:23-32`):
```
contracts/solana/
├── Anchor.toml              # Workspace configuration
├── Cargo.toml               # Root workspace manifest
├── programs/
│   ├── hub/                 # Central configuration program
│   ├── offer/               # Offer marketplace program
│   ├── trade/               # Escrow and trading program
│   ├── profile/             # User profiles and reputation
│   └── price/               # Price oracle program
├── sdk/                     # TypeScript SDK
└── tests/                   # Integration tests
```

**Account Space Calculations** (from Migration Guide):
```rust
// Example space calculation for TradeAccount
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

### Integration Testing Patterns

**End-to-End Test Structure** (Based on `SOLANA_E2E_TESTING.md`):
```typescript
// Complete trading flow test
describe("LocalMoney Happy Path Integration", () => {
  before(async () => {
    // Deploy all 5 programs to local validator
    await deployPrograms();
    await initializeHub();
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

### Known Gotchas and Solutions

**1. IDL Build Requirements**:
```toml
# MUST include in each program's Cargo.toml
[features]
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
```

**2. Token Transfer Safety**:
```rust
// WRONG - Basic transfer (deprecated)
token::transfer(ctx, amount)?;

// CORRECT - Transfer with decimals validation
transfer_checked(ctx, amount, token_mint.decimals)?;
```

**3. PDA Signer Seeds**:
```rust
// CORRECT - Include bump in signer seeds
let signer_seeds = &[
    b"trade",
    trade_id.to_le_bytes().as_ref(),
    &[trade.bump],
];
```

**4. Account Constraints**:
```rust
// MUST include token_program constraint
#[account(
    mut,
    associated_token::mint = token_mint,
    associated_token::authority = seller,
    associated_token::token_program = token_program,  // REQUIRED
)]
pub seller_token_account: InterfaceAccount<'info, TokenAccount>,
```

## Implementation Blueprint

### Phase 1: Workspace Setup and Hub Program
**Duration**: 1-2 hours

**Tasks**:
1. **Initialize Anchor Workspace**:
   ```bash
   anchor init localmoney-solana --typescript
   cd localmoney-solana
   ```

2. **Configure Root Cargo.toml**:
   ```toml
   [workspace]
   members = ["programs/*"]
   resolver = "2"
   
   [workspace.dependencies]
   anchor-lang = "0.31.1"
   anchor-spl = { version = "0.31.1", features = ["token", "idl-build"] }
   
   [profile.release]
   overflow-checks = true
   ```

3. **Configure Anchor.toml**:
   ```toml
   [toolchain]
   anchor_version = "0.31.1"
   solana_version = "2.1.21"
   
   [programs.localnet]
   hub = "HUBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   offer = "OFFERxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   trade = "TRADExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   profile = "PROFILExxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   price = "PRICExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   
   [workspace]
   members = ["programs/*"]
   ```

4. **Implement Hub Program**:
   - Create `programs/hub/src/lib.rs` with configuration management
   - Implement admin controls and program registry
   - Add CPI registration for other programs

**Validation**: `anchor build --program hub` succeeds and generates IDL

### Phase 2: Core Data Structures and Types
**Duration**: 2-3 hours

**Tasks**:
1. **Create Common Types Package**:
   ```rust
   // programs/common/src/lib.rs
   #[derive(Clone, Debug, PartialEq, AnchorSerialize, AnchorDeserialize)]
   pub enum FiatCurrency {
       USD, EUR, GBP, CAD, AUD, JPY, BRL, MXN, // ... others
   }
   
   #[derive(Clone, Debug, PartialEq, AnchorSerialize, AnchorDeserialize)]
   pub enum OfferType { Buy, Sell }
   
   #[derive(Clone, Debug, PartialEq, AnchorSerialize, AnchorDeserialize)]
   pub enum TradeState {
       RequestCreated, RequestAccepted, EscrowFunded,
       FiatDeposited, EscrowReleased, EscrowDisputed,
       // ... all states from CosmWasm
   }
   ```

2. **Define Account Structures**:
   - `TradeAccount` with proper space calculation
   - `OfferAccount` with marketplace data
   - `ProfileAccount` with reputation tracking
   - `PriceAccount` with fiat currency rates

**Validation**: All types compile and serialize properly

### Phase 3: Offer Program Implementation
**Duration**: 3-4 hours

**Tasks**:
1. **Create Offer Program Structure**:
   ```rust
   // programs/offer/src/lib.rs
   #[program]
   pub mod offer {
       pub fn create_offer(ctx: Context<CreateOffer>, params: CreateOfferParams) -> Result<()> {
           // Validate offer parameters
           // Create offer PDA
           // Update user profile via CPI
       }
       
       pub fn update_offer(ctx: Context<UpdateOffer>, params: UpdateOfferParams) -> Result<()> {
           // Update existing offer
           // Validate ownership
       }
   }
   ```

2. **Implement Account Contexts**:
   - `CreateOffer` with proper PDA derivation
   - `UpdateOffer` with ownership validation
   - Token mint validation for SPL tokens

3. **Add CPI to Profile Program**:
   - Update offer statistics
   - Increment active offer counts

**Validation**: Offer creation, updates, and profile CPI work correctly

### Phase 4: Trade Program with Escrow
**Duration**: 4-5 hours

**Tasks**:
1. **Implement Core Trade Functions**:
   ```rust
   pub fn create_trade(ctx: Context<CreateTrade>, params: CreateTradeParams) -> Result<()> {
       // Validate offer exists and is active
       // Assign random arbitrator
       // Initialize trade PDA
       // Create escrow token account PDA
   }
   
   pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
       // Transfer SPL tokens to escrow PDA
       // Use transfer_checked for safety
       // Update trade state
   }
   
   pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
       // Calculate and deduct fees
       // Transfer tokens to buyer
       // Update profiles via CPI
   }
   ```

2. **Implement Dispute Resolution**:
   - `dispute_trade` function for conflict initiation
   - `settle_dispute` for arbitrator decisions
   - Proper fund distribution logic

3. **Add Comprehensive State Management**:
   - State history tracking
   - Expiration handling
   - Contact information management

**Validation**: Complete trade flow works end-to-end with proper escrow

### Phase 5: Profile and Price Programs
**Duration**: 2-3 hours

**Tasks**:
1. **Profile Program**:
   ```rust
   pub fn create_profile(ctx: Context<CreateProfile>, username: String) -> Result<()> {
       // Initialize user profile PDA
       // Set default reputation values
   }
   
   pub fn update_trade_stats(ctx: Context<UpdateTradeStats>, trade_state: TradeState) -> Result<()> {
       // Called via CPI from trade program
       // Update trading statistics
   }
   ```

2. **Price Program**:
   ```rust
   pub fn update_prices(ctx: Context<UpdatePrices>, prices: Vec<CurrencyPrice>) -> Result<()> {
       // Admin-only price updates
       // Validate price feeds
   }
   
   pub fn get_price(mint: Pubkey, fiat: FiatCurrency) -> Result<u64> {
       // Query price for calculations
   }
   ```

**Validation**: Profile updates and price queries work via CPI

### Phase 6: TypeScript SDK Generation
**Duration**: 2-3 hours

**Tasks**:
1. **Build All Programs**:
   ```bash
   anchor build
   ```

2. **Generate TypeScript Types**:
   ```bash
   anchor gen # Generates types from IDLs
   ```

3. **Create SDK Structure**:
   ```typescript
   // sdk/src/index.ts
   export class LocalMoneySDK {
     constructor(connection: Connection, wallet: Wallet) {}
     
     async createOffer(params: CreateOfferParams): Promise<string> {}
     async createTrade(offerId: string, params: CreateTradeParams): Promise<string> {}
     async fundEscrow(tradeId: string): Promise<string> {}
     async releaseEscrow(tradeId: string): Promise<string> {}
   }
   ```

**Validation**: SDK compiles and can interact with deployed programs

### Phase 7: Integration Testing
**Duration**: 4-5 hours

**Tasks**:
1. **Setup Test Environment**:
   ```typescript
   // tests/integration/setup.ts
   before(async () => {
     // Start local validator
     // Deploy all programs
     // Fund test wallets
     // Initialize hub configuration
   });
   ```

2. **Happy Path Tests**:
   - Complete trading flow from offer to completion
   - Fee calculations and distributions
   - Profile statistics updates

3. **Error Scenario Tests**:
   - Invalid trade attempts
   - Expired trade handling
   - Dispute resolution flows

4. **Cross-Program Tests**:
   - Verify all CPI calls work correctly
   - Test state consistency across programs

**Validation**: All tests pass consistently

### Implementation Priority Order

1. **Hub Program** - Central configuration needed by all others
2. **Common Types** - Shared data structures
3. **Profile Program** - Required by offer and trade CPIs
4. **Price Program** - Required for trade pricing
5. **Offer Program** - Marketplace functionality
6. **Trade Program** - Complex escrow and state management
7. **SDK Generation** - Client library
8. **Integration Tests** - End-to-end validation

## Error Handling Strategy

### Expected Challenges and Solutions

**1. PDA Derivation Conflicts**:
- **Issue**: Multiple programs using same seeds
- **Solution**: Program-specific prefixes for all PDAs

**2. CPI Context Setup**:
- **Issue**: Missing accounts in CPI calls
- **Solution**: Use anchor-gen to verify account requirements

**3. Token Account Authority**:
- **Issue**: PDA authority for escrow transfers
- **Solution**: Proper signer seeds with bump validation

**4. Space Calculation Errors**:
- **Issue**: Account size too small for data
- **Solution**: Conservative space estimates with buffer

### Rollback Strategy
```bash
# If implementation fails, reset to specific phase
git checkout HEAD~1  # Undo last commit
anchor clean          # Clean build artifacts
rm -rf target/        # Fresh build environment
```

### Debug Commands
```bash
# Useful debugging commands
anchor test --detach           # Keep validator running for inspection
solana logs                    # View transaction logs
anchor account <TYPE> <ADDR>   # Inspect account data
```

## Validation Gates (Must be Executable)

### Phase Validation Commands
```bash
# Phase 1: Hub Program
cd contracts/solana
anchor build --program hub
ls target/idl/hub.json

# Phase 2: All Programs Compile
anchor build
ls target/idl/ | wc -l  # Should show 5 IDL files

# Phase 3: Deploy to Localnet
anchor deploy --provider.cluster localnet
anchor test --skip-deploy

# Phase 4: SDK Generation
anchor gen
cd sdk && npm install && npm run build

# Phase 5: Integration Tests
cd tests
npm install
npm test
```

### Final Validation Checklist
```bash
# Complete system validation
anchor test                    # All tests pass
anchor build --verifiable      # Reproducible builds
npm run lint                   # Code quality
npm run type-check            # TypeScript validation
```

## Quality Confidence Score

**Confidence Level: 8/10** for one-pass implementation success

**Reasoning**:
- ✅ **Comprehensive Context**: Complete business logic analysis from CosmWasm contracts
- ✅ **Modern Patterns**: Based on official Anchor 0.31.1 documentation and 2025 best practices
- ✅ **Proven Architecture**: Migration guide provides tested program structure
- ✅ **Detailed Implementation**: Step-by-step blueprint with specific code examples
- ✅ **Validation Gates**: Executable tests for each phase
- ✅ **Error Handling**: Known gotchas and solutions documented

**Risk Factors** (-2 points):
- **Cross-Program Complexity**: 5 interconnected programs with CPI dependencies
- **Token Integration**: SPL Token and Token-2022 compatibility requirements
- **State Management**: Complex trade state transitions and escrow logic

**Mitigation**:
- **Phase-by-Phase Approach**: Each phase validates before proceeding
- **Existing Examples**: Leverage proven patterns from documentation
- **Conservative Estimates**: Space calculations include buffers
- **Comprehensive Testing**: Integration tests catch cross-program issues

This PRP provides everything needed for successful implementation of the LocalMoney protocol migration to Solana with modern Anchor framework patterns.