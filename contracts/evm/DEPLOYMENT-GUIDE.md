# LocalMoney Protocol - Deployment Guide

## 🔒 Security Audit Fixes Implemented

This deployment includes critical security fixes from the audit report (commit: 3e0c6a7):

### HIGH Severity (Fixed)
- **AUTH-006**: Escrow deposit authorization - prevents arbitrary token theft
- **AUTH-007**: VRF arbitrator selection - true randomness via Chainlink VRF
- **EXT-017**: CEI pattern in Trade.fundEscrow - prevents reentrancy
- **MATH-026**: PriceOracle storage initialization - proper initialization

### MEDIUM Severity (Fixed)
- **EXT-021/DOS-054**: Pull payment pattern - prevents ETH send attacks
- **EXT-018**: Comprehensive reentrancy protection - all functions protected
- **UPG-012**: UUPS upgrade with timelock - secure upgrade mechanism

## 📋 Prerequisites

1. Node.js v18+ and npm
2. Hardhat environment configured
3. Funded deployer wallet
4. RPC endpoint for target network
5. Block explorer API key (for verification)

## 🚀 Deployment Steps

### 1. Environment Setup

Create `.env` file:
```bash
# Network RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
MUMBAI_RPC_URL=https://polygon-mumbai.infura.io/v3/YOUR_KEY

# Private Keys (use hardware wallet in production!)
DEPLOYER_PRIVATE_KEY=0x...

# Block Explorer API Keys
ETHERSCAN_API_KEY=YOUR_KEY
POLYGONSCAN_API_KEY=YOUR_KEY

# Optional: Chainlink VRF (if applicable)
VRF_SUBSCRIPTION_ID=YOUR_SUBSCRIPTION_ID
```

### 2. Compile Contracts

```bash
npm run compile
```

### 3. Run Tests

```bash
# Run all tests
npm test

# Run security-specific tests
npm run test:security

# Generate coverage report
npm run coverage
```

### 4. Deploy to Testnet

```bash
# Deploy to Sepolia
npm run deploy:testnet sepolia

# Deploy to Mumbai
npm run deploy:testnet mumbai
```

The deployment script will:
- Deploy all contracts with security fixes
- Set up timelock controller (2-day delay)
- Configure access control roles
- Save deployment addresses to JSON file

### 5. Verify Contracts

```bash
# Set deployment file
export DEPLOYMENT_FILE=deployment-sepolia-1234567890.json

# Run verification
npm run verify sepolia
```

### 6. Run Integration Tests

```bash
# Set deployment file
export DEPLOYMENT_FILE=deployment-sepolia-1234567890.json

# Run integration tests
npm run test:integration sepolia
```

## 🔧 Post-Deployment Configuration

### 1. Chainlink VRF Setup (if supported)

For networks with Chainlink VRF support:

1. Create VRF subscription at [vrf.chain.link](https://vrf.chain.link)
2. Fund subscription with LINK tokens
3. Add ArbitratorManager as consumer
4. Configure VRF in ArbitratorManager:

```javascript
await arbitratorManager.configureVRF(
    vrfCoordinator,    // Network-specific address
    subscriptionId,    // Your subscription ID
    keyHash,          // Network-specific key hash
    100000,           // Callback gas limit
    3                 // Confirmations
);
```

### 2. Price Oracle Configuration

Set up price feeds:

```javascript
// Update fiat prices
await priceOracle.updateFiatPrices(
    ["USD", "EUR", "GBP"],
    [100000000, 108000000, 127000000] // 8 decimals
);

// Register token price routes
await priceOracle.registerPriceRoute(
    tokenAddress,
    [token, WETH],           // Path
    [3000],                  // Fee tiers
    chainlinkFeedAddress,    // Optional Chainlink feed
    600                      // TWAP period
);
```

### 3. Register Arbitrators

```javascript
// Arbitrator registration
await arbitratorManager.connect(arbitrator).registerArbitrator(
    ["USD", "EUR"],          // Supported currencies
    "encryption-public-key"   // Public key for secure communication
);
```

### 4. Emergency Roles

Assign emergency roles for circuit breaker:

```javascript
const EMERGENCY_ROLE = await hub.EMERGENCY_ROLE();
await hub.grantRole(EMERGENCY_ROLE, emergencyAdmin);
```

## 📊 Contract Addresses (Example - Sepolia)

| Contract | Address | Purpose |
|----------|---------|---------|
| Hub | 0x... | Central configuration & timelock |
| Trade | 0x... | P2P trading with CEI pattern |
| Escrow | 0x... | Pull payment pattern for funds |
| ArbitratorManager | 0x... | VRF-based arbitrator selection |
| Profile | 0x... | User profiles & reputation |
| Offer | 0x... | Trade offer management |
| PriceOracle | 0x... | Price feeds & validation |

## 🔐 Security Considerations

1. **Timelock Delays**: All upgrades subject to 2-day timelock
2. **Access Control**: Role-based permissions for all admin functions
3. **Pull Payments**: ETH withdrawals use pull pattern to prevent attacks
4. **Reentrancy Guards**: All external functions protected
5. **VRF Randomness**: True randomness for arbitrator selection
6. **CEI Pattern**: State changes before external calls

## 🧪 Testing Checklist

- [ ] All unit tests pass
- [ ] Security tests pass
- [ ] Integration tests pass on testnet
- [ ] Gas costs within acceptable range
- [ ] Upgrade mechanism tested
- [ ] Emergency pause tested
- [ ] VRF functionality verified (if applicable)
- [ ] Pull payment withdrawals work
- [ ] Access controls enforced

## 📈 Monitoring & Maintenance

1. **Monitor Events**: Set up event monitoring for critical functions
2. **Track Gas Prices**: Monitor and adjust gas limits as needed
3. **VRF Subscription**: Keep VRF subscription funded with LINK
4. **Security Alerts**: Set up alerts for suspicious activity
5. **Upgrade Planning**: Test upgrades on testnet before mainnet

## 🚨 Emergency Procedures

### Global Pause
```javascript
await hub.emergencyPause("Security incident detected");
```

### Resume Operations
```javascript
await hub.resume(); // Admin only, after issue resolved
```

### Specific Operation Pause
```javascript
await hub.pauseOperation(OP_CREATE_TRADE);
```

## 📚 Additional Resources

- [Audit Report](./audit-artifacts/audit-report.json)
- [Security Fixes Documentation](./TODO-AUDIT-FIXES.md)
- [OpenZeppelin Upgrades](https://docs.openzeppelin.com/upgrades)
- [Chainlink VRF Docs](https://docs.chain.link/vrf/v2/introduction)

## 🤝 Support

For deployment support or security questions:
- GitHub Issues: [LocalMoney/issues](https://github.com/LocalMoney/issues)
- Security: security@localmoney.com (PGP key available)

---

**Last Updated**: November 2024
**Version**: 1.0.0 (Post-Audit)