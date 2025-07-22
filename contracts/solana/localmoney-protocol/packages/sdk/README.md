# LocalMoney Solana SDK

TypeScript SDK for interacting with the LocalMoney decentralized P2P trading protocol on Solana.

## 🎉 **NEW: Enhanced Wallet Integration (v0.1.0)**

The SDK now includes comprehensive wallet integration with support for:
- **Browser Wallets**: Phantom, Solflare, Coinbase Wallet
- **Wallet Management**: Connection/disconnection, auto-reconnect, state management  
- **Event System**: Connect, disconnect, account change, error events
- **Transaction Signing**: Enhanced error handling, user-friendly interfaces
- **Development Support**: Keypair wallets for testing
- **Multi-wallet Support**: Wallet detection and switching capabilities

## Features

- 🔐 **Complete Protocol Coverage**: SDKs for all 6 programs (Hub, Profile, Price, Offer, Trade, Arbitration)
- 🔗 **Enhanced Wallet Integration**: Support for browser wallets with comprehensive connection management
- 📊 **Type Safety**: Full TypeScript support with comprehensive type definitions
- 🛠️ **Developer Friendly**: Easy-to-use APIs with built-in validation and error handling
- 🔄 **Cross-Program Integration**: Seamless interactions between different protocol components
- 📈 **Real-time Data**: Live price feeds, trading status, and market data
- 🎯 **Production Ready**: Robust error handling, retry logic, and transaction confirmation

## Installation

```bash
npm install @localmoney/solana-sdk
# or
yarn add @localmoney/solana-sdk
```

## Quick Start

### Basic Setup

```typescript
import { 
  LocalMoneySDK, 
  createConnection, 
  createWallet, 
  quickStart,
  Keypair 
} from '@localmoney/solana-sdk';

// Option 1: Quick start for development (localhost)
const sdk = await quickStart({
  network: 'localhost',
  keypair: Keypair.generate() // or load your keypair
});

// Option 2: Manual setup
const connection = createConnection('http://localhost:8899');
const wallet = createWallet(yourKeypair);
const sdk = LocalMoneySDK.createLocal(wallet);

// Option 3: Custom program addresses
const sdk = new LocalMoneySDK(connection, wallet, {
  hub: new PublicKey('...'),
  profile: new PublicKey('...'),
  price: new PublicKey('...'),
  offer: new PublicKey('...'),
  trade: new PublicKey('...'),
  arbitration: new PublicKey('...')
});
```

### Protocol Initialization (Admin Only)

```typescript
import { BN } from 'bn.js';

// Initialize Hub configuration
await sdk.hub.initialize({
  offerProgram: new PublicKey('...'),
  tradeProgram: new PublicKey('...'),
  profileProgram: new PublicKey('...'),
  priceProgram: new PublicKey('...'),
  priceProvider: new PublicKey('...'),
  localMint: new PublicKey('...'),
  chainFeeCollector: new PublicKey('...'),
  warchest: new PublicKey('...'),
  activeOffersLimit: 5,
  activeTradesLimit: 3,
  arbitrationFeeBps: 200, // 2%
  burnFeeBps: 50,         // 0.5%
  chainFeeBps: 50,        // 0.5%
  warchestFeeBps: 100,    // 1%
  tradeExpirationTimer: new BN(2 * 24 * 60 * 60), // 2 days
  tradeDisputeTimer: new BN(24 * 60 * 60),        // 1 day
  tradeLimitMin: new BN(1000000),     // 0.001 SOL
  tradeLimitMax: new BN(100000000000) // 100 SOL
});

// Initialize Price oracle
await sdk.price.initializePriceConfig(
  hubProgramId,
  new BN(3600) // 1 hour max staleness
);
```

## Core Usage Examples

### 1. User Profile Management

```typescript
import { FiatCurrency } from '@localmoney/solana-sdk';

// Create user profile
const result = await sdk.profile.createProfile(
  userPublicKey,
  'encrypted-contact-info'
);

// Get profile information
const profile = await sdk.profile.getProfile(userPublicKey);
console.log('Total trades:', profile?.totalTrades.toString());

// Update contact information
await sdk.profile.updateContact(
  userPublicKey,
  'new-encrypted-contact-info'
);

// Get profile statistics
const stats = await sdk.profile.getProfileStats(userPublicKey);
console.log('Success rate:', stats?.successRate + '%');
console.log('Reputation level:', sdk.profile.getReputationLevel(stats?.reputationScore || 0));

// Validate profile for trading
const validation = await sdk.profile.validateProfileForTrading(userPublicKey);
if (!validation.eligible) {
  console.log('Issues:', validation.issues);
  console.log('Recommendations:', validation.recommendations);
}
```

### 2. Price Oracle Operations

```typescript
import { FiatCurrency, BN } from '@localmoney/solana-sdk';

// Update currency price (price provider only)
await sdk.price.updatePrice({
  currency: FiatCurrency.USD,
  priceUsd: new BN(100000000), // $1.00 in 1e8 precision
  confidence: 95
});

// Get current price
const usdPrice = await sdk.price.getPrice(FiatCurrency.USD);
console.log('USD price:', usdPrice?.priceUsd.toString());

// Get multiple prices
const prices = await sdk.price.getMultiplePrices([
  FiatCurrency.USD,
  FiatCurrency.EUR,
  FiatCurrency.GBP
]);

// Convert between currencies
const conversion = await sdk.price.convertCurrency(
  new BN(1000000000), // 1 SOL worth
  FiatCurrency.USD,
  FiatCurrency.EUR
);

// Check price freshness
const isFresh = await sdk.price.isPriceFresh(FiatCurrency.USD, 3600);
console.log('Price is fresh:', isFresh);

// Validate price lock
const lockValidation = await sdk.price.validatePriceLock(
  FiatCurrency.USD,
  lockedPrice,
  lockedTimestamp,
  10, // 10% max deviation
  1800 // 30 minutes max age
);
```

### 3. Hub Configuration Queries

```typescript
// Get global configuration
const config = await sdk.hub.getGlobalConfig();
console.log('Active offers limit:', config?.activeOffersLimit);

// Get fee configuration
const fees = await sdk.hub.getFeeConfiguration();
console.log('Total fees:', fees?.totalFeeBps + ' BPS');

// Calculate fees for an amount
const feeCalc = await sdk.hub.calculateFees(new BN(1000000000));
console.log('Chain fee:', feeCalc?.chainFee.toString());
console.log('Total fees:', feeCalc?.totalFees.toString());

// Validate trade amount
const amountValidation = await sdk.hub.validateTradeAmount(new BN(5000000));
if (!amountValidation.valid) {
  console.log('Invalid amount:', amountValidation.reason);
}

// Check activity limits
const limitsCheck = await sdk.hub.validateUserActivityLimits(
  userPublicKey,
  currentOffers,
  currentTrades
);
```

### 4. Utility Functions

```typescript
import { Utils, PDAGenerator } from '@localmoney/solana-sdk';

// Amount formatting
const formatted = Utils.formatAmount(new BN(1500000000), 9);
console.log('Formatted amount:', formatted); // "1.5"

const parsed = Utils.parseAmount("1.5", 9);
console.log('Parsed amount:', parsed.toString()); // "1500000000"

// Fee calculations
const fee = Utils.calculateFee(new BN(1000000000), 250); // 2.5%
console.log('Fee amount:', fee.toString());

// Time utilities
const isExpired = Utils.isExpired(expirationTimestamp);
const timeLeft = Utils.getTimeRemaining(expirationTimestamp);

// PDA generation
const pda = new PDAGenerator(programAddresses);
const [profilePDA, bump] = pda.getProfilePDA(userPublicKey);
const [offerPDA] = pda.getOfferPDA(new BN(1));
```

### 5. Error Handling

```typescript
import { ErrorHandler, ERROR_CODES } from '@localmoney/solana-sdk';

try {
  await sdk.profile.createProfile(userPublicKey);
} catch (error) {
  const message = ErrorHandler.parseAnchorError(error);
  console.log('Error message:', message);
  
  if (ErrorHandler.isLocalMoneyError(error, ERROR_CODES.PROFILE_VALIDATION_FAILED)) {
    console.log('Profile validation failed');
  }
  
  const errorCode = ErrorHandler.getErrorCode(error);
  console.log('Error code:', errorCode);
}
```

### 6. Protocol Status Monitoring

```typescript
// Check protocol status
const status = await sdk.getProtocolStatus();
console.log('Hub initialized:', status.hubInitialized);
console.log('Programs valid:', status.programsValid);
console.log('Current block height:', status.blockHeight);

// Validate all programs
const validation = await sdk.validatePrograms();
if (!validation.valid) {
  console.log('Program validation results:', validation.results);
}

// Get complete protocol configuration
const protocolConfig = await sdk.getProtocolConfig();
console.log('Global config:', protocolConfig?.globalConfig);
console.log('Price config:', protocolConfig?.priceConfig);
```

## Wallet Integration

### Enhanced Wallet Support

The SDK now includes comprehensive wallet integration for web applications:

```typescript
import { 
  LocalMoneySDK,
  LocalMoneyWallet,
  WalletType,
  WalletUtils,
  createLocalMoneyWallet
} from '@localmoney/solana-sdk';

// Check available wallets
const availableWallets = LocalMoneySDK.getAvailableWallets();
console.log('Available wallets:', availableWallets);

// Create enhanced wallet
const connection = createConnection('http://localhost:8899');
const wallet = createLocalMoneyWallet(connection, {
  autoConnect: false
});

// Connect to Phantom wallet
if (WalletUtils.isWalletInstalled(WalletType.PHANTOM)) {
  const connected = await wallet.connectWallet(WalletType.PHANTOM);
  if (connected) {
    console.log('Connected to Phantom!');
  }
}

// Set up event listeners
wallet.on('connect', (publicKey) => {
  console.log('Wallet connected:', WalletUtils.formatAddress(publicKey));
});

wallet.on('disconnect', () => {
  console.log('Wallet disconnected');
});

wallet.on('error', (error) => {
  console.error('Wallet error:', error.message);
});

// For development with keypair
const keypair = Keypair.generate();
await wallet.connectWithKeypair(keypair);
```

### Enhanced SDK Creation with Wallet

```typescript
// Create SDK with enhanced wallet support
const { sdk, wallet } = LocalMoneySDK.createWithEnhancedWallet(
  connection,
  programAddresses,
  { autoConnect: true }
);

// Or use for localhost development
const { sdk, wallet } = LocalMoneySDK.createLocalWithEnhancedWallet({
  autoConnect: false
});

// Enhanced transaction sending
const result = await sdk.sendTransaction(transaction, options);
if (result.success) {
  console.log('Transaction successful:', result.signature);
} else {
  console.error('Transaction failed:', result.error);
  if (result.cancelled) {
    console.log('Transaction was cancelled by user');
  }
}
```

### Wallet Management

```typescript
// Get wallet state
const state = wallet.getState();
console.log('Connection state:', state.connectionState);
console.log('Wallet type:', state.walletType);
console.log('Balance:', state.balance);

// Auto-reconnect functionality
const reconnected = await wallet.autoReconnect();
console.log('Auto-reconnect successful:', reconnected);

// Get balance
const balance = await wallet.getBalance();
console.log('Wallet balance:', balance, 'SOL');

// Disconnect wallet
await wallet.disconnect();
```

### Multi-wallet Support

```typescript
// Detect and switch between wallets
const wallets = LocalMoneySDK.getAvailableWallets();
const installedWallets = wallets.filter(w => w.installed);

for (const walletInfo of installedWallets) {
  console.log(`${walletInfo.name}: ${walletInfo.type}`);
  
  if (walletInfo.type === WalletType.PHANTOM) {
    await wallet.connectWallet(WalletType.PHANTOM);
    break;
  }
}

// Installation URLs for missing wallets
const phantom = wallets.find(w => w.type === WalletType.PHANTOM);
if (!phantom?.installed) {
  console.log('Install Phantom:', WalletUtils.getWalletInstallUrl(WalletType.PHANTOM));
}
```

## Advanced Usage

### Custom Transaction Building

```typescript
import { TransactionBuilder } from '@localmoney/solana-sdk';

// Estimate compute units
const computeUnits = TransactionBuilder.estimateComputeUnits(3); // 3 instructions

// Calculate priority fee
const priorityFee = TransactionBuilder.calculatePriorityFee('high');
```

### Retry Logic

```typescript
import { Utils } from '@localmoney/solana-sdk';

const result = await Utils.retryWithBackoff(
  async () => {
    return await sdk.hub.getGlobalConfig();
  },
  3, // max retries
  1000 // base delay ms
);
```

### Batch Operations

```typescript
// Batch price updates
const updates = [
  { currency: FiatCurrency.USD, priceUsd: new BN(100000000), confidence: 95 },
  { currency: FiatCurrency.EUR, priceUsd: new BN(110000000), confidence: 93 },
  { currency: FiatCurrency.GBP, priceUsd: new BN(125000000), confidence: 92 },
];

const results = await sdk.price.batchUpdatePrices(updates);
results.forEach((result, index) => {
  if (result.success) {
    console.log(`Updated ${updates[index].currency}: ${result.signature}`);
  } else {
    console.error(`Failed to update ${updates[index].currency}: ${result.error}`);
  }
});
```

## Development Setup

### Local Testing

```typescript
// Request airdrop for testing (devnet/localhost only)
import { requestAirdrop } from '@localmoney/solana-sdk';

await requestAirdrop(
  sdk.getConnection(),
  userPublicKey,
  2000000000 // 2 SOL
);
```

### Network Configurations

```typescript
import { NETWORK_CONFIGS, ENDPOINTS } from '@localmoney/solana-sdk';

// Use predefined network configs
const sdk = await quickStart({
  network: 'devnet',
  keypair: yourKeypair
});

// Or use custom endpoints
const connection = createConnection(ENDPOINTS.MAINNET);
```

## Error Reference

The SDK includes comprehensive error codes and messages:

- **General**: `UNAUTHORIZED`, `INVALID_AMOUNT`, `EXCESSIVE_FEES`
- **Profile**: `PROFILE_NOT_FOUND`, `CONTACT_INFO_REQUIRED`
- **Price**: `PRICE_STALE`, `PRICE_LOCK_EXPIRED`
- **Trading**: `OFFER_LIMIT_EXCEEDED`, `INVALID_TRADE_STATE`

## Protocol Constants

```typescript
import { PROTOCOL_CONSTANTS } from '@localmoney/solana-sdk';

console.log('Max platform fee:', PROTOCOL_CONSTANTS.MAX_PLATFORM_FEE_BPS);
console.log('Max trade expiration:', PROTOCOL_CONSTANTS.MAX_TRADE_EXPIRATION_SECONDS);
console.log('Price precision:', PROTOCOL_CONSTANTS.PRICE_PRECISION);
```

## Contributing

This SDK is part of the LocalMoney protocol migration from CosmWasm to Solana. For contribution guidelines and development setup, please refer to the main repository documentation.

## License

ISC License - see LICENSE file for details.