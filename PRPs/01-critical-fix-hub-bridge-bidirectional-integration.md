# PRP: Hub-Bridge Bidirectional Integration & Interface Safety

## Overview
Establish proper bidirectional communication between Hub and AxelarBridge contracts by replacing unsafe low-level calls with typed interfaces, implementing callback mechanisms, and enabling Hub to send responses back to satellites through the bridge.

**Status:** CRITICAL - Blocks Satellite Communication
**Estimated Time:** 1-2 weeks
**Dependencies:** AxelarBridge, Hub, AxelarHandler contracts

## Reference Documentation

### Solidity Best Practices
- **Interface Pattern**: https://docs.soliditylang.org/en/v0.8.24/contracts.html#interfaces
- **Low-Level Calls**: https://docs.soliditylang.org/en/v0.8.24/units-and-global-variables.html#members-of-address-types
- **Error Handling**: https://docs.soliditylang.org/en/v0.8.24/control-structures.html#error-handling-assert-require-revert-and-exceptions

### Axelar Documentation
- **GMP Callbacks**: https://docs.axelar.dev/dev/general-message-passing/gmp-messages#receiving-confirmation
- **Two-Way Messaging**: https://docs.axelar.dev/dev/general-message-passing/gmp-examples#two-way-messaging

### LocalMoney Codebase
- **AxelarBridge Low-Level Calls**: `contracts/evm/contracts/crosschain/AxelarBridge.sol` (lines 208-216, 259-267, 727-734)
- **Hub Cross-Chain Handlers**: `contracts/evm/contracts/Hub.sol` (lines 524-669)
- **AxelarHandler**: `contracts/evm/contracts/crosschain/AxelarHandler.sol`
- **Satellite Callback Handling**: `contracts/evm/contracts/satellites/LocalMoneySatellite.sol` (lines 316-372)

## Problem Statement

### Current Issues

#### Issue 1: Unsafe Low-Level Calls in AxelarBridge
**Location**: `AxelarBridge.sol:208-216, 259-267, 727-734`

```solidity
// Line 208-216: sendMessage
(bool success, ) = axelarHandler.call(
    abi.encodeWithSignature(
        "sendMessage(string,string,bytes)",
        destinationChain,
        satelliteAddresses[destinationChain],
        payload
    )
);
require(success, "Failed to send message"); // Generic error!
```

**Problems**:
- No type safety - typos in function signature go undetected
- Cannot decode revert reasons
- No return value capture
- Difficult to debug
- Gas estimation inaccurate

#### Issue 2: Hub Cannot Send Responses to Satellites
**Location**: `Hub.sol:524-669`

```solidity
function handleCrossChainOfferCreation(...)
    external onlyAxelarBridge returns (uint256 localOfferId) {

    // Creates offer successfully
    localOfferId = offerContract.createOffer(...);

    emit CrossChainOfferCreated(offerId, sourceChain, creator);

    return localOfferId;
    // ❌ But satellite never receives this confirmation!
}
```

**Problems**:
- Satellites send messages but never get responses
- Cache becomes stale (offers show as pending forever)
- Users don't know if operations succeeded
- Cannot retry failed operations

#### Issue 3: Callback Mechanism is Incomplete
**Location**: `AxelarBridge.sol:706-748`

```solidity
function _sendCallback(...) internal {
    // Uses generic QUERY_STATUS for all callbacks
    MessageTypes.CrossChainMessage memory callback = MessageTypes.CrossChainMessage({
        messageType: MessageTypes.MessageType.QUERY_STATUS, // ❌ Always same!
        ...
    });

    // Uses low-level call again
    (bool callSuccess, ) = axelarHandler.call(...);
}
```

**Problems**:
- All callbacks use same message type
- Satellites cannot distinguish callback types
- No retry mechanism for failed callbacks
- Low-level call without proper error handling

### Impact
- **Satellites have stale data**: Users see incorrect offer/trade states
- **No error feedback**: Users don't know why operations failed
- **No retries**: Failed messages stuck forever
- **Debugging nightmare**: Generic errors with no context
- **Type safety broken**: Refactoring breaks contracts silently

## Context for AI Agent

### Pattern 1: Proper Interface Usage
**Reference**: OpenZeppelin contracts, existing LocalMoney contracts

```solidity
// ❌ BAD: Low-level call
(bool success, ) = target.call(
    abi.encodeWithSignature("transfer(address,uint256)", to, amount)
);

// ✅ GOOD: Interface
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

IERC20 token = IERC20(tokenAddress);
bool success = token.transfer(to, amount);
require(success, "Transfer failed");
```

### Pattern 2: Hub Using Other Contracts
**Reference**: `Hub.sol:552-561`

Hub already properly uses Offer contract through interface:
```solidity
IOffer offerContract = IOffer(_config.offerContract);
localOfferId = offerContract.createOffer(
    isBuy ? IOffer.OfferType.Buy : IOffer.OfferType.Sell,
    fiatCurrency,
    token,
    0,
    amount,
    price,
    string(abi.encodePacked("Cross-chain offer from ", sourceChain))
);
```

**We need to apply this same pattern for AxelarBridge!**

### Pattern 3: Error Decoding
**Reference**: Solidity docs

```solidity
// Proper error handling with try-catch
try target.someFunction(params) returns (uint256 result) {
    // Success path
    return result;
} catch Error(string memory reason) {
    // Known error with reason string
    emit OperationFailed(reason);
    revert(reason);
} catch Panic(uint errorCode) {
    // Panic errors (assert, overflow, etc.)
    emit OperationPanicked(errorCode);
    revert("Panic occurred");
} catch (bytes memory lowLevelData) {
    // Unknown error
    emit LowLevelError(lowLevelData);
    revert("Unknown error");
}
```

### Pattern 4: Callback Pattern from Other Protocols
**Reference**: Axelar documentation

Two-way messaging pattern:
```solidity
// Contract A sends message
function sendRequest(string calldata destChain) external payable {
    bytes memory payload = abi.encode(requestId, msg.sender, params);
    gateway.callContract(destChain, destContract, payload);
}

// Contract B receives and responds
function _execute(
    bytes32 commandId,
    string calldata sourceChain,
    string calldata sourceAddress,
    bytes calldata payload
) internal override {
    // Process request
    (uint256 requestId, address requester, ...) = abi.decode(payload);

    // Send response back
    bytes memory response = abi.encode(requestId, result, success);
    gateway.callContract(sourceChain, sourceAddress, response);
}

// Contract A receives response
function _execute(...) internal override {
    // Process response
    (uint256 requestId, bytes memory result, bool success) = abi.decode(payload);

    // Update local state
    requests[requestId].result = result;
    requests[requestId].completed = true;
}
```

## Implementation Blueprint

### Step 1: Create IAxelarHandler Interface

Create proper interface for AxelarHandler:

```solidity
// contracts/evm/contracts/crosschain/interfaces/IAxelarHandler.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAxelarHandler
 * @notice Interface for AxelarHandler contract
 * @dev Provides type-safe access to AxelarHandler functionality
 */
interface IAxelarHandler {
    /**
     * @notice Send cross-chain message via Axelar Gateway
     * @param destinationChain Target chain name (e.g., "Polygon")
     * @param destinationAddress Target contract address as string
     * @param payload Encoded message data
     */
    function sendMessage(
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload
    ) external;

    /**
     * @notice Get Axelar Gateway address
     * @return Address of Axelar Gateway
     */
    function gateway() external view returns (address);

    /**
     * @notice Check if contract is valid executable
     * @return True if valid Axelar executable
     */
    function isValidExecutable() external view returns (bool);
}
```

### Step 2: Update AxelarHandler to Match Interface

**File**: `contracts/evm/contracts/crosschain/AxelarHandler.sol`

```solidity
// Ensure public functions match interface exactly
function sendMessage(
    string calldata destinationChain,
    string calldata destinationAddress,
    bytes calldata payload
) external {
    require(msg.sender == upgradableBridge, "Only bridge can send");
    gateway.callContract(destinationChain, destinationAddress, payload);
}

function isValidExecutable() external pure returns (bool) {
    return true;
}
```

### Step 3: Replace Low-Level Calls in AxelarBridge

**File**: `contracts/evm/contracts/crosschain/AxelarBridge.sol`

```solidity
import "./interfaces/IAxelarHandler.sol";

contract AxelarBridge is ... {
    IAxelarHandler public axelarHandlerInterface;

    function initialize(..., address _axelarHandler) external initializer {
        // ... existing code ...

        axelarHandlerInterface = IAxelarHandler(_axelarHandler);
    }

    // ✅ FIXED: Replace line 208-216
    function sendMessage(
        string calldata destinationChain,
        MessageTypes.CrossChainMessage calldata message
    ) external payable override whenNotPaused nonReentrant returns (bytes32 messageId) {
        require(registeredChains[destinationChain], "Unregistered chain");
        require(!chainPaused[destinationChain], "Chain paused");

        messageId = MessageTypes.getMessageId(message, _currentChainName());
        bytes memory payload = MessageTypes.encodeMessage(message);

        // ✅ Use interface instead of low-level call
        try axelarHandlerInterface.sendMessage(
            destinationChain,
            satelliteAddresses[destinationChain],
            payload
        ) {
            emit MessageSent(messageId, destinationChain, msg.sender);
        } catch Error(string memory reason) {
            revert(string(abi.encodePacked("Send failed: ", reason)));
        } catch {
            revert("Send failed: Unknown error");
        }
    }

    // ✅ FIXED: Replace line 259-267
    function sendMessageWithGas(
        string calldata destinationChain,
        MessageTypes.CrossChainMessage calldata message,
        uint256 gasLimit,
        address refundAddress
    ) external payable override whenNotPaused nonReentrant returns (bytes32 messageId) {
        require(registeredChains[destinationChain], "Unregistered chain");
        require(!chainPaused[destinationChain], "Chain paused");
        require(msg.value > 0, "Gas payment required");

        messageId = MessageTypes.getMessageId(message, _currentChainName());
        bytes memory payload = MessageTypes.encodeMessage(message);

        // Pay for gas
        (bool gasSuccess, ) = gasService.call{value: msg.value}(
            abi.encodeWithSignature(
                "payNativeGasForContractCall(address,string,string,bytes,address)",
                address(axelarHandlerInterface),
                destinationChain,
                satelliteAddresses[destinationChain],
                payload,
                refundAddress
            )
        );
        require(gasSuccess, "Gas payment failed");

        // ✅ Use interface
        try axelarHandlerInterface.sendMessage(
            destinationChain,
            satelliteAddresses[destinationChain],
            payload
        ) {
            emit MessageSent(messageId, destinationChain, msg.sender);
        } catch Error(string memory reason) {
            revert(string(abi.encodePacked("Send failed: ", reason)));
        }
    }

    // ✅ FIXED: Replace line 727-734 in _sendCallback
    function _sendCallback(
        string memory destinationChain,
        uint256 originalNonce,
        bool success,
        bytes memory data
    ) internal {
        require(registeredChains[destinationChain], "Destination not registered");

        // Encode callback with proper type
        MessageTypes.CrossChainMessage memory callback = MessageTypes.CrossChainMessage({
            messageType: MessageTypes.MessageType.CALLBACK_RESPONSE,
            sender: address(this),
            sourceChainId: block.chainid,
            nonce: messageNonce++,
            payload: abi.encode(originalNonce, success, data)
        });

        bytes memory axelarPayload = MessageTypes.encodeMessage(callback);

        // ✅ Use interface instead of low-level call
        try axelarHandlerInterface.sendMessage(
            destinationChain,
            satelliteAddresses[destinationChain],
            axelarPayload
        ) {
            emit CallbackSent(destinationChain, originalNonce, success);
        } catch Error(string memory reason) {
            // Store for retry
            bytes32 callbackId = keccak256(abi.encodePacked(
                destinationChain,
                originalNonce,
                block.timestamp
            ));

            // Could store pending callbacks here for retry
            emit CallbackFailed(destinationChain, originalNonce, reason);
        }
    }
}
```

### Step 4: Add Callback Message Type to MessageTypes

**File**: `contracts/evm/contracts/crosschain/MessageTypes.sol`

```solidity
enum MessageType {
    CREATE_OFFER,
    CREATE_TRADE,
    FUND_ESCROW,
    RELEASE_FUNDS,
    DISPUTE_TRADE,
    UPDATE_PROFILE,
    QUERY_STATUS,
    BATCH_OPERATION,
    TOKEN_DEPOSIT,
    TOKEN_RELEASE,
    TOKEN_BRIDGE,
    TOKEN_REFUND,
    CALLBACK_RESPONSE  // ✅ NEW: Dedicated callback type
}

/**
 * @notice Callback response payload structure
 */
struct CallbackPayload {
    uint256 originalNonce;
    uint8 originalMessageType;
    bool success;
    bytes data;
}
```

### Step 5: Enable Hub to Send Responses via AxelarBridge

**File**: `contracts/evm/contracts/Hub.sol`

Add method to send responses back to satellites:

```solidity
// contracts/evm/contracts/Hub.sol

/**
 * @notice Send response message to satellite chain
 * @param destinationChain Target chain name
 * @param originalNonce Nonce from original request
 * @param success Whether operation succeeded
 * @param responseData Response data to send
 */
function sendSatelliteResponse(
    string memory destinationChain,
    uint256 originalNonce,
    bool success,
    bytes memory responseData
) internal {
    require(address(axelarBridge) != address(0), "Bridge not set");

    // Create callback message
    MessageTypes.CrossChainMessage memory response = MessageTypes.CrossChainMessage({
        messageType: MessageTypes.MessageType.CALLBACK_RESPONSE,
        sender: address(this),
        sourceChainId: block.chainid,
        nonce: crossChainMessageNonce++,
        payload: abi.encode(originalNonce, success, responseData)
    });

    // Send via bridge (assuming bridge has a sendMessage method)
    try axelarBridge.sendMessage(destinationChain, response) {
        emit SatelliteResponseSent(destinationChain, originalNonce, success);
    } catch Error(string memory reason) {
        emit SatelliteResponseFailed(destinationChain, originalNonce, reason);
    }
}

// Update existing handlers to send responses
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
    // ... existing validation ...

    // Get nonce from message (need to pass it as parameter)
    uint256 originalNonce = /* extract from context */;

    // Prevent replay
    bytes32 messageId = keccak256(abi.encodePacked(
        sourceChain,
        creator,
        offerId,
        crossChainMessageNonce++
    ));
    require(!processedCrossChainMessages[messageId], "Already processed");
    processedCrossChainMessages[messageId] = true;

    // Create offer
    IOffer offerContract = IOffer(_config.offerContract);
    localOfferId = offerContract.createOffer(
        isBuy ? IOffer.OfferType.Buy : IOffer.OfferType.Sell,
        fiatCurrency,
        token,
        0,
        amount,
        price,
        string(abi.encodePacked("Cross-chain offer from ", sourceChain))
    );

    emit CrossChainOfferCreated(offerId, sourceChain, creator);

    // ✅ NEW: Send success response back to satellite
    bytes memory responseData = abi.encode(
        offerId,
        localOfferId,
        "Offer created successfully"
    );
    sendSatelliteResponse(sourceChain, originalNonce, true, responseData);

    return localOfferId;
}
```

**Note**: This requires modifying AxelarBridge to pass originalNonce to Hub handlers. Alternative: Hub reads nonce from message ID mapping.

### Step 6: Update Satellite to Handle Callbacks

**File**: `contracts/evm/contracts/satellites/LocalMoneySatellite.sol`

```solidity
// Update _execute to handle CALLBACK_RESPONSE
function _execute(
    bytes32 commandId,
    string calldata sourceChain,
    string calldata sourceAddress,
    bytes calldata payload
) internal override {
    require(keccak256(bytes(sourceChain)) == keccak256(bytes(HUB_CHAIN)), "Invalid source chain");
    require(keccak256(bytes(sourceAddress)) == keccak256(bytes(hubAddress)), "Invalid source");

    MessageTypes.CrossChainMessage memory message = MessageTypes.decodeMessage(payload);

    // Check if this is a callback response
    if (message.messageType == MessageTypes.MessageType.CALLBACK_RESPONSE) {
        _handleCallback(message);
    } else {
        // Handle other message types (shouldn't normally receive these on satellite)
        revert("Unexpected message type on satellite");
    }
}

function _handleCallback(MessageTypes.CrossChainMessage memory message) internal {
    MessageTypes.CallbackPayload memory callback = abi.decode(
        message.payload,
        (MessageTypes.CallbackPayload)
    );

    // Prevent replay
    bytes32 callbackId = keccak256(abi.encodePacked(
        message.sender,
        callback.originalNonce,
        message.nonce
    ));
    require(!processedCallbacks[callbackId], "Callback already processed");
    processedCallbacks[callbackId] = true;

    if (callback.success) {
        _handleSuccessCallback(
            callback.originalNonce,
            callback.originalMessageType,
            callback.data
        );
    } else {
        _handleFailureCallback(
            callback.originalNonce,
            callback.originalMessageType,
            callback.data
        );
    }

    emit CallbackReceived(callbackId, callback.success, callback.data);
}

function _handleSuccessCallback(
    uint256 originalNonce,
    uint8 originalMessageType,
    bytes memory data
) internal {
    if (originalMessageType == uint8(MessageTypes.MessageType.CREATE_OFFER)) {
        (bytes32 offerId, uint256 localOfferId, string memory message) =
            abi.decode(data, (bytes32, uint256, string));

        // Update local cache to ACTIVE
        offerCache[offerId].isActive = true;
        offerCache[offerId].lastUpdate = block.timestamp;
        emit CacheUpdated(offerId, 0);

    } else if (originalMessageType == uint8(MessageTypes.MessageType.CREATE_TRADE)) {
        (bytes32 tradeId, uint256 localTradeId, string memory message) =
            abi.decode(data, (bytes32, uint256, string));

        // Update trade cache to ACTIVE
        tradeCache[tradeId].status = 1;
        tradeCache[tradeId].lastUpdate = block.timestamp;
        emit CacheUpdated(tradeId, 1);
    }
    // ... handle other types
}

function _handleFailureCallback(
    uint256 originalNonce,
    uint8 originalMessageType,
    bytes memory data
) internal {
    (string memory errorReason) = abi.decode(data, (string));

    if (originalMessageType == uint8(MessageTypes.MessageType.CREATE_OFFER)) {
        // Mark offer as FAILED
        // Extract offerId from stored requests (need request tracking)
        emit OperationFailed(originalNonce, errorReason);

    } else if (originalMessageType == uint8(MessageTypes.MessageType.CREATE_TRADE)) {
        // Mark trade as FAILED
        emit OperationFailed(originalNonce, errorReason);
    }
    // ... handle other types
}
```

### Step 7: Add Request Tracking to Satellite

To match callbacks with original requests:

```solidity
struct PendingRequest {
    uint256 nonce;
    uint8 messageType;
    bytes32 targetId;  // offerId or tradeId
    address requester;
    uint256 timestamp;
    bool isCompleted;
}

mapping(uint256 => PendingRequest) public pendingRequests;

function createOffer(...) external payable override nonReentrant whenNotPaused {
    // ... existing code ...

    uint256 nonce = messageNonce++;

    // Store pending request
    pendingRequests[nonce] = PendingRequest({
        nonce: nonce,
        messageType: uint8(MessageTypes.MessageType.CREATE_OFFER),
        targetId: offerId,
        requester: msg.sender,
        timestamp: block.timestamp,
        isCompleted: false
    });

    // ... send message ...
}

function _handleSuccessCallback(...) internal {
    // Mark request as completed
    pendingRequests[originalNonce].isCompleted = true;

    // ... update cache ...
}
```

## Implementation Tasks (In Order)

1. **Create IAxelarHandler Interface** (1 hour)
   - [ ] Create `contracts/evm/contracts/crosschain/interfaces/IAxelarHandler.sol`
   - [ ] Define sendMessage, gateway, isValidExecutable functions
   - [ ] Add comprehensive NatSpec documentation

2. **Update AxelarHandler** (1 hour)
   - [ ] Ensure public functions match interface
   - [ ] Add isValidExecutable view function
   - [ ] Test interface compliance

3. **Replace Low-Level Calls in AxelarBridge** (4 hours)
   - [ ] Import IAxelarHandler interface
   - [ ] Add axelarHandlerInterface state variable
   - [ ] Update initialize to cast to interface
   - [ ] Replace sendMessage low-level call (line 208-216)
   - [ ] Replace sendMessageWithGas low-level call (line 259-267)
   - [ ] Replace _sendCallback low-level call (line 727-734)
   - [ ] Add proper try-catch error handling
   - [ ] Update all error messages to be descriptive

4. **Add CALLBACK_RESPONSE Message Type** (1 hour)
   - [ ] Add to MessageTypes enum
   - [ ] Create CallbackPayload struct
   - [ ] Update validateMessage to handle new type

5. **Enable Hub Response Sending** (1 day)
   - [ ] Add sendSatelliteResponse internal function to Hub
   - [ ] Update handleCrossChainOfferCreation to send response
   - [ ] Update handleCrossChainTradeCreation to send response
   - [ ] Update handleCrossChainEscrowFunding to send response
   - [ ] Update handleCrossChainFundRelease to send response
   - [ ] Add SatelliteResponseSent and SatelliteResponseFailed events
   - [ ] Handle errors in response sending

6. **Update Satellite Callback Handling** (1 day)
   - [ ] Add _handleCallback function
   - [ ] Update _execute to route CALLBACK_RESPONSE
   - [ ] Implement _handleSuccessCallback with type discrimination
   - [ ] Implement _handleFailureCallback with type discrimination
   - [ ] Add request tracking (PendingRequest struct and mapping)
   - [ ] Update all user functions to store pending requests
   - [ ] Mark requests as completed in callbacks

7. **Add Callback Retry Mechanism** (1 day)
   - [ ] Store failed callbacks in mapping
   - [ ] Add retryCallback function (admin only)
   - [ ] Add callback expiry mechanism
   - [ ] Add getFailedCallbacks view function

8. **Write Comprehensive Tests** (3 days)
   - [ ] Test interface casting and calls
   - [ ] Test sendMessage with try-catch error handling
   - [ ] Test callback sending from Hub
   - [ ] Test callback receiving on Satellite
   - [ ] Test success callback updates cache correctly
   - [ ] Test failure callback marks operations as failed
   - [ ] Test request tracking and completion
   - [ ] Test callback replay protection
   - [ ] Test callback retry mechanism
   - [ ] Test error message propagation

9. **Integration Tests** (2 days)
   - [ ] Test complete offer creation with callback
   - [ ] Test complete trade flow with callbacks
   - [ ] Test failed operations with error callbacks
   - [ ] Test callback timeout and retry
   - [ ] Test multiple concurrent operations

10. **Documentation** (1 day)
    - [ ] Document interface pattern and benefits
    - [ ] Document callback flow with diagrams
    - [ ] Document request tracking
    - [ ] Add troubleshooting guide
    - [ ] Document gas costs

## Validation Gates

### Compilation
```bash
cd contracts/evm
just compile
# Should compile without errors
```

### Interface Tests
```bash
just test test/crosschain/AxelarHandler.test.js
# Verify interface compliance
```

### Bridge Tests
```bash
just test test/crosschain/AxelarBridge.test.js
# All tests should pass with new interface pattern
```

### Integration Tests
```bash
just test test/crosschain/Integration.test.js
# End-to-end callback flows should work
```

### Gas Report
```bash
just gas-report
# Verify gas costs didn't increase significantly
```

## Success Criteria

- [ ] All low-level calls replaced with typed interface calls
- [ ] IAxelarHandler interface created and implemented
- [ ] Error messages are descriptive (not "Failed to send message")
- [ ] Hub can send responses back to satellites
- [ ] CALLBACK_RESPONSE message type implemented
- [ ] Satellites handle callbacks and update cache
- [ ] Request tracking implemented on satellites
- [ ] Success callbacks update cache to ACTIVE state
- [ ] Failure callbacks update cache to FAILED state
- [ ] Callback replay protection implemented
- [ ] Failed callbacks stored for retry
- [ ] Test coverage >95%
- [ ] Integration tests demonstrate bidirectional communication
- [ ] Documentation complete

## Common Pitfalls to Avoid

1. **Interface Mismatch**: Ensure AxelarHandler functions match interface exactly
2. **Missing Error Handling**: Always wrap interface calls in try-catch
3. **Wrong Callback Format**: Use CallbackPayload struct consistently
4. **Replay Attacks**: Check processedCallbacks before processing
5. **Nonce Tracking**: Ensure original nonce is preserved in callbacks
6. **Type Confusion**: Carefully convert between message types
7. **Gas Estimation**: Interface calls need proper gas limits
8. **State Desync**: Ensure cache updates are atomic

## Confidence Score

**9/10** - Very high confidence for one-pass implementation

### Reasoning:
- ✅ Clear interface pattern from Solidity best practices
- ✅ Existing callback skeleton in place
- ✅ Similar patterns exist in other contracts (IOffer, ITrade)
- ✅ Test patterns well established
- ✅ All required components already exist
- ⚠️ Minor risk: Coordinating nonce passing between contracts

### Risk Mitigation:
- Use proven interface pattern from OpenZeppelin
- Test each replacement incrementally
- Maintain backward compatibility during transition
- Add extensive error messages for debugging

## Notes for AI Agent

### Self-Validation Checklist
1. ✅ Can compile without errors
2. ✅ No low-level calls remain in AxelarBridge
3. ✅ Interface matches implementation exactly
4. ✅ All try-catch blocks have descriptive errors
5. ✅ Hub sends responses after operations
6. ✅ Satellites receive and process callbacks
7. ✅ Cache updates work correctly
8. ✅ Request tracking works
9. ✅ Integration tests pass
10. ✅ Gas costs reasonable

### Debugging Tips
```bash
# Check interface compliance
npx hardhat compile --force

# Test specific interface call
npx hardhat test --grep "interface call"

# Check callback flow
npx hardhat test --grep "callback" --logs

# Verify no low-level calls
grep -r "\.call(" contracts/evm/contracts/crosschain/AxelarBridge.sol
```

### Expected Improvements
- **Type Safety**: Compile-time checking of function calls
- **Error Messages**: Clear, actionable error messages
- **Debugging**: Stack traces show actual function names
- **Gas Efficiency**: No overhead from low-level encoding
- **Maintainability**: Refactoring is safe and easy
- **User Experience**: Satellites show real-time operation status