name: "EVM Translation Phase 1: Foundation & Core Infrastructure"
description: |

## Purpose
Establish the foundational EVM smart contract infrastructure for LocalMoney protocol, setting up the development environment and implementing the Hub and Profile contracts as the core administrative and user management layer, based on the CosmWasm to EVM translation guide.

## Core Principles
1. **Modular Architecture**: Maintain separation of concerns like CosmWasm implementation
2. **Upgradability**: Use UUPS proxy pattern for future updates
3. **Gas Efficiency**: Optimize storage layout from the start
4. **Access Control**: Implement role-based permissions
5. **EVM Best Practices**: Follow OpenZeppelin standards

---

## Goal
Create a fully functional Hardhat development environment with Hub and Profile contracts that mirror the CosmWasm functionality, establishing the foundation for subsequent contract implementations.

## Why
- **Foundation First**: Other contracts depend on Hub configuration and Profile management
- **Development Setup**: Need consistent tooling for all phases
- **Access Control**: Establish security patterns early
- **Testing Framework**: Build test infrastructure for all contracts

## What
Complete implementation including:
- **Hardhat Project**: Full development environment setup
- **Hub Contract**: Central configuration and administration
- **Profile Contract**: User profile and reputation management
- **Interfaces**: Define all contract interfaces for future phases
- **Access Control**: Role-based permission system
- **Testing Suite**: Unit tests for both contracts
- **Documentation**: NatSpec comments and deployment guide

### Success Criteria
- [ ] Hardhat project compiles and runs tests
- [ ] Hub contract manages configuration correctly
- [ ] Profile contract tracks user data
- [ ] Access control restricts admin functions
- [ ] Gas costs are optimized (< 200k for deployment)
- [ ] Test coverage > 90%
- [ ] All functions have NatSpec documentation

## All Needed Context

### Critical Documentation Sources
```yaml
# HARDHAT DOCUMENTATION
hardhat_setup: https://hardhat.org/hardhat-runner/docs/getting-started
hardhat_testing: https://hardhat.org/hardhat-runner/docs/guides/test-contracts
hardhat_console: https://hardhat.org/hardhat-runner/docs/guides/console-logging

# OPENZEPPELIN CONTRACTS
upgradeable_contracts: https://docs.openzeppelin.com/contracts/5.x/upgradeable
access_control: https://docs.openzeppelin.com/contracts/5.x/access-control
uups_pattern: https://docs.openzeppelin.com/contracts/5.x/api/proxy#UUPSUpgradeable

# SOLIDITY BEST PRACTICES
solidity_docs: https://docs.soliditylang.org/en/v0.8.24/
natspec: https://docs.soliditylang.org/en/v0.8.24/natspec-format.html
```

### Reference Files to Analyze
```yaml
# COSMWASM IMPLEMENTATIONS TO TRANSLATE
hub_contract: contracts/cosmwasm/contracts/hub/src/contract.rs
hub_state: contracts/cosmwasm/contracts/hub/src/state.rs
profile_contract: contracts/cosmwasm/contracts/profile/src/contract.rs
profile_state: contracts/cosmwasm/contracts/profile/src/lib.rs

# TRANSLATION GUIDE
guide: COSMWASM_TO_EVM_TRANSLATION_GUIDE.md
```

### Implementation Blueprint

#### 1. Project Structure
```
contracts/evm/
├── contracts/
│   ├── Hub.sol
│   ├── Profile.sol
│   └── interfaces/
│       ├── IHub.sol
│       ├── IProfile.sol
│       ├── IOffer.sol
│       ├── ITrade.sol
│       └── IPriceOracle.sol
├── test/
│   ├── Hub.test.js
│   └── Profile.test.js
├── scripts/
│   └── deploy.js
├── hardhat.config.js
└── package.json
```

#### 2. Hub Contract Structure
```solidity
// Based on COSMWASM_TO_EVM_TRANSLATION_GUIDE.md lines 86-160
contract Hub is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    struct HubConfig {
        address offerContract;
        address tradeContract;
        address profileContract;
        address priceContract;
        address treasury;
        address localMarket;
        address priceProvider;
        
        // Fee configuration (basis points)
        uint16 burnFeePct;      // Max 10000 (100%)
        uint16 chainFeePct;     
        uint16 warchestFeePct;
        uint16 conversionFeePct;
        
        // Trading limits
        uint256 minTradeAmount;  // In USD cents
        uint256 maxTradeAmount;
        uint256 maxActiveOffers;
        uint256 maxActiveTrades;
        
        // Timers (in seconds)
        uint256 tradeExpirationTimer;
        uint256 tradeDisputeTimer;
        
        // Circuit breaker flags
        bool globalPause;
        bool pauseNewTrades;
        bool pauseDeposits;
        bool pauseWithdrawals;
    }
}
```

#### 3. Profile Contract Structure
```solidity
// Based on COSMWASM_TO_EVM_TRANSLATION_GUIDE.md lines 346-391
contract Profile is Initializable, UUPSUpgradeable {
    struct UserProfile {
        string encryptedContact;
        string publicKey;
        uint256 tradesRequested;
        uint256 tradesCompleted;
        uint256 activeOffers;
        uint256 activeTrades;
        uint256 createdAt;
        uint256 lastActivity;
    }
}
```

## Tasks Implementation Order

1. **Environment Setup** (30 mins)
   - Initialize Hardhat project
   - Install OpenZeppelin dependencies
   - Configure Solidity compiler settings
   - Setup test environment

2. **Create Interfaces** (45 mins)
   - Define IHub interface
   - Define IProfile interface
   - Define placeholder interfaces for future contracts
   - Add events and custom errors

3. **Implement Hub Contract** (2 hours)
   - Storage layout with HubConfig struct
   - Initialize function with validation
   - UpdateConfig with fee validation
   - UpdateAdmin with ownership transfer
   - Circuit breaker functions
   - View functions for config

4. **Implement Profile Contract** (1.5 hours)
   - UserProfile struct and mappings
   - UpdateContact function
   - UpdateTradesCount (callable by Trade contract)
   - UpdateActiveOffers (callable by Offer contract)
   - Authorization modifiers
   - Query functions

5. **Write Tests** (2 hours)
   - Hub initialization tests
   - Configuration validation tests
   - Access control tests
   - Profile CRUD operations
   - Integration tests between contracts

6. **Documentation** (30 mins)
   - NatSpec comments for all functions
   - Deployment instructions
   - Gas optimization notes

## Validation Gates

```bash
# Compile contracts
npx hardhat compile

# Run tests with coverage
npx hardhat coverage

# Check test coverage (must be > 90%)
# Verify all tests pass

# Gas reporter
REPORT_GAS=true npx hardhat test

# Verify deployment gas < 200k per contract

# Security check with Slither
slither contracts/

# Size check (must be under 24KB)
npx hardhat size-contracts
```

## Common Pitfalls to Avoid

1. **Storage Collision**: Use proper storage gaps for upgradeable contracts
2. **Initialization**: Ensure initialize can only be called once
3. **Access Control**: Don't forget to set up roles in initialize
4. **Integer Overflow**: Use Solidity 0.8+ or SafeMath
5. **Gas Optimization**: Pack struct variables efficiently

## Migration Notes from CosmWasm

Key differences to handle:
- Replace `InstantiateMsg` with `initialize` function
- Convert `ExecuteMsg` enum to individual functions
- Replace `QueryMsg` with view functions
- Convert `Response` with events
- Replace `Deps`/`DepsMut` with storage variables

## Dependencies

```json
{
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "@openzeppelin/hardhat-upgrades": "^3.0.0",
    "hardhat": "^2.19.0",
    "hardhat-gas-reporter": "^1.0.9",
    "solidity-coverage": "^0.8.5"
  },
  "dependencies": {
    "@openzeppelin/contracts-upgradeable": "^5.0.0"
  }
}
```

## Confidence Score: 9/10

This PRP provides comprehensive context for implementing the foundation layer. The clear structure, reference to existing CosmWasm code, and detailed validation gates ensure successful one-pass implementation.