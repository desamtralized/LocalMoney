# PRP: Integrate @localmoney/sdk into Frontend Application

## Summary

Integrate the newly created `@localmoney/sdk` TypeScript SDK into the Vue.js frontend application at `/app/`. This involves creating a `SolanaChain` implementation of the existing `Chain` interface, adding Solana wallet support, and wiring up all components following the established multi-chain architecture patterns.

## Background

The LocalMoney frontend application supports multiple blockchains through an abstracted `Chain` interface with implementations for Cosmos (CosmWasm) and EVM (BSC). The recently developed `@localmoney/sdk` package provides a comprehensive TypeScript SDK for interacting with the 7 Solana programs (Hub, Profile, Offer, Trade, Escrow, Arbitrator, Price Oracle).

The app already has `@solana/web3.js` and `@solana/wallet-adapter-phantom` in dependencies but they are not actively used. The goal is to integrate Solana as a first-class chain option following the existing architecture patterns.

## Architecture Overview

### Existing Pattern Reference

The app uses a **Chain interface abstraction** (`/app/src/network/Chain.ts`) with:
- `CosmosChain` - Cosmos/CosmWasm implementation (~940 lines)
- `EVMChain` - BSC/EVM implementation (~1728 lines)
- `chainFactory()` - Factory function to instantiate chain implementations

Each chain has:
- Config file (e.g., `/app/src/network/evm/config/bsc.ts`)
- Hub info with program/contract addresses
- Wallet connection via `WalletService`

### SDK Integration Approach

Create `SolanaChain` class that:
1. Wraps `LocalMoneyClient` from `@localmoney/sdk`
2. Implements the `Chain` interface
3. Adapts SDK methods to Chain interface method signatures
4. Handles wallet connection via Phantom Solana adapter

## Key Files Reference

### Files to Modify
| File | Purpose |
|------|---------|
| `/app/package.json` | Add workspace dependency on SDK |
| `/app/src/network/Chain.ts` | Add Solana to ChainClient enum and chainFactory |
| `/app/src/services/wallet.ts` | Extend WalletService for Solana wallet detection |
| `/app/src/types/components.interface.ts` | Add Solana-specific types if needed |

### Files to Create
| File | Purpose |
|------|---------|
| `/app/src/network/solana/SolanaChain.ts` | Main chain implementation (~800-1000 lines) |
| `/app/src/network/solana/config/index.ts` | Solana network configs (devnet, mainnet) |
| `/app/src/network/solana/config/devnet.ts` | Devnet configuration |
| `/app/src/network/solana/config/mainnet.ts` | Mainnet configuration |
| `/app/src/network/solana/types.ts` | Solana-specific type definitions |
| `/app/src/network/solana/wallet.ts` | Phantom Solana wallet adapter wrapper |

### Existing Pattern Files (Reference Only)
| File | Pattern to Follow |
|------|-------------------|
| `/app/src/network/evm/EVMChain.ts` | Chain implementation pattern |
| `/app/src/network/evm/config/bsc.ts` | Config structure pattern |
| `/app/src/network/cosmos/CosmosChain.ts` | Alternative implementation reference |
| `/app/src/stores/client.ts` | Store integration patterns |

## SDK Documentation Reference

- **SDK Location**: `/packages/sdk/`
- **Main Export**: `LocalMoneyClient` from `@localmoney/sdk`
- **Config Exports**: `DEVNET_CONFIG`, `MAINNET_CONFIG`, `NetworkConfig`
- **Program Clients**: `hub`, `profile`, `offer`, `trade`, `arbitrator`, `priceOracle`

### SDK WalletAdapter Interface
```typescript
// From packages/sdk/src/programs/base.ts
export interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}
```

## External Documentation

### Solana Wallet Adapter
- Official Docs: https://github.com/anza-xyz/wallet-adapter
- Phantom Adapter: `@solana/wallet-adapter-phantom` (already in deps)
- Base Package: `@solana/wallet-adapter-base`

### Key Integration Notes
1. Phantom wallet exposes `window.phantom.solana` for Solana mode (vs `window.phantom.ethereum` for EVM)
2. The SDK's `WalletAdapter` interface is compatible with standard Solana wallet adapters
3. Auto-connect and wallet state persistence should follow existing patterns

## Validation Gates

```bash
# Ensure SDK builds first
npm run build --workspace=packages/sdk

# Type check frontend
npm run typecheck --workspace=app

# Run frontend tests
npm run test --workspace=app

# Start dev server and verify Solana chain selection works
npm run dev --workspace=app
```

---

## Task List

### Task 1: Add SDK as Workspace Dependency

**Background & Reasoning**:
The `@localmoney/sdk` package needs to be added as a dependency to the frontend app. Using workspace linking ensures the app always uses the latest local SDK build during development.

**Scope**:
- Included: Update `/app/package.json` to reference SDK as workspace dependency
- Included: Verify TypeScript can resolve SDK types
- Not included: Publishing SDK to npm
- Affected files: `/app/package.json`, `/app/tsconfig.json` (if path mapping needed)

**Technical Considerations**:
- Use `"@localmoney/sdk": "workspace:*"` for pnpm/yarn workspace support OR `"@localmoney/sdk": "file:../packages/sdk"` for npm
- SDK exports ESM and CJS bundles - Vite will use ESM
- Type definitions are bundled in SDK's dist folder

**Acceptance Criteria**:
- [ ] SDK is listed as dependency in `/app/package.json`
- [ ] `npm install` in app directory resolves SDK correctly
- [ ] TypeScript recognizes `import { LocalMoneyClient } from "@localmoney/sdk"` without errors
- [ ] Vite dev server starts without SDK resolution errors
- [ ] SDK types are available for autocompletion in IDE

**Definition of Done**:
- Package.json updated and committed
- App builds successfully with SDK dependency
- No type errors related to SDK imports

---

### Task 2: Create Solana Network Configuration

**Background & Reasoning**:
Following the pattern established by BSC (`/app/src/network/evm/config/bsc.ts`), create configuration files for Solana devnet and mainnet. These configs define RPC endpoints, chain metadata, and initial hub configuration.

**Scope**:
- Included: Create `/app/src/network/solana/config/` directory structure
- Included: Devnet and mainnet configuration files
- Included: Type definitions for Solana config interfaces
- Not included: Localnet configuration (developers can use devnet)
- Affected files: New files in `/app/src/network/solana/config/`

**Technical Considerations**:
- Config must include program IDs from SDK's DEVNET_CONFIG/MAINNET_CONFIG
- RPC endpoints should support both direct use and environment variable override
- Hub config structure should map to existing `HubConfig` interface where possible
- Include SPL token addresses for supported tokens (USDC, etc.)

**Acceptance Criteria**:
- [ ] `SolanaConfig` interface defined with all required fields
- [ ] `SolanaHubInfo` interface defined matching existing HubInfo patterns
- [ ] Devnet config exports `SOLANA_DEVNET_CONFIG` and `SOLANA_DEVNET_HUB_INFO`
- [ ] Mainnet config exports `SOLANA_MAINNET_CONFIG` and `SOLANA_MAINNET_HUB_INFO`
- [ ] Environment variable support for RPC endpoints (`VITE_SOLANA_RPC_DEVNET`, etc.)
- [ ] Type exports available from `/app/src/network/solana/config/index.ts`

**Definition of Done**:
- Config files created following BSC pattern
- Types are accurate and complete
- Configs compile without TypeScript errors

---

### Task 3: Implement Phantom Solana Wallet Adapter

**Background & Reasoning**:
Create a wallet adapter wrapper that bridges Phantom's Solana wallet interface with the SDK's `WalletAdapter` interface. The app already has `@solana/wallet-adapter-phantom` in dependencies but needs integration code.

**Scope**:
- Included: Create `/app/src/network/solana/wallet.ts`
- Included: Implement connection, disconnection, and transaction signing
- Included: Handle wallet state changes and events
- Not included: Support for other Solana wallets (future enhancement)
- Affected files: New file, modifications to `/app/src/services/wallet.ts`

**Technical Considerations**:
- Phantom's Solana interface is at `window.phantom?.solana` (different from EVM mode)
- The adapter must implement SDK's `WalletAdapter` interface:
  - `publicKey: PublicKey | null`
  - `signTransaction(tx)`
  - `signAllTransactions(txs)`
- Handle account change events and emit appropriate updates
- Consider auto-connect behavior consistent with other chains

**Acceptance Criteria**:
- [ ] `PhantomSolanaAdapter` class implements SDK's `WalletAdapter` interface
- [ ] `connect()` method prompts Phantom wallet connection
- [ ] `disconnect()` method cleanly disconnects and resets state
- [ ] `signTransaction()` correctly signs and returns transaction
- [ ] `signAllTransactions()` batch signs multiple transactions
- [ ] Account change events are handled and propagated
- [ ] Detection of Phantom Solana availability works correctly
- [ ] Integration with `WalletService` for detection

**Definition of Done**:
- Wallet adapter created and tested
- WalletService extended with `PHANTOM_SOLANA` provider type
- Connection flow works end-to-end in browser

---

### Task 4: Extend WalletService for Solana Support

**Background & Reasoning**:
The existing `WalletService` class (`/app/src/services/wallet.ts`) detects available wallets and determines chain compatibility. It needs to be extended to detect and support Phantom in Solana mode.

**Scope**:
- Included: Add `PHANTOM_SOLANA` to `WalletProvider` enum
- Included: Add `SOLANA` to `ChainType` enum
- Included: Update detection logic for Phantom Solana mode
- Included: Update compatibility checking
- Not included: Support for other Solana wallets
- Affected files: `/app/src/services/wallet.ts`

**Technical Considerations**:
- Phantom exposes both `window.phantom.solana` (Solana) and `window.phantom.ethereum` (EVM)
- Must differentiate between Phantom EVM and Phantom Solana providers
- Existing `WalletProvider.PHANTOM` is for EVM mode - need separate identifier for Solana
- Chain type determination logic must handle new Solana type

**Acceptance Criteria**:
- [ ] `WalletProvider.PHANTOM_SOLANA` enum value added
- [ ] `ChainType.SOLANA` enum value added
- [ ] `detectAvailableWallets()` detects Phantom Solana when available
- [ ] `getChainTypeForWallet(PHANTOM_SOLANA)` returns `ChainType.SOLANA`
- [ ] `isWalletCompatibleWithChain()` correctly validates Solana chain compatibility
- [ ] `getWalletDisplayName(PHANTOM_SOLANA)` returns appropriate display name
- [ ] Wallet icon provided for Solana wallet type

**Definition of Done**:
- WalletService updated with Solana support
- Type safety maintained throughout
- All existing functionality preserved

---

### Task 5: Implement SolanaChain Class - Core Structure

**Background & Reasoning**:
Create the core `SolanaChain` class that implements the `Chain` interface. This task focuses on the class structure, initialization, wallet connection, and basic methods. Trade operations will be implemented in subsequent tasks.

**Scope**:
- Included: Create `/app/src/network/solana/SolanaChain.ts`
- Included: Implement constructor, init(), getName(), getChainType()
- Included: Implement connectWallet(), disconnectWallet(), getWalletAddress()
- Included: Implement getHubConfig()
- Not included: Trade-specific operations (Task 6-8)
- Affected files: New file creation

**Technical Considerations**:
- Wrap `LocalMoneyClient` from SDK as internal implementation
- On `init()`, create SDK client and fetch hub configuration
- Convert SDK's `NetworkConfig` to app's `HubConfig` format
- Handle wallet adapter lifecycle correctly
- Error handling should use existing `ChainError` classes

**Acceptance Criteria**:
- [ ] `SolanaChain` class implements `Chain` interface
- [ ] Constructor accepts `SolanaConfig` and `SolanaHubInfo`
- [ ] `init()` initializes SDK client and fetches hub config from chain
- [ ] `getName()` returns human-readable chain name
- [ ] `getChainType()` returns `'solana'`
- [ ] `connectWallet()` connects via Phantom adapter and updates SDK client
- [ ] `disconnectWallet()` cleanly disconnects wallet
- [ ] `getWalletAddress()` returns connected wallet's base58 address
- [ ] `getHubConfig()` returns hub configuration in app's format
- [ ] Proper error handling with ChainError classes

**Definition of Done**:
- Core SolanaChain class structure complete
- Initialization and wallet flow working
- TypeScript compiles without errors

---

### Task 6: Implement SolanaChain - Profile and Offer Operations

**Background & Reasoning**:
Implement the profile and offer-related methods of the Chain interface. These methods map to SDK's `ProfileClient` and `OfferClient` functionality.

**Scope**:
- Included: fetchProfile(), fetchMakerProfile()
- Included: fetchTokenBalance()
- Included: fetchOffer(), fetchAllOffers(), fetchOffers(), fetchMakerOffers(), fetchMyOffers()
- Included: fetchOffersCountByStates(), fetchAllFiatsOffersCount()
- Included: createOffer(), updateOffer()
- Not included: Trade operations (Task 7)
- Affected files: `/app/src/network/solana/SolanaChain.ts`

**Technical Considerations**:
- SDK uses `BN` for amounts, app uses string amounts - conversion needed
- SDK's `OfferAccount` must be converted to app's `GetOffer` format
- Offer types and states need mapping between SDK enums and app enums
- Fiat currency handling: SDK uses 3-byte arrays, app uses string codes
- Implement pagination using SDK's query methods

**Acceptance Criteria**:
- [ ] `fetchProfile()` returns user profile in app's `Profile` format
- [ ] `fetchTokenBalance()` returns balance in app's `Coin` format
- [ ] `fetchOffer()` fetches single offer by ID
- [ ] `fetchAllOffers()` fetches paginated offers
- [ ] `fetchOffers()` filters by `FetchOffersArgs` (fiat, type, denom, order)
- [ ] `fetchMakerOffers()` returns offers for specific maker
- [ ] `fetchMyOffers()` returns connected wallet's offers
- [ ] `fetchOffersCountByStates()` returns count for given states
- [ ] `fetchAllFiatsOffersCount()` returns counts grouped by fiat currency
- [ ] `createOffer()` creates new offer and returns offer ID
- [ ] `updateOffer()` updates existing offer
- [ ] All data transformations between SDK and app types are correct

**Definition of Done**:
- All profile and offer methods implemented
- Data transformations tested and working
- Method signatures match Chain interface exactly

---

### Task 7: Implement SolanaChain - Trade Operations

**Background & Reasoning**:
Implement trade lifecycle methods including creation, acceptance, escrow funding, fiat confirmation, and release. These are the core P2P trading operations.

**Scope**:
- Included: openTrade(), fetchTrades(), fetchTradeDetail(), fetchDisputedTrades()
- Included: fetchTradesCountByStates(), fetchAllFiatsTradesCount()
- Included: acceptTradeRequest(), cancelTradeRequest()
- Included: fundEscrow(), setFiatDeposited()
- Included: releaseEscrow(), refundEscrow()
- Not included: Dispute operations (Task 8)
- Affected files: `/app/src/network/solana/SolanaChain.ts`

**Technical Considerations**:
- Trade state mapping: SDK's `TradeState` enum to app's `TradeState` enum
- State history must be reconstructed from on-chain data
- Escrow operations require SPL token accounts and mint addresses
- Token addresses must be resolved from offer or passed explicitly
- Handle expiration timestamps correctly (Solana uses Unix timestamps)

**Acceptance Criteria**:
- [ ] `openTrade()` creates trade against offer and returns trade ID
- [ ] `fetchTrades()` returns paginated trades for connected wallet
- [ ] `fetchTradeDetail()` returns full `TradeInfo` for single trade
- [ ] `fetchDisputedTrades()` returns open and closed disputes separately
- [ ] `fetchTradesCountByStates()` returns trade count for given states
- [ ] `fetchAllFiatsTradesCount()` returns counts grouped by fiat currency
- [ ] `acceptTradeRequest()` accepts trade as seller
- [ ] `cancelTradeRequest()` cancels trade
- [ ] `fundEscrow()` funds escrow with seller's tokens
- [ ] `setFiatDeposited()` marks fiat as deposited by buyer
- [ ] `releaseEscrow()` releases tokens to buyer
- [ ] `refundEscrow()` refunds tokens to depositor
- [ ] Trade state history correctly populated

**Definition of Done**:
- All trade operations implemented
- Trade lifecycle flow works end-to-end
- State management correct throughout lifecycle

---

### Task 8: Implement SolanaChain - Arbitration and Price Oracle

**Background & Reasoning**:
Implement dispute resolution and price oracle operations. These are supporting features for the main trading flow.

**Scope**:
- Included: openDispute(), settleDispute()
- Included: fetchArbitrators(), newArbitrator()
- Included: updateFiatPrice(), batchUpdateFiatPrices()
- Included: fetchFiatToUsdRate(), formatFiatPrice()
- Not included: Admin-only arbitrator management
- Affected files: `/app/src/network/solana/SolanaChain.ts`

**Technical Considerations**:
- Arbitrator data includes encrypted contact info
- Price oracle uses 8-decimal precision in SDK
- Batch price fetching should be efficient
- formatFiatPrice must match SDK's oracle decimal handling

**Acceptance Criteria**:
- [ ] `openDispute()` initiates dispute for trade
- [ ] `settleDispute()` resolves dispute (winner: 'buyer' | 'seller')
- [ ] `fetchArbitrators()` returns list of registered arbitrators
- [ ] `newArbitrator()` registers new arbitrator (if permitted)
- [ ] `updateFiatPrice()` fetches and returns price for fiat/denom pair
- [ ] `batchUpdateFiatPrices()` batch fetches prices efficiently
- [ ] `fetchFiatToUsdRate()` returns fiat to USD exchange rate
- [ ] `formatFiatPrice()` correctly formats raw price to display value

**Definition of Done**:
- All arbitration and oracle methods implemented
- Price formatting matches other chain implementations
- Dispute flow integrates with trade state

---

### Task 9: Integrate SolanaChain into Chain Factory

**Background & Reasoning**:
Add Solana chains to the `ChainClient` enum and `chainFactory()` function so the app can instantiate and switch to Solana chains.

**Scope**:
- Included: Add `solanaDevnet` and `solanaMainnet` to `ChainClient` enum
- Included: Import Solana configs and SolanaChain class
- Included: Add cases to `chainFactory()` switch statement
- Not included: UI components for chain selection (existing components work)
- Affected files: `/app/src/network/Chain.ts`

**Technical Considerations**:
- Follow exact pattern of existing chain client entries
- Import order should match existing style
- Ensure types are correctly exported

**Acceptance Criteria**:
- [ ] `ChainClient.solanaDevnet` and `ChainClient.solanaMainnet` enum values added
- [ ] Solana config imports added at top of file
- [ ] `SolanaChain` import added
- [ ] `chainFactory()` returns `SolanaChain` instance for Solana clients
- [ ] No changes to existing chain functionality
- [ ] TypeScript compiles without errors

**Definition of Done**:
- Chain.ts updated with Solana support
- Factory function returns correct chain instances
- All types properly aligned

---

### Task 10: Add Solana Chain to ChainSelector Component

**Background & Reasoning**:
Update the chain selector UI component to include Solana network options. The existing component (`/app/src/ui/components/commons/ChainSelector.vue`) likely iterates over available chains.

**Scope**:
- Included: Ensure Solana chains appear in chain selector dropdown
- Included: Add Solana icon/logo if required
- Included: Verify chain switching works correctly
- Not included: UI redesign - use existing patterns
- Affected files: `/app/src/ui/components/commons/ChainSelector.vue` (if modifications needed)

**Technical Considerations**:
- Chain selector may dynamically read from ChainClient enum
- May need to add Solana logo SVG to assets
- Beta/feature flags may control chain visibility
- Consider devnet vs mainnet visibility in production

**Acceptance Criteria**:
- [ ] Solana Devnet appears in chain selector (at minimum for testing)
- [ ] Solana Mainnet appears in chain selector (when ready)
- [ ] Selecting Solana chain triggers `setClient()` with correct ChainClient
- [ ] Chain icon displays correctly
- [ ] Chain name displays correctly
- [ ] Switching to Solana chain initializes SolanaChain correctly

**Definition of Done**:
- Solana chains visible and selectable in UI
- Chain switching works correctly
- Visual consistency maintained

---

### Task 11: Integration Testing and Bug Fixes

**Background & Reasoning**:
Perform end-to-end integration testing of the Solana chain integration. Verify all features work correctly in the browser with actual wallet connections to devnet.

**Scope**:
- Included: Test wallet connection flow
- Included: Test profile creation/fetching
- Included: Test offer creation, viewing, updating
- Included: Test trade creation and lifecycle
- Included: Test price oracle integration
- Included: Fix any bugs discovered
- Not included: Automated E2E test suite (future enhancement)
- Affected files: Various, based on bugs found

**Technical Considerations**:
- Test with Phantom wallet on Solana devnet
- May need devnet SOL and test tokens
- Compare behavior with existing chains for consistency
- Verify error messages are user-friendly

**Acceptance Criteria**:
- [ ] Wallet connects successfully with Phantom
- [ ] Profile displays after creation
- [ ] Offers display correctly from chain
- [ ] Offer creation works and appears in "My Offers"
- [ ] Trade creation flow works
- [ ] Trade acceptance and escrow funding work
- [ ] Price display works for supported fiat currencies
- [ ] Chain switching between Solana and other chains works
- [ ] No console errors during normal operation
- [ ] Error handling shows appropriate user messages

**Definition of Done**:
- All core flows manually tested and working
- Critical bugs fixed
- Integration ready for broader testing

---

## Dependencies Graph

```
Task 1 (SDK Dependency)
   ↓
Task 2 (Config) ←──────┐
   ↓                    │
Task 3 (Wallet Adapter) │
   ↓                    │
Task 4 (WalletService)  │
   ↓                    │
Task 5 (Core Structure)─┘
   ↓
Task 6 (Profile/Offer) ←─── Task 5
   ↓
Task 7 (Trade) ←──────────── Task 6
   ↓
Task 8 (Arbitration/Oracle) ← Task 7
   ↓
Task 9 (Chain Factory) ←──── Task 8
   ↓
Task 10 (UI Integration) ←── Task 9
   ↓
Task 11 (Testing) ←───────── Task 10
```

## Risk Factors

1. **Wallet Compatibility**: Phantom Solana API may differ from documentation
2. **Token Account Management**: SPL token accounts require explicit creation
3. **Transaction Signing**: Solana transactions have different signing requirements than Cosmos/EVM
4. **State Sync**: Solana confirmation times may affect UX
5. **SDK Bugs**: SDK was just created - may encounter edge cases

## Estimated Complexity

- **Total Tasks**: 11
- **Core Implementation**: Tasks 1-9 (critical path)
- **Polish**: Tasks 10-11 (integration and testing)
- **Largest Task**: Task 5-7 (SolanaChain implementation ~800 lines total)

---

## PRP Quality Score: 8.5/10

**Scoring Breakdown**:
- **Context completeness (9/10)**: All necessary file references, patterns, and SDK documentation included
- **Task clarity (8/10)**: Tasks are well-defined with clear acceptance criteria; some implementation details left to developer judgment as appropriate
- **Acceptance criteria (9/10)**: Specific, measurable criteria for each task
- **Scope definition (8/10)**: Clear boundaries with explicit included/excluded items
- **One-pass viability (8/10)**: High probability of success given comprehensive context; some debugging expected for wallet integration

**Confidence Notes**:
- High confidence on structural tasks (1-5, 9-10) - well-defined patterns exist
- Medium-high confidence on implementation tasks (6-8) - SDK provides clear methods but data transformation may need iteration
- Medium confidence on testing task (11) - depends on devnet availability and wallet behavior
