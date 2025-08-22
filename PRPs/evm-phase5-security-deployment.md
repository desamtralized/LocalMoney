name: "EVM Translation Phase 5: Security, Testing & Deployment"
description: |

## Purpose
Finalize the LocalMoney EVM protocol with comprehensive security hardening, complete test coverage, gas optimizations, formal verification preparation, and production deployment infrastructure. This phase ensures the protocol is secure, efficient, and ready for mainnet deployment.

## Core Principles
1. **Defense in Depth**: Multiple layers of security
2. **Comprehensive Testing**: 100% critical path coverage
3. **Gas Efficiency**: Optimize every operation
4. **Audit Readiness**: Documentation and verification
5. **Safe Deployment**: Multi-sig and timelocks

---

## Goal
Transform the functional protocol from Phases 1-4 into a production-ready, audited, and optimized system with comprehensive testing, security measures, deployment scripts, and monitoring infrastructure.

## Why
- **Security Critical**: Handling real user funds
- **Audit Requirements**: Professional audit preparation
- **Gas Costs**: User experience depends on efficiency
- **Reliability**: Production systems need robustness
- **Monitoring**: Operational visibility essential

## What
Complete implementation including:
- **Security Hardening**: All known vulnerability fixes
- **Gas Optimization**: Storage and computation efficiency
- **Test Coverage**: Unit, integration, fuzz, invariant tests
- **Formal Verification**: Property specifications
- **Deployment System**: Multi-network deployment
- **Monitoring**: Events and analytics
- **Documentation**: Complete technical and user docs

### Success Criteria
- [ ] Slither reports no high/medium issues
- [ ] Test coverage > 95% for all contracts
- [ ] Gas costs optimized (benchmarked)
- [ ] Formal verification properties pass
- [ ] Deployment scripts work on all networks
- [ ] Multi-sig setup complete
- [ ] Documentation comprehensive
- [ ] Audit checklist complete

## All Needed Context

### Critical Documentation Sources
```yaml
# SECURITY TOOLS
slither: https://github.com/crytic/slither
mythx: https://docs.mythx.io/
echidna: https://github.com/crytic/echidna
manticore: https://github.com/trailofbits/manticore

# GAS OPTIMIZATION
sol_optimizer: https://docs.soliditylang.org/en/v0.8.24/internals/optimizer.html
gas_golf: https://github.com/hrkrshnn/solidity-gas-golfing

# DEPLOYMENT
hardhat_deploy: https://github.com/wighawag/hardhat-deploy
safe_contracts: https://github.com/safe-global/safe-contracts

# MONITORING
tenderly: https://docs.tenderly.co/
dune_analytics: https://docs.dune.com/
```

### Reference Files to Analyze
```yaml
# ALL PHASE CONTRACTS
hub: contracts/evm/contracts/Hub.sol
profile: contracts/evm/contracts/Profile.sol
offer: contracts/evm/contracts/Offer.sol
trade: contracts/evm/contracts/Trade.sol
oracle: contracts/evm/contracts/PriceOracle.sol

# TRANSLATION GUIDE
guide: COSMWASM_TO_EVM_TRANSLATION_GUIDE.md (lines 697-853)
```

### Implementation Blueprint

#### 1. Security Hardening Checklist
```solidity
// ReentrancyGuard on all external functions with transfers
contract Trade is ReentrancyGuardUpgradeable {
    // Check-Effects-Interactions pattern
    function releaseEscrow(uint256 _tradeId) external nonReentrant {
        // 1. Checks
        require(trades[_tradeId].state == TradeState.FiatDeposited, "Invalid state");
        require(msg.sender == trades[_tradeId].seller, "Not seller");
        
        // 2. Effects (state changes)
        uint256 amount = escrowBalances[_tradeId];
        escrowBalances[_tradeId] = 0;
        trades[_tradeId].state = TradeState.EscrowReleased;
        
        // 3. Interactions (external calls)
        _transfer(trades[_tradeId].tokenAddress, trades[_tradeId].buyer, amount);
    }
}

// Input validation library
library InputValidator {
    function validateAddress(address _addr) internal pure {
        require(_addr != address(0), "Zero address");
    }
    
    function validateString(string memory _str, uint256 _maxLength) internal pure {
        require(bytes(_str).length > 0, "Empty string");
        require(bytes(_str).length <= _maxLength, "String too long");
    }
    
    function validateAmount(uint256 _amount, uint256 _min, uint256 _max) internal pure {
        require(_amount >= _min, "Amount below minimum");
        require(_amount <= _max, "Amount above maximum");
    }
}

// Access control with timelock
contract Hub is TimelockController {
    uint256 public constant TIMELOCK_DELAY = 48 hours;
    
    function scheduleConfigUpdate(HubConfig memory _newConfig) external onlyRole(PROPOSER_ROLE) {
        bytes32 id = keccak256(abi.encode(_newConfig, block.timestamp));
        _schedule(id, TIMELOCK_DELAY);
        emit ConfigUpdateScheduled(id, _newConfig);
    }
    
    function executeConfigUpdate(HubConfig memory _newConfig) external onlyRole(EXECUTOR_ROLE) {
        bytes32 id = keccak256(abi.encode(_newConfig, block.timestamp - TIMELOCK_DELAY));
        require(isOperationReady(id), "Not ready");
        _execute(id);
        _updateConfig(_newConfig);
    }
}
```

#### 2. Gas Optimization Patterns
```solidity
// Storage packing
contract OptimizedTrade {
    struct TradeData {
        address buyer;        // 20 bytes
        uint96 amount;       // 12 bytes - enough for most tokens
        address seller;      // 20 bytes
        uint96 fiatAmount;   // 12 bytes
        address token;       // 20 bytes
        uint32 createdAt;    // 4 bytes - Unix timestamp
        uint32 expiresAt;    // 4 bytes
        uint8 state;         // 1 byte - enum
        // Total: 93 bytes = 3 storage slots (optimized from 8+)
    }
    
    // Use mappings instead of arrays where possible
    mapping(address => EnumerableSet.UintSet) private userTrades;
    
    // Cache frequently accessed values
    uint256 private cachedTotalTrades;
    
    // Batch operations
    function batchCreateOffers(OfferData[] calldata _offers) external {
        for (uint i = 0; i < _offers.length;) {
            _createOffer(_offers[i]);
            unchecked { ++i; }
        }
    }
}

// Event optimization
event TradeCreated(
    uint256 indexed tradeId,
    uint256 indexed offerId,
    address indexed buyer
    // Additional data in non-indexed parameters
);
```

#### 3. Comprehensive Test Suite
```javascript
// test/security/SecurityTests.test.js
describe("Security Test Suite", function() {
    describe("Reentrancy Protection", function() {
        it("Should prevent reentrancy on releaseEscrow", async function() {
            const maliciousContract = await deployMaliciousReentrant();
            await expect(
                maliciousContract.attackReleaseEscrow(tradeId)
            ).to.be.revertedWith("ReentrancyGuard");
        });
    });
    
    describe("Integer Overflow Protection", function() {
        it("Should handle maximum uint256 values", async function() {
            const maxUint = ethers.constants.MaxUint256;
            await expect(
                offer.createOffer(type, fiat, token, maxUint, maxUint, rate, desc)
            ).to.be.revertedWith("Amount overflow");
        });
    });
    
    describe("Access Control", function() {
        it("Should restrict admin functions", async function() {
            await expect(
                hub.connect(attacker).updateConfig(newConfig)
            ).to.be.revertedWith("AccessControl");
        });
    });
});

// test/gas/GasOptimization.test.js
describe("Gas Optimization Tests", function() {
    it("Should track gas usage for all operations", async function() {
        const createOfferGas = await offer.estimateGas.createOffer(...);
        expect(createOfferGas).to.be.lessThan(150000);
        
        const createTradeGas = await trade.estimateGas.createTrade(...);
        expect(createTradeGas).to.be.lessThan(200000);
    });
});

// test/fuzzing/echidna.yaml
testMode: assertion
testLimit: 100000
corpusDir: corpus
coverageFormats: ["html", "lcov"]
```

#### 4. Formal Verification Properties
```solidity
// Invariants for formal verification
contract TradeInvariants {
    // Property 1: Escrow balance equals trade amount when funded
    function invariant_escrow_balance() public view {
        for (uint i = 0; i < nextTradeId; i++) {
            if (trades[i].state == TradeState.EscrowFunded) {
                assert(escrowBalances[i] == trades[i].amount);
            }
        }
    }
    
    // Property 2: Released escrow has zero balance
    function invariant_released_escrow() public view {
        for (uint i = 0; i < nextTradeId; i++) {
            if (trades[i].state == TradeState.EscrowReleased) {
                assert(escrowBalances[i] == 0);
            }
        }
    }
    
    // Property 3: Total fees never exceed 10%
    function invariant_fee_cap() public view {
        HubConfig memory config = hub.getConfig();
        uint256 totalFees = config.burnFeePct + config.chainFeePct + config.warchestFeePct;
        assert(totalFees <= 1000); // 10% in basis points
    }
}
```

#### 5. Deployment Infrastructure
```javascript
// scripts/deploy.js
const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Deploy with proxy
    const Hub = await ethers.getContractFactory("Hub");
    const hub = await upgrades.deployProxy(Hub, [initialConfig], {
        initializer: "initialize",
        kind: "uups"
    });
    await hub.deployed();
    
    // Verify on Etherscan
    await hre.run("verify:verify", {
        address: hub.address,
        constructorArguments: [],
    });
    
    // Transfer ownership to multi-sig
    await hub.transferOwnership(MULTISIG_ADDRESS);
    
    // Save deployment addresses
    const deployments = {
        hub: hub.address,
        profile: profile.address,
        // ... other contracts
    };
    
    fs.writeFileSync(
        `deployments/${network.name}.json`,
        JSON.stringify(deployments, null, 2)
    );
}

// hardhat.config.js - Multi-network configuration
module.exports = {
    networks: {
        mainnet: {
            url: process.env.MAINNET_RPC,
            accounts: [process.env.DEPLOYER_KEY],
            gasPrice: 30000000000,
        },
        arbitrum: {
            url: process.env.ARBITRUM_RPC,
            accounts: [process.env.DEPLOYER_KEY],
        },
        optimism: {
            url: process.env.OPTIMISM_RPC,
            accounts: [process.env.DEPLOYER_KEY],
        },
    },
    gasReporter: {
        enabled: true,
        currency: "USD",
        gasPrice: 30,
    },
};
```

#### 6. Monitoring & Analytics
```solidity
// Enhanced events for monitoring
contract MonitoredTrade {
    event MetricUpdate(
        string indexed metric,
        uint256 value,
        uint256 timestamp
    );
    
    event AnomalyDetected(
        string indexed anomalyType,
        uint256 tradeId,
        address actor
    );
    
    function _trackMetric(string memory metric, uint256 value) internal {
        emit MetricUpdate(metric, value, block.timestamp);
        
        // Anomaly detection
        if (value > expectedRanges[metric].max) {
            emit AnomalyDetected("HIGH_VALUE", 0, msg.sender);
        }
    }
}
```

## Tasks Implementation Order

1. **Security Audit Preparation** (2 hours)
   - Run Slither and fix all issues
   - Add reentrancy guards
   - Implement check-effects-interactions
   - Add input validation
   - Review access controls

2. **Gas Optimization** (2 hours)
   - Pack storage structs
   - Optimize loops with unchecked
   - Cache storage reads
   - Batch operations
   - Event optimization

3. **Test Coverage Completion** (3 hours)
   - Unit tests to 100%
   - Integration test scenarios
   - Edge case testing
   - Fuzzing setup
   - Invariant tests

4. **Formal Verification** (1.5 hours)
   - Write invariants
   - Setup Echidna
   - Create symbolic tests
   - Document properties

5. **Deployment System** (1.5 hours)
   - Multi-network scripts
   - Proxy deployment
   - Verification scripts
   - Multi-sig setup
   - Emergency procedures

6. **Documentation** (2 hours)
   - Technical documentation
   - User guides
   - API documentation
   - Deployment guide
   - Emergency runbooks

## Validation Gates

```bash
# Security analysis
slither . --print human-summary
mythx analyze

# Test coverage
npx hardhat coverage
# Require: Branch coverage > 95%
# Require: Function coverage > 98%

# Gas benchmarking
REPORT_GAS=true npx hardhat test
# Compare against targets in gas-benchmarks.json

# Fuzzing
echidna-test . --contract TradeInvariants --config echidna.yaml

# Deployment dry run
npx hardhat run scripts/deploy.js --network hardhat

# Mainnet fork testing
npx hardhat test test/fork/MainnetIntegration.test.js --network mainnet-fork

# Contract size check
npx hardhat size-contracts
# All contracts must be < 24KB

# Documentation build
npm run docs:build

# Final audit checklist
npm run audit:checklist
```

## Security Checklist

- [ ] No compiler warnings
- [ ] Slither: No high/medium issues
- [ ] Reentrancy guards on all transfers
- [ ] Check-effects-interactions pattern
- [ ] Input validation on all external functions
- [ ] No unchecked external calls
- [ ] Proper access control
- [ ] Timelock on critical functions
- [ ] Circuit breaker implemented
- [ ] No unbounded loops
- [ ] Integer overflow protection
- [ ] Front-running mitigation
- [ ] Flash loan attack protection
- [ ] Proper randomness (VRF)
- [ ] Emergency pause mechanism
- [ ] Upgrade authorization

## Deployment Checklist

- [ ] Multi-sig wallet deployed
- [ ] Timelock configured
- [ ] Initial parameters set
- [ ] Contracts verified on Etherscan
- [ ] Ownership transferred to multi-sig
- [ ] Emergency contacts documented
- [ ] Monitoring alerts configured
- [ ] Incident response plan ready
- [ ] User documentation published
- [ ] Bug bounty program launched

## Common Pitfalls to Avoid

1. **Proxy Storage**: Maintain storage layout compatibility
2. **Gas Limits**: Test with realistic mainnet gas prices
3. **Network Differences**: Test on actual testnets
4. **Verification Issues**: Keep constructor args simple
5. **Multi-sig Setup**: Test all operations with multi-sig

## Production Readiness Criteria

1. **Security**: Professional audit completed
2. **Testing**: >95% coverage, all scenarios tested
3. **Performance**: Gas costs benchmarked and optimized
4. **Documentation**: Complete technical and user docs
5. **Monitoring**: Full observability stack deployed
6. **Governance**: Multi-sig and timelock active
7. **Emergency**: Incident response procedures ready

## Dependencies

```json
{
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "@openzeppelin/hardhat-upgrades": "^3.0.0",
    "hardhat-gas-reporter": "^1.0.9",
    "hardhat-contract-sizer": "^2.10.0",
    "solidity-coverage": "^0.8.5",
    "slither-analyzer": "^0.9.0",
    "@nomiclabs/hardhat-etherscan": "^3.1.0",
    "hardhat-deploy": "^0.11.0"
  }
}
```

## Confidence Score: 9/10

This final phase ensures production readiness through comprehensive security measures, testing, and deployment infrastructure. The detailed checklists and validation gates provide clear success criteria. With proper execution of this phase, the protocol will be ready for professional audit and mainnet deployment.