# LocalMoney SDK Documentation

Welcome to the comprehensive documentation for the LocalMoney Solana SDK.

## Table of Contents

- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Advanced Topics](#advanced-topics)
- [Migration Guide](#migration-guide)

## Getting Started

- **[Quick Start Guide](../README.md#quick-start)** - Get up and running with the SDK
- **[Installation](../README.md#installation)** - Installing the SDK in your project
- **[Basic Usage](../README.md#core-usage-examples)** - Core functionality examples

## API Reference

### Core SDK

- **[LocalMoneySDK](./API-CORE.md)** - Main SDK class and basic functionality
- **[Enhanced Error Handling](./API-ERROR-HANDLING.md)** - Comprehensive error handling system
- **[Wallet Integration](./API-WALLET.md)** - Browser wallet integration and management
- **[Transaction Building](./API-TRANSACTIONS.md)** - Transaction construction utilities

### Program SDKs

- **[Hub SDK](./API-HUB.md)** - Hub program interactions and configuration
- **[Profile SDK](./API-PROFILE.md)** - User profile management
- **[Price SDK](./API-PRICE.md)** - Price oracle operations
- **[Offer SDK](./API-OFFER.md)** - Offer creation and management
- **[Trade SDK](./API-TRADE.md)** - Trade execution and lifecycle
- **[Arbitration SDK](./API-ARBITRATION.md)** - Dispute resolution and arbitration

### Utilities

- **[PDA Generator](./API-UTILS.md#pda-generator)** - Program Derived Address utilities
- **[Utils](./API-UTILS.md#utils)** - General utility functions
- **[Types](./API-TYPES.md)** - TypeScript type definitions

## Examples

- **[Basic Usage](../examples/basic-usage.ts)** - Fundamental SDK operations
- **[Wallet Integration](../examples/wallet-integration-usage.ts)** - Browser wallet setup
- **[Transaction Building](../examples/transaction-building-usage.ts)** - Custom transactions
- **[Enhanced Error Handling](../examples/enhanced-error-handling-usage.ts)** - Production error handling

## Advanced Topics

- **[Error Handling Deep Dive](./ADVANCED-ERROR-HANDLING.md)** - Production error handling strategies
- **[Performance Optimization](./PERFORMANCE.md)** - Performance tuning and monitoring
- **[Testing Guide](./TESTING.md)** - Testing with the SDK
- **[Security Best Practices](./SECURITY.md)** - Security considerations

## Migration Guide

- **[From CosmWasm](./MIGRATION-COSMWASM.md)** - Migrating from CosmWasm implementation
- **[Version Upgrades](./MIGRATION-VERSIONS.md)** - Upgrading between SDK versions

## SDK Features Overview

### 🔐 Complete Protocol Coverage
The SDK provides full coverage of all LocalMoney protocol programs:
- **Hub Program**: Global configuration and cross-program coordination
- **Profile Program**: User profiles, reputation, and activity tracking
- **Price Program**: Oracle price feeds and currency conversions
- **Offer Program**: Buy/sell offer creation and management
- **Trade Program**: Trade execution, escrow, and lifecycle management
- **Arbitration Program**: Dispute resolution and arbitrator management

### ⚡ Enhanced Error Handling
Production-ready error handling with:
- **Automatic Error Classification**: Network, RPC, Program, Account, etc.
- **Circuit Breaker Pattern**: Prevent cascade failures
- **Retry Logic**: Exponential backoff with jitter
- **Recovery Strategies**: Fallback operations, caching, graceful degradation
- **Performance Monitoring**: Detailed analytics and statistics

### 🔗 Browser Wallet Integration
Comprehensive wallet support:
- **Multi-wallet Support**: Phantom, Solflare, Coinbase Wallet
- **Auto-reconnection**: Persistent wallet connections
- **Event System**: Connect, disconnect, error, account change events
- **Development Support**: Keypair wallets for testing

### 📊 Type Safety
Complete TypeScript support:
- **Full Type Definitions**: All protocol data structures and methods
- **IDE Support**: IntelliSense and auto-completion
- **Compile-time Safety**: Catch errors during development

### 🛠️ Developer Experience
Developer-friendly features:
- **Easy Setup**: Quick start functions for rapid development
- **Comprehensive Examples**: Real-world usage patterns
- **Detailed Documentation**: Complete API reference and guides
- **Testing Utilities**: Built-in testing helpers and mocks

### 🎯 Production Ready
Enterprise-grade reliability:
- **Error Recovery**: Automatic retry and fallback mechanisms
- **Performance Monitoring**: Built-in analytics and metrics
- **Caching**: Intelligent caching for improved performance
- **Logging**: Comprehensive logging for debugging and monitoring

## SDK Architecture

```
LocalMoney SDK
├── Core SDK (LocalMoneySDK)
│   ├── Connection Management
│   ├── Wallet Integration
│   └── Program Address Management
├── Enhanced SDK (EnhancedLocalMoneySDK)
│   ├── Error Handling
│   ├── Circuit Breakers
│   ├── Retry Logic
│   └── Recovery Strategies
├── Program SDKs
│   ├── HubSDK
│   ├── ProfileSDK
│   ├── PriceSDK
│   ├── OfferSDK
│   ├── TradeSDK
│   └── ArbitrationSDK
├── Utilities
│   ├── PDAGenerator
│   ├── TransactionBuilder
│   ├── Utils
│   └── ErrorHandler
└── Browser Integration
    ├── LocalMoneyWallet
    ├── WalletUtils
    └── Multi-wallet Support
```

## Development Status

The SDK is production-ready with comprehensive testing:

- ✅ **Core Functionality**: All protocol operations implemented
- ✅ **Error Handling**: Production-ready error handling system
- ✅ **Wallet Integration**: Full browser wallet support
- ✅ **Type Safety**: Complete TypeScript definitions
- ✅ **Testing**: Comprehensive test suite with E2E validation
- ✅ **Documentation**: Complete API reference and examples
- ✅ **Performance**: Optimized for high-frequency operations

## Community and Support

- **Issues**: Report bugs and request features on [GitHub Issues](https://github.com/localmoney/solana-sdk/issues)
- **Discussions**: Join the community discussions
- **Documentation**: Complete guides and API reference
- **Examples**: Real-world usage examples and patterns

## Contributing

We welcome contributions to the LocalMoney SDK! Please see our contributing guidelines for more information.

## License

The LocalMoney SDK is licensed under the ISC License. See the LICENSE file for details.

---

**Next Steps:**
1. Check out the [Quick Start Guide](../README.md#quick-start) to get started
2. Explore the [API Reference](#api-reference) for detailed method documentation
3. Review [Examples](#examples) for real-world usage patterns
4. Read [Advanced Topics](#advanced-topics) for production considerations