# LocalMoney Protocol Specification (CosmWasm)

This document describes the architecture, data models, and message flows of the LocalMoney protocol implemented in CosmWasm smart contracts. It provides a language-agnostic reference for re-implementing the same protocol in other smart contract environments.

---

## 1. High-Level Architecture

The LocalMoney protocol is composed of five core modules, each deployed as a separate CosmWasm smart contract:

1. **Hub** ‑ Central configuration, admin and registration orchestration.
2. **Offer** ‑ Create, update, and query trade offers.
3. **Profile** ‑ Manage user profiles, contacts, and counters.
4. **Price** ‑ Oracle for fiat and on-chain asset price feeds and conversion routes.
5. **Trade** ‑ P2P trade lifecycle, escrow, disputes, and settlements.

All contracts share common definitions (messages, errors, guards, data types) imported from the `localmoney_protocol` package. They communicate via CosmWasm `ExecuteMsg` calls and `SubMsg`s, enforcing ownership and business-logic guards.

---

## 2. Module Details

### 2.1 Hub Module

**InstantiateMsg**:
```
{ admin_addr: Addr }
```

**ExecuteMsg**:
- `UpdateConfig(HubConfig)`
- `UpdateAdmin { admin_addr: Addr }`

**QueryMsg**:
- `Config {}` → returns `HubConfig`
- `Admin {}`  → returns current admin `Addr`

**HubConfig** (all fields mandatory):
```rust
pub struct HubConfig {
    offer_addr: Addr,
    trade_addr: Addr,
    profile_addr: Addr,
    price_addr: Addr,
    price_provider_addr: Addr,
    local_market_addr: Addr,
    local_denom: Denom,
    chain_fee_collector_addr: Addr,
    warchest_addr: Addr,
    active_offers_limit: u8,
    active_trades_limit: u8,
    arbitration_fee_pct: Decimal,
    burn_fee_pct: Decimal,
    chain_fee_pct: Decimal,
    warchest_fee_pct: Decimal,
    trade_expiration_timer: u64, // seconds
    trade_dispute_timer: u64,    // seconds
    trade_limit_min: Uint128,    // in USD
    trade_limit_max: Uint128,
}
```

**Flows**:
1. **Instantiate**: Set `admin_addr` and store contract version.
2. **UpdateConfig** (only `admin_addr`):
   - Validate total fees ≤ 10%.
   - Validate timers within predefined bounds.
   - Persist `HubConfig` to storage.
   - Emit four `SubMsg` calls:
     - `OfferRegisterHub`, `PriceRegisterHub`, `ProfileRegisterHub`, `TradeRegisterHub`.
   - These calls instruct downstream contracts to record the hub address and switch from un-initialized to registered state.
3. **UpdateAdmin** (only current admin): Replace `admin_addr`.

---

### 2.2 Offer Module

**InstantiateMsg**:
```
{}    // no parameters
```

**ExecuteMsg**:
- `RegisterHub {}`
- `Create { offer: OfferMsg }`
- `UpdateOffer { offer_update: OfferUpdateMsg }`

**QueryMsg**:
- `State {}`           → returns total offers count.
- `Offer { id }`       → returns `OfferResponse`.
- `OffersBy { offer_type, fiat_currency, denom, order, limit, last }`
- `OffersByOwner { owner, limit, last }`

**OfferMsg** / **OfferUpdateMsg**:
- Fields: `id`, `owner_contact`, `owner_encryption_key`, `offer_type`, `fiat_currency`, `rate`, `denom`, `min_amount`, `max_amount`, `description`, `state`.

**OfferState**: `Active`  `Paused`  `Archive`

**Flows**:
1. **RegisterHub**: Persist hub address (via `register_hub_internal`). Only callable once.
2. **Create**:
   - Validate `min_amount ≤ max_amount` and description length.
   - Increment global `OFFERS_COUNT` to derive new `offer_id`.
   - Store new `Offer` in indexed map keyed by `offer_id`.
   - Emit two `SubMsg`s:
     - `update_profile_contact_msg` → Profile module updates contact & encryption key.
     - `update_profile_active_offers_msg` → Profile module increments active offers.
3. **UpdateOffer**:
   - Validate parameters and ownership.
   - Conditionally emit two `SubMsg`s (contact, state change).
   - Persist updated `Offer`.

---

### 2.3 Profile Module

**InstantiateMsg**:
```
{}    // no parameters
```

**ExecuteMsg**:
- `UpdateContact { profile_addr, contact, encryption_key }`
- `UpdateTradesCount { profile_addr, trade_state }`
- `UpdateActiveOffers { profile_addr, offer_state }`
- `RegisterHub {}`

**QueryMsg**:
- `Profile { address }` → returns `ProfileModel`
- `ProfilesBy ...` (pagination)

**ProfileModel** fields:
- `address: Addr`
- `contact: Option<String>`
- `encryption_key: Option<String>`
- `active_offers_count: u8`
- `active_trades_count: u8`
- `requested_trades_count: u64`
- `released_trades_count: u64`
- `last_trade: u64` (timestamp)

**Flows**:
1. **RegisterHub**: Store hub address (once).
2. **UpdateContact**:
   - Only owner or Offer/Trade hub can call.
   - Initialize `created_at` if missing.
   - Update `contact` & `encryption_key` in storage.
3. **UpdateActiveOffers** (only Offer contract): Increment/decrement `active_offers_count` within hub limit.
4. **UpdateTradesCount** (only Trade contract): Adjust counters per `TradeState`:
   - `RequestCreated` → +`requested_trades_count`, check `active_trades_limit`.
   - `RequestAccepted`/`EscrowFunded` → +`active_trades_count`.
   - `EscrowReleased` → +`released_trades_count` & –`active_trades_count`.
   - Final states (`Settled*`, `Refunded`) → –`active_trades_count`.
   - Update `last_trade` timestamp.

---

### 2.4 Price Module

**InstantiateMsg**:
```
{}    // no parameters
```

**ExecuteMsg**:
- `RegisterHub {}`
- `UpdatePrices(Vec<CurrencyPrice>)`
- `RegisterPriceRouteForDenom { denom: Denom, route: Vec<PriceRoute> }`

**QueryMsg**:
- `Price { fiat: FiatCurrency, denom: Denom }` → returns `DenomFiatPrice`

**Data Types**:
- `CurrencyPrice { currency: FiatCurrency, usd_price: Uint128, updated_at: u64 }`
- `PriceRoute { pool: Addr, ask_asset: Denom, offer_asset: Denom }`
- `DenomFiatPrice { denom, fiat, price: Uint256 }`

**Flows**:
1. **RegisterHub**: Persist hub address.
2. **UpdatePrices**:
   - Only `price_provider_addr` from hub config.
   - For each `CurrencyPrice`, update storage under `FIAT_PRICE` map.
3. **RegisterPriceRouteForDenom**:
   - Only hub admin.
   - Persist `route` under `DENOM_PRICE_ROUTE[denom]`.
4. **Query::Price**:
   - Load conversion route for Luna (hardcoded key).
   - Perform swap simulation via `WasmMsg::SmartQuery` to pool.
   - Combine on-chain `luna►fiat` rate with stored `usd►fiat` rates.

---

### 2.5 Trade Module

**InstantiateMsg**:
```
{}    // no parameters
```

**ExecuteMsg**:
A rich enum supporting:
- Registration: `RegisterHub {}`
- Trade Lifecycle:
  - `Create(NewTrade)`
  - `AcceptRequest { trade_id, maker_contact }`
  - `FundEscrow { trade_id, maker_contact: Option<String> }`
  - `FiatDeposited { trade_id }`
  - `ReleaseEscrow { trade_id }`
  - `DisputeEscrow { trade_id, buyer_contact, seller_contact }`
  - `SettleDispute { trade_id, winner }`
  - `CancelRequest { trade_id }`
  - `RefundEscrow { trade_id }`
- Arbitrator Management:
  - `NewArbitrator { arbitrator, fiat, encryption_key }`
  - `DeleteArbitrator { arbitrator, fiat }`
- Conversion Routes:
  - `RegisterConversionRouteForDenom { denom, route: Vec<ConversionRoute> }`

**QueryMsg**:
- `Trade { id }` → `TradeInfo`
- `Trades { user, role, limit, last }`
- `Arbitrator { arbitrator }`
- `Arbitrators {}`
- `ArbitratorsFiat { fiat }`

**Core Data Types**:
- `NewTrade { offer_id, amount: Uint128, taker, ... }`
- `Trade { id, buyer, seller, arbitrator, denom, amount, fiat, denom_fiat_price, state, state_history, ... }`
- `TradeState`: 
  `RequestCreated → RequestAccepted → EscrowFunded → FiatDeposited → EscrowReleased → SettledForMaker/Taker`, with branches for `CancelRequest`, `RefundEscrow`, `EscrowDisputed`, `SettleDispute`.
- `ConversionRoute`: Routes for denom swaps prior to mint/burn.
- `FeeInfo { burn_amount, chain_amount, warchest_amount }`

**Flows**:
1. **RegisterHub**: Persist hub address.
2. **Create Trade**:
   - Guard: address ≠ offer owner.
   - Lookup `Offer` via `hub_cfg.offer_addr` and `offer_id`.
   - Enforce `min_amount ≤ new_trade.amount ≤ max_amount`.
   - Calculate USD equivalent and enforce `trade_limit_min ≤ USD ≤ trade_limit_max`.
   - Freeze fiat rate (`denom_fiat_price`) via price oracle.
   - Instantiate `Trade` object with `RequestCreated` state.
   - Persist via `TradeModel::create`, update index.
   - Emit two `SubMsg`s:
     - `update_profile_contact_msg` for `taker`.
     - `update_trades_count_msg` for both parties with `RequestCreated`.
3. **AcceptRequest**:
   - Transition state `RequestCreated → RequestAccepted`.
   - Save `maker_contact`.
   - Emit profile and state update.
4. **FundEscrow**:
   - Accept native/cw20 coin into contract (`BankMsg` or `WasmMsg::Execute` for cw20).
   - Transition `RequestAccepted → EscrowFunded`.
   - Save optional `maker_contact`.
5. **FiatDeposited**:
   - Guard on `EscrowFunded`.
   - Transition `EscrowFunded → FiatDeposited`.
6. **ReleaseEscrow**:
   - Guard on `FiatDeposited`.
   - Compute `FeeInfo` from `HubConfig` and `amount`.
   - Deduct fees: send `chain_fee`, `burn_fee` (burn), `warchest_fee`, and remaining to `seller`.
   - Transition `FiatDeposited → EscrowReleased`.
   - Emit profile update and submessages for each fee distribution.
7. **CancelRequest** (only buyer before funding): 
   - Guard on `RequestCreated`.
   - Transition `RequestCreated → RequestCanceled`.
   - Emit profile update.
8. **RefundEscrow** (only seller/buyer after dispute window):
   - Guard on `EscrowFunded` + expiration timer.
   - Refund funds to `buyer`.
   - Transition `EscrowFunded → EscrowRefunded`.
   - Emit profile update.
9. **DisputeEscrow**:
   - Guard on `FiatDeposited` + within dispute timer.
   - Transition `FiatDeposited → EscrowDisputed`.
   - Store buyer/seller contacts.
   - Emit profile update.
10. **SettleDispute** (only by hub admin/arbitrator):
   - Guard on `EscrowDisputed`.
   - Distribute funds: winner receives amount minus fees, loser gets nothing.
   - Transition to `SettledForMaker` or `SettledForTaker`.
   - Emit profile update.
11. **NewArbitrator/DeleteArbitrator**:
   - Only hub admin.
   - Register or remove arbitrator addresses per fiat currency.
12. **RegisterConversionRouteForDenom**:
   - Only hub admin.
   - Persist `ConversionRoute` vector under `DENOM_CONVERSION_ROUTE[denom]`.

---

## 3. State Machines & Transitions

**TradeState**:

| State             | Allowed Next States               |
|-------------------|-----------------------------------|
| RequestCreated    | RequestAccepted, RequestCanceled  |
| RequestAccepted   | EscrowFunded                      |
| EscrowFunded      | FiatDeposited, EscrowRefunded     |
| FiatDeposited     | EscrowReleased, EscrowDisputed    |
| EscrowDisputed    | SettledForMaker, SettledForTaker  |
| EscrowReleased    | (terminal)                        |
| SettledForMaker   | (terminal)                        |
| SettledForTaker   | (terminal)                        |
| EscrowRefunded    | (terminal)                        |
| RequestCanceled   | (terminal)                        |

Use `assert_trade_state_change` guards to enforce these transitions.

---

## 4. Data Storage & Indexes

- **Offers**: `IndexedMap<u64, Offer, OfferIndexes>` with primary key `id`. Secondary indexes: by owner, by (type, fiat, denom).
- **Profiles**: `Map<Addr, ProfileModel>`
- **Prices**:
  - `FIAT_PRICE: Map<&str, CurrencyPrice>`
  - `DENOM_PRICE_ROUTE: Map<&str, Vec<PriceRoute>>`
- **Trades**:
  - `trades(): IndexedMap<u64, Trade, TradeIndexes>` with indexes by arbitrator.
  - `DENOM_CONVERSION_ROUTE: Map<&str, Vec<ConversionRoute>>`
  - `DENOM_CONVERSION_STEP: Item<ConversionStep>` for swap replies.
- **Arbitrators**: `IndexedMap<&str, Arbitrator, ArbitratorIndexes>` keyed by fiat string.

---

## 5. Fees & Conversion

- **FeeInfo**: computes three components from `HubConfig` percentages:
  - `burn_amount`, `chain_amount`, `warchest_amount`.
- **calc_denom_fiat_price**: lock in exchange rate at trade creation.
- **Swaps**: On releasing escrow, funds may be routed through a CW20 swap pool via `ConversionRoute`:
  - Each step: `(pool, ask_asset, offer_asset)`, invoked via `WasmMsg::Execute`.
  - `SWAP_REPLY_ID` correlates a callback to finalize fee deduction and settlement.

---

## 6. Guards & Error Handling

Common business-logic guards from `localmoney_protocol::guards`:
- `assert_ownership` – ensure caller is whitelisted contract or admin.
- `assert_multiple_ownership` – composite owner check.
- `assert_value_in_range`, `assert_min_g_max` – numeric validations.
- `assert_trade_state_change` – valid state transition.
- `assert_migration_parameters` – safe module migrations.

Errors are defined centrally (`ContractError`), enabling consistent error codes across modules.

---

## 7. Cross-module Integration

- **Registration**: Hub triggers `RegisterHub` in each module to record the hub address.
- **Profile Updates**: Offer & Trade emit `update_profile_*` submessages to Profile contract.
- **Fee & Price Oracles**: Trade & Offer modules rely on Price contract for `InstantiateMsg` & `QueryMsg`.
- **Trade Limits**: Hub config defines per-user and per-trade limits enforced in Offer & Trade.

---

## 8. Implementation Notes

- **Pagination & Indexes**: Query endpoints support `limit` and `last` parameters for cursor-style paging.
- **Timestamps**: All timeouts and expirations use `Env.block.time.seconds()`.
- **Custom Queries**: Price swap simulation uses `CustomQuery` to execute `WasmMsg::SmartQuery` on CW20 pool.
- **Migrations**: Each module stores version via `cw2` and verifies compatibility on `MigrateMsg`.

---

_End of specification._ 