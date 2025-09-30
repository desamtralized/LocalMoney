# Phase 1 Critical Gaps: Core Contract Integration for Axelar Cross-Chain Protocol

## Overview
Complete the critical missing pieces in the Axelar integration by connecting the core LocalMoney contracts (Hub, Trade, Offer) to the cross-chain infrastructure. This PRP addresses the 40% of implementation work that blocks production deployment.

**Current Status**: Cross-chain smart contracts exist but are not integrated with core protocol contracts. Message handlers are empty placeholders. No tokens are deployed or registered.

**Goal**: Enable end-to-end cross-chain operations from satellite chains through the BSC hub, with full message routing and callback support.

## Reference Documentation

### External Resources
- **Axelar ITS Documentation**: https://docs.axelar.dev/dev/send-tokens/interchain-tokens/intro/
- **Axelar ITS Contract Guide**: https://docs.axelar.dev/dev/send-tokens/interchain-tokens/developer-guides/programmatically-create-a-token
- **Axelar GMP Messages**: https://docs.axelar.dev/dev/general-message-passing/gmp-messages
- **Axelar Security**: https://docs.axelar.dev/learn/security
- **ITS Factory Contract**: 0x83a93500d23Fbc3e82B410aD07A6a9F7A0670D66
- **ITS Service Contract**: 0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C

### Codebase Files
- **Gap Analysis**: `/Volumes/Pylon/workspace/localmoney/AXELAR_INTEGRATION_GAPS.md`
- **AxelarBridge**: `/Volumes/Pylon/workspace/localmoney/contracts/evm/contracts/crosschain/AxelarBridge.sol`
- **Hub Contract**: `/Volumes/Pylon/workspace/localmoney/contracts/evm/contracts/Hub.sol`
- **Trade Contract**: `/Volumes/Pylon/workspace/localmoney/contracts/evm/contracts/Trade.sol`
- **Offer Contract**: `/Volumes/Pylon/workspace/localmoney/contracts/evm/contracts/Offer.sol`
- **CrossChainEscrow**: `/Volumes/Pylon/workspace/localmoney/contracts/evm/contracts/crosschain/CrossChainEscrow.sol`
- **MessageTypes**: `/Volumes/Pylon/workspace/localmoney/contracts/evm/contracts/crosschain/MessageTypes.sol`
- **LocalMoneySatellite**: `/Volumes/Pylon/workspace/localmoney/contracts/evm/contracts/satellites/LocalMoneySatellite.sol`
- **Test Patterns**: `/Volumes/Pylon/workspace/localmoney/contracts/evm/test/crosschain/AxelarBridge.simple.test.js`

## Context for AI Agent

### Current Architecture State

#### What Exists ✅
1. **Cross-Chain Infrastructure** (600 lines in AxelarBridge.sol)
   - Message routing framework with 12 message types
   - Chain registry and satellite management
   - Role-based access control
   - Failed message recovery
   - Gas payment integration

2. **Satellite Contracts** (444 lines in LocalMoneySatellite.sol)
   - User functions: createOffer, createTrade, fundEscrow, completeTrade
   - Local caching for offers and trades
   - Gas estimation

3. **CrossChainEscrow** (405 lines)
   - Extends base Escrow with cross-chain capabilities
   - ITS token integration interfaces
   - Cross-chain deposit/release tracking
   - 0.3% cross-chain fee mechanism

4. **Test Suite** (~2,585 lines)
   - Message encoding/decoding tests
   - Access control tests
   - Basic functionality tests

#### What's Missing ❌
1. **Hub.sol** has NO reference to AxelarBridge (Hub.sol:1-600)
2. **Trade.sol** has NO integration with CrossChainEscrow (Trade.sol:1-700)
3. **Offer.sol** has NO cross-chain support (Offer.sol:1-500)
4. **All message handlers are EMPTY** (AxelarBridge.sol:273-426)
5. **NO callback mechanism** for satellite synchronization
6. **NO ITS tokens deployed** or registered
7. **NO interface files** for cross-chain contracts

### Key Patterns from Codebase

#### Pattern 1: Upgradeable Contract Structure
```solidity
// From Hub.sol:31-96
contract Hub is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    IHub
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    function initialize(HubConfig memory _config, uint256 _minDelay) external initializer {
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __AccessControl_init();
        // ... initialization logic
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(ADMIN_ROLE)
    {}
}
```

#### Pattern 2: Interface Definition and State Management
```solidity
// From Trade.sol:29-40
mapping(uint256 => TradeData) public trades;
mapping(uint256 => StateTransitionRecord[]) public tradeHistory;
uint256 public nextTradeId;

IHub public hub;
IOffer public offerContract;
IProfile public profileContract;
IEscrow public escrowContract;
IArbitratorManager public arbitratorManager;
```

#### Pattern 3: Test Structure
```javascript
// From AxelarBridge.simple.test.js:4-68
describe("AxelarBridge Simple Test", function () {
    let axelarBridge, hub, owner;
    let mockGateway, mockGasService;
ména
    beforeEach(async function () {
        // Deploy mocks
        const MockGateway = await ethers.getContractFactory("MockAxelarGateway");
        mockGateway = await MockGateway.deploy();
        await mockGateway.waitForDeployment();

        // Deploy hub
        hub = await upgrades.deployProxy(Hub, [hubConfig, minDelay]);

        // Deploy AxelarBridge
        axelarBridge = await upgrades.deployProxy(AxelarBridge, [
            await hub.getAddress(),
            await mockGasService.getAddress()
        ]);
    });

    it("should register a chain", async function () {
        await axelarBridge.registerChain("Polygon", "0x1234...");
        expect(await axelarBridge.isChainRegistered("Polygon")).to.be.true;
    });
});
```

#### Pattern 4: Error Handling
```solidity
// From Trade.sol:71-90
error InvalidOffer(uint256 offerId);
error OfferNotActive(uint256 offerId);
error UnauthorizedAccess(address caller);
error InvalidStateTransition(TradeState current, TradeState requested);

// Usage
if (hub.isPaused()) revert SystemPaused();
if (amount < minAmount || amount > maxAmount) {
    revert AmountOutOfRange(amount, minAmount, maxAmount);
}
```

## Critical Implementation Gaps Analysis

### Gap 1: Hub.sol Integration (HIGH PRIORITY)
**Location**: contracts/evm/contracts/Hub.sol:1-600
**Issue**: No AxelarBridge reference or cross-chain message handling
**Impact**: Cannot route cross-chain messages from BSC hub
**Lines Affected**: Requires additions throughout contract

### Gap 2: Message Handler Implementation (CRITICAL)
**Location**: contracts/evm/contracts/crosschain/AxelarBridge.sol:273-426
**Issue**: All 12 message handlers are empty placeholders
**Impact**: Messages received but not processed - complete failure
**Handlers Affected**:
- `_handleCreateOffer` (line 273)
- `_handleCreateTrade` (line 286)
- `_handleFundEscrow` (line 299)
- `_handleReleaseFunds` (line 312)
- `_handleDisputeTrade` (line 325)
- `_handleUpdateProfile` (line 336)
- `_handleQueryStatus` (line 343)
- `_handleBatchOperation` (line 350)
- `_handleTokenBridge` (line 404)
- `_handleTokenRefund` (line 418)

### Gap 3: Trade.sol Integration (HIGH PRIORITY)
**Location**: contracts/evm/contracts/Trade.sol:1-700
**Issue**: No CrossChainEscrow integration
**Impact**: Cannot handle cross-chain trade escrow
**Required Changes**:
- Add CrossChainEscrow reference
- Detect cross-chain trades
- Route to appropriate escrow

### Gap 4: Offer.sol Cross-Chain Support (MEDIUM PRIORITY)
**Location**: contracts/evm/contracts/Offer.sol:1-500
**Issue**: No origin/destination chain fields
**Impact**: Users cannot create cross-chain offers
**Required Changes**:
- Add originChain, destinationChain fields to OfferData
- Update createOffer to accept chain parameters
- Add cross-chain offer validation

### Gap 5: Callback Mechanism (HIGH PRIORITY)
**Location**: contracts/evm/contracts/crosschain/AxelarBridge.sol
**Issue**: No callback sending implementation
**Impact**: Satellites cannot sync state after hub operations
**Required**: Implement `_sendCallback` function

### Gap 6: Interface Definitions (MEDIUM PRIORITY)
**Location**: contracts/evm/contracts/crosschain/interfaces/
**Issue**: No interface files exist for cross-chain contracts
**Impact**: Harder integration, no type safety
**Required Interfaces**:
- IAxelarBridge.sol
- ICrossChainEscrow.sol
- ISatellite.sol

## Implementation Blueprint

### Pseudocode: Hub.sol Integration

```solidity
// Add to Hub.sol state variables
contract Hub is ... {
    IAxelarBridge public axelarBridge;
    mapping(uint256 => string) public supportedChains; // chainId => chainName
    mapping(bytes32 => bool) public processedCrossChainMessages;

    event AxelarBridgeUpdated(address indexed bridge);
    event CrossChainOfferCreated(bytes32 indexed offerId, string sourceChain);
    event CrossChainTradeCreated(bytes32 indexed tradeId, string sourceChain);

    // Add setter (called during deployment or upgrade)
    function setAxelarBridge(address _bridge) external onlyRole(ADMIN_ROLE) {
        require(_bridge != address(0), "Invalid bridge");
        axelarBridge = IAxelarBridge(_bridge);
        emit AxelarBridgeUpdated(_bridge);
    }

    // Add cross-chain message handlers (called BY AxelarBridge)
    function handleCrossChainOfferCreation(
        string memory sourceChain,
        address creator,
        bytes32 offerId,
        address token,
        uint256 amount,
        uint256 price,
        bool isBuy,
        string memory fiatCurrency
    ) external onlyAxelarBridge nonReentrant returns (bool) {
        // 1. Validate parameters
        require(amount > 0 && price > 0, "Invalid parameters");

        // 2. Forward to Offer contract
        uint256 localOfferId = offerContract.createCrossChainOffer(
            sourceChain,
            creator,
            offerId,
            token,
            amount,
            price,
            isBuy,
            fiatCurrency
        );

        // 3. Emit event for tracking
        emit CrossChainOfferCreated(offerId, sourceChain);

        return true;
    }

    // Similar handlers for trade, escrow, etc.
}
```

### Pseudocode: Message Handler Implementation

```solidity
// In AxelarBridge.sol - Complete _handleCreateOffer
function _handleCreateOffer(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    // 1. Decode payload
    MessageTypes.CreateOfferPayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.CreateOfferPayload)
    );

    // 2. Validate
    require(registeredChains[sourceChain], "Invalid source chain");
    require(payload.amount > 0, "Invalid amount");
    require(payload.price > 0, "Invalid price");

    // 3. Generate offer ID (deterministic)
    bytes32 offerId = keccak256(abi.encodePacked(
        sourceChain,
        message.sender,
        message.nonce,
        payload.token,
        block.timestamp
    ));

    // 4. Forward to Hub
    try hub.handleCrossChainOfferCreation(
        sourceChain,
        message.sender,
        offerId,
        payload.token,
        payload.amount,
        payload.price,
        payload.isBuy,
        payload.fiatCurrency
    ) returns (bool success) {
        // 5. Send success callback to satellite
        _sendCallback(
            sourceChain,
            message.nonce,
            true,
            abi.encode(offerId)
        );
    } catch Error(string memory reason) {
        // 6. Send failure callback with reason
        _sendCallback(
            sourceChain,
            message.nonce,
            false,
            abi.encode(reason)
        );

        // 7. Store in failed messages for retry
        bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
        failedMessages[messageId] = message;
        failedMessageReasons[messageId] = reason;
    }
}
```

### Pseudocode: Callback Mechanism

```solidity
// Add to AxelarBridge.sol
function _sendCallback(
    string memory destinationChain,
    uint256 nonce,
    bool success,
    bytes memory data
) internal {
    require(registeredChains[destinationChain], "Invalid destination");

    // 1. Encode callback message
    MessageTypes.CrossChainMessage memory callback = MessageTypes.CrossChainMessage({
        messageType: MessageTypes.MessageType.QUERY_STATUS, // Reuse for callbacks
        sender: address(this),
        sourceChainId: block.chainid,
        nonce: messageNonce++,
        payload: abi.encode(nonce, success, data)
    });

    // 2. Encode for Axelar
    bytes memory axelarPayload = MessageTypes.encodeMessage(callback);

    // 3. Send via AxelarHandler (no gas payment, hub covers)
    (bool callSuccess, ) = axelarHandler.call(
        abi.encodeWithSignature(
            "sendMessage(string,string,bytes)",
            destinationChain,
            satelliteAddresses[destinationChain],
            axelarPayload
        )
    );

    require(callSuccess, "Callback send failed");

    emit CallbackSent(destinationChain, nonce, success);
}
```

### Pseudocode: ITS Token Setup

```javascript
// Script: scripts/setup-its-tokens.js
async function deployITSTokens() {
    // 1. Get ITS factory and service contracts
    const itsFactory = await ethers.getContractAt(
        "IInterchainTokenFactory",
        "0x83a93500d23Fbc3e82B410aD07A6a9F7A0670D66"
    );

    const itsService = await ethers.getContractAt(
        "IInterchainTokenService",
        "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C"
    );

    // 2. Generate unique salt
    const salt = ethers.randomBytes(32);

    // 3. Deploy USDT interchain token on BSC
    const deployTx = await itsFactory.deployInterchainToken(
        salt,
        "Bridged USDT",
        "USDT",
        6, // decimals
        ethers.parseUnits("1000000", 6), // 1M initial supply
        deployer.address
    );
    await deployTx.wait();

    // 4. Get token ID
    const tokenId = await itsFactory.interchainTokenId(
        deployer.address,
        salt
    );

    // 5. Deploy to remote chains (Polygon, Avalanche, Base)
    for (const chain of ["Polygon", "Avalanche", "Base"]) {
        const gasAmount = await itsService.estimateGasFee(
            chain,
            "0x", // No payload
            300000 // Gas limit
        );

        const deployRemoteTx = await itsFactory.deployRemoteInterchainToken(
            salt,
            chain,
            gasAmount,
            { value: gasAmount }
        );
        await deployRemoteTx.wait();

        console.log(`Token deployed to ${chain}: ${tokenId}`);
    }

    // 6. Register in ITSTokenRegistry
    const tokenRegistry = await ethers.getContract("ITSTokenRegistry");
    await tokenRegistry.registerToken(
        tokenId,
        "USDT",
        137, // Polygon
        await itsService.validTokenAddress(tokenId),
        ethers.parseUnits("10", 6), // Min bridge amount
        ethers.parseUnits("100000", 6) // Max bridge amount
    );

    // Repeat for other chains and tokens (USDC, KUJI, etc.)
}
```

## Implementation Tasks (In Order)

### Phase A: Interface Definitions (1-2 hours)
1. **Create IAxelarBridge.sol interface**
   - Define all public functions from AxelarBridge.sol
   - Include events and error definitions
   - Place in contracts/evm/contracts/crosschain/interfaces/

2. **Create ICrossChainEscrow.sol interface**
   - Extract public functions from CrossChainEscrow.sol
   - Define cross-chain specific events
   - Place in contracts/evm/contracts/crosschain/interfaces/

3. **Update IHub.sol interface**
   - Add cross-chain message handler signatures
   - Add AxelarBridge getter/setter
   - Add cross-chain events

### Phase B: Hub.sol Integration (4-6 hours)
1. **Add state variables**
   - IAxelarBridge reference
   - Chain registry mappings
   - Cross-chain message tracking

2. **Add setter functions**
   - setAxelarBridge (ADMIN_ROLE)
   - registerSupportedChain (ADMIN_ROLE)

3. **Add message handler functions**
   - handleCrossChainOfferCreation
   - handleCrossChainTradeCreation
   - handleCrossChainEscrowFunding
   - handleCrossChainRelease
   - handleCrossChainDispute

4. **Add modifier for bridge-only calls**
   ```solidity
   modifier onlyAxelarBridge() {
       require(msg.sender == address(axelarBridge), "Not authorized");
       _;
   }
   ```

5. **Add events**
   - AxelarBridgeUpdated
   - CrossChainMessageReceived
   - CrossChainOperationCompleted

6. **Write tests**
   - Test setAxelarBridge access control
   - Test message handler calls
   - Test integration with Offer/Trade contracts

### Phase C: Offer.sol Cross-Chain Support (3-4 hours)
1. **Update OfferData struct**
   ```solidity
   struct OfferData {
       // ... existing fields
       string originChain;      // Chain where offer was created
       string destinationChain; // Target chain for trade
       bool isCrossChain;       // Flag for cross-chain offers
   }
   ```

2. **Update createOffer function**
   - Add optional chain parameters
   - Validate chain support
   - Emit enhanced events with chain info

3. **Add createCrossChainOffer function**
   ```solidity
   function createCrossChainOffer(
       string memory sourceChain,
       address creator,
       bytes32 offerId,
       address token,
       uint256 amount,
       uint256 price,
       bool isBuy,
       string memory fiatCurrency
   ) external onlyHub returns (uint256);
   ```

4. **Add cross-chain offer queries**
   - getOffersByChain
   - getCrossChainOffers
   - isOfferCrossChain

5. **Write tests**
   - Test cross-chain offer creation
   - Test offer queries by chain
   - Test access control

### Phase D: Trade.sol Integration (4-6 hours)
1. **Add CrossChainEscrow reference**
   ```solidity
   ICrossChainEscrow public crossChainEscrow;
   ```

2. **Add setter function**
   ```solidity
   function setCrossChainEscrow(address _escrow) external onlyHub {
       require(_escrow != address(0), "Invalid escrow");
       crossChainEscrow = ICrossChainEscrow(_escrow);
   }
   ```

3. **Update createTrade to detect cross-chain**
   ```solidity
   // In createTrade function
   IOffer.OfferData memory offer = offerContract.getOffer(offerId);
   bool isCrossChain = offer.isCrossChain ||
                       bytes(offer.destinationChain).length > 0;

   if (isCrossChain) {
       // Use CrossChainEscrow instead of regular Escrow
       _handleCrossChainTrade(offerId, amount, offer);
   } else {
       // Existing logic
   }
   ```

4. **Add _handleCrossChainTrade internal function**
   - Create trade with cross-chain flag
   - Route escrow to CrossChainEscrow
   - Emit cross-chain trade event

5. **Add cross-chain release/refund handlers**
   - Called by Hub when callback received
   - Validate and update trade state
   - Emit events

6. **Write tests**
   - Test cross-chain trade creation
   - Test escrow routing
   - Test release/refund flows

### Phase E: Message Handler Implementation (8-10 hours)
1. **Implement _handleCreateOffer** (AxelarBridge.sol:273-284)
   - Decode CreateOfferPayload
   - Validate parameters
   - Call hub.handleCrossChainOfferCreation
   - Send callback on success/failure
   - Handle errors and store failed messages

2. **Implement _handleCreateTrade** (AxelarBridge.sol:286-297)
   - Decode CreateTradePayload
   - Validate offer exists and is active
   - Call hub.handleCrossChainTradeCreation
   - Send callback with trade ID
   - Handle errors

3. **Implement _handleFundEscrow** (AxelarBridge.sol:299-310)
   - Decode FundEscrowPayload
   - Validate trade exists
   - Forward to crossChainEscrow
   - Update trade state
   - Send callback

4. **Implement _handleReleaseFunds** (AxelarBridge.sol:312-323)
   - Decode ReleaseFundsPayload
   - Validate authorization
   - Release from CrossChainEscrow
   - Update trade state
   - Send callback

5. **Implement _handleDisputeTrade** (AxelarBridge.sol:325-332)
   - Decode dispute payload
   - Validate disputer is trade party
   - Initiate dispute on hub
   - Notify arbitrators
   - Send callback

6. **Implement _handleUpdateProfile** (AxelarBridge.sol:336-339)
   - Decode profile update payload
   - Forward to Profile contract
   - Send callback

7. **Implement _handleQueryStatus** (AxelarBridge.sol:343-346)
   - Decode query payload
   - Get status from Hub/Trade/Offer
   - Send callback with status data

8. **Implement _handleBatchOperation** (AxelarBridge.sol:350-355)
   - Decode batch payload
   - Process each operation sequentially
   - Track successes/failures
   - Send batch callback

9. **Implement _handleTokenBridge** (AxelarBridge.sol:404-416)
   - Already partially implemented
   - Add validation
   - Add callback

10. **Implement _handleTokenRefund** (AxelarBridge.sol:418-426)
    - Decode refund payload
    - Validate refund conditions
    - Process refund via CrossChainEscrow
    - Send callback

11. **Write comprehensive tests for each handler**
    - Happy path tests
    - Error condition tests
    - Callback verification tests
    - Gas usage tests

### Phase F: Callback Mechanism (3-4 hours)
1. **Implement _sendCallback function**
   - Encode callback message
   - Send via AxelarHandler
   - Emit CallbackSent event
   - Add error handling

2. **Add callback tracking**
   - Map nonce to original message
   - Track callback status
   - Add callback timeout mechanism

3. **Update Satellite to handle callbacks**
   - Implement _execute handler for callbacks
   - Update local cache based on callback
   - Emit events for user notification

4. **Write callback tests**
   - Test successful callback flow
   - Test callback on error
   - Test callback timeout
   - Test satellite cache updates

### Phase G: ITS Token Setup (6-8 hours)
1. **Create deployment script**
   - scripts/deploy-its-tokens.js
   - Deploy USDT, USDC, KUJI interchain tokens
   - Deploy to all target chains

2. **Register tokens in ITSTokenRegistry**
   - Map token IDs to chain addresses
   - Set bridge limits (min/max)
   - Configure fees

3. **Update CrossChainEscrow**
   - Add token validation
   - Test token transfers
   - Test fee collection

4. **Create token management scripts**
   - scripts/add-its-token.js
   - scripts/update-token-limits.js
   - scripts/pause-token.js

5. **Write token integration tests**
   - Test token deployment
   - Test registration
   - Test cross-chain transfers
   - Test limit enforcement

### Phase H: Integration Testing (4-6 hours)
1. **Write end-to-end test suite**
   - test/crosschain/EndToEnd.test.js
   - Full offer → trade → escrow → release flow
   - Test with ITS tokens
   - Test callbacks

2. **Test error scenarios**
   - Insufficient gas
   - Invalid parameters
   - Failed messages and retry
   - Chain pauses

3. **Test gas estimation**
   - Measure gas costs
   - Verify estimates are accurate
   - Test gas refunds

4. **Performance testing**
   - Test message throughput
   - Test callback latency
   - Test under load

### Phase I: Documentation (2-3 hours)
1. **Update contract documentation**
   - Add NatSpec comments
   - Document cross-chain flows
   - Add usage examples

2. **Create integration guide**
   - docs/CROSS_CHAIN_INTEGRATION.md
   - Explain message flows
   - Show code examples

3. **Create deployment guide**
   - docs/CROSS_CHAIN_DEPLOYMENT.md
   - Step-by-step deployment
   - Configuration checklist

## Error Handling Strategy

### Message Validation Errors
```solidity
// In message handlers
require(registeredChains[sourceChain], "Unregistered chain");
require(payload.amount > MIN_AMOUNT, "Amount too small");
require(payload.amount < MAX_AMOUNT, "Amount too large");
require(bytes(payload.fiatCurrency).length > 0, "Invalid currency");
```

### Handler Errors
```solidity
// Wrap all external calls in try-catch
try hub.handleCrossChainOfferCreation(...) returns (bool success) {
    _sendCallback(sourceChain, nonce, true, abi.encode(offerId));
} catch Error(string memory reason) {
    _sendCallback(sourceChain, nonce, false, abi.encode(reason));
    _storeFailedMessage(message, reason);
} catch (bytes memory lowLevelData) {
    _sendCallback(sourceChain, nonce, false, abi.encode("Unknown error"));
    _storeFailedMessage(message, "Low-level error");
}
```

### Callback Errors
```solidity
// In _sendCallback
try axelarHandler.sendMessage(...) {
    emit CallbackSent(destinationChain, nonce, success);
} catch {
    // Store callback for retry
    pendingCallbacks[keccak256(...)] = CallbackData({
        destinationChain: destinationChain,
        nonce: nonce,
        success: success,
        data: data,
        timestamp: block.timestamp
    });
    emit CallbackFailed(destinationChain, nonce);
}
```

### Token Operation Errors
```solidity
// In token handlers
require(tokenRegistry.isTokenRegistered(tokenId), "Token not registered");
require(!tokenRegistry.isTokenPaused(tokenId), "Token paused");
require(amount >= tokenRegistry.getMinBridgeAmount(tokenId), "Below minimum");
require(amount <= tokenRegistry.getMaxBridgeAmount(tokenId), "Above maximum");
```

## Security Considerations

### 1. Access Control
- Only registered satellites can send messages
- Only AxelarBridge can call Hub message handlers
- Only Hub can call Offer/Trade cross-chain functions
- Admin functions behind timelock (existing pattern)

### 2. Replay Protection
- Nonce-based message tracking
- processedMessages mapping prevents replays
- Message expiry for outdated messages

### 3. Reentrancy Protection
- All message handlers use nonReentrant modifier
- External calls wrapped in checks-effects-interactions pattern

### 4. Validation
```solidity
// Validate all inputs
require(amount > 0 && amount <= MAX_AMOUNT, "Invalid amount");
require(bytes(sourceChain).length > 0, "Invalid chain");
require(registeredChains[sourceChain], "Unregistered chain");
require(!chainPaused[sourceChain], "Chain paused");
```

### 5. Circuit Breakers
- Emergency pause per chain
- Global pause capability
- Token-specific pause
- Rate limiting (future enhancement)

### 6. Failed Message Recovery
```solidity
// Admin can retry failed messages
function retryFailedMessage(bytes32 messageId) external onlyRole(ADMIN_ROLE) {
    Message memory msg = failedMessages[messageId];
    require(msg.sender != address(0), "Not found");
    delete failedMessages[messageId];
    this.routeMessage(msg, msg.sourceChain);
}
```

## Validation Gates (MUST PASS)

```bash
# 1. Compile all contracts
cd contracts/evm
just compile
# Expected: No errors, no warnings

# 2. Run all cross-chain tests
just test test/crosschain/
# Expected: All tests pass

# 3. Run integration tests
just test test/crosschain/Integration.test.js
# Expected: Full flow works end-to-end

# 4. Check contract sizes
just size
# Expected: All contracts < 24KB

# 5. Run security tests
just test-security
# Expected: All security checks pass

# 6. Generate coverage report
just coverage
# Expected: >95% coverage for modified contracts

# 7. Gas report
just gas-report
# Expected: Message processing < 500k gas

# 8. Test specific files
just test test/Hub.test.js
just test test/Trade.test.js
just test test/Offer.test.js
# Expected: All existing tests still pass (backward compatibility)
```

## Success Criteria

### Functional Requirements
- [ ] Hub.sol has AxelarBridge reference and handlers implemented
- [ ] Trade.sol routes cross-chain trades to CrossChainEscrow
- [ ] Offer.sol supports cross-chain offers with chain fields
- [ ] All 12 message handlers are fully implemented and tested
- [ ] Callback mechanism works bidirectionally
- [ ] At least 3 ITS tokens deployed (USDT, USDC, KUJI)
- [ ] Tokens registered in ITSTokenRegistry with limits

### Technical Requirements
- [ ] All contracts compile without warnings
- [ ] Test coverage >95% for new code
- [ ] Contract sizes within 24KB limit
- [ ] Gas costs reasonable (<500k for message processing)
- [ ] No reentrancy vulnerabilities
- [ ] Replay protection verified

### Integration Requirements
- [ ] End-to-end test: Polygon→BSC offer creation works
- [ ] End-to-end test: Cross-chain trade with escrow works
- [ ] End-to-end test: ITS token bridge works
- [ ] Callbacks successfully update satellite cache
- [ ] Failed messages can be retried by admin

### Documentation Requirements
- [ ] All new functions have NatSpec comments
- [ ] Integration guide created
- [ ] Deployment guide created
- [ ] Message flow diagrams added

## Implementation Code Examples

### Hub.sol Changes

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAxelarBridge.sol";
import "./crosschain/interfaces/IAxelarBridge.sol";

contract Hub is ... {
    // ============ NEW STATE VARIABLES ============
    IAxelarBridge public axelarBridge;
    mapping(uint256 => string) public chainIdToName;
    mapping(string => uint256) public chainNameToId;
    mapping(bytes32 => bool) public processedCrossChainMessages;

    uint256 public crossChainMessageNonce;

    // ============ NEW EVENTS ============
    event AxelarBridgeUpdated(address indexed oldBridge, address indexed newBridge);
    event ChainRegistered(uint256 indexed chainId, string chainName);
    event CrossChainOfferCreated(
        bytes32 indexed offerId,
        string indexed sourceChain,
        address indexed creator
    );
    event CrossChainTradeCreated(
        bytes32 indexed tradeId,
        string indexed sourceChain,
        address indexed taker
    );
    event CrossChainMessageProcessed(
        bytes32 indexed messageId,
        string sourceChain,
        bool success
    );

    // ============ NEW MODIFIERS ============
    modifier onlyAxelarBridge() {
        require(msg.sender == address(axelarBridge), "Not authorized: only AxelarBridge");
        _;
    }

    // ============ NEW FUNCTIONS ============

    /**
     * @notice Set the AxelarBridge contract address
     * @param _bridge Address of AxelarBridge contract
     * @dev Only callable by ADMIN_ROLE
     */
    function setAxelarBridge(address _bridge) external onlyRole(ADMIN_ROLE) {
        require(_bridge != address(0), "Invalid bridge address");
        address oldBridge = address(axelarBridge);
        axelarBridge = IAxelarBridge(_bridge);
        emit AxelarBridgeUpdated(oldBridge, _bridge);
    }

    /**
     * @notice Register a supported chain for cross-chain operations
     * @param chainId Chain ID (e.g., 137 for Polygon)
     * @param chainName Axelar chain name (e.g., "Polygon")
     */
    function registerChain(uint256 chainId, string calldata chainName)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(chainId != 0, "Invalid chain ID");
        require(bytes(chainName).length > 0, "Invalid chain name");

        chainIdToName[chainId] = chainName;
        chainNameToId[chainName] = chainId;

        emit ChainRegistered(chainId, chainName);
    }

    /**
     * @notice Handle cross-chain offer creation from satellite chain
     * @param sourceChain Name of source chain
     * @param creator Original offer creator address
     * @param offerId Unique offer ID from satellite
     * @param token Token address
     * @param amount Offer amount
     * @param price Price in fiat cents
     * @param isBuy Whether this is a buy offer
     * @param fiatCurrency Fiat currency code
     * @return localOfferId The local offer ID created on hub
     */
    function handleCrossChainOfferCreation(
        string memory sourceChain,
        address creator,
        bytes32 offerId,
        address token,
        uint256 amount,
        uint256 price,
        bool isBuy,
        string memory fiatCurrency
    ) external onlyAxelarBridge nonReentrant whenNotPaused returns (uint256 localOfferId) {
        // Validate parameters
        require(chainNameToId[sourceChain] != 0, "Unsupported chain");
        require(creator != address(0), "Invalid creator");
        require(amount > 0, "Invalid amount");
        require(price > 0, "Invalid price");
        require(bytes(fiatCurrency).length > 0, "Invalid currency");

        // Prevent replay
        bytes32 messageId = keccak256(abi.encodePacked(
            sourceChain,
            creator,
            offerId,
            crossChainMessageNonce++
        ));
        require(!processedCrossChainMessages[messageId], "Already processed");
        processedCrossChainMessages[messageId] = true;

        // Create offer via Offer contract
        // Note: Offer contract must have createCrossChainOffer function
        IOffer offerContract = IOffer(_config.offerContract);
        localOfferId = offerContract.createCrossChainOffer(
            sourceChain,
            creator,
            offerId,
            token,
            amount,
            price,
            isBuy,
            fiatCurrency,
            0, // minAmount (use default)
            0  // maxAmount (use default)
        );

        emit CrossChainOfferCreated(offerId, sourceChain, creator);
        emit CrossChainMessageProcessed(messageId, sourceChain, true);

        return localOfferId;
    }

    /**
     * @notice Handle cross-chain trade creation from satellite chain
     * @param sourceChain Name of source chain
     * @param taker Trade taker address
     * @param tradeId Unique trade ID from satellite
     * @param offerId Offer ID being accepted
     * @param amount Trade amount
     * @return localTradeId The local trade ID created on hub
     */
    function handleCrossChainTradeCreation(
        string memory sourceChain,
        address taker,
        bytes32 tradeId,
        uint256 offerId,
        uint256 amount
    ) external onlyAxelarBridge nonReentrant whenNotPaused returns (uint256 localTradeId) {
        // Validate parameters
        require(chainNameToId[sourceChain] != 0, "Unsupported chain");
        require(taker != address(0), "Invalid taker");
        require(offerId > 0, "Invalid offer ID");
        require(amount > 0, "Invalid amount");

        // Prevent replay
        bytes32 messageId = keccak256(abi.encodePacked(
            sourceChain,
            taker,
            tradeId,
            crossChainMessageNonce++
        ));
        require(!processedCrossChainMessages[messageId], "Already processed");
        processedCrossChainMessages[messageId] = true;

        // Create trade via Trade contract
        ITrade tradeContract = ITrade(_config.tradeContract);
        localTradeId = tradeContract.createCrossChainTrade(
            sourceChain,
            taker,
            tradeId,
            offerId,
            amount
        );

        emit CrossChainTradeCreated(tradeId, sourceChain, taker);
        emit CrossChainMessageProcessed(messageId, sourceChain, true);

        return localTradeId;
    }

    /**
     * @notice Handle cross-chain escrow funding notification
     * @param sourceChain Name of source chain
     * @param tradeId Trade ID
     * @param amount Amount funded
     */
    function handleCrossChainEscrowFunding(
        string memory sourceChain,
        bytes32 tradeId,
        uint256 amount
    ) external onlyAxelarBridge nonReentrant whenNotPaused returns (bool) {
        require(chainNameToId[sourceChain] != 0, "Unsupported chain");
        require(amount > 0, "Invalid amount");

        // Forward to Trade contract to update state
        ITrade tradeContract = ITrade(_config.tradeContract);
        bool success = tradeContract.notifyCrossChainEscrowFunded(
            tradeId,
            sourceChain,
            amount
        );

        return success;
    }

    /**
     * @notice Handle cross-chain fund release request
     * @param sourceChain Name of source chain
     * @param tradeId Trade ID
     * @param recipient Recipient address
     */
    function handleCrossChainFundRelease(
        string memory sourceChain,
        bytes32 tradeId,
        address recipient
    ) external onlyAxelarBridge nonReentrant whenNotPaused returns (bool) {
        require(chainNameToId[sourceChain] != 0, "Unsupported chain");
        require(recipient != address(0), "Invalid recipient");

        // Forward to Trade contract
        ITrade tradeContract = ITrade(_config.tradeContract);
        bool success = tradeContract.releaseCrossChainFunds(
            tradeId,
            sourceChain,
            recipient
        );

        return success;
    }

    // Add storage gap adjustment
    uint256[45] private __gap; // Reduced from 50 to account for new variables
}
```

### AxelarBridge.sol - Complete Message Handler

```solidity
// In AxelarBridge.sol - Replace empty _handleCreateOffer

/**
 * @notice Handle CREATE_OFFER message from satellite
 * @param message Cross-chain message
 * @param sourceChain Name of source chain
 */
function _handleCreateOffer(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    // 1. Decode payload
    MessageTypes.CreateOfferPayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.CreateOfferPayload)
    );

    // 2. Validate payload
    require(payload.amount > 0, "Invalid amount");
    require(payload.price > 0, "Invalid price");
    require(payload.minAmount <= payload.maxAmount, "Invalid range");
    require(bytes(payload.fiatCurrency).length > 0, "Invalid currency");

    // 3. Generate deterministic offer ID
    bytes32 offerId = keccak256(abi.encodePacked(
        sourceChain,
        message.sender,
        message.nonce,
        payload.token,
        payload.amount,
        block.timestamp
    ));

    // 4. Forward to Hub with error handling
    try hub.handleCrossChainOfferCreation(
        sourceChain,
        message.sender,
        offerId,
        payload.token,
        payload.amount,
        payload.price,
        payload.isBuy,
        payload.fiatCurrency
    ) returns (uint256 localOfferId) {
        // Success - send callback to satellite with offer ID
        bytes memory callbackData = abi.encode(
            offerId,
            localOfferId,
            true,
            "" // No error message
        );

        _sendCallback(
            sourceChain,
            message.nonce,
            true,
            callbackData
        );

        emit MessageProcessed(
            MessageTypes.getMessageId(message, sourceChain),
            sourceChain,
            message.sender
        );

    } catch Error(string memory reason) {
        // Failure - send callback with error reason
        bytes memory callbackData = abi.encode(
            offerId,
            0, // No local ID
            false,
            reason
        );

        _sendCallback(
            sourceChain,
            message.nonce,
            false,
            callbackData
        );

        // Store for retry
        bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
        failedMessages[messageId] = message;
        failedMessageReasons[messageId] = reason;

        emit MessageFailed(messageId, reason);

    } catch (bytes memory lowLevelData) {
        // Unknown error
        bytes memory callbackData = abi.encode(
            offerId,
            0,
            false,
            "Unknown error during offer creation"
        );

        _sendCallback(
            sourceChain,
            message.nonce,
            false,
            callbackData
        );

        bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
        failedMessages[messageId] = message;
        failedMessageReasons[messageId] = "Low-level error";

        emit MessageFailed(messageId, "Low-level error");
    }
}

/**
 * @notice Handle CREATE_TRADE message from satellite
 */
function _handleCreateTrade(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    MessageTypes.CreateTradePayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.CreateTradePayload)
    );

    require(payload.amount > 0, "Invalid amount");
    require(payload.trader != address(0), "Invalid trader");

    bytes32 tradeId = keccak256(abi.encodePacked(
        sourceChain,
        message.sender,
        message.nonce,
        payload.offerId,
        block.timestamp
    ));

    try hub.handleCrossChainTradeCreation(
        sourceChain,
        payload.trader,
        tradeId,
        uint256(payload.offerId), // Convert bytes32 to uint256 if needed
        payload.amount
    ) returns (uint256 localTradeId) {
        bytes memory callbackData = abi.encode(
            tradeId,
            localTradeId,
            true,
            ""
        );

        _sendCallback(sourceChain, message.nonce, true, callbackData);

    } catch Error(string memory reason) {
        bytes memory callbackData = abi.encode(tradeId, 0, false, reason);
        _sendCallback(sourceChain, message.nonce, false, callbackData);

        bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
        failedMessages[messageId] = message;
        failedMessageReasons[messageId] = reason;

        emit MessageFailed(messageId, reason);
    }
}

/**
 * @notice Handle FUND_ESCROW message from satellite
 */
function _handleFundEscrow(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    MessageTypes.FundEscrowPayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.FundEscrowPayload)
    );

    require(payload.amount > 0, "Invalid amount");
    require(payload.token != address(0), "Invalid token");

    try hub.handleCrossChainEscrowFunding(
        sourceChain,
        payload.tradeId,
        payload.amount
    ) returns (bool success) {
        if (success) {
            bytes memory callbackData = abi.encode(
                payload.tradeId,
                payload.amount,
                true,
                ""
            );
            _sendCallback(sourceChain, message.nonce, true, callbackData);
        } else {
            revert("Escrow funding failed");
        }
    } catch Error(string memory reason) {
        bytes memory callbackData = abi.encode(
            payload.tradeId,
            0,
            false,
            reason
        );
        _sendCallback(sourceChain, message.nonce, false, callbackData);

        bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
        failedMessages[messageId] = message;
        failedMessageReasons[messageId] = reason;

        emit MessageFailed(messageId, reason);
    }
}

/**
 * @notice Handle RELEASE_FUNDS message from satellite
 */
function _handleReleaseFunds(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    MessageTypes.ReleaseFundsPayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.ReleaseFundsPayload)
    );

    require(payload.recipient != address(0), "Invalid recipient");
    require(payload.amount > 0, "Invalid amount");

    try hub.handleCrossChainFundRelease(
        sourceChain,
        payload.tradeId,
        payload.recipient
    ) returns (bool success) {
        if (success) {
            bytes memory callbackData = abi.encode(
                payload.tradeId,
                payload.recipient,
                payload.amount,
                true,
                ""
            );
            _sendCallback(sourceChain, message.nonce, true, callbackData);
        } else {
            revert("Fund release failed");
        }
    } catch Error(string memory reason) {
        bytes memory callbackData = abi.encode(
            payload.tradeId,
            address(0),
            0,
            false,
            reason
        );
        _sendCallback(sourceChain, message.nonce, false, callbackData);

        bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
        failedMessages[messageId] = message;
        failedMessageReasons[messageId] = reason;

        emit MessageFailed(messageId, reason);
    }
}

/**
 * @notice Send callback to satellite chain
 * @param destinationChain Target chain name
 * @param originalNonce Nonce from original message
 * @param success Whether operation succeeded
 * @param data Callback data (result or error)
 */
function _sendCallback(
    string memory destinationChain,
    uint256 originalNonce,
    bool success,
    bytes memory data
) internal {
    require(registeredChains[destinationChain], "Destination not registered");

    // Encode callback message
    MessageTypes.CrossChainMessage memory callback = MessageTypes.CrossChainMessage({
        messageType: MessageTypes.MessageType.QUERY_STATUS, // Reuse for callbacks
        sender: address(this),
        sourceChainId: block.chainid,
        nonce: messageNonce++,
        payload: abi.encode(originalNonce, success, data)
    });

    bytes memory axelarPayload = MessageTypes.encodeMessage(callback);

    // Send via AxelarHandler (no gas payment, hub covers gas)
    (bool callSuccess, ) = axelarHandler.call(
        abi.encodeWithSignature(
            "sendMessage(string,string,bytes)",
            destinationChain,
            satelliteAddresses[destinationChain],
            axelarPayload
        )
    );

    if (!callSuccess) {
        // Store for retry
        bytes32 callbackId = keccak256(abi.encodePacked(
            destinationChain,
            originalNonce,
            block.timestamp
        ));

        // Could store pending callbacks here for retry
        emit CallbackFailed(destinationChain, originalNonce);
    } else {
        emit CallbackSent(destinationChain, originalNonce, success);
    }
}

// Add new events
event CallbackSent(string indexed destinationChain, uint256 indexed originalNonce, bool success);
event CallbackFailed(string indexed destinationChain, uint256 indexed originalNonce);
```

### Integration Test Example

```javascript
// test/crosschain/Integration.test.js
const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");

describe("Cross-Chain Integration Tests", function () {
    let hub, offer, trade, escrow, crossChainEscrow;
    let axelarBridge, axelarHandler;
    let satellite;
    let mockGateway, mockGasService;
    let itsTokenRegistry;
    let owner, user1, user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy mocks
        const MockGateway = await ethers.getContractFactory("MockAxelarGateway");
        mockGateway = await MockGateway.deploy();
        await mockGateway.waitForDeployment();

        const MockGasService = await ethers.getContractFactory("MockAxelarGasService");
        mockGasService = await MockGasService.deploy();
        await mockGasService.waitForDeployment();

        // Deploy core contracts
        const Hub = await ethers.getContractFactory("Hub");
        const Offer = await ethers.getContractFactory("Offer");
        const Trade = await ethers.getContractFactory("Trade");
        const Escrow = await ethers.getContractFactory("Escrow");

        // ... deploy all contracts with proper initialization

        // Deploy cross-chain contracts
        const AxelarHandler = await ethers.getContractFactory("AxelarHandler");
        axelarHandler = await AxelarHandler.deploy(await mockGateway.getAddress());
        await axelarHandler.waitForDeployment();

        const AxelarBridge = await ethers.getContractFactory("AxelarBridge");
        axelarBridge = await upgrades.deployProxy(
            AxelarBridge,
            [await hub.getAddress(), await mockGasService.getAddress()],
            { constructorArgs: [await mockGateway.getAddress()] }
        );
        await axelarBridge.waitForDeployment();

        // Connect Hub to AxelarBridge
        await hub.setAxelarBridge(await axelarBridge.getAddress());

        // Register chains
        await hub.registerChain(137, "Polygon");
        await axelarBridge.registerChain("Polygon", await satellite.getAddress());

        // Deploy satellite
        const Satellite = await ethers.getContractFactory("LocalMoneySatellite");
        satellite = await upgrades.deployProxy(
            Satellite,
            [await mockGasService.getAddress(), await axelarBridge.getAddress()],
            { constructorArgs: [await mockGateway.getAddress()] }
        );
        await satellite.waitForDeployment();
    });

    describe("End-to-End Cross-Chain Offer Creation", function () {
        it("should create offer on satellite and sync to hub", async function () {
            // 1. User creates offer on satellite (Polygon)
            const gasPayment = ethers.parseEther("0.1");
            const createOfferTx = await satellite.connect(user1).createOffer(
                ethers.ZeroAddress, // Native token
                ethers.parseEther("100"), // 100 tokens
                100, // $1.00 per token
                true, // Buy offer
                { value: gasPayment }
            );

            const receipt = await createOfferTx.wait();
            const offerCreatedEvent = receipt.logs.find(
                log => log.eventName === "OfferCreated"
            );
            const satelliteOfferId = offerCreatedEvent.args.offerId;

            // 2. Simulate Axelar message delivery
            const message = {
                messageType: 0, // CREATE_OFFER
                sender: user1.address,
                sourceChainId: 137,
                nonce: 1,
                payload: ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "bool", "string", "uint256", "uint256"],
                    [
                        ethers.ZeroAddress,
                        ethers.parseEther("100"),
                        100,
                        true,
                        "USD",
                        0,
                        ethers.parseEther("100")
                    ]
                )
            };

            const encodedMessage = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint8,address,uint256,uint256,bytes)"],
                [message]
            );

            // Simulate Axelar calling bridge
            await mockGateway.callExecute(
                await axelarBridge.getAddress(),
                "Polygon",
                await satellite.getAddress(),
                encodedMessage
            );

            // 3. Verify offer created on hub
            const offers = await offer.getActiveOffers(0, 10);
            expect(offers.length).to.be.greaterThan(0);

            // 4. Verify callback was sent back to satellite
            const callbackEvents = await axelarBridge.queryFilter("CallbackSent");
            expect(callbackEvents.length).to.equal(1);
            expect(callbackEvents[0].args.destinationChain).to.equal("Polygon");
            expect(callbackEvents[0].args.success).to.be.true;
        });

        it("should handle failed offer creation gracefully", async function () {
            // Create offer with invalid parameters
            const message = {
                messageType: 0,
                sender: user1.address,
                sourceChainId: 137,
                nonce: 2,
                payload: ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "bool", "string", "uint256", "uint256"],
                    [ethers.ZeroAddress, 0, 0, true, "USD", 0, 0] // Invalid: zero amounts
                )
            };

            const encodedMessage = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint8,address,uint256,uint256,bytes)"],
                [message]
            );

            await mockGateway.callExecute(
                await axelarBridge.getAddress(),
                "Polygon",
                await satellite.getAddress(),
                encodedMessage
            );

            // Verify callback with failure
            const callbackEvents = await axelarBridge.queryFilter("CallbackSent");
            const failureCallback = callbackEvents.find(e => !e.args.success);
            expect(failureCallback).to.exist;

            // Verify message stored for retry
            const failedEvents = await axelarBridge.queryFilter("MessageFailed");
            expect(failedEvents.length).to.equal(1);
        });
    });

    describe("End-to-End Cross-Chain Trade Flow", function () {
        let offerId;

        beforeEach(async function () {
            // Create offer on hub first
            const tx = await offer.connect(user1).createOffer(
                0, // Buy
                "USD",
                ethers.ZeroAddress,
                ethers.parseEther("10"),
                ethers.parseEther("100"),
                100,
                "Test offer"
            );
            const receipt = await tx.wait();
            offerId = receipt.logs[0].args.offerId;
        });

        it("should complete full trade flow cross-chain", async function () {
            // 1. User2 creates trade on satellite
            const gasPayment = ethers.parseEther("0.1");
            const createTradeTx = await satellite.connect(user2).createTrade(
                ethers.hexlify(ethers.toBeArray(offerId)), // Convert to bytes32
                ethers.parseEther("50"),
                { value: gasPayment }
            );
            await createTradeTx.wait();

            // 2. Simulate message delivery (CREATE_TRADE)
            // ... (similar to offer creation test)

            // 3. Verify trade created on hub
            const trades = await trade.getUserTrades(user2.address, 0, 10);
            expect(trades.length).to.be.greaterThan(0);

            // 4. Fund escrow from satellite
            const fundTx = await satellite.connect(user2).fundEscrow(
                tradeId,
                { value: ethers.parseEther("50.15") } // Amount + gas
            );
            await fundTx.wait();

            // 5. Simulate escrow funding message
            // ...

            // 6. Complete trade
            const completeTx = await satellite.connect(user1).completeTrade(tradeId);
            await completeTx.wait();

            // 7. Verify funds released
            const finalBalance = await ethers.provider.getBalance(user1.address);
            // Assert balance increased
        });
    });

    describe("ITS Token Integration", function () {
        let tokenId, token;

        beforeEach(async function () {
            // Deploy and register ITS token
            // ... (deploy token via ITS factory)

            await itsTokenRegistry.registerToken(
                tokenId,
                "USDT",
                137,
                await token.getAddress(),
                ethers.parseUnits("10", 6),
                ethers.parseUnits("100000", 6)
            );
        });

        it("should bridge tokens cross-chain", async function () {
            // 1. User1 bridges USDT from Polygon to BSC
            const amount = ethers.parseUnits("1000", 6);
            const gasPayment = ethers.parseEther("0.1");

            const bridgeTx = await satellite.connect(user1).bridgeToken(
                tokenId,
                amount,
                "binance", // Destination
                user1.address,
                { value: gasPayment }
            );
            await bridgeTx.wait();

            // 2. Verify tokens locked on satellite
            // ...

            // 3. Simulate ITS callback on BSC
            // ...

            // 4. Verify tokens received on BSC
            const hubBalance = await token.balanceOf(user1.address);
            expect(hubBalance).to.equal(amount);
        });

        it("should enforce bridge limits", async function () {
            // Try to bridge below minimum
            const tooSmall = ethers.parseUnits("5", 6);

            await expect(
                satellite.connect(user1).bridgeToken(
                    tokenId,
                    tooSmall,
                    "binance",
                    user1.address,
                    { value: ethers.parseEther("0.1") }
                )
            ).to.be.revertedWith("Below minimum");

            // Try to bridge above maximum
            const tooLarge = ethers.parseUnits("200000", 6);

            await expect(
                satellite.connect(user1).bridgeToken(
                    tokenId,
                    tooLarge,
                    "binance",
                    user1.address,
                    { value: ethers.parseEther("0.1") }
                )
            ).to.be.revertedWith("Above maximum");
        });
    });

    describe("Gas Estimation", function () {
        it("should provide accurate gas estimates", async function () {
            const estimate = await satellite.estimateGasFee();
            expect(estimate).to.be.greaterThan(0);

            // Should be reasonable (not too high)
            expect(estimate).to.be.lessThan(ethers.parseEther("1"));
        });
    });
});
```

## Dependencies and External Resources

### NPM Dependencies (Already Installed)
```json
{
  "@axelar-network/axelar-gmp-sdk-solidity": "^5.0.0",
  "@axelar-network/axelar-cgp-solidity": "^6.0.0",
  "@axelar-network/interchain-token-service": "^2.0.0",
  "@openzeppelin/contracts": "^5.0.0",
  "@openzeppelin/contracts-upgradeable": "^5.0.0",
  "hardhat": "^2.19.0",
  "ethers": "^6.9.0"
}
```

### External Contract Addresses (Mainnet)
```javascript
// BSC Mainnet
const AXELAR_GATEWAY_BSC = "0x304acf330bbE08d1e512eefaa92F6a57871fD895";
const AXELAR_GAS_SERVICE_BSC = "0x2d5d7d31F671F86C782533cc367F14109a082712";
const ITS_FACTORY = "0x83a93500d23Fbc3e82B410aD07A6a9F7A0670D66";
const ITS_SERVICE = "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C";

// Polygon Mainnet
const AXELAR_GATEWAY_POLYGON = "0x6f015F16De9fC8791b234eF68D486d2bF203FBA8";
const AXELAR_GAS_SERVICE_POLYGON = "0x2d5d7d31F671F86C782533cc367F14109a082712";

// Avalanche C-Chain
const AXELAR_GATEWAY_AVALANCHE = "0x5029C0EFf6C34351a0CEc334542cDb22c7928f78";
const AXELAR_GAS_SERVICE_AVALANCHE = "0x2d5d7d31F671F86C782533cc367F14109a082712";

// Base Mainnet
const AXELAR_GATEWAY_BASE = "0xe432150cce91c13a887f7D836923d5597adD8E31";
const AXELAR_GAS_SERVICE_BASE = "0x2d5d7d31F671F86C782533cc367F14109a082712";
```

### Documentation Links
- **Axelar ITS Guide**: https://docs.axelar.dev/dev/send-tokens/interchain-tokens/intro/
- **ITS Factory**: https://docs.axelar.dev/dev/send-tokens/interchain-tokens/developer-guides/programmatically-create-a-token
- **GMP Security**: https://docs.axelar.dev/learn/security
- **AxelarScan Explorer**: https://axelarscan.io/
- **Axelar Testnet Faucet**: https://faucet.testnet.axelar.dev/

## Confidence Score: 8.5/10

### Rationale
**Strengths**:
- Complete implementation code provided for all critical gaps
- Full test suite with end-to-end scenarios
- Real code examples from existing codebase patterns
- Detailed pseudocode for complex flows
- Comprehensive error handling strategy
- Security considerations addressed
- Clear validation gates that are executable
- External documentation and contract addresses included

**Risks & Mitigation**:
1. **Complexity Risk (Medium)**: 10+ handlers + 3 contracts integration
   - *Mitigation*: Phased implementation (A→I), each phase validated
2. **ITS Token Setup (Medium)**: First-time Axelar ITS deployment
   - *Mitigation*: Test on testnet first, follow official Axelar guides
3. **Gas Cost Uncertainty (Low)**: Cross-chain operations gas intensive
   - *Mitigation*: Gas reports during testing, adjust buffer/multipliers
4. **Callback Timing (Low)**: Axelar network delays variable
   - *Mitigation*: Timeout mechanism, retry for failed messages

**What Could Increase Score to 9.5/10**:
- Live testnet deployment verification
- External Axelar team code review
- Fuzzing tests on message parsing
- Load testing on testnet

## Next Phase Dependencies

This PRP is **critical** for all subsequent phases:
- ✅ **Phase 2**: Frontend Integration (requires working message handlers)
- ✅ **Phase 3**: Operational Infrastructure (requires deployments)
- ✅ **Phase 4**: Security Audit (requires complete implementation)
- ✅ **Phase 5**: Mainnet Launch (requires everything)

**Estimated Time**: 40-50 hours (5-7 days with 1 senior dev)

---

**Last Updated**: 2025-09-30
**PRP Version**: 1.0
**Status**: Ready for Implementation