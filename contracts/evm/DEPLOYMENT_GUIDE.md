# LocalMoney EVM Protocol - Production Deployment Guide

## 🎯 Overview

This guide covers the complete deployment process for the LocalMoney EVM Protocol, implementing the security and optimization requirements from Phase 5: Security, Testing & Deployment.

## ✅ Pre-Deployment Checklist

### Security Requirements
- [ ] Slither analysis completed with no high/medium issues
- [ ] All contracts under 24KB size limit
- [ ] Constructor protection enabled on all upgradeable contracts
- [ ] Multi-sig wallet deployed and configured
- [ ] Emergency procedures documented
- [ ] Audit completed (for mainnet)

### Infrastructure Requirements
- [ ] RPC endpoints configured for target networks
- [ ] Private keys securely stored (hardware wallet recommended)
- [ ] Etherscan API keys configured
- [ ] Multi-sig team members confirmed
- [ ] Emergency contact list prepared

### Environment Setup
- [ ] `.env` file configured with required variables
- [ ] Gas price strategy determined
- [ ] Treasury and fee collector addresses prepared
- [ ] Price oracle feeds identified

## 🔧 Environment Configuration

Create a `.env` file in the `contracts/evm/` directory:

```bash
# Network RPC URLs
MAINNET_RPC=https://mainnet.infura.io/v3/YOUR_KEY
ARBITRUM_RPC=https://arb1.arbitrum.io/rpc
OPTIMISM_RPC=https://mainnet.optimism.io
SEPOLIA_RPC=https://sepolia.infura.io/v3/YOUR_KEY

# Deployment Private Key (Use hardware wallet for mainnet!)
DEPLOYER_PRIVATE_KEY=0x...

# Multi-sig and Treasury Addresses
MAINNET_MULTISIG=0x...
MAINNET_TREASURY=0x...
ARBITRUM_MULTISIG=0x...
ARBITRUM_TREASURY=0x...
OPTIMISM_MULTISIG=0x...
OPTIMISM_TREASURY=0x...

# API Keys for Verification
ETHERSCAN_API_KEY=...
ARBISCAN_API_KEY=...
OPTIMISM_API_KEY=...
```

## 🚀 Deployment Process

### Step 1: Pre-Deployment Validation

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run security analysis
slither . --exclude informational,optimization

# Check contract sizes
npx hardhat size-contracts

# Run tests (if working)
npx hardhat test
```

### Step 2: Deploy to Testnet First

```bash
# Deploy to Sepolia testnet
npx hardhat run scripts/deploy-production.js --network sepolia

# Validate deployment
npx hardhat run scripts/validate-deployment.js -- deployments/sepolia-latest.json
```

### Step 3: Production Deployment

⚠️ **CRITICAL**: Only proceed after successful testnet deployment and validation.

```bash
# Deploy to Mainnet
npx hardhat run scripts/deploy-production.js --network mainnet

# Deploy to Arbitrum
npx hardhat run scripts/deploy-production.js --network arbitrum

# Deploy to Optimism  
npx hardhat run scripts/deploy-production.js --network optimism
```

### Step 4: Post-Deployment Validation

```bash
# Validate each deployment
npx hardhat run scripts/validate-deployment.js -- deployments/mainnet-latest.json
npx hardhat run scripts/validate-deployment.js -- deployments/arbitrum-latest.json
npx hardhat run scripts/validate-deployment.js -- deployments/optimism-latest.json
```

## 🔐 Security Configuration

### Multi-Sig Setup

1. **Deploy Multi-Sig Wallet** (if not already deployed)
   - Use Gnosis Safe or similar
   - Minimum 3/5 threshold recommended
   - Include team members from different geographic locations

2. **Transfer Ownership**
   - All contracts deployed with deployer as initial admin
   - Ownership automatically transferred to multi-sig during deployment
   - Verify transfer completed successfully

3. **Configure Emergency Roles**
   - Grant emergency role to trusted operators
   - Test emergency pause functionality
   - Document emergency procedures

### Access Control Verification

```bash
# Check Hub admin
npx hardhat console --network mainnet
> const hub = await ethers.getContractAt("Hub", "HUB_ADDRESS")
> await hub.getAdmin()

# Verify multi-sig ownership
> const admin = await hub.getAdmin()
> console.log("Admin is multi-sig:", admin === "MULTISIG_ADDRESS")
```

## ⚙️ Configuration Management

### Initial Configuration

The deployment script sets conservative defaults:

- **Fees**: Total fees ≤ 10%
  - Burn Fee: 1.0%
  - Chain Fee: 1.5%
  - Warchest Fee: 2.5%
  - Arbitrator Fee: 2.0%
  - Conversion Fee: 0.5%

- **Trading Limits**:
  - Minimum Trade: $10
  - Maximum Trade: $50,000
  - Max Active Offers: 20
  - Max Active Trades: 10

- **Timers**:
  - Trade Expiration: 48 hours
  - Dispute Window: 7 days

### Post-Deployment Configuration

1. **Price Oracle Setup**
   ```bash
   # Configure price feeds for supported tokens
   # Set up Uniswap V3 routes
   # Test price updates
   ```

2. **Fee Collector Setup**
   ```bash
   # Verify treasury addresses
   # Test fee distribution
   ```

3. **Emergency Controls Test**
   ```bash
   # Test emergency pause
   # Test operation-specific pausing
   # Verify resume functionality
   ```

## 📊 Monitoring & Maintenance

### Health Checks

Create monitoring for:

- [ ] Contract upgrade events
- [ ] Emergency pause events  
- [ ] Fee distribution events
- [ ] Large trade events
- [ ] Failed transaction patterns

### Regular Maintenance

- [ ] Monitor gas usage patterns
- [ ] Review fee collection rates
- [ ] Update price feeds as needed
- [ ] Security patch assessments
- [ ] Performance optimization reviews

## 🚨 Emergency Procedures

### Emergency Pause

If critical vulnerability discovered:

1. **Immediate Response**
   ```bash
   # Connect to multi-sig
   # Execute emergency pause
   hub.emergencyPause("Critical vulnerability detected")
   ```

2. **Communication**
   - Notify all stakeholders immediately
   - Publish incident report
   - Coordinate with security team

3. **Resolution**
   - Deploy fixes to testnet first
   - Complete security review
   - Coordinate upgrade timing
   - Resume operations

### Upgrade Process

For contract upgrades:

1. **Preparation**
   - Deploy new implementation to testnet
   - Complete security audit
   - Prepare upgrade proposal

2. **Execution**
   - Submit to multi-sig
   - Wait for timelock delay
   - Execute upgrade
   - Verify upgrade success

3. **Validation**
   - Run validation script
   - Monitor for issues
   - Communication to users

## 📋 Deployment Verification Checklist

### Contract Deployment
- [ ] All contracts deployed successfully
- [ ] Contract sizes under 24KB limit
- [ ] All contracts verified on Etherscan
- [ ] Proxy deployment working correctly

### Security Configuration
- [ ] Ownership transferred to multi-sig
- [ ] Emergency roles configured
- [ ] Access controls verified
- [ ] Upgrade authorization working

### Functional Testing
- [ ] Basic functionality tested
- [ ] Fee calculation working
- [ ] Emergency pause working
- [ ] Price oracle responding

### Documentation
- [ ] Deployment addresses recorded
- [ ] Configuration documented
- [ ] Emergency procedures ready
- [ ] User documentation published

## 🔗 Important Links

- **Multi-Sig Wallet**: [Link to Gnosis Safe]
- **Monitoring Dashboard**: [Link to monitoring]
- **Incident Response**: [Link to procedures]
- **Security Audit**: [Link to audit report]

## 📞 Emergency Contacts

- **Protocol Team Lead**: [Contact info]
- **Security Team**: [Contact info]
- **Multi-Sig Signers**: [Contact list]
- **Emergency Response**: [24/7 contact]

---

⚠️ **REMEMBER**: This is a financial protocol handling real user funds. Double-check everything and never rush production deployments.

🎉 **Generated with [Claude Code](https://claude.ai/code)**