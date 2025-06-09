# LocalMoney Protocol Specification

## Overview

LocalMoney is a decentralized peer-to-peer (P2P) trading protocol that enables users to trade cryptocurrencies for fiat currencies through an escrow-based system. The protocol consists of five interconnected smart contracts that manage offers, trades, user profiles, price feeds, and central configuration.

## Architecture

The LocalMoney protocol follows a hub-and-spoke architecture with the following contracts:

1. **Hub Contract** - Central configuration and contract registry
2. **Offer Contract** - Manages buy/sell offers
3. **Trade Contract** - Handles trade execution and escrow
4. **Profile Contract** - User profile and reputation management
5. **Price Contract** - Price oracle and conversion rates

## Core Components

### 1. Hub Contract

The Hub contract serves as the central registry and configuration manager for the entire protocol.

#### Key Features:
- **Admin Management**: Single admin address with protocol governance rights
- **Contract Registry**: Maintains addresses of all protocol contracts
- **Fee Configuration**: Manages protocol fees and limits
- **Global Parameters**: Sets trading limits, timers, and other protocol parameters

#### Configuration Parameters:
- `offer_addr`: Address of the Offer contract
- `trade_addr`: Address of the Trade contract
- `profile_addr`: Address of the Profile contract
- `price_addr`: Address of the Price contract
- `price_provider_addr`: Address authorized to update prices
- `local_market_addr`: Local market contract address
- `local_denom`: Native denomination for the protocol
- `chain_fee_collector_addr`: Address receiving chain fees
- `warchest_addr`: Address receiving warchest fees
- `active_offers_limit`: Maximum active offers per user (default: configurable)
- `active_trades_limit`: Maximum active trades per user (default: configurable)
- `arbitration_fee_pct`: Percentage fee for arbitration
- `burn_fee_pct`: Percentage of tokens to burn
- `chain_fee_pct`: Percentage fee for chain operations
- `warchest_fee_pct`: Percentage fee for protocol treasury
- `trade_expiration_timer`: Trade expiration time in seconds (max: 172800 = 2 days)
- `trade_dispute_timer`: Dispute window in seconds (max: 86400 = 1 day)
- `trade_limit_min`: Minimum trade amount in USD
- `trade_limit_max`: Maximum trade amount in USD

#### Constraints:
- Total platform fees (chain + burn + warchest) cannot exceed 10%
- Trade expiration timer cannot exceed 2 days
- Trade dispute timer cannot exceed 1 day

### 2. Offer Contract

The Offer contract manages buy and sell offers posted by users.

#### Offer Types:
- **Buy Offers**: User wants to buy crypto with fiat
- **Sell Offers**: User wants to sell crypto for fiat

#### Offer States:
- **Active**: Offer is available for trading
- **Paused**: Offer is temporarily disabled
- **Archive**: Offer is permanently disabled

#### Offer Structure:
```rust
pub struct Offer {
    pub id: u64,                    // Unique offer ID
    pub owner: Addr,                // Offer creator
    pub offer_type: OfferType,      // Buy or Sell
    pub fiat_currency: FiatCurrency, // Target fiat currency
    pub rate: Uint128,              // Exchange rate (percentage)
    pub min_amount: Uint128,        // Minimum trade amount
    pub max_amount: Uint128,        // Maximum trade amount
    pub description: Option<String>, // Optional description (max 140 chars)
    pub denom: Denom,               // Cryptocurrency denomination
    pub state: OfferState,          // Current offer state
    pub timestamp: u64,             // Creation timestamp
}
```

#### Key Features:
- **Rate-based Pricing**: Offers specify a rate percentage applied to market prices
- **Amount Limits**: Each offer defines min/max trade amounts
- **Multi-currency Support**: Supports 20+ popular  fiat currencies
- **Flexible Denominations**: Supports native and CW20 tokens
- **Description Support**: Optional 140-character descriptions

### 3. Trade Contract

The Trade contract handles the core trading logic, escrow management, and dispute resolution.

#### Trade States:
1. **RequestCreated**: Initial trade request
2. **RequestCanceled**: Trade request canceled
3. **RequestExpired**: Trade request expired
4. **RequestAccepted**: Maker accepted the trade
5. **EscrowFunded**: Crypto funds locked in escrow
6. **EscrowCanceled**: Escrow canceled before funding
7. **EscrowRefunded**: Funds returned to seller
8. **FiatDeposited**: Buyer confirmed fiat payment
9. **EscrowReleased**: Crypto released to buyer
10. **EscrowDisputed**: Trade under dispute
11. **SettledForMaker**: Dispute resolved in favor of maker
12. **SettledForTaker**: Dispute resolved in favor of taker

#### Trade Structure:
```rust
pub struct Trade {
    pub id: u64,                    // Unique trade ID
    pub addr: Addr,                 // Trade contract address
    pub buyer: Addr,                // Crypto buyer
    pub buyer_contact: Option<String>, // Buyer contact info
    pub seller: Addr,               // Crypto seller
    pub seller_contact: Option<String>, // Seller contact info
    pub arbitrator: Addr,           // Assigned arbitrator
    pub offer_contract: Addr,       // Source offer contract
    pub offer_id: u64,              // Source offer ID
    pub created_at: u64,            // Creation timestamp
    pub expires_at: u64,            // Expiration timestamp
    pub enables_dispute_at: Option<u64>, // When disputes can be raised
    pub denom: Denom,               // Trading denomination
    pub amount: Uint128,            // Trade amount
    pub fiat: FiatCurrency,         // Fiat currency
    pub denom_fiat_price: Uint256,  // Locked exchange rate
    pub state_history: Vec<TradeStateItem>, // State change history
    pub state: TradeState,          // Current state
}
```

#### Trade Flow:
1. **Trade Creation**: Taker creates trade from an offer
2. **Trade Acceptance**: Maker accepts the trade request
3. **Escrow Funding**: Seller deposits crypto to escrow
4. **Fiat Payment**: Buyer sends fiat payment off-chain
5. **Payment Confirmation**: Buyer confirms fiat payment
6. **Escrow Release**: Crypto released to buyer

#### Dispute Resolution:
- **Arbitrator Assignment**: Random arbitrator selected for each trade
- **Dispute Window**: Disputes can be raised after a configurable delay
- **Arbitrator Decision**: Arbitrators can settle disputes in favor of either party
- **Encrypted Communication**: All contact information is encrypted

#### Fee Structure:
- **Chain Fee**: Percentage fee for blockchain operations
- **Burn Fee**: Percentage of tokens burned
- **Warchest Fee**: Percentage fee for protocol treasury
- **Total Fee Cap**: Maximum 10% total fees

### 4. Profile Contract

The Profile contract manages user profiles, reputation, and activity tracking.

#### Profile Structure:
```rust
pub struct Profile {
    pub addr: Addr,                     // User address
    pub created_at: u64,                // Profile creation time
    pub requested_trades_count: u64,    // Total trade requests
    pub active_trades_count: u8,        // Current active trades
    pub released_trades_count: u64,     // Successfully completed trades
    pub last_trade: u64,                // Last trade timestamp
    pub contact: Option<String>,        // Contact information
    pub encryption_key: Option<String>, // Public encryption key
    pub active_offers_count: u8,        // Current active offers
}
```

#### Key Features:
- **Reputation Tracking**: Tracks successful trade completions
- **Activity Limits**: Enforces limits on active trades and offers
- **Contact Management**: Stores encrypted contact information
- **Trade History**: Maintains comprehensive trading history

### 5. Price Contract

The Price contract provides price feeds and currency conversion functionality.

#### Key Features:
- **Multi-currency Support**: Supports 20+ popular  fiat currencies
- **Price Routes**: Configurable price conversion routes
- **Oracle Integration**: Integrates with external price oracles
- **USD Base Pricing**: All prices normalized to USD

#### Price Structure:
```rust
pub struct CurrencyPrice {
    pub currency: FiatCurrency,    // Fiat currency
    pub usd_price: Uint128,        // Price in USD
    pub updated_at: u64,           // Last update timestamp
}
```

## Supported Fiat Currencies

The protocol supports 20+ popular  fiat currencies including:
- Major currencies: USD, EUR, GBP, JPY, CNY, CAD, AUD
- Regional currencies: AED, ARS, BRL, INR, KRW, MXN, RUB, ZAR
- And many more (see complete list in currencies.rs)

## Security Features

### 1. Access Control
- **Admin-only Functions**: Critical configuration changes require admin approval
- **Contract Authorization**: Inter-contract calls are properly authorized
- **Ownership Verification**: All user actions verify proper ownership

### 2. Economic Security
- **Fee Caps**: Maximum 10% total protocol fees
- **Trade Limits**: Configurable min/max trade amounts
- **Activity Limits**: Prevents spam through active trade/offer limits

### 3. Dispute Resolution
- **Random Arbitrator Selection**: Prevents arbitrator manipulation
- **Encrypted Communication**: Protects user privacy
- **Time-locked Disputes**: Prevents premature dispute raising

### 4. State Management
- **Comprehensive State Tracking**: All state changes are logged
- **Expiration Handling**: Automatic trade expiration
- **Refund Protection**: Secure refund mechanisms

## Protocol Limits and Constants

- **Maximum Platform Fee**: 10%
- **Maximum Trade Expiration**: 2 days (172,800 seconds)
- **Maximum Dispute Timer**: 1 day (86,400 seconds)
- **Offer Description Limit**: 140 characters
- **Pagination Limits**: 1-30 items per page

## Integration Points

### 1. External Price Oracles
- Price feeds for cryptocurrency valuations
- Fiat currency exchange rates
- Configurable price routes for different tokens

### 2. Off-chain Components
- Fiat payment systems
- Communication channels for traders
- Dispute resolution interfaces

### 3. Frontend Applications
- Trading interfaces
- Profile management
- Offer creation and management
- Trade monitoring and execution

## Governance and Upgrades

- **Admin-controlled**: Single admin address manages protocol parameters
- **Contract Migration**: Support for contract upgrades through migration
- **Parameter Updates**: Dynamic configuration updates without redeployment
- **Fee Adjustment**: Flexible fee structure adjustments

## Conclusion

The LocalMoney protocol provides a comprehensive framework for decentralized P2P cryptocurrency trading with robust security, dispute resolution, and user management features. The modular architecture allows for flexible deployment and future enhancements while maintaining security and user experience standards. 