name: "EVM Translation Phase 4: Advanced Features & Price Oracle"
description: |

## Purpose
Complete the LocalMoney EVM protocol with advanced features including dispute resolution, arbitration system, price oracle integration, and sophisticated fee distribution. This phase adds the complex governance and pricing mechanisms that make the protocol fully functional for production use.

## Core Principles
1. **Fair Dispute Resolution**: Neutral arbitration system
2. **Price Accuracy**: Reliable oracle for fiat/crypto rates
3. **Fee Distribution**: Complex multi-recipient fee handling
4. **Random Selection**: Fair arbitrator assignment
5. **Incentive Alignment**: Proper rewards for arbitrators

---

## Goal
Implement dispute resolution system with arbitrator management, price oracle for accurate fiat conversions, and complete fee distribution including burn mechanisms, creating a production-ready P2P trading protocol.

## Why
- **Trust Building**: Dispute resolution ensures fairness
- **Price Discovery**: Accurate pricing for trades
- **Tokenomics**: Fee burning creates value
- **Decentralization**: Community arbitrators
- **Compliance**: Proper dispute handling

## What
Complete implementation including:
- **Dispute System**: Full dispute lifecycle in Trade contract
- **Arbitrator Registry**: Management and selection system
- **Price Oracle**: Fiat price feeds and DEX integration
- **Fee Distribution**: Multi-path fee handling with burns
- **Random Selection**: VRF for arbitrator assignment
- **Circuit Breaker**: Emergency pause mechanisms
- **Advanced Queries**: Complex filtering and analytics

### Success Criteria
- [ ] Disputes can be initiated and resolved
- [ ] Arbitrators selected randomly from pool
- [ ] Price oracle provides accurate rates
- [ ] Fees distribute to multiple recipients
- [ ] Burn mechanism works for LOCAL token
- [ ] Circuit breaker can pause operations
- [ ] All integration points work
- [ ] Test coverage > 90%

## All Needed Context

### Critical Documentation Sources
```yaml
# CHAINLINK VRF
vrf_v2: https://docs.chain.link/vrf/v2/introduction
vrf_implementation: https://docs.chain.link/vrf/v2/direct-funding/examples/get-a-random-number

# PRICE FEEDS
chainlink_feeds: https://docs.chain.link/data-feeds/price-feeds
uniswap_v3_oracle: https://docs.uniswap.org/contracts/v3/guides/oracle

# TOKEN BURNING
burn_mechanisms: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20Burnable

# CIRCUIT BREAKER
pausable: https://docs.openzeppelin.com/contracts/5.x/api/security#Pausable
```

### Reference Files to Analyze
```yaml
# COSMWASM DISPUTE IMPLEMENTATION
trade_contract: contracts/cosmwasm/contracts/trade/src/contract.rs (dispute functions)

# EXISTING EVM CONTRACTS
hub_contract: contracts/evm/contracts/Hub.sol
trade_contract: contracts/evm/contracts/Trade.sol

# TRANSLATION GUIDE
guide: COSMWASM_TO_EVM_TRANSLATION_GUIDE.md (lines 393-431, 777-803)
```

### Implementation Blueprint

#### 1. Enhanced Trade Contract - Dispute Functions
```solidity
// Extend Trade.sol from Phase 3
contract Trade {
    // Additional storage for disputes
    mapping(address => mapping(string => address[])) public arbitratorsByFiat;
    mapping(address => ArbitratorInfo) public arbitratorInfo;
    mapping(uint256 => DisputeInfo) public disputes;
    
    struct ArbitratorInfo {
        bool isActive;
        string[] supportedFiats;
        string encryptionKey;
        uint256 disputesHandled;
        uint256 disputesWon;
    }
    
    struct DisputeInfo {
        uint256 tradeId;
        address initiator;
        uint256 initiatedAt;
        address arbitrator;
        string buyerEvidence;
        string sellerEvidence;
        address winner;
        uint256 resolvedAt;
    }
    
    // Dispute functions
    function initiateDispute(
        uint256 _tradeId,
        string memory _buyerContact,
        string memory _sellerContact
    ) external nonReentrant;
    
    function submitEvidence(
        uint256 _tradeId,
        string memory _evidence
    ) external;
    
    function resolveDispute(
        uint256 _tradeId,
        address _winner
    ) external nonReentrant;
    
    // Arbitrator management
    function registerArbitrator(
        string memory _fiatCurrency,
        string memory _encryptionKey
    ) external;
    
    function removeArbitrator(
        string memory _fiatCurrency
    ) external;
}
```

#### 2. Price Oracle Contract
```solidity
// Based on COSMWASM_TO_EVM_TRANSLATION_GUIDE.md lines 395-431
contract PriceOracle is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    using AggregatorV3Interface for address;
    
    struct PriceData {
        uint256 usdPrice;      // 8 decimals
        uint256 updatedAt;
        address source;        // Chainlink feed or DEX
    }
    
    struct PriceRoute {
        address[] path;        // Token swap path
        uint24[] fees;         // Uniswap V3 fee tiers
        bool useChainlink;     // Primary source
        address chainlinkFeed;
    }
    
    // Fiat currency prices in USD
    mapping(string => PriceData) public fiatPrices;
    
    // Token to USD price routes
    mapping(address => PriceRoute) public tokenPriceRoutes;
    
    // Chainlink price feeds
    mapping(string => address) public chainlinkFeeds;
    
    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER");
    
    function updateFiatPrices(
        string[] memory _currencies,
        uint256[] memory _prices
    ) external onlyRole(PRICE_UPDATER_ROLE);
    
    function getTokenPriceInFiat(
        address _token,
        string memory _fiatCurrency,
        uint256 _amount
    ) external view returns (uint256);
    
    function registerPriceRoute(
        address _token,
        address[] memory _path,
        uint24[] memory _fees,
        address _chainlinkFeed
    ) external onlyRole(DEFAULT_ADMIN_ROLE);
    
    // Chainlink integration
    function getLatestPrice(address _feed) public view returns (uint256) {
        (
            uint80 roundId,
            int256 price,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = AggregatorV3Interface(_feed).latestRoundData();
        
        require(price > 0, "Invalid price");
        require(updatedAt > block.timestamp - 3600, "Stale price");
        
        return uint256(price);
    }
}
```

#### 3. Enhanced Fee Distribution
```solidity
// Fee distribution logic in Trade contract
function _distributeFees(
    address _token,
    uint256 _totalAmount
) private returns (uint256 remaining) {
    IHub.HubConfig memory config = hub.getConfig();
    
    // Calculate individual fees
    uint256 burnFee = (_totalAmount * config.burnFeePct) / 10000;
    uint256 chainFee = (_totalAmount * config.chainFeePct) / 10000;
    uint256 warchestFee = (_totalAmount * config.warchestFeePct) / 10000;
    
    // Burn fee - swap to LOCAL and burn
    if (burnFee > 0 && config.localTokenAddress != address(0)) {
        _swapAndBurn(_token, burnFee, config.localTokenAddress);
    }
    
    // Chain fee to designated collector
    if (chainFee > 0) {
        _transfer(_token, config.chainFeeCollector, chainFee);
    }
    
    // Warchest fee
    if (warchestFee > 0) {
        _transfer(_token, config.warchestAddress, warchestFee);
    }
    
    remaining = _totalAmount - burnFee - chainFee - warchestFee;
}

function _swapAndBurn(
    address _fromToken,
    uint256 _amount,
    address _localToken
) private {
    // Use Uniswap V3 to swap to LOCAL token
    ISwapRouter swapRouter = ISwapRouter(hub.getSwapRouter());
    
    if (_fromToken != _localToken) {
        // Approve and swap
        IERC20(_fromToken).approve(address(swapRouter), _amount);
        
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: _fromToken,
                tokenOut: _localToken,
                fee: 3000, // 0.3% fee tier
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: _amount,
                amountOutMinimum: 0, // Accept any amount
                sqrtPriceLimitX96: 0
            });
        
        uint256 amountOut = swapRouter.exactInputSingle(params);
        
        // Burn the LOCAL tokens
        ILocalToken(_localToken).burn(amountOut);
    } else {
        // Already LOCAL token, just burn
        ILocalToken(_localToken).burn(_amount);
    }
}
```

#### 4. Arbitrator Selection with VRF
```solidity
// Chainlink VRF integration for random selection
contract Trade is VRFConsumerBaseV2 {
    VRFCoordinatorV2Interface COORDINATOR;
    
    struct VRFRequest {
        uint256 tradeId;
        string fiatCurrency;
    }
    
    mapping(uint256 => VRFRequest) public vrfRequests; // requestId => request
    
    uint64 s_subscriptionId;
    bytes32 keyHash;
    uint32 callbackGasLimit = 100000;
    uint16 requestConfirmations = 3;
    uint32 numWords = 1;
    
    function _requestRandomArbitrator(
        uint256 _tradeId,
        string memory _fiatCurrency
    ) private {
        uint256 requestId = COORDINATOR.requestRandomWords(
            keyHash,
            s_subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        
        vrfRequests[requestId] = VRFRequest(_tradeId, _fiatCurrency);
    }
    
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) internal override {
        VRFRequest memory request = vrfRequests[requestId];
        address[] memory arbitrators = arbitratorsByFiat[request.fiatCurrency];
        
        require(arbitrators.length > 0, "No arbitrators available");
        
        // Select random arbitrator
        uint256 index = randomWords[0] % arbitrators.length;
        address selectedArbitrator = arbitrators[index];
        
        // Assign to trade
        trades[request.tradeId].arbitrator = selectedArbitrator;
        disputes[request.tradeId].arbitrator = selectedArbitrator;
        
        emit ArbitratorAssigned(request.tradeId, selectedArbitrator);
    }
}
```

#### 5. Circuit Breaker Implementation
```solidity
// Enhanced Hub contract with circuit breaker
contract Hub is Pausable {
    mapping(bytes32 => bool) public operationPaused;
    
    bytes32 public constant OP_CREATE_OFFER = keccak256("CREATE_OFFER");
    bytes32 public constant OP_CREATE_TRADE = keccak256("CREATE_TRADE");
    bytes32 public constant OP_FUND_ESCROW = keccak256("FUND_ESCROW");
    bytes32 public constant OP_RELEASE_ESCROW = keccak256("RELEASE_ESCROW");
    
    function pauseOperation(bytes32 _operation) external onlyRole(EMERGENCY_ROLE) {
        operationPaused[_operation] = true;
        emit OperationPaused(_operation);
    }
    
    function unpauseOperation(bytes32 _operation) external onlyRole(DEFAULT_ADMIN_ROLE) {
        operationPaused[_operation] = false;
        emit OperationUnpaused(_operation);
    }
    
    function emergencyPause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }
    
    modifier whenOperationNotPaused(bytes32 _operation) {
        require(!operationPaused[_operation], "Operation paused");
        require(!paused(), "Contract paused");
        _;
    }
}
```

## Tasks Implementation Order

1. **Price Oracle Setup** (2 hours)
   - Create PriceOracle contract
   - Integrate Chainlink feeds
   - Implement Uniswap V3 TWAP
   - Price route configuration
   - Fiat price updates

2. **Dispute System** (2.5 hours)
   - Extend Trade contract
   - Dispute initiation logic
   - Evidence submission
   - Arbitrator assignment
   - Resolution mechanism
   - Fee distribution

3. **Arbitrator Management** (1.5 hours)
   - Registration system
   - Multi-fiat support
   - Reputation tracking
   - Random selection
   - VRF integration

4. **Advanced Fee Distribution** (1.5 hours)
   - Multi-recipient distribution
   - Token swapping logic
   - Burn mechanism
   - LOCAL token integration
   - Fee calculation updates

5. **Circuit Breaker** (1 hour)
   - Pausable operations
   - Emergency controls
   - Granular pausing
   - Role management

6. **Integration & Testing** (3 hours)
   - Full dispute flow tests
   - Price oracle accuracy
   - Fee distribution verification
   - VRF mock testing
   - Circuit breaker scenarios

## Validation Gates

```bash
# Compile all contracts
npx hardhat compile

# Test dispute resolution
npx hardhat test test/DisputeResolution.test.js

# Test price oracle
npx hardhat test test/PriceOracle.test.js

# Test VRF arbitrator selection
npx hardhat test test/ArbitratorSelection.test.js

# Test fee distribution and burning
npx hardhat test test/FeeDistribution.test.js

# Circuit breaker tests
npx hardhat test test/CircuitBreaker.test.js

# Full integration test
npx hardhat test test/integration/CompleteProtocol.test.js

# Gas profiling for complex operations
REPORT_GAS=true npx hardhat test

# Fork testing with mainnet
npx hardhat test --network hardhat-fork test/ForkTests.test.js

# Coverage report
npx hardhat coverage
```

## Test Scenarios

1. **Dispute Resolution**
   - Initiate dispute at correct state
   - Random arbitrator selection
   - Evidence submission
   - Resolution and fee distribution
   - Invalid state attempts

2. **Price Oracle**
   - Chainlink feed integration
   - Uniswap TWAP calculation
   - Stale price handling
   - Multiple token routes

3. **Fee Scenarios**
   - Correct percentage calculations
   - Multi-recipient distribution
   - Token swapping
   - Burn verification

4. **Circuit Breaker**
   - Individual operation pausing
   - Global pause
   - Resume functionality
   - Role-based access

## Common Pitfalls to Avoid

1. **VRF Subscription**: Ensure funded Chainlink VRF subscription
2. **Price Staleness**: Check oracle freshness
3. **Arbitrator Availability**: Handle empty arbitrator pools
4. **Reentrancy in Disputes**: Careful with external calls
5. **Fee Precision**: Use basis points correctly

## Migration Notes from CosmWasm

Key differences:
- Replace custom random with Chainlink VRF
- No native IBC - use bridge protocols
- Oracle integration differs significantly
- Burn mechanism requires token approval
- Event logging more verbose than attributes

## External Dependencies

```json
{
  "additional_dependencies": {
    "@chainlink/contracts": "^0.8.0",
    "@uniswap/v3-periphery": "^1.4.3",
    "@uniswap/v3-core": "^1.0.1"
  }
}
```

## Confidence Score: 8/10

This PRP completes the protocol with production-ready features. The dispute system and price oracle are well-defined with clear integration points. VRF and Chainlink integration add complexity but ensure fairness and accuracy. Testing is comprehensive but mainnet fork testing is essential.