# PRP: LocalMoney Solana TypeScript SDK

## Overview

Create a production-grade TypeScript SDK for the LocalMoney Solana Protocol that enables seamless frontend integration. The SDK provides type-safe access to all 7 programs (Hub, Profile, Offer, Trade, Escrow, Arbitrator, Price Oracle), automatic PDA derivation, high-level transaction builders for common workflows, and comprehensive account fetching with proper deserialization.

**Status:** READY FOR IMPLEMENTATION
**Dependencies:** @coral-xyz/anchor ^0.31.0, @solana/web3.js ^1.95.0, @solana/spl-token ^0.4.0
**Priority:** HIGH - Blocks frontend development
**Confidence Score:** 9/10

## Reference Documentation

### Official Anchor/Solana Documentation
- **Anchor TypeScript Client**: https://www.anchor-lang.com/docs/clients/typescript
- **Solana JS/TS Client Guide**: https://solana.com/docs/programs/anchor/client-typescript
- **Anchor TypeDocs API**: https://solana-foundation.github.io/anchor/ts/index.html
- **Intro to Client-Side Anchor**: https://solana.com/developers/courses/onchain-development/intro-to-anchor-frontend
- **PDA Guide**: https://solana.com/docs/core/pda
- **Anchor Seeds/Bumps/PDAs**: https://chainstack.com/solana-anchor-accounts-seeds-bumps-pdas-and-how-the-client-really-works/

### LocalMoney Codebase References
- **Test Utilities (PDA helpers, constants)**: `/contracts/solana/tests/utils/index.ts`
- **Integration Test Setup**: `/contracts/solana/tests/integration/setup.ts`
- **Generated TypeScript Types**: `/contracts/solana/target/types/*.ts`
- **IDL Files**: `/contracts/solana/target/idl/*.json`
- **Program IDs**: Defined in each program's `lib.rs` via `declare_id!`

### Key Technical Constraints
- **@coral-xyz/anchor** is only compatible with @solana/web3.js v1.x (NOT v2.x)
- SDK must work in both Node.js and browser environments
- Must support wallet adapter integration for frontend use
- All PDAs use specific seeds defined in the Rust programs

## Program Architecture Summary

### Program IDs (Localnet/Devnet)
```typescript
const PROGRAM_IDS = {
  HUB: "8xemd2mhu4zi314H6nFTGgXKTVFji4evLSedxKVvk7jH",
  PROFILE: "86KWUvm3YK3fsSqSF1iLCRB2mLmHFcGUozFvD823Npf5",
  OFFER: "CZR8LiYhioRCc9qYFBfMkQ3JnkgU2PfAD8fMLN5WrNDo",
  TRADE: "5fRDb9S3Z61fBALmDHNV5EH7GDP8gsCGkQT8eawDL1kE",
  ESCROW: "CfpW1FrK41jj5tv1JRBxgRTqRr7Yeok9HeqnaUMg46VJ",
  ARBITRATOR: "J5BNGJ128bxHuWemwaoGkDqy8DVSvsA7o5kpdy9eDoNe",
  PRICE_ORACLE: "CwWd4PCPx85fgREweU3UWWd6kxhtqRVd9xh2iVMT9Rbw",
};
```

### PDA Seeds (Critical for SDK)
| PDA | Seeds | Program |
|-----|-------|---------|
| Hub Config | `["hub_config"]` | Hub |
| User Profile | `["profile", user_pubkey]` | Profile |
| Offer | `["offer", offer_id (8 bytes LE)]` | Offer |
| Offer Counter | `["offer_counter"]` | Offer |
| Trade | `["trade", trade_id (8 bytes LE)]` | Trade |
| Trade Counter | `["trade_counter"]` | Trade |
| Escrow Vault | `["escrow_vault", trade_id (8 bytes LE)]` | Escrow |
| Arbitrator | `["arbitrator", arbitrator_pubkey, fiat_currency (3 bytes)]` | Arbitrator |
| Dispute | `["dispute", trade_id (8 bytes LE)]` | Arbitrator |
| Price Registry | `["price_provider_registry"]` | Price Oracle |
| Price Provider | `["price_provider", provider_pubkey]` | Price Oracle |
| Price | `["price", fiat_currency (3 bytes)]` | Price Oracle |

### Key Enums and States

**OfferType**: `Buy | Sell`
**OfferState**: `Active | Paused | Deleted`
**TradeState**: `RequestCreated | RequestAccepted | EscrowFunded | FiatDeposited | EscrowReleased | RequestCanceled | RequestExpired | EscrowRefunded | Disputed | DisputeResolved`
**DisputeResolution**: `BuyerWins | SellerWins`

### Instructions by Program

**Hub (Admin only)**:
- `initialize`, `updateConfig`, `transferAdmin`, `setCircuitBreaker`

**Profile (User)**:
- `createProfile`, `updateContact`
- CPI-only: `updateTradeStats`, `updateActiveCounters`

**Offer (User)**:
- `initializeCounter` (admin), `createOffer`, `updateOffer`, `pauseOffer`, `resumeOffer`, `deleteOffer`

**Trade (User)**:
- `initializeCounter` (admin), `createTrade`, `acceptTrade`, `fundEscrow`, `confirmFiatDeposit`, `releaseEscrow`, `cancelTrade`, `refundTrade`, `initiateDispute`, `checkExpiration`

**Escrow (CPI-only from Trade)**:
- `fundEscrow`, `releaseEscrow`, `refundEscrow`, `freezeEscrow`, `unfreezeEscrow`

**Arbitrator (Admin + Assigned)**:
- `registerArbitrator`, `removeArbitrator`, `assignArbitrator` (CPI), `submitEvidence`, `resolveDispute`

**Price Oracle (Admin + Providers)**:
- `initializeRegistry`, `registerProvider`, `removeProvider`, `initializePrice`, `updatePrice`

## SDK Architecture

### Design Principles

1. **Unified Client Entry Point**: Single `LocalMoneyClient` class that provides access to all program operations
2. **Program-Specific Subclients**: Modular access via `client.profile`, `client.offer`, `client.trade`, etc.
3. **Automatic PDA Resolution**: SDK handles all PDA derivation internally
4. **Type Safety**: Full TypeScript types from Anchor IDL generation
5. **Transaction Builder Pattern**: High-level methods for complex multi-step workflows
6. **Read-Only Mode**: Support fetching accounts without wallet connection
7. **Error Handling**: Custom error classes with human-readable messages

### Directory Structure

```
packages/sdk/
├── src/
│   ├── index.ts                    # Main exports
│   ├── client.ts                   # LocalMoneyClient orchestrator
│   ├── config.ts                   # Network configurations
│   ├── constants.ts                # Program IDs, seeds, constants
│   │
│   ├── types/                      # TypeScript type definitions
│   │   ├── index.ts                # Re-exports
│   │   ├── accounts.ts             # Account state types
│   │   ├── instructions.ts         # Instruction param types
│   │   ├── events.ts               # Event types
│   │   └── enums.ts                # Enum types (states, etc.)
│   │
│   ├── pdas/                       # PDA derivation utilities
│   │   ├── index.ts                # All PDA functions
│   │   └── seeds.ts                # Seed constants
│   │
│   ├── programs/                   # Program-specific clients
│   │   ├── base.ts                 # BaseProgram abstract class
│   │   ├── hub.ts                  # HubClient
│   │   ├── profile.ts              # ProfileClient
│   │   ├── offer.ts                # OfferClient
│   │   ├── trade.ts                # TradeClient
│   │   ├── arbitrator.ts           # ArbitratorClient
│   │   └── price-oracle.ts         # PriceOracleClient
│   │
│   ├── builders/                   # High-level transaction builders
│   │   ├── trade-flow.ts           # Complete trade lifecycle
│   │   ├── offer-management.ts     # Offer CRUD operations
│   │   └── dispute-flow.ts         # Dispute resolution
│   │
│   ├── utils/                      # Utility functions
│   │   ├── conversion.ts           # Fiat/bytes, amount conversions
│   │   ├── formatting.ts           # Display formatting
│   │   └── validation.ts           # Input validation
│   │
│   └── errors/                     # Error handling
│       ├── index.ts                # Error classes
│       └── parser.ts               # Anchor error parsing
│
├── tests/                          # SDK tests
│   ├── unit/
│   └── integration/
│
├── package.json
├── tsconfig.json
├── tsup.config.ts                  # Build configuration
└── README.md
```

## Task Breakdown

---

### Task 1: Project Scaffolding and Package Setup

**Background & Reasoning:**
Before any SDK code can be written, the project structure must be established with proper TypeScript configuration, build tooling, and dependency management. This foundation ensures the SDK can be built for multiple targets (CJS/ESM), tested effectively, and published to npm.

**Scope:**
- Create `packages/sdk/` directory structure
- Initialize npm package with proper metadata
- Configure TypeScript with strict mode and proper module resolution
- Set up tsup for dual CJS/ESM builds
- Configure Jest for testing
- Add ESLint and Prettier for code quality
- Create initial README with installation instructions

**What is NOT included:**
- Writing any actual SDK functionality
- Copying IDL files (separate task)
- Writing tests (separate task)

**Technical Considerations:**
- Package should be scoped: `@localmoney/sdk`
- Must support both Node.js (>=18) and browser environments
- TypeScript target: ES2020 for modern features
- Use `tsup` for zero-config bundling with tree-shaking
- Peer dependencies: @coral-xyz/anchor, @solana/web3.js, @solana/spl-token

**Acceptance Criteria:**
- [ ] `packages/sdk/` directory created with full structure
- [ ] `package.json` with correct dependencies and peer dependencies
- [ ] `tsconfig.json` with strict mode, ES2020 target, and proper paths
- [ ] `tsup.config.ts` configured for CJS/ESM dual output
- [ ] `jest.config.js` configured for TypeScript
- [ ] `.eslintrc.js` and `.prettierrc` configured
- [ ] `npm run build` succeeds (even with empty src)
- [ ] `npm run lint` runs without errors

**Definition of Done:**
- Project skeleton complete and builds without errors
- All config files in place
- README has basic installation section

---

### Task 2: Copy IDL Types and Generate Type Definitions

**Background & Reasoning:**
Anchor generates TypeScript type definitions from IDL files that provide full type safety when interacting with programs. These types must be copied into the SDK and organized for clean exports. The IDL files contain instruction discriminators, account structures, and type definitions essential for the SDK.

**Scope:**
- Copy all 7 IDL JSON files from `target/idl/` to SDK
- Copy all 7 TypeScript type files from `target/types/` to SDK
- Create unified type exports in `types/index.ts`
- Create enum type definitions that match Rust enums
- Create account state types for better DX

**What is NOT included:**
- Modifying the generated types
- Writing custom type transformations
- PDA derivation (separate task)

**Files to Copy:**
- `/contracts/solana/target/idl/*.json` → `packages/sdk/src/idl/`
- `/contracts/solana/target/types/*.ts` → `packages/sdk/src/types/generated/`

**Technical Considerations:**
- IDL files are JSON and need to be importable
- Generated types use specific Anchor conventions (BN for numbers, PublicKey for addresses)
- Enum types in TypeScript need manual definition to match Rust variants
- Consider creating "friendlier" wrapper types for frontend consumption

**Acceptance Criteria:**
- [ ] All 7 IDL JSON files present in `src/idl/`
- [ ] All 7 generated type files present in `src/types/generated/`
- [ ] `src/types/index.ts` exports all types cleanly
- [ ] `src/types/enums.ts` defines all enum types (OfferType, TradeState, etc.)
- [ ] `src/types/accounts.ts` re-exports account types with documentation
- [ ] TypeScript compiles without errors
- [ ] Types are importable: `import { Trade, TradeState } from '@localmoney/sdk'`

**Definition of Done:**
- All types properly exported
- No TypeScript errors
- Types match Rust definitions exactly

---

### Task 3: Implement PDA Derivation Utilities

**Background & Reasoning:**
Program Derived Addresses (PDAs) are deterministically derived addresses used by Solana programs to create accounts. The SDK must provide reliable PDA derivation that exactly matches the seeds used in the Rust programs. This is critical - incorrect PDA derivation will cause all transactions to fail.

**Scope:**
- Create `pdas/seeds.ts` with seed constants
- Create `pdas/index.ts` with all PDA derivation functions
- Port existing helpers from `/tests/utils/index.ts`
- Add comprehensive JSDoc documentation
- Add helper functions for common patterns (get all PDAs for a trade, etc.)

**What is NOT included:**
- Account fetching (separate task)
- Transaction building (separate task)

**Reference Implementation:**
```typescript
// From /contracts/solana/tests/utils/index.ts
export async function getTradePDA(
  tradeId: BN,
  programId: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("trade"), tradeId.toArrayLike(Buffer, "le", 8)],
    programId
  );
}
```

**Technical Considerations:**
- Use `PublicKey.findProgramAddressSync` for synchronous derivation
- Trade IDs and Offer IDs are u64 (8 bytes, little-endian)
- Fiat currencies are 3-byte ASCII strings (e.g., "USD" → [85, 83, 68])
- All seeds must exactly match Rust `#[account(...seeds = [...])]` definitions
- Consider caching PDA results for performance

**Required PDAs:**
1. `getHubConfigPDA(programId)` - Hub config
2. `getProfilePDA(user, programId)` - User profile
3. `getOfferPDA(offerId, programId)` - Single offer
4. `getOfferCounterPDA(programId)` - Offer counter
5. `getTradePDA(tradeId, programId)` - Single trade
6. `getTradeCounterPDA(programId)` - Trade counter
7. `getEscrowVaultPDA(tradeId, programId)` - Escrow vault
8. `getArbitratorPDA(arbitrator, fiatCurrency, programId)` - Arbitrator
9. `getDisputePDA(tradeId, programId)` - Dispute
10. `getPriceProviderRegistryPDA(programId)` - Registry
11. `getPriceProviderPDA(provider, programId)` - Provider
12. `getPricePDA(fiatCurrency, programId)` - Price feed

**Acceptance Criteria:**
- [ ] All 12 PDA functions implemented
- [ ] Seeds exactly match Rust program definitions
- [ ] Functions return `[PublicKey, number]` tuple (address + bump)
- [ ] JSDoc documentation on all functions
- [ ] Unit tests verify PDA derivation matches expected addresses
- [ ] Helper function `getTradeRelatedPDAs(tradeId)` returns all PDAs for a trade
- [ ] `fiatToBytes(fiat: string)` and `bytesToFiat(bytes: number[])` utilities

**Definition of Done:**
- All PDA functions pass unit tests
- Documentation complete
- No hardcoded program IDs (passed as parameters)

---

### Task 4: Implement Constants and Configuration Module

**Background & Reasoning:**
The SDK needs a centralized configuration system for program IDs, network endpoints, and protocol constants. This enables easy switching between localnet, devnet, and mainnet environments and provides a single source of truth for values like basis points and fee limits.

**Scope:**
- Create `constants.ts` with program IDs for each network
- Create `config.ts` with network configuration factory
- Define protocol constants (BASIS_POINTS, MAX_FEE, etc.)
- Create `NetworkConfig` type and preset configurations
- Add environment detection helpers

**What is NOT included:**
- Runtime configuration updates
- Wallet/provider setup (part of client)

**Technical Considerations:**
- Program IDs may differ between localnet, devnet, and mainnet
- Frontend needs to easily switch networks
- Constants should be importable individually for tree-shaking
- Consider using environment variables for program IDs in production

**Configuration Structure:**
```typescript
interface NetworkConfig {
  name: 'localnet' | 'devnet' | 'mainnet-beta';
  endpoint: string;
  programIds: {
    hub: PublicKey;
    profile: PublicKey;
    offer: PublicKey;
    trade: PublicKey;
    escrow: PublicKey;
    arbitrator: PublicKey;
    priceOracle: PublicKey;
  };
}
```

**Acceptance Criteria:**
- [ ] `LOCALNET_CONFIG`, `DEVNET_CONFIG`, `MAINNET_CONFIG` presets defined
- [ ] `getNetworkConfig(network: string)` factory function
- [ ] Protocol constants exported: `BASIS_POINTS`, `MAX_TOTAL_FEE_PCT`, etc.
- [ ] Program ID validation (checks format)
- [ ] TypeScript types for all configurations
- [ ] Unit tests for config factory

**Definition of Done:**
- All network configs defined
- Constants match Rust program values
- Easy to add new networks

---

### Task 5: Implement Base Program Client Class

**Background & Reasoning:**
All program-specific clients share common functionality: connection management, provider handling, account fetching, and error parsing. A base class provides this shared foundation and ensures consistent behavior across all program clients.

**Scope:**
- Create `programs/base.ts` with `BaseProgram` abstract class
- Implement connection and provider management
- Implement generic account fetching with deserialization
- Implement Anchor error parsing
- Create wallet connection state management

**What is NOT included:**
- Program-specific instruction methods
- Transaction builders
- Event subscription

**Technical Considerations:**
- Must work with @coral-xyz/anchor's Program class
- Support both connected (wallet) and read-only (no wallet) modes
- Handle network errors gracefully
- Parse Anchor errors into human-readable messages
- Consider retry logic for transient failures

**Base Class Interface:**
```typescript
abstract class BaseProgram<T extends Idl> {
  protected program: Program<T>;
  protected connection: Connection;
  protected provider?: AnchorProvider;

  // Account fetching
  protected async fetchAccount<A>(pda: PublicKey, accountType: string): Promise<A | null>;
  protected async fetchAccounts<A>(pdas: PublicKey[], accountType: string): Promise<(A | null)[]>;

  // Error handling
  protected parseError(error: unknown): LocalMoneyError;

  // State checks
  get isConnected(): boolean;
  get walletPublicKey(): PublicKey | null;
}
```

**Acceptance Criteria:**
- [ ] `BaseProgram` abstract class implemented
- [ ] Connection and provider management working
- [ ] Generic `fetchAccount` method with proper deserialization
- [ ] Error parsing converts Anchor errors to custom error types
- [ ] Read-only mode works without wallet
- [ ] TypeScript generics properly constrain IDL types
- [ ] Unit tests for error parsing and account fetching

**Definition of Done:**
- Base class is fully functional
- All program clients can extend it
- Error handling is comprehensive

---

### Task 6: Implement Hub Program Client

**Background & Reasoning:**
The Hub program is the central configuration registry for the entire protocol. The SDK needs to expose Hub configuration reading for frontend displays (fee info, limits, circuit breaker status) and admin operations for the protocol admin dashboard.

**Scope:**
- Create `programs/hub.ts` with `HubClient` class extending `BaseProgram`
- Implement Hub config fetching
- Implement admin instructions (initialize, updateConfig, setCircuitBreaker)
- Add typed methods for reading specific config values

**What is NOT included:**
- Cross-program coordination
- Config caching strategy

**Instructions to Implement:**
1. `fetchConfig()` - Get current Hub configuration
2. `initialize(params)` - Initialize Hub (admin only)
3. `updateConfig(params)` - Update configuration (admin only)
4. `setCircuitBreaker(params)` - Set pause flags (admin only)
5. `transferAdmin(newAdmin)` - Transfer admin authority

**Acceptance Criteria:**
- [ ] `HubClient` class extends `BaseProgram`
- [ ] `fetchConfig()` returns typed `HubConfig` account
- [ ] `initialize()` builds and sends transaction
- [ ] `updateConfig()` handles optional params correctly
- [ ] `setCircuitBreaker()` properly encodes flags
- [ ] Helper methods: `getFees()`, `getLimits()`, `isGloballyPaused()`
- [ ] Integration test verifies config fetch on devnet/localnet

**Definition of Done:**
- All Hub operations functional
- Proper error handling
- TypeScript types complete

---

### Task 7: Implement Profile Program Client

**Background & Reasoning:**
User profiles store reputation, trading statistics, and encrypted contact information. The SDK must enable profile creation, contact updates, and profile fetching. Profile statistics are updated via CPI from other programs but the SDK needs to expose read access.

**Scope:**
- Create `programs/profile.ts` with `ProfileClient` class
- Implement profile fetching (single and batch)
- Implement profile creation
- Implement contact update
- Add helper methods for reputation calculation display

**What is NOT included:**
- CPI instruction wrappers (handled internally by Trade/Offer)
- Profile search/indexing (needs off-chain indexer)

**Instructions to Implement:**
1. `fetchProfile(user)` - Get user's profile
2. `fetchProfiles(users)` - Batch fetch multiple profiles
3. `createProfile(params)` - Create new profile
4. `updateContact(params)` - Update contact info
5. `profileExists(user)` - Check if profile exists

**Acceptance Criteria:**
- [ ] `ProfileClient` class extends `BaseProgram`
- [ ] `fetchProfile()` returns typed `UserProfile` or null
- [ ] `fetchProfiles()` handles batch fetching efficiently
- [ ] `createProfile()` derives PDA and sends transaction
- [ ] `updateContact()` works for profile owner
- [ ] Helper: `calculateReputationDisplay(profile)` formats reputation as percentage
- [ ] Helper: `formatTradingVolume(profile)` returns human-readable volume

**Definition of Done:**
- Profile operations complete
- Batch fetching optimized
- Reputation helpers work correctly

---

### Task 8: Implement Offer Program Client

**Background & Reasoning:**
Offers are the marketplace listings that users browse and respond to. The SDK needs comprehensive offer management including creation, updates, state changes, and efficient fetching for marketplace display. This is one of the most user-facing parts of the SDK.

**Scope:**
- Create `programs/offer.ts` with `OfferClient` class
- Implement offer CRUD operations
- Implement offer state changes (pause, resume, delete)
- Implement offer fetching (single, by owner, all active)
- Add filtering and sorting helpers

**What is NOT included:**
- Full marketplace indexing (needs off-chain solution)
- Offer search (client-side filtering only)

**Instructions to Implement:**
1. `fetchOffer(offerId)` - Get single offer
2. `fetchOffersByOwner(owner)` - Get user's offers
3. `fetchActiveOffers()` - Get all active offers (limited)
4. `createOffer(params)` - Create new offer
5. `updateOffer(offerId, params)` - Update offer
6. `pauseOffer(offerId)` - Pause offer
7. `resumeOffer(offerId)` - Resume offer
8. `deleteOffer(offerId)` - Delete offer
9. `getNextOfferId()` - Get next offer ID from counter

**Acceptance Criteria:**
- [ ] `OfferClient` class extends `BaseProgram`
- [ ] All instruction methods implemented
- [ ] `fetchOffersByOwner()` uses getProgramAccounts with filters
- [ ] Offer state helpers: `isActive()`, `canTrade()`
- [ ] Fiat currency conversion: `offer.fiatCurrencyDisplay`
- [ ] Rate formatting: `formatRate(offer)` shows exchange rate
- [ ] Integration tests for CRUD operations

**Definition of Done:**
- All offer operations complete
- Efficient fetching with filters
- State validation helpers

---

### Task 9: Implement Trade Program Client

**Background & Reasoning:**
The Trade program handles the core P2P exchange flow and is the most complex program. The SDK needs to support the entire trade lifecycle: creation, acceptance, escrow funding, fiat confirmation, and release. It also needs dispute initiation and expiration checking.

**Scope:**
- Create `programs/trade.ts` with `TradeClient` class
- Implement complete trade lifecycle methods
- Implement trade fetching (by ID, by user, by state)
- Add trade state machine helpers
- Implement dispute initiation

**What is NOT included:**
- Escrow direct operations (internal CPI)
- Dispute resolution (arbitrator client)
- Fee calculation (handled by program)

**Instructions to Implement:**
1. `fetchTrade(tradeId)` - Get single trade
2. `fetchTradesByUser(user)` - Get user's trades (as buyer or seller)
3. `fetchTradesByOffer(offerId)` - Get trades for an offer
4. `createTrade(params)` - Create trade request
5. `acceptTrade(tradeId, params)` - Accept trade
6. `fundEscrow(tradeId)` - Fund escrow with tokens
7. `confirmFiatDeposit(tradeId)` - Confirm fiat payment
8. `releaseEscrow(tradeId)` - Release escrow to recipient
9. `cancelTrade(tradeId)` - Cancel before escrow funded
10. `refundTrade(tradeId)` - Request refund after escrow
11. `initiateDispute(tradeId)` - Start dispute process
12. `checkExpiration(tradeId)` - Check and update expired trades

**Technical Considerations:**
- `fundEscrow` requires token account setup and approval
- State transitions must be validated before sending
- Trade has complex account requirements (profiles, escrow, etc.)

**Acceptance Criteria:**
- [ ] `TradeClient` class extends `BaseProgram`
- [ ] All 12 instruction methods implemented
- [ ] Trade state helpers: `canAccept()`, `canFund()`, `canRelease()`, etc.
- [ ] `getTradeParties(trade)` returns buyer/seller with roles
- [ ] `getExpiration(trade)` returns human-readable expiration
- [ ] Proper account resolution for complex instructions
- [ ] Integration tests for happy path flow

**Definition of Done:**
- Complete trade lifecycle supported
- State validation prevents invalid operations
- Error messages are clear

---

### Task 10: Implement Arbitrator Program Client

**Background & Reasoning:**
The Arbitrator program handles dispute resolution. The SDK needs to support evidence submission and dispute resolution for arbitrators, plus read access for viewing dispute status. Admin operations for managing arbitrators are also needed.

**Scope:**
- Create `programs/arbitrator.ts` with `ArbitratorClient` class
- Implement dispute fetching
- Implement evidence submission
- Implement dispute resolution
- Implement admin arbitrator management

**What is NOT included:**
- Arbitrator assignment (CPI from Trade)
- Automatic arbitrator selection algorithms

**Instructions to Implement:**
1. `fetchDispute(tradeId)` - Get dispute details
2. `fetchArbitrator(pubkey, fiatCurrency)` - Get arbitrator info
3. `fetchArbitratorsByFiat(fiatCurrency)` - Get arbitrators for currency
4. `submitEvidence(tradeId, params)` - Submit evidence
5. `resolveDispute(tradeId, params)` - Resolve dispute (arbitrator only)
6. `registerArbitrator(pubkey, fiatCurrency)` - Register arbitrator (admin)
7. `removeArbitrator(pubkey, fiatCurrency)` - Remove arbitrator (admin)

**Acceptance Criteria:**
- [ ] `ArbitratorClient` class extends `BaseProgram`
- [ ] All instruction methods implemented
- [ ] Dispute state helpers: `hasSubmittedEvidence(party)`, `isResolved()`
- [ ] `canSubmitEvidence(dispute, user)` validation
- [ ] `canResolve(dispute, user)` validation
- [ ] Evidence length validation (max 500 chars)

**Definition of Done:**
- Dispute lifecycle complete
- Proper role validation
- Evidence handling works

---

### Task 11: Implement Price Oracle Client

**Background & Reasoning:**
The Price Oracle provides fiat currency exchange rates. The SDK needs to support price fetching for display and provider management for admin operations. Price providers need to be able to submit updates.

**Scope:**
- Create `programs/price-oracle.ts` with `PriceOracleClient` class
- Implement price fetching
- Implement provider management
- Implement price updates for providers

**What is NOT included:**
- Automatic price aggregation
- External price feed integration

**Instructions to Implement:**
1. `fetchPrice(fiatCurrency)` - Get current price
2. `fetchAllPrices()` - Get all available prices
3. `fetchProvider(pubkey)` - Get provider info
4. `fetchRegistry()` - Get registry info
5. `updatePrice(fiatCurrency, params)` - Update price (provider)
6. `initializeRegistry(params)` - Initialize registry (admin)
7. `registerProvider(pubkey)` - Register provider (admin)
8. `removeProvider(pubkey)` - Remove provider (admin)
9. `initializePrice(fiatCurrency, params)` - Initialize price feed (admin)

**Acceptance Criteria:**
- [ ] `PriceOracleClient` class extends `BaseProgram`
- [ ] All instruction methods implemented
- [ ] Price staleness checking: `isStale(price)` based on max_price_staleness
- [ ] Price formatting: `formatPrice(price)` with decimals
- [ ] Provider validation helpers

**Definition of Done:**
- Price operations complete
- Staleness checking works
- Provider management functional

---

### Task 12: Implement Main LocalMoneyClient Orchestrator

**Background & Reasoning:**
The `LocalMoneyClient` is the main entry point for the SDK. It orchestrates all program clients, manages connection state, and provides a unified interface. This is what frontend developers will primarily interact with.

**Scope:**
- Create `client.ts` with `LocalMoneyClient` class
- Compose all program clients
- Implement connection management
- Implement wallet adapter integration
- Add convenience methods for common operations

**What is NOT included:**
- High-level transaction builders (separate task)
- Event subscription system

**Client Interface:**
```typescript
class LocalMoneyClient {
  constructor(config: NetworkConfig, wallet?: WalletAdapter);

  // Program clients
  readonly hub: HubClient;
  readonly profile: ProfileClient;
  readonly offer: OfferClient;
  readonly trade: TradeClient;
  readonly arbitrator: ArbitratorClient;
  readonly priceOracle: PriceOracleClient;

  // Connection management
  connect(wallet: WalletAdapter): void;
  disconnect(): void;

  // Convenience methods
  async getMyProfile(): Promise<UserProfile | null>;
  async getMyOffers(): Promise<Offer[]>;
  async getMyTrades(): Promise<Trade[]>;
}
```

**Acceptance Criteria:**
- [ ] `LocalMoneyClient` composes all program clients
- [ ] Constructor accepts network config and optional wallet
- [ ] `connect()` and `disconnect()` manage wallet state
- [ ] All sub-clients accessible via properties
- [ ] Convenience methods work correctly
- [ ] State is consistent across all sub-clients
- [ ] TypeScript types properly exposed

**Definition of Done:**
- Unified client functional
- Wallet integration works
- Clean API surface

---

### Task 13: Implement High-Level Transaction Builders

**Background & Reasoning:**
Common workflows like "create offer and wait for trades" or "complete full trade flow" involve multiple instructions and account setups. High-level builders abstract this complexity and provide single-method calls for entire workflows.

**Scope:**
- Create `builders/trade-flow.ts` for trade lifecycle
- Create `builders/offer-management.ts` for offer operations
- Create `builders/dispute-flow.ts` for disputes
- Implement multi-instruction transaction batching
- Add progress callbacks for multi-step operations

**What is NOT included:**
- UI components
- Real-time updates (event subscription)

**Trade Flow Builder Methods:**
1. `prepareAndExecuteTrade(params)` - Create trade, fund escrow in one flow
2. `completeTradeAsSeller(tradeId)` - Full seller flow
3. `completeTradeAsBuyer(tradeId)` - Full buyer flow

**Acceptance Criteria:**
- [ ] `TradeFlowBuilder` class with high-level methods
- [ ] `OfferManagementBuilder` for offer batch operations
- [ ] `DisputeFlowBuilder` for dispute handling
- [ ] Transaction batching where possible
- [ ] Progress callbacks for multi-step operations
- [ ] Error recovery suggestions

**Definition of Done:**
- Builders simplify common workflows
- Transactions optimized
- Callbacks provide progress updates

---

### Task 14: Implement Utility Functions and Formatting

**Background & Reasoning:**
The SDK needs utility functions for data conversion, display formatting, and input validation. These utilities ensure consistent handling of fiat currencies, amounts, and protocol-specific data formats.

**Scope:**
- Create `utils/conversion.ts` for data conversions
- Create `utils/formatting.ts` for display formatting
- Create `utils/validation.ts` for input validation
- Port utilities from test utils

**What is NOT included:**
- UI formatting (locale-specific)
- Complex calculations

**Utility Functions:**
```typescript
// Conversion
fiatToBytes(fiat: string): number[]
bytesToFiat(bytes: number[]): string
lamportsToSol(lamports: BN): number
solToLamports(sol: number): BN

// Formatting
formatFiatAmount(cents: BN, currency: string): string
formatTokenAmount(amount: BN, decimals: number): string
formatExchangeRate(rate: BN): string
formatTimestamp(timestamp: BN): Date

// Validation
isValidFiatCurrency(currency: string): boolean
isValidAmount(amount: BN, min: BN, max: BN): boolean
isValidContactInfo(contact: string): boolean
```

**Acceptance Criteria:**
- [ ] All conversion functions implemented
- [ ] All formatting functions implemented
- [ ] All validation functions implemented
- [ ] Unit tests for all utilities
- [ ] JSDoc documentation
- [ ] No external dependencies (except BN)

**Definition of Done:**
- All utilities functional
- 100% test coverage on utilities
- Clear documentation

---

### Task 15: Implement Custom Error Types and Parsing

**Background & Reasoning:**
Anchor errors are encoded as numbers. The SDK needs to parse these into human-readable messages and provide custom error types for better error handling in the frontend. Good error messages significantly improve developer experience.

**Scope:**
- Create `errors/index.ts` with custom error classes
- Create `errors/parser.ts` for Anchor error parsing
- Map all program error codes to messages
- Implement error categorization

**What is NOT included:**
- UI error display components
- Error recovery automation

**Error Structure:**
```typescript
class LocalMoneyError extends Error {
  code: string;
  program: string;
  instruction?: string;
}

class InsufficientFundsError extends LocalMoneyError {}
class InvalidStateError extends LocalMoneyError {}
class UnauthorizedError extends LocalMoneyError {}
class AccountNotFoundError extends LocalMoneyError {}
```

**Acceptance Criteria:**
- [ ] Base `LocalMoneyError` class defined
- [ ] Specific error subclasses for common errors
- [ ] Error parser maps Anchor error codes to custom errors
- [ ] All program error codes documented
- [ ] `parseTransactionError(error)` utility
- [ ] Errors include helpful suggestions

**Definition of Done:**
- All errors properly typed
- Anchor errors mapped
- Error messages are actionable

---

### Task 16: Write Unit Tests

**Background & Reasoning:**
Unit tests ensure individual components work correctly in isolation. They should cover PDA derivation, utility functions, error parsing, and client methods with mocked dependencies.

**Scope:**
- Write unit tests for PDA derivation
- Write unit tests for utilities
- Write unit tests for error parsing
- Mock Anchor Program for client tests

**What is NOT included:**
- Integration tests (separate task)
- E2E tests against live network

**Test Coverage Requirements:**
- PDA derivation: 100%
- Utilities: 100%
- Error parsing: 100%
- Client methods: 80%+

**Acceptance Criteria:**
- [ ] Tests for all 12 PDA functions
- [ ] Tests for all conversion utilities
- [ ] Tests for all formatting utilities
- [ ] Tests for all validation utilities
- [ ] Tests for error parsing
- [ ] Tests for client instantiation
- [ ] Mocks properly isolate components
- [ ] `npm test` passes with coverage report

**Definition of Done:**
- All unit tests passing
- Coverage meets requirements
- Tests are maintainable

---

### Task 17: Write Integration Tests

**Background & Reasoning:**
Integration tests verify the SDK works correctly against actual Solana programs. These tests should use localnet/devnet to test real transactions and account fetching.

**Scope:**
- Set up test environment with localnet
- Write integration tests for each program client
- Write integration tests for transaction builders
- Test error scenarios

**What is NOT included:**
- Performance testing
- Stress testing

**Integration Test Scenarios:**
1. Hub: Fetch config
2. Profile: Create and update profile
3. Offer: Full CRUD lifecycle
4. Trade: Happy path trade flow
5. Arbitrator: Dispute resolution
6. Price Oracle: Price fetching

**Acceptance Criteria:**
- [ ] Integration test setup with localnet
- [ ] Tests for all program clients
- [ ] Tests verify actual on-chain state
- [ ] Error scenarios tested
- [ ] `npm run test:integration` passes

**Definition of Done:**
- Integration tests passing on localnet
- Key scenarios covered
- CI-friendly setup

---

### Task 18: Write Documentation and Examples

**Background & Reasoning:**
Good documentation is essential for SDK adoption. The README should provide quick start guides, API documentation should cover all methods, and examples should demonstrate common use cases.

**Scope:**
- Write comprehensive README
- Add JSDoc to all public methods
- Create example scripts for common workflows
- Document error handling patterns

**What is NOT included:**
- Video tutorials
- Full website documentation

**Documentation Structure:**
```
README.md
├── Installation
├── Quick Start
├── Configuration
├── Core Concepts
│   ├── Program Clients
│   ├── PDA Derivation
│   └── Transaction Building
├── API Reference
├── Error Handling
└── Examples
    ├── Create Profile
    ├── Post Offer
    ├── Complete Trade
    └── Handle Dispute
```

**Acceptance Criteria:**
- [ ] README covers all major features
- [ ] JSDoc on all public methods
- [ ] At least 5 example scripts
- [ ] Error handling guide
- [ ] TypeScript examples with proper types
- [ ] Configuration guide for different networks

**Definition of Done:**
- Documentation is comprehensive
- Examples are runnable
- JSDoc generates clean output

---

## Validation Gates

```bash
# Build
npm run build  # Must succeed with no errors

# Type Check
npm run typecheck  # Must pass with no errors

# Lint
npm run lint  # Must pass with no warnings

# Unit Tests
npm test  # Must pass with >80% coverage

# Integration Tests (requires localnet)
npm run test:integration  # Must pass

# Documentation Generation
npm run docs  # Must generate without errors
```

## Dependencies

```json
{
  "dependencies": {
    "@coral-xyz/anchor": "^0.31.0",
    "@solana/web3.js": "^1.95.0",
    "@solana/spl-token": "^0.4.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsup": "^8.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  },
  "peerDependencies": {
    "@coral-xyz/anchor": ">=0.29.0",
    "@solana/web3.js": ">=1.90.0"
  }
}
```

## Task Dependencies

```
Task 1 (Scaffolding)
    └── Task 2 (Types)
        └── Task 3 (PDAs)
            └── Task 4 (Constants)
                └── Task 5 (Base Client)
                    ├── Task 6 (Hub)
                    ├── Task 7 (Profile)
                    ├── Task 8 (Offer)
                    ├── Task 9 (Trade)
                    ├── Task 10 (Arbitrator)
                    └── Task 11 (Price Oracle)
                        └── Task 12 (Main Client)
                            └── Task 13 (Builders)
                                └── Task 14 (Utils)
                                    └── Task 15 (Errors)
                                        └── Task 16 (Unit Tests)
                                            └── Task 17 (Integration Tests)
                                                └── Task 18 (Documentation)
```

## Quality Checklist

- [x] All necessary context included (documentation URLs, gotchas, patterns)
- [x] Validation gates are executable by AI
- [x] References existing patterns with specific file locations
- [x] Clear implementation path with architectural explanation
- [x] Error handling strategy documented
- [x] Each task formatted as detailed PM-style ticket with:
  - [x] Background & reasoning section
  - [x] Clear scope with boundaries
  - [x] Technical considerations
  - [x] Specific, measurable acceptance criteria
  - [x] Definition of done
  - [x] NO code or pseudo-code in task descriptions
- [x] Tasks ordered by dependencies
- [x] All affected files/modules identified

## Confidence Score: 9/10

**Scoring Breakdown:**
- **Context completeness (10/10)**: Comprehensive program documentation, PDA seeds, instruction lists, reference code from tests
- **Task clarity (9/10)**: Clear responsibilities and boundaries for each task
- **Acceptance criteria (9/10)**: Specific, measurable, and testable
- **Scope definition (9/10)**: Clear what's in/out for each task
- **One-pass viability (8/10)**: Well-structured for sequential implementation, may need minor adjustments during development

**Risk Factors:**
- Anchor IDL format may have quirks requiring adjustment
- Token account setup complexity for escrow funding
- Browser vs Node.js compatibility edge cases

---

**Generated:** 2024-11-24
**PRP Location:** `/Volumes/Pylon/workspace/localmoney/contracts/solana/PRPs/typescript-sdk-implementation.md`
