# LocalMoney Protocol Translation: CosmWasm to Solana/Anchor

This document provides comprehensive instructions for translating the LocalMoney protocol from CosmWasm to Solana using the Anchor framework.

## Project Architecture Overview

The LocalMoney protocol is a peer-to-peer trading platform that allows users to exchange crypto assets for fiat currencies. The protocol is built on five core contracts:

1. **Hub**: Central coordination contract storing global configuration and connecting other contracts
2. **Offer**: Manages buy/sell listings for crypto-to-fiat trades
3. **Trade**: Handles escrow, trade lifecycle, and dispute resolution
4. **Price**: Oracle integration for currency pricing
5. **Profile**: User profile management and reputation data

## Technical Requirements

- **Solana Toolchain**: Latest version (currently 2.0.26+)
- **Anchor Framework**: Latest version (currently 0.30.1+)
- **TypeScript**: For client integration and integration tests
- **Wallet Adapters**: For frontend integration

#### Offer Program

- [ ] Design `Offer` PDA structure with proper indexing capabilities
- [ ] Create enumeration accounts for offer listing/filtering

#### Trade Program
- [ ] Design `Trade` PDA structure with state tracking
- [ ] Implement escrow account for fund management
- [ ] Design trade state history tracking mechanism

#### Price Program
- [x] Design `Price` PDA structure with proper indexing capabilities
- [x] Implement oracle price feeds and currency conversion
- [x] Create price routing accounts for multi-hop conversions

#### Profile Program
- [x] Design user profile accounts with proper PDA derivation
- [x] Implement reputation tracking mechanism

## Technical Challenges and Solutions

### Challenge 1: Storage Model Translation

**CosmWasm Approach**:
CosmWasm uses namespaced key-value storage via `cw-storage-plus` with:
```rust
pub const CONFIG: Item<HubConfig> = Item::new("config");
pub const ADMIN: Item<Admin> = Item::new("admin");
```

**Solana Solution**:
Use Anchor's account framework with proper PDA derivation:
```rust
#[account]
pub struct HubConfig {
    pub offer_addr: Pubkey,
    pub trade_addr: Pubkey,
    // ...other fields
}

// PDA derivation
let (config_address, _) = Pubkey::find_program_address(
    &[b"config"],
    program_id
);
```

### Challenge 2: ID-Based Lookup

**CosmWasm Approach**:
Uses maps with numeric keys:
```rust
let trade_id = trades_count + 1;
// Lookup: TradeModel::from_store(deps.storage, trade_id)
```

**Solana Solution**:
Use composite seeds for PDAs:
```rust
let (trade_address, _) = Pubkey::find_program_address(
    &[b"trade", trade_id.to_le_bytes().as_ref()],
    program_id
);
```

### Challenge 3: Contract Relationships

**CosmWasm Approach**:
Contracts register with Hub via `RegisterHub` messages

**Solana Solution**:
Use PDA authority delegation and CPI contexts:
```rust
// Authorize the Trade program to modify Hub state
let (auth_pda, bump) = Pubkey::find_program_address(
    &[b"authority", trade_program.key().as_ref()],
    hub_program.key()
);

// Include the authority in the CPI
let cpi_accounts = HubProgram::accounts::UpdateState {
    authority: auth_pda,
    // ...other accounts
};
```

### Challenge 4: State Transitions

**CosmWasm Approach**:
```rust
trade.set_state(TradeState::RequestAccepted, &env, &info);
```

**Solana Solution**:
Use Anchor's discriminator pattern with explicit state fields:
```rust
#[account]
pub struct Trade {
    pub state: TradeState,
    pub state_history: Vec<TradeStateItem>,
    // ...other fields
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TradeState {
    RequestCreated,
    RequestAccepted,
    // ...other states
}
```

## Security Considerations

1. **Account Validation**: Carefully check all accounts for proper ownership and proper constraint enforcement
2. **PDA Derivation**: Ensure unique and collision-resistant PDA derivation paths
3. **Access Control**: Implement proper signer and owner checks for all sensitive operations
4. **Re-entrancy Protection**: Consider transaction order and potential attack vectors
5. **Data Validation**: Validate all inputs and ensure they meet protocol requirements
6. **Program Size**: Stay within Solana program size limits

## Deployment Strategy - Deploy to LOCALNET

0. Run solana-test-validator in the background
1. Deploy the shared library first
2. Deploy the Hub program
3. Deploy individual service programs
4. Initialize the Hub with program addresses
5. Register all programs with the Hub

### Tasks

## Translation Tasks

### 1. Program Structure Setup 

- [x] Create Anchor workspace with individual programs for each contract
- [x] Set up shared libraries for common functionality (equivalent to `packages/protocol`)
- [x] Design PDA derivation paths for all account structures
- [x] Create error handling module with equivalent error codes
- [x] Configure program security through proper PDA seeds and constraints

### 2. Account Structures

#### Hub Program
- [x] Define `HubConfig` account structure
- [x] Create admin account structure for permission management
- [x] Implement contract version tracking

#### Hub Program
- [x] `initialize`: Create hub configuration
- [x] `update_config`: Update hub settings
- [x] `update_admin`: Admin transfer functionality

#### Offer Program
- [x] `register_hub`: Connection to hub program
- [x] `create_offer`: Create buy/sell listing
- [x] `update_offer`: Modify offer details
- [x] Implement offer filtering/pagination via RPCs

#### Trade Program
- [x] `register_hub`: Connection to hub program
- [x] `create_trade`: Initiate trade from offer
- [x] `accept_request`: Accept trade request
- [x] `fund_escrow`: Fund trade escrow with tokens
- [x] `fiat_deposited`: Mark fiat as sent
- [x] `release_escrow`: Complete trade and release funds
- [x] `refund_escrow`: Cancel trade and return funds
- [x] `dispute_escrow`: Initiate arbitration process
- [x] `settle_dispute`: Arbitrator dispute resolution
- [x] Cross-program communication

#### Price Program
- [x] `register_hub`: Connection to hub program
- [x] `register_price_route`: Configure pricing oracle paths
- [x] `update_prices`: Update currency price feeds
- [x] Cross-program communication

#### Profile Program
- [x] `register_hub`: Connection to hub program
- [x] `update_profile`: Update user profile information
- [x] `update_trades_count`: Modify reputation metrics
- [x] `update_active_offers`: Modify active offers count
- [x] Cross-program communication

### 4. Cross-Program Communication

- [x] Design CPI interfaces between programs
- [x] Implement proper privilege escalation via PDAs
- [x] Create authorized-only routes for sensitive operations
- [x] Develop instruction validation checks

### 5. Token Handling

- [x] Integrate SPL Token program for token operations
- [x] Implement escrow mechanism using token program
- [x] Create fee distribution mechanism for platform fees
- [x] Develop token transfer validation and security checks

### 6. Testing 

- [ ] Create integration tests for cross-program flows
- [ ] Implement security test cases for permission validation
- [ ] Design stress tests for account limits and program interactions

### 7. Libraries for Frontend Integration

- [ ] Develop TypeScript client for program interaction based on generated IDL and Type files from `anchor build` command.
- [ ] Create wallet connection and signing utilities (local wallets for tests, maker, taker and admin)
- [ ] Implement account deserialization helpers

## Project Setup
- [x] Create Solana workspace structure
- [x] Configure Anchor.toml
- [x] Set up program folders

## Shared Library Implementation
- [x] Create shared constants module
- [x] Create error handling module
- [x] Create Hub data structures
- [x] Create Offer data structures
- [x] Create Trade data structures
- [x] Create Price data structures
- [x] Create Profile data structures

## Program Implementations
- [x] Hub Program
  - [x] Basic account structures
  - [x] Initialize functionality
  - [x] Update config functionality
  - [x] Admin management
  - [x] Cross-program communication

- [x] Offer Program
  - [x] Basic account structures
  - [x] Offer creation
  - [x] Offer updates
  - [x] Offer state management
  - [x] Cross-program communication with Hub
  - [x] Update prices functionality
  - [x] Register price routes
  - [x] Cross-program communication

- [x] Trade Program
  - [x] Basic account structures
  - [x] Trade creation
  - [x] Trade lifecycle management
  - [x] Escrow handling
  - [x] Dispute resolution
  - [x] Cross-program communication

- [x] Price Program
  - [x] Basic account structures
  - [x] Initialize functionality
  - [x] Register with hub
  - [x] Update prices functionality
  - [x] Register price routes
  - [ ] Cross-program communication

- [x] Profile Program
  - [x] Basic account structures
  - [x] Initialize functionality
  - [x] Register with hub
  - [x] Update profile contact information
  - [x] Update trades count mechanism
  - [x] Update active offers mechanism
  - [x] Cross-program communication

## Testing and Documentation
- [x] Basic README
- [ ] Program-level documentation
- [ ] Integration tests

## Deployment
- [ ] Create deployment scripts
- [ ] Configure test environment 

## Cross-Program Invocation (CPI) Guide

This section details the necessary CPIs between the LocalMoney Solana programs and provides guidance on implementation. CPIs allow programs to call instructions in other programs, enabling composability and modularity.

### Required CPI Interactions

Based on the CosmWasm contract logic and the Solana program structure, the following CPIs are required:

1.  **Offer Program -> Profile Program:**
    *   `update_contact`: When creating/updating an offer, the Offer program needs to call the Profile program to update the owner's contact information.
    *   `update_active_offers`: When an offer's state changes (created, paused, archived), the Offer program needs to call the Profile program to update the owner's active offers count.

2.  **Trade Program -> Profile Program:**
    *   `update_trades_count`: As a trade progresses through its lifecycle (created, accepted, funded, released, cancelled, refunded, settled), the Trade program needs to call the Profile program to update the relevant trade counts for both buyer and seller profiles.

3.  **Trade Program -> Price Program (Indirect):**
    *   While there's no direct CPI *from* the Trade program *to* the Price program during trade execution, the client initiating the `create_trade` instruction needs to first query the Price program (or a cached price source) to get the `DenomFiatPrice` for the relevant `denom` and `fiat_currency`. This price is then passed as an account (`denom_price`) to the `create_trade` instruction in the Trade program.

4.  **Trade Program -> Offer Program (Read-Only):**
    *   The `create_trade` instruction in the Trade program requires the `Offer` account as input. This allows the Trade program to read offer details (amounts, owner, denom, etc.) but doesn't involve a CPI call *to* the Offer program's instructions.

5.  **All Service Programs (Offer, Trade, Price, Profile) -> Hub Program (Initialization):**
    *   Each service program needs a `register_hub` instruction (or similar mechanism during initialization) to store the Hub program's address or relevant Hub configuration (like `HubConfig` PDA address). This allows service programs to access shared configuration (limits, timers, fees) stored in the Hub. *Currently, the Solana programs seem to store the hub authority or program ID, but might need refinement to directly reference and read the `HubConfig` account via CPI contexts if dynamic config reading is required.*

### Implementation Strategy

#### 1. Anchor CPI Contexts:
   - Define structs deriving `anchor_lang::Accounts` for each CPI call. These structs specify the accounts required by the *target* program's instruction.
   - Example (Trade calling Profile's `update_trades_count`):
     ```rust
     use crate::profile::cpi::accounts::UpdateTradesCount as ProfileUpdateTradesCount;
     use crate::profile::program::Profile as ProfileProgram; // Assuming you define the program type
     use crate::profile::{self, UpdateTradesCountParams};

     // In the Trade program's instruction handler...
     fn update_profile_trades_count_cpi(
         profile_program: &AccountInfo<'info>,
         profile_accounts: ProfileUpdateTradesCount<'info>, // Accounts needed by Profile::UpdateTradesCount
         signer_seeds: &[&[u8]],
         params: UpdateTradesCountParams
     ) -> Result<()> {
         let cpi_ctx = CpiContext::new_with_signer(
             profile_program.clone(), 
             profile_accounts, 
             &[&signer_seeds]
         );
         profile::cpi::update_trades_count(cpi_ctx, params)
     }

     // Account definition within the Trade program's instruction context
     #[derive(Accounts)]
     pub struct TradeInstructionContext<'info> {
         // ... other accounts ...
         pub profile_program: Program<'info, ProfileProgram>,
         #[account(mut)] // Profile account needs to be mutable
         pub buyer_profile: Account<'info, Profile>, // Or however the profile account is defined
         // ... accounts required by Profile::UpdateTradesCount ...
         pub hub_config_for_profile: UncheckedAccount<'info>, // Passed to Profile CPI
         pub profile_owner_for_profile: UncheckedAccount<'info>, // Passed to Profile CPI
     }
     
     // Calling the CPI
     let profile_cpi_accounts = ProfileUpdateTradesCount {
         authority: trade_program_pda.to_account_info(), // Or appropriate authority
         hub_config: ctx.accounts.hub_config_for_profile.to_account_info(),
         profile_owner: ctx.accounts.profile_owner_for_profile.to_account_info(), // e.g., buyer's key
         profile: ctx.accounts.buyer_profile.to_account_info(), 
     };

     update_profile_trades_count_cpi(
         ctx.accounts.profile_program.to_account_info(),
         profile_cpi_accounts,
         // Seeds for the Trade program's PDA authority if needed
         &[&[b"trade_authority_seed", ...]], 
         UpdateTradesCountParams { trade_state: TradeState::EscrowReleased }
     )?;
     ```

#### 2. Authority & Security:
   - **PDA Signers:** Use Program Derived Addresses (PDAs) owned by the *calling* program as signers for CPIs. This proves the call originates from a specific program.
     - Example: The Trade program needs a PDA that acts as the `authority` signer when calling `profile::cpi::update_trades_count`. The Profile program's `UpdateTradesCount` context must constrain this `authority` signer.
     ```rust
     // In Profile program's UpdateTradesCount context:
     #[derive(Accounts)]
     pub struct UpdateTradesCount<'info> {
         /// Must be the trade program's designated PDA signer
         #[account(
             // Add constraint to check if the signer is the expected PDA
             // e.g., constraint = authority.key() == TradeProgramPDA::find(...).0 @ CustomError::UnauthorizedTradeProgram
         )]
         pub authority: Signer<'info>, 
         // ... rest of accounts
     }
     ```
   - **Account Constraints:** The *target* program's instruction context (`#[derive(Accounts)]`) must rigorously validate all accounts passed via CPI, including checking ownership, mutability, seeds, and relationships between accounts. Do not trust that the calling program passed valid accounts.
   - **Minimize Privilege:** Only grant necessary permissions via CPI. For example, the Trade program should only be able to update *trade counts* in the Profile, not arbitrary profile data.

#### 3. Shared Data Structures:
   - Ensure both calling and target programs use the *exact same* data structures (defined in the `shared` crate) for accounts and instruction parameters involved in the CPI. Mismatched definitions will cause serialization errors.

#### 4. Hub Configuration Access:
   - For service programs needing Hub configuration (limits, timers):
     - **(CPI to Hub Getter):** Create a read-only instruction in the Hub program (e.g., `get_config`) that returns the configuration data. Service programs can CPI into this getter.

### CPI Implementation Tasks

- [x] **Trade -> Profile:** Implement `update_trades_count` CPI call within relevant Trade instructions (`create_trade`, `accept_request`, `fund_escrow`, `release_escrow`, `refund_escrow`, `settle_dispute`, `cancel_request`).
- [x] **Trade -> Offer (read-only):** When creating a trade, read Offer account via CPI. 
- [x] **Offer -> Profile:** Implement `update_contact` CPI call within `create_offer` and `update_offer`.
- [x] **Offer -> Profile:** Implement `update_active_offers` CPI call within `create_offer` and `update_offer_state`.
- [x] **Security:** Define and implement PDA signers for Trade and Offer programs to authorize CPI calls to Profile.
- [x] **Security:** Add constraints in Profile program instructions (`UpdateContact`, `UpdateTradesCount`, `UpdateActiveOffers`) to verify the `authority` signer is the correct PDA from the expected calling program (Trade or Offer).
- [x] **Hub Access:** Review `HubConfig` access in service programs. Ensure the `HubConfig` account is correctly passed and accessed where needed (e.g., in Profile program's trade/offer count checks).
- [ ] **Testing:** Create integration tests specifically covering all CPI scenarios, including success cases and failure cases (e.g., unauthorized caller, incorrect accounts). 

## Integration Testing Plan

### Architecture

*   **Framework:** Use Anchor's built-in TypeScript testing framework (`anchor test`).
*   **Environment:** Run tests against `solana-test-validator`.
*   **Setup:**
    *   Deploy all programs (Shared Lib -> Hub -> Offer -> Trade -> Price -> Profile) to the local validator before running tests.
    *   Initialize the Hub program and register all other programs with it.
    *   Create necessary mints for test tokens (e.g., USDC, SOL wrapper).
    *   Set up keypairs for different roles: Admin, Offer Maker, Offer Taker (Buyer/Seller), Arbitrator.
    *   Fund user accounts with SOL and test tokens.
*   **Structure:** Organize tests by program interaction flow (e.g., `offer-creation.test.ts`, `trade-lifecycle.test.ts`, `cpi-security.test.ts`).

### Micro-Tasks for Integration Tests

**1. Setup & Initialization:**
    *   `[x]` Write a helper script/function (`setupTests.ts`) to handle prerequisite deployments and initializations (programs, hub, mints, users, funding).
    *   `[x]` Integrate `setupTests.ts` into the `anchor test` flow (e.g., using `before` hooks).
    *   `[x]` Create utility functions for common actions (e.g., `createProfile`, `createOffer`, `fetchAccountData`).

**2. Hub Program Tests:**
    *   `[x]` Test `initialize` and verify `HubConfig` state.
    *   `[x]` Test `update_config` (positive case: admin).
    *   `[x]` Test `update_config` (negative case: non-admin).
    *   `[x]` Test `update_admin` (positive case: current admin).
    *   `[x]` Test `update_admin` (negative case: non-admin).
    *   `[ ]` Test registration calls from service programs (verify Hub stores program IDs/PDAs correctly). *(Implicitly tested via service program registration)*

**3. Profile Program Tests:**
    *   `[x]` Test `update_profile` (creating a new profile).
    *   `[x]` Test `update_profile` (updating existing profile contact info).
    *   `[x]` Test `update_profile` (negative case: wrong owner).
    *   `[x]` Test CPI: `update_trades_count` called by Trade program (verify counts increment/decrement correctly for different trade states).
    *   `[x]` Test CPI: `update_active_offers` called by Offer program (verify counts increment/decrement).
    *   `[x]` Test CPI Security: Attempt to call `update_trades_count` from an unauthorized program/signer -> Expect failure.
    *   `[x]` Test CPI Security: Attempt to call `update_active_offers` from an unauthorized program/signer -> Expect failure.

**4. Price Program Tests:**
    *   `[x]` Test `register_price_route` (admin only).
    *   `[x]` Test `register_price_route` (negative case: non-admin).
    *   `[x]` Test `update_prices` (authorized source only).
    *   `[x]` Test `update_prices` (negative case: unauthorized source).
    *   `[x]` Test fetching prices (RPC/client-side getter).

**5. Offer Program Tests:**
    *   `[x]` Test `create_offer` (successful creation).
        *   `[x]` Verify Offer account state.
        *   `[x]` Verify CPI call to `Profile::update_active_offers` occurred (+1). *(CPI test implemented)*
        *   `[ ]` Verify CPI call to `Profile::update_contact` occurred. *(Note: Test updated assuming Offer READS contact, doesn't CPI write)*
    *   `[x]` Test `update_offer` (successful update by owner).
        *   `[x]` Verify Offer account state change.
        *   `[ ]` Verify CPI call to `Profile::update_contact` occurred. *(Note: Test updated assuming Offer READS contact, doesn't CPI write)*
    *   `[x]` Test `update_offer` (negative case: non-owner).
        *   `[x]` Verify Offer account state unchanged.
        *   `[ ]` Verify CPI call to `Profile::update_contact` occurred. *(Note: Test updated assuming Offer READS contact, doesn't CPI write)*
    *   `[x]` Test offer state changes (e.g., pausing/archiving).
        *   `[x]` Verify `Profile::update_active_offers` CPI calls (-1/+1). *(CPI test implemented)*
    *   `[ ]` Test CPI Security: Attempt to call `Profile::update_active_offers` or `update_contact` via Offer's CPI mechanism but with incorrect PDA signer -> Expect failure. *(Note: Skipped as main security test is in profile.test.ts)*

**6. Trade Program Tests (Lifecycle):**
    *   `[x]` **Setup:** Create Offer, Maker/Taker Profiles, Price, Hub, SPL Mint, ATAs. Fund users.
    *   `[x]` Test `create_trade` (successful initiation by Taker).
        *   `[x]` Verify Trade account state (`RequestCreated`).
        *   `[x]` Verify Offer account is read correctly.
        *   `[x]` Verify Price account is read correctly.
        *   `[x]` Verify CPI call to `Profile::update_trades_count` for both parties. *(CPI test implemented)*
    *   `[x]` Test `accept_request` (successful acceptance by Maker).
        *   `[x]` Verify Trade account state (`RequestAccepted`).
        *   `[x]` Verify CPI call to `Profile::update_trades_count`. *(CPI test implemented - assumes no change)*
    *   `[x]` Test `fund_escrow` (successful funding by Taker).
        *   `[x]` Verify Trade account state (`EscrowFunded`).
        *   `[x]` Verify SPL token transfer to escrow PDA.
        *   `[x]` Verify CPI call to `Profile::update_trades_count`. *(CPI test implemented - assumes no change)*
    *   `[x]` Test `fiat_deposited` (successful confirmation by Taker).
        *   `[x]` Verify Trade account state (`FiatDeposited`).
        *   `[x]` *(No Profile CPI expected here)*
    *   `[x]` Test `release_escrow` (successful release by Maker).
        *   `[x]` Verify Trade account state (`EscrowReleased`).
        *   `[x]` Verify SPL token transfer from escrow PDA to taker.
        *   `[x]` Verify CPI call to `Profile::update_trades_count`. *(CPI test implemented - completed count)*

**7. Trade Program Tests (Dispute):**
    *   `[x]` Test `dispute_escrow` (after funding).
        *   `[x]` Verify Trade account state (`EscrowDisputed`).
        *   `[x]` Verify CPI call to `Profile::update_trades_count`. *(CPI test implemented - disputed count)*
    *   `[x]` Test `settle_dispute` (by arbitrator - settle for buyer).
        *   `[x]` Verify Trade account state (`EscrowSettled`).
        *   `[x]` Verify SPL token transfer from escrow PDA to buyer.
        *   `[x]` Verify CPI call to `Profile::update_trades_count`. *(CPI test implemented - completed/cancelled counts)*
    *   `[x]` Test `settle_dispute` (negative case: non-arbitrator).

**8. Cross-Program Interaction Tests (Specific Scenarios):**
    *   `[ ]` Test full lifecycle: Offer Create -> Trade Create -> Accept -> Fund -> Fiat -> Release. Verify all intermediate states and Profile counts.
    *   `[ ]` Test full lifecycle with cancellation: Offer -> Trade -> Cancel.
    *   `[ ]` Test full lifecycle with refund: Offer -> Trade -> Accept -> Fund -> Refund.
    *   `[ ]` Test full lifecycle with dispute: Offer -> Trade -> Accept -> Fund -> Dispute -> Settle.

**9. Security & Edge Case Tests:**
    *   `[ ]` Test incorrect signers for all sensitive instructions (e.g., non-owner trying to update offer, non-admin trying to update hub).
    *   `[ ]` Test incorrect account inputs (e.g., wrong profile passed to trade, wrong offer passed to trade).
    *   `[ ]` Test insufficient funds during `fund_escrow`.
    *   `[ ]` Test double-funding `fund_escrow`.
    *   `[ ]` Test releasing escrow before funding.
    *   `[ ]` Test boundary conditions for amounts, timers (if applicable).
    *   `[ ]` (Advanced) Stress Test: Create many offers/trades concurrently (might require local cluster setup beyond `solana-test-validator`).

### Final Tasks
`[ ]` Sync program IDs with anchor keys sync and update .env file on the tests folder so the tests can load program_ids from the env file.
`[ ]` Start a Local Solana Test Validator
`[ ]` Airdrop 10k SOL to each relevant account (admin, maker, taker, arbitrator)
`[ ]` Deploy programs to Localnet.
`[ ]` Run Integration Tests.
`[ ]` Create a List of bugs in the end of this file if you encounter any during compilation or while running tests.