# CosmWasm to EVM Translation Guide for LocalMoney Protocol

## Executive Summary

This document provides a comprehensive guide for translating the LocalMoney protocol from CosmWasm (Rust-based smart contracts for Cosmos ecosystem) to EVM-compatible smart contracts using the latest version of Solidity. The LocalMoney protocol is a decentralized P2P trading platform facilitating fiat-to-cryptocurrency exchanges through an escrow mechanism with integrated dispute resolution.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Translation Challenges](#core-translation-challenges)
3. [Contract-by-Contract Translation Strategy](#contract-by-contract-translation-strategy)
4. [Technical Implementation Details](#technical-implementation-details)
5. [Migration Roadmap](#migration-roadmap)
6. [Testing Strategy](#testing-strategy)
7. [Security Considerations](#security-considerations)

## Architecture Overview

### Current CosmWasm Architecture
- **Hub Contract**: Central orchestrator managing configuration
- **Offer Contract**: Handles buy/sell offer lifecycle
- **Trade Contract**: Core trading engine with escrow
- **Profile Contract**: User profile and reputation management
- **Price Contract**: Oracle for price feeds

### Target EVM Architecture
The EVM implementation will maintain the same modular architecture but with Solidity-specific patterns and optimizations.

## Core Translation Challenges

### 1. Storage Model Differences

#### CosmWasm Storage
```rust
// CosmWasm uses key-value storage with typed buckets
pub const CONFIG: Item<HubConfig> = Item::new("config");
pub const ADMIN: Item<Admin> = Item::new("admin");
```

#### Solidity Translation
```solidity
// Solidity uses state variables with explicit visibility
HubConfig public hubConfig;
address public admin;
mapping(uint256 => Offer) public offers;
```

### 2. Message Passing vs Function Calls

#### CosmWasm Approach
- Uses message passing between contracts
- Asynchronous execution with SubMsg
- Response handling through Reply entry points

#### EVM Translation
- Direct function calls between contracts
- Synchronous execution model
- Interface-based contract interactions

### 3. Query vs View Functions

#### CosmWasm
```rust
#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&CONFIG.load(deps.storage)?),
    }
}
```

#### Solidity
```solidity
function getConfig() external view returns (HubConfig memory) {
    return hubConfig;
}
```

## Contract-by-Contract Translation Strategy

### 1. Hub Contract Translation

#### Core Components to Translate

**State Variables**
```solidity
pragma solidity ^0.8.24;

contract Hub {
    struct HubConfig {
        address offerContract;
        address tradeContract;
        address profileContract;
        address priceContract;
        address treasury;
        address localMarket;
        address priceProvider;
        
        // Fee configuration (basis points)
        uint16 burnFeePct;
        uint16 chainFeePct;
        uint16 warchestFeePct;
        uint16 conversionFeePct;
        
        // Trading limits
        uint256 minTradeAmount;
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
    
    HubConfig public config;
    address public admin;
    
    // Events
    event ConfigUpdated(HubConfig newConfig);
    event AdminUpdated(address oldAdmin, address newAdmin);
    event ContractRegistered(address contractAddress, ContractType contractType);
}
```

**Key Functions**
```solidity
function initialize(HubConfig memory _config) external {
    require(admin == address(0), "Already initialized");
    admin = msg.sender;
    _validateAndSetConfig(_config);
}

function updateConfig(HubConfig memory _config) external onlyAdmin {
    _validateAndSetConfig(_config);
    _notifyChildContracts();
    emit ConfigUpdated(_config);
}

function _validateAndSetConfig(HubConfig memory _config) private {
    // Validate fee percentages
    uint32 totalFees = uint32(_config.burnFeePct) + 
                       uint32(_config.chainFeePct) + 
                       uint32(_config.warchestFeePct);
    require(totalFees <= 10000, "Total fees exceed 100%");
    
    // Validate timer constraints
    require(_config.tradeExpirationTimer > 0 && 
            _config.tradeExpirationTimer <= MAX_EXPIRATION_TIME, 
            "Invalid expiration timer");
    
    config = _config;
}
```

### 2. Offer Contract Translation

**State Management**
```solidity
contract Offer {
    enum OfferType { Buy, Sell }
    enum OfferState { Active, Paused, Archived }
    
    struct OfferData {
        uint256 id;
        address owner;
        OfferType offerType;
        OfferState state;
        string fiatCurrency;
        address tokenAddress;
        uint256 minAmount;
        uint256 maxAmount;
        uint256 rate; // Price per token in fiat cents
        string description;
        uint256 createdAt;
        uint256 updatedAt;
    }
    
    uint256 public nextOfferId;
    mapping(uint256 => OfferData) public offers;
    mapping(address => uint256[]) public userOffers;
    
    IHub public hub;
    
    event OfferCreated(uint256 indexed offerId, address indexed owner);
    event OfferUpdated(uint256 indexed offerId, OfferState newState);
}
```

**Core Functions**
```solidity
function createOffer(
    OfferType _type,
    string memory _fiatCurrency,
    address _token,
    uint256 _minAmount,
    uint256 _maxAmount,
    uint256 _rate,
    string memory _description
) external returns (uint256) {
    require(_minAmount <= _maxAmount, "Invalid amount range");
    require(bytes(_description).length <= 280, "Description too long");
    
    // Check user limits from hub
    IHub.HubConfig memory config = hub.getConfig();
    require(getUserActiveOffers(msg.sender) < config.maxActiveOffers, 
            "Max active offers reached");
    
    uint256 offerId = nextOfferId++;
    offers[offerId] = OfferData({
        id: offerId,
        owner: msg.sender,
        offerType: _type,
        state: OfferState.Active,
        fiatCurrency: _fiatCurrency,
        tokenAddress: _token,
        minAmount: _minAmount,
        maxAmount: _maxAmount,
        rate: _rate,
        description: _description,
        createdAt: block.timestamp,
        updatedAt: block.timestamp
    });
    
    userOffers[msg.sender].push(offerId);
    
    // Update profile statistics
    IProfile(hub.profileContract()).updateActiveOffers(
        msg.sender, 
        OfferState.Active
    );
    
    emit OfferCreated(offerId, msg.sender);
    return offerId;
}
```

### 3. Trade Contract Translation

**Complex State Management**
```solidity
contract Trade {
    enum TradeState {
        RequestCreated,
        RequestAccepted,
        EscrowFunded,
        FiatDeposited,
        EscrowReleased,
        EscrowCancelled,
        EscrowRefunded,
        EscrowDisputed,
        DisputeResolved
    }
    
    struct TradeData {
        uint256 id;
        uint256 offerId;
        address buyer;
        address seller;
        address tokenAddress;
        uint256 amount;
        uint256 fiatAmount;
        string fiatCurrency;
        uint256 rate;
        TradeState state;
        uint256 createdAt;
        uint256 expiresAt;
        uint256 disputeDeadline;
        address arbitrator;
        string buyerContact;
        string sellerContact;
    }
    
    mapping(uint256 => TradeData) public trades;
    mapping(address => mapping(string => address[])) public arbitrators;
    uint256 public nextTradeId;
    
    // Escrow management
    mapping(uint256 => uint256) public escrowBalances;
}
```

**Escrow Functions**
```solidity
function fundEscrow(uint256 _tradeId, string memory _contact) external payable {
    TradeData storage trade = trades[_tradeId];
    require(trade.state == TradeState.RequestAccepted, "Invalid state");
    require(msg.sender == trade.seller, "Not seller");
    require(block.timestamp < trade.expiresAt, "Trade expired");
    
    if (trade.tokenAddress == address(0)) {
        // Native token (ETH)
        require(msg.value == trade.amount, "Incorrect amount");
        escrowBalances[_tradeId] = msg.value;
    } else {
        // ERC20 token
        IERC20(trade.tokenAddress).transferFrom(
            msg.sender, 
            address(this), 
            trade.amount
        );
        escrowBalances[_tradeId] = trade.amount;
    }
    
    trade.state = TradeState.EscrowFunded;
    trade.sellerContact = _contact;
    
    emit EscrowFunded(_tradeId, trade.amount);
}

function releaseEscrow(uint256 _tradeId) external {
    TradeData storage trade = trades[_tradeId];
    require(trade.state == TradeState.FiatDeposited, "Invalid state");
    require(msg.sender == trade.seller, "Not seller");
    
    uint256 escrowAmount = escrowBalances[_tradeId];
    require(escrowAmount > 0, "No escrow");
    
    // Calculate and distribute fees
    (uint256 buyerAmount, FeeDistribution memory fees) = 
        _calculateFees(escrowAmount);
    
    // Transfer to buyer
    _transfer(trade.tokenAddress, trade.buyer, buyerAmount);
    
    // Distribute fees
    _distributeFees(trade.tokenAddress, fees);
    
    // Update state
    trade.state = TradeState.EscrowReleased;
    escrowBalances[_tradeId] = 0;
    
    // Update profiles
    _updateTradeStatistics(trade.buyer, trade.seller);
    
    emit EscrowReleased(_tradeId, buyerAmount);
}
```

### 4. Profile Contract Translation

```solidity
contract Profile {
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
    
    mapping(address => UserProfile) public profiles;
    IHub public hub;
    
    modifier onlyAuthorizedContract() {
        IHub.HubConfig memory config = hub.getConfig();
        require(
            msg.sender == config.offerContract ||
            msg.sender == config.tradeContract,
            "Unauthorized"
        );
        _;
    }
    
    function updateContact(
        string memory _contact, 
        string memory _publicKey
    ) external {
        UserProfile storage profile = profiles[msg.sender];
        
        if (profile.createdAt == 0) {
            profile.createdAt = block.timestamp;
        }
        
        profile.encryptedContact = _contact;
        profile.publicKey = _publicKey;
        profile.lastActivity = block.timestamp;
        
        emit ProfileUpdated(msg.sender);
    }
}
```

### 5. Price Contract Translation

```solidity
contract PriceOracle {
    struct PriceData {
        uint256 usdPrice; // Price in USD with 8 decimals
        uint256 updatedAt;
    }
    
    mapping(string => PriceData) public fiatPrices;
    mapping(address => address[]) public priceRoutes; // Token -> route
    
    address public priceProvider;
    IHub public hub;
    
    function updatePrices(
        string[] memory currencies,
        uint256[] memory prices
    ) external onlyPriceProvider {
        require(currencies.length == prices.length, "Mismatched arrays");
        
        for (uint i = 0; i < currencies.length; i++) {
            fiatPrices[currencies[i]] = PriceData({
                usdPrice: prices[i],
                updatedAt: block.timestamp
            });
        }
        
        emit PricesUpdated(currencies.length);
    }
    
    function getTokenPriceInFiat(
        address _token,
        string memory _fiatCurrency
    ) external view returns (uint256) {
        // Implementation for price calculation
        // using DEX routes or oracles
    }
}
```

## Technical Implementation Details

### 1. Access Control Pattern

Replace CosmWasm's message-based access control with Solidity modifiers:

```solidity
modifier onlyAdmin() {
    require(msg.sender == admin, "Not admin");
    _;
}

modifier onlyHub() {
    require(msg.sender == address(hub), "Not hub");
    _;
}

modifier requireNotPaused() {
    require(!hub.isPaused(), "System paused");
    _;
}
```

### 2. Error Handling

Transform CosmWasm's Result types to Solidity's require/revert pattern:

```solidity
// Custom errors (Solidity 0.8.4+)
error InvalidAmount(uint256 provided, uint256 required);
error TradeExpired(uint256 tradeId, uint256 expiredAt);
error Unauthorized(address caller, address expected);

// Usage
if (msg.value != requiredAmount) {
    revert InvalidAmount(msg.value, requiredAmount);
}
```

### 3. Event Emission

Replace CosmWasm's attributes with Solidity events:

```solidity
event TradeCreated(
    uint256 indexed tradeId,
    uint256 indexed offerId,
    address indexed buyer,
    uint256 amount
);

event StateTransition(
    uint256 indexed tradeId,
    TradeState from,
    TradeState to,
    uint256 timestamp
);
```

### 4. Upgradability Pattern

Implement proxy pattern for upgradability:

```solidity
// Using OpenZeppelin's upgradeable contracts
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract HubV1 is Initializable, UUPSUpgradeable {
    function initialize(HubConfig memory _config) public initializer {
        __UUPSUpgradeable_init();
        // Initialization logic
    }
    
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyAdmin 
    {}
}
```

### 5. Gas Optimization Strategies

#### Storage Packing
```solidity
struct OptimizedTrade {
    uint128 amount;      // Sufficient for most tokens
    uint128 fiatAmount;
    uint32 createdAt;    // Unix timestamp
    uint32 expiresAt;
    uint8 state;         // Enum can fit in uint8
    address buyer;       // 20 bytes
    address seller;      // 20 bytes
    // Pack efficiently to minimize storage slots
}
```

#### Batch Operations
```solidity
function batchUpdatePrices(
    string[] calldata currencies,
    uint256[] calldata prices
) external onlyPriceProvider {
    // Single transaction for multiple updates
}
```

### 6. Cross-Contract Communication

#### Interface Definition
```solidity
interface IHub {
    struct HubConfig {
        // Config struct definition
    }
    
    function getConfig() external view returns (HubConfig memory);
    function isPaused() external view returns (bool);
}

interface IProfile {
    function updateTradeCount(address user, bool completed) external;
    function getProfile(address user) external view returns (UserProfile memory);
}
```

#### Contract Registry Pattern
```solidity
contract ContractRegistry {
    mapping(bytes32 => address) public contracts;
    
    function getContract(string memory name) 
        public 
        view 
        returns (address) 
    {
        return contracts[keccak256(bytes(name))];
    }
}
```

## Migration Roadmap

### Phase 1: Foundation (Weeks 1-2)
1. **Setup Development Environment**
   - Configure Hardhat/Foundry framework
   - Setup testing infrastructure
   - Configure deployment scripts

2. **Implement Core Contracts**
   - Hub contract with basic configuration
   - Profile contract with user management
   - Basic access control system

### Phase 2: Trading Logic (Weeks 3-4)
1. **Offer Contract**
   - Offer creation and management
   - Query mechanisms
   - Integration with Profile contract

2. **Trade Contract (Basic)**
   - Trade creation and acceptance
   - Basic state transitions
   - Escrow funding mechanism

### Phase 3: Advanced Features (Weeks 5-6)
1. **Trade Contract (Complete)**
   - Fee calculation and distribution
   - Dispute resolution system
   - Arbitrator management

2. **Price Oracle**
   - Price feed integration
   - DEX route configuration
   - Price calculation logic

### Phase 4: Security & Optimization (Weeks 7-8)
1. **Security Hardening**
   - Reentrancy guards
   - Integer overflow protection
   - Access control review

2. **Gas Optimization**
   - Storage optimization
   - Function optimization
   - Batch operation implementation

### Phase 5: Testing & Deployment (Weeks 9-10)
1. **Comprehensive Testing**
   - Unit tests for all contracts
   - Integration testing
   - Stress testing

2. **Deployment Preparation**
   - Mainnet deployment scripts
   - Multi-sig wallet setup
   - Documentation completion

## Testing Strategy

### 1. Unit Testing Framework

```javascript
// Using Hardhat with Chai
describe("Hub Contract", function() {
    let hub, owner, addr1;
    
    beforeEach(async function() {
        const Hub = await ethers.getContractFactory("Hub");
        [owner, addr1] = await ethers.getSigners();
        hub = await Hub.deploy();
        await hub.deployed();
    });
    
    describe("Configuration", function() {
        it("Should set initial config correctly", async function() {
            const config = await hub.getConfig();
            expect(config.admin).to.equal(owner.address);
        });
        
        it("Should validate fee percentages", async function() {
            await expect(
                hub.updateConfig({...defaultConfig, burnFeePct: 11000})
            ).to.be.revertedWith("Total fees exceed 100%");
        });
    });
});
```

### 2. Integration Testing

```javascript
describe("Trading Flow Integration", function() {
    it("Should complete full trade cycle", async function() {
        // 1. Create offer
        const offerId = await offer.createOffer(...);
        
        // 2. Create trade
        const tradeId = await trade.createTrade(offerId, ...);
        
        // 3. Accept and fund
        await trade.acceptRequest(tradeId);
        await trade.fundEscrow(tradeId, {value: amount});
        
        // 4. Complete trade
        await trade.markFiatDeposited(tradeId);
        await trade.releaseEscrow(tradeId);
        
        // Verify final state
        const finalTrade = await trade.getTrade(tradeId);
        expect(finalTrade.state).to.equal(TradeState.EscrowReleased);
    });
});
```

### 3. Security Testing

- **Fuzzing**: Use Echidna or Foundry's fuzzer
- **Static Analysis**: Slither, MythX
- **Formal Verification**: For critical functions
- **Audit Preparation**: Documentation and test coverage

## Security Considerations

### 1. Common Vulnerabilities to Address

#### Reentrancy Protection
```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Trade is ReentrancyGuard {
    function releaseEscrow(uint256 _tradeId) 
        external 
        nonReentrant 
    {
        // Implementation
    }
}
```

#### Integer Overflow/Underflow
```solidity
// Use SafeMath or Solidity 0.8+ built-in overflow checks
function calculateFees(uint256 amount) 
    public 
    pure 
    returns (uint256) 
{
    return (amount * feePercentage) / 10000;
}
```

#### Front-Running Protection
```solidity
// Commit-reveal pattern for sensitive operations
mapping(bytes32 => uint256) private commitments;

function commitTrade(bytes32 _commitment) external {
    commitments[_commitment] = block.timestamp;
}

function revealTrade(
    uint256 _offerId,
    uint256 _amount,
    uint256 _nonce
) external {
    bytes32 commitment = keccak256(
        abi.encodePacked(_offerId, _amount, _nonce, msg.sender)
    );
    require(commitments[commitment] > 0, "Invalid commitment");
    require(
        block.timestamp >= commitments[commitment] + REVEAL_DELAY,
        "Too early"
    );
    // Process trade
}
```

### 2. Access Control Best Practices

```solidity
import "@openzeppelin/contracts/access/AccessControl.sol";

contract Hub is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PRICE_PROVIDER_ROLE = keccak256("PRICE_PROVIDER_ROLE");
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    function updateConfig(HubConfig memory _config) 
        external 
        onlyRole(ADMIN_ROLE) 
    {
        // Implementation
    }
}
```

### 3. Emergency Response Mechanisms

```solidity
contract CircuitBreaker {
    bool public paused;
    uint256 public pausedAt;
    uint256 public constant PAUSE_DURATION = 48 hours;
    
    modifier whenNotPaused() {
        require(!paused || block.timestamp > pausedAt + PAUSE_DURATION, 
                "Paused");
        _;
    }
    
    function emergencyPause() external onlyAdmin {
        paused = true;
        pausedAt = block.timestamp;
        emit EmergencyPause(msg.sender, block.timestamp);
    }
    
    function unpause() external onlyAdmin {
        require(block.timestamp > pausedAt + PAUSE_DURATION, 
                "Wait period not over");
        paused = false;
        emit Unpaused(msg.sender, block.timestamp);
    }
}
```

## Appendix A: Key Differences Summary

| Aspect | CosmWasm | EVM/Solidity |
|--------|----------|--------------|
| **Storage** | Key-value with typed Items/Maps | State variables and mappings |
| **Execution** | Message-based, async | Function calls, sync |
| **Queries** | Separate query entry point | View functions |
| **Responses** | Result<Response, Error> | Revert with reason |
| **Events** | Attributes in Response | Event logs |
| **Upgrades** | Migration entry point | Proxy patterns |
| **Gas** | CosmWasm gas metering | EVM gas model |
| **Cross-contract** | CosmosMsg/SubMsg | Direct calls/interfaces |

## Appendix B: Development Tools & Resources

### Essential Tools
- **Development Framework**: Hardhat or Foundry
- **Testing**: Chai, Waffle, Forge
- **Security**: Slither, Echidna, MythX
- **Documentation**: NatSpec, Docusaurus

### Libraries & Dependencies
```json
{
  "dependencies": {
    "@openzeppelin/contracts": "^5.0.0",
    "@openzeppelin/contracts-upgradeable": "^5.0.0",
    "@chainlink/contracts": "^0.8.0"
  },
  "devDependencies": {
    "hardhat": "^2.19.0",
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "ethers": "^6.9.0"
  }
}
```

### Audit Checklist
- [ ] All functions have appropriate access control
- [ ] Reentrancy guards on state-changing functions
- [ ] Integer overflow protection
- [ ] No unbounded loops
- [ ] Proper event emission
- [ ] Emergency pause mechanism
- [ ] Upgrade authorization controls
- [ ] Input validation on all external functions
- [ ] Gas optimization review
- [ ] Documentation completeness

## Conclusion

This translation guide provides a comprehensive roadmap for migrating the LocalMoney protocol from CosmWasm to EVM. The key to successful translation lies in:

1. **Maintaining functional parity** while leveraging Solidity-specific optimizations
2. **Implementing robust security measures** appropriate for the EVM environment
3. **Optimizing for gas efficiency** without compromising functionality
4. **Ensuring upgradability** for future improvements
5. **Comprehensive testing** at every stage

The modular architecture of LocalMoney translates well to the EVM model, and with careful implementation following this guide, the protocol can achieve the same level of functionality and security on EVM-compatible chains.