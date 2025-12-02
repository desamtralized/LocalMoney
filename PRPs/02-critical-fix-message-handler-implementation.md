# PRP: Critical Message Handler Implementation for AxelarBridge

## Overview
Implement complete functionality for all 12 message handlers in AxelarBridge contract. Currently, all handlers are empty placeholders that only emit events without processing messages, which blocks all cross-chain functionality.

**Status:** CRITICAL - Blocks Production Deployment
**Estimated Time:** 2-3 weeks
**Dependencies:** Existing AxelarBridge, Hub, Offer, Trade, Profile contracts

## Reference Documentation

### Axelar Network Documentation
- **GMP Messages**: https://docs.axelar.dev/dev/general-message-passing/gmp-messages
- **Message Execution**: https://docs.axelar.dev/dev/general-message-passing/gmp-solidity#message-execution
- **Error Handling**: https://docs.axelar.dev/dev/general-message-passing/gmp-error-handling

### LocalMoney Codebase References
- **AxelarBridge**: `contracts/evm/contracts/crosschain/AxelarBridge.sol` (lines 273-698)
- **MessageTypes**: `contracts/evm/contracts/crosschain/MessageTypes.sol`
- **Hub Interface**: `contracts/evm/contracts/interfaces/IHub.sol` (lines 141-205)
- **Offer Contract**: `contracts/evm/contracts/Offer.sol` (lines 80-150)
- **Trade Contract**: `contracts/evm/contracts/Trade.sol` (lines 140-200)
- **Existing Tests**: `contracts/evm/test/crosschain/AxelarBridge.test.js`

## Problem Statement

### Current State
All message handlers in `AxelarBridge.sol` have placeholder implementations:

```solidity
// Line 557-564
function _handleDisputeTrade(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    // Basic implementation for dispute handling
    // Can be extended based on specific requirements
    emit MessageProcessed(
        MessageTypes.getMessageId(message, sourceChain),
        sourceChain,
        message.sender
    );
}
```

### Impact
- **Cannot process cross-chain messages**: All messages are marked as "processed" without actual execution
- **No validation**: Invalid messages are accepted
- **No error handling**: Failures are silently ignored
- **No callbacks**: Satellites never receive confirmation
- **Funds at risk**: Escrow operations have no implementation

### Affected Handlers
1. `_handleCreateOffer` (line 278)
2. `_handleCreateTrade` (line 386)
3. `_handleFundEscrow` (line 443)
4. `_handleReleaseFunds` (line 497)
5. `_handleDisputeTrade` (line 553)
6. `_handleUpdateProfile` (line 569)
7. `_handleQueryStatus` (line 585)
8. `_handleBatchOperation` (line 607)
9. `_handleTokenDeposit` (line 621)
10. `_handleTokenRelease` (line 646)
11. `_handleTokenBridge` (line 667)
12. `_handleTokenRefund` (line 684)

## Context for AI Agent

### Existing Patterns to Follow

#### 1. Hub Contract Cross-Chain Handlers
**Reference**: `Hub.sol:524-669`

The Hub contract has cross-chain handlers that show the expected pattern:
```solidity
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
    // 1. Validate parameters
    require(chainNameToId[sourceChain] != 0, "Unsupported chain");
    require(creator != address(0), "Invalid creator");
    require(amount > 0, "Invalid amount");

    // 2. Prevent replay
    bytes32 messageId = keccak256(...);
    require(!processedCrossChainMessages[messageId], "Already processed");
    processedCrossChainMessages[messageId] = true;

    // 3. Execute operation
    IOffer offerContract = IOffer(_config.offerContract);
    localOfferId = offerContract.createOffer(...);

    // 4. Emit events
    emit CrossChainOfferCreated(offerId, sourceChain, creator);

    return localOfferId;
}
```

#### 2. Error Handling Pattern
**Reference**: `AxelarBridge.sol:273-380`

Existing partial implementation shows try-catch pattern:
```solidity
try hub.handleCrossChainOfferCreation(...) returns (uint256 localOfferId) {
    // Success path
    bytes memory callbackData = abi.encode(offerId, localOfferId, true, "");
    _sendCallback(sourceChain, message.nonce, true, callbackData);
    emit MessageProcessed(...);

} catch Error(string memory reason) {
    // Known error
    bytes memory callbackData = abi.encode(offerId, 0, false, reason);
    _sendCallback(sourceChain, message.nonce, false, callbackData);

    bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
    failedMessages[messageId] = message;
    failedMessageReasons[messageId] = reason;
    emit MessageFailed(messageId, reason);

} catch (bytes memory lowLevelData) {
    // Unknown error
    bytes memory callbackData = abi.encode(offerId, 0, false, "Unknown error");
    _sendCallback(sourceChain, message.nonce, false, callbackData);
    // ... store for recovery
}
```

#### 3. Payload Decoding Pattern
**Reference**: `MessageTypes.sol:44-118`

Each message type has a defined payload structure:
```solidity
struct CreateOfferPayload {
    address token;
    uint256 amount;
    uint256 price;
    bool isBuy;
    string fiatCurrency;
    uint256 minAmount;
    uint256 maxAmount;
}

// Decode in handler:
MessageTypes.CreateOfferPayload memory payload = abi.decode(
    message.payload,
    (MessageTypes.CreateOfferPayload)
);
```

### Testing Pattern
**Reference**: `test/crosschain/AxelarBridge.test.js:120-194`

```javascript
it("should process CREATE_OFFER message", async function () {
    // 1. Prepare message
    const message = {
        messageType: 0, // CREATE_OFFER
        sender: user1.address,
        sourceChainId: 137,
        nonce: 1,
        payload: ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "uint256", "bool", "string", "uint256", "uint256"],
            [token, amount, price, true, "USD", minAmount, maxAmount]
        )
    };

    // 2. Encode for Axelar
    const encodedMessage = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "address", "uint256", "uint256", "bytes"],
        [message.messageType, message.sender, message.sourceChainId, message.nonce, message.payload]
    );

    // 3. Simulate Axelar callback
    await mockGateway.callExecute(
        await axelarBridge.getAddress(),
        "Polygon",
        "0xSatelliteAddress",
        encodedMessage
    );

    // 4. Verify processing
    expect(await axelarBridge.isMessageProcessed(messageId)).to.be.true;
});
```

## Implementation Blueprint

### Step 1: Add Missing Payload Structures to MessageTypes.sol

```solidity
// contracts/evm/contracts/crosschain/MessageTypes.sol

struct DisputeTradePayload {
    bytes32 tradeId;
    string reason;
    bytes evidence;
}

struct UpdateProfilePayload {
    string contactInfo;
    string publicKey;
    bytes metadata;
}

struct QueryStatusPayload {
    bytes32 targetId;  // offerId or tradeId
    uint8 queryType;   // 0=offer, 1=trade
}

struct BatchOperationPayload {
    uint8[] operationTypes;
    bytes[] operationData;
}
```

### Step 2: Implement Each Handler

#### Handler 1: _handleCreateOffer (COMPLETE - Reference Implementation)
**Lines**: 278-381
**Status**: ✅ Already implemented correctly
**No changes needed**

#### Handler 2: _handleCreateTrade (PARTIAL - Needs Enhancement)
**Lines**: 386-438
**Current Issues**: Missing error handling for invalid offer IDs

```solidity
function _handleCreateTrade(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    MessageTypes.CreateTradePayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.CreateTradePayload)
    );

    // Enhanced validation
    require(payload.amount > 0, "Invalid amount");
    require(payload.trader != address(0), "Invalid trader");
    require(payload.offerId != bytes32(0), "Invalid offer ID");

    bytes32 tradeId = keccak256(abi.encodePacked(
        sourceChain,
        message.sender,
        message.nonce,
        payload.offerId,
        block.timestamp
    ));

    // Check offer exists and is active
    try hub.handleCrossChainTradeCreation(
        sourceChain,
        payload.trader,
        tradeId,
        uint256(payload.offerId),
        payload.amount
    ) returns (uint256 localTradeId) {
        bytes memory callbackData = abi.encode(
            tradeId,
            localTradeId,
            true,
            ""
        );
        _sendCallback(sourceChain, message.nonce, true, callbackData);
        emit MessageProcessed(
            MessageTypes.getMessageId(message, sourceChain),
            sourceChain,
            message.sender
        );

    } catch Error(string memory reason) {
        bytes memory callbackData = abi.encode(tradeId, 0, false, reason);
        _sendCallback(sourceChain, message.nonce, false, callbackData);

        bytes32 messageId = MessageTypes.getMessageId(message, sourceChain);
        failedMessages[messageId] = message;
        failedMessageReasons[messageId] = reason;
        emit MessageFailed(messageId, reason);
    }
}
```

#### Handler 3: _handleFundEscrow (COMPLETE - Reference Implementation)
**Lines**: 443-492
**Status**: ✅ Already implemented correctly
**No changes needed**

#### Handler 4: _handleReleaseFunds (COMPLETE - Reference Implementation)
**Lines**: 497-548
**Status**: ✅ Already implemented correctly
**No changes needed**

#### Handler 5: _handleDisputeTrade (EMPTY - Critical Implementation Needed)
**Lines**: 553-564
**Current**: Empty placeholder

```solidity
function _handleDisputeTrade(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    MessageTypes.DisputeTradePayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.DisputeTradePayload)
    );

    require(payload.tradeId != bytes32(0), "Invalid trade ID");
    require(bytes(payload.reason).length > 0, "Dispute reason required");
    require(payload.reason.length <= 1000, "Reason too long");

    // Convert bytes32 tradeId to uint256 for Trade contract
    uint256 localTradeId = uint256(payload.tradeId);

    // Get Trade contract from Hub
    IHub.HubConfig memory config = hub.getConfig();
    ITrade tradeContract = ITrade(config.tradeContract);

    try tradeContract.initiateDispute(
        localTradeId,
        message.sender,
        payload.reason
    ) {
        bytes memory callbackData = abi.encode(
            payload.tradeId,
            true,
            "Dispute initiated successfully"
        );
        _sendCallback(sourceChain, message.nonce, true, callbackData);

        emit MessageProcessed(
            MessageTypes.getMessageId(message, sourceChain),
            sourceChain,
            message.sender
        );

    } catch Error(string memory reason) {
        bytes memory callbackData = abi.encode(
            payload.tradeId,
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
```

#### Handler 6: _handleUpdateProfile (EMPTY - Implementation Needed)
**Lines**: 569-580

```solidity
function _handleUpdateProfile(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    MessageTypes.UpdateProfilePayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.UpdateProfilePayload)
    );

    require(bytes(payload.contactInfo).length > 0, "Contact info required");

    // Get Profile contract from Hub
    IHub.HubConfig memory config = hub.getConfig();
    IProfile profileContract = IProfile(config.profileContract);

    try profileContract.updateCrossChainProfile(
        message.sender,
        sourceChain,
        payload.contactInfo,
        payload.publicKey
    ) {
        bytes memory callbackData = abi.encode(
            message.sender,
            true,
            "Profile updated successfully"
        );
        _sendCallback(sourceChain, message.nonce, true, callbackData);

        emit MessageProcessed(
            MessageTypes.getMessageId(message, sourceChain),
            sourceChain,
            message.sender
        );

    } catch Error(string memory reason) {
        bytes memory callbackData = abi.encode(
            message.sender,
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
```

#### Handler 7: _handleQueryStatus (PARTIAL - Needs Enhancement)
**Lines**: 585-602

```solidity
function _handleQueryStatus(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    MessageTypes.QueryStatusPayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.QueryStatusPayload)
    );

    require(payload.targetId != bytes32(0), "Invalid target ID");

    bytes memory statusData;

    if (payload.queryType == 0) {
        // Query offer status
        IHub.HubConfig memory config = hub.getConfig();
        IOffer offerContract = IOffer(config.offerContract);

        try offerContract.getOffer(uint256(payload.targetId)) returns (
            IOffer.OfferData memory offerData
        ) {
            statusData = abi.encode(
                offerData.id,
                offerData.state,
                offerData.maxAmount,
                "Offer found"
            );
        } catch {
            statusData = abi.encode(0, 0, 0, "Offer not found");
        }

    } else if (payload.queryType == 1) {
        // Query trade status
        IHub.HubConfig memory config = hub.getConfig();
        ITrade tradeContract = ITrade(config.tradeContract);

        try tradeContract.getTrade(uint256(payload.targetId)) returns (
            ITrade.TradeData memory tradeData
        ) {
            statusData = abi.encode(
                tradeData.id,
                tradeData.state,
                tradeData.amount,
                "Trade found"
            );
        } catch {
            statusData = abi.encode(0, 0, 0, "Trade not found");
        }
    } else {
        statusData = abi.encode(0, 0, 0, "Invalid query type");
    }

    // Send status back to satellite
    _sendCallback(sourceChain, message.nonce, true, statusData);

    emit MessageProcessed(
        MessageTypes.getMessageId(message, sourceChain),
        sourceChain,
        message.sender
    );
}
```

#### Handler 8: _handleBatchOperation (EMPTY - Implementation Needed)
**Lines**: 607-618

```solidity
function _handleBatchOperation(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    MessageTypes.BatchOperationPayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.BatchOperationPayload)
    );

    require(payload.operationTypes.length > 0, "No operations");
    require(
        payload.operationTypes.length == payload.operationData.length,
        "Length mismatch"
    );
    require(payload.operationTypes.length <= 10, "Too many operations");

    uint256 successCount = 0;
    bytes[] memory results = new bytes[](payload.operationTypes.length);

    for (uint256 i = 0; i < payload.operationTypes.length; i++) {
        MessageTypes.MessageType opType = MessageTypes.MessageType(
            payload.operationTypes[i]
        );

        // Create sub-message for each operation
        MessageTypes.CrossChainMessage memory subMessage = MessageTypes.CrossChainMessage({
            messageType: opType,
            sender: message.sender,
            sourceChainId: message.sourceChainId,
            nonce: message.nonce + i + 1,
            payload: payload.operationData[i]
        });

        // Route to appropriate handler
        try this.routeMessage(subMessage, sourceChain) {
            successCount++;
            results[i] = abi.encode(true, "Success");
        } catch Error(string memory reason) {
            results[i] = abi.encode(false, reason);
        }
    }

    bytes memory callbackData = abi.encode(
        successCount,
        payload.operationTypes.length,
        results
    );

    _sendCallback(sourceChain, message.nonce, true, callbackData);

    emit MessageProcessed(
        MessageTypes.getMessageId(message, sourceChain),
        sourceChain,
        message.sender
    );
}
```

#### Handler 9: _handleTokenDeposit (PARTIAL - Reference Implementation)
**Lines**: 621-644
**Status**: ✅ Already implemented correctly
**No changes needed**

#### Handler 10: _handleTokenRelease (PARTIAL - Reference Implementation)
**Lines**: 646-665
**Status**: ✅ Already implemented correctly
**No changes needed**

#### Handler 11: _handleTokenBridge (EMPTY - Implementation Needed)
**Lines**: 667-679

```solidity
function _handleTokenBridge(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    require(address(tokenRegistry) != address(0), "Token registry not set");

    MessageTypes.TokenBridgePayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.TokenBridgePayload)
    );

    require(payload.token != address(0), "Invalid token");
    require(payload.amount > 0, "Invalid amount");
    require(payload.recipient != address(0), "Invalid recipient");

    // Validate token is registered
    ITSTokenRegistry.TokenInfo memory tokenInfo = tokenRegistry.getTokenInfo(
        payload.token
    );
    require(tokenInfo.isRegistered, "Token not registered");
    require(!tokenInfo.isPaused, "Token paused");

    // Get destination chain ID from reference
    uint256 destChainId = tokenRegistry.chainNameToId(sourceChain);
    require(destChainId > 0, "Unknown destination chain");

    // Forward to token bridge or cross-chain escrow
    if (address(crossChainEscrow) != address(0)) {
        try crossChainEscrow.releaseToChain{value: msg.value}(
            destChainId,
            payload.recipient,
            payload.token,
            payload.amount,
            payload.referenceId
        ) {
            bytes memory callbackData = abi.encode(
                payload.referenceId,
                payload.amount,
                true,
                "Bridge transfer initiated"
            );
            _sendCallback(sourceChain, message.nonce, true, callbackData);

            emit MessageProcessed(
                MessageTypes.getMessageId(message, sourceChain),
                sourceChain,
                message.sender
            );

        } catch Error(string memory reason) {
            bytes memory callbackData = abi.encode(
                payload.referenceId,
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
    } else {
        revert("CrossChainEscrow not configured");
    }
}
```

#### Handler 12: _handleTokenRefund (EMPTY - Implementation Needed)
**Lines**: 684-698

```solidity
function _handleTokenRefund(
    MessageTypes.CrossChainMessage memory message,
    string memory sourceChain
) internal {
    require(address(crossChainEscrow) != address(0), "Escrow not set");

    MessageTypes.TokenBridgePayload memory payload = abi.decode(
        message.payload,
        (MessageTypes.TokenBridgePayload)
    );

    require(payload.token != address(0), "Invalid token");
    require(payload.amount > 0, "Invalid amount");
    require(payload.sender != address(0), "Invalid sender");
    require(payload.referenceId != bytes32(0), "Invalid reference");

    // Verify refund is authorized
    // This should be called only after trade cancellation or failure

    bytes32 depositId = keccak256(abi.encodePacked(
        sourceChain,
        payload.sender,
        payload.referenceId
    ));

    try crossChainEscrow.emergencyUnlockDeposit(depositId) {
        // Transfer refunded tokens back to sender
        IERC20(payload.token).safeTransfer(payload.sender, payload.amount);

        bytes memory callbackData = abi.encode(
            payload.referenceId,
            payload.amount,
            true,
            "Refund processed successfully"
        );
        _sendCallback(sourceChain, message.nonce, true, callbackData);

        emit MessageProcessed(
            MessageTypes.getMessageId(message, sourceChain),
            sourceChain,
            message.sender
        );

    } catch Error(string memory reason) {
        bytes memory callbackData = abi.encode(
            payload.referenceId,
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
```

### Step 3: Enhance Hub Contract Cross-Chain Handlers

**Add Missing Handlers to IHub.sol**:

```solidity
// contracts/evm/contracts/interfaces/IHub.sol

/**
 * @notice Handle cross-chain dispute initiation
 */
function handleCrossChainDispute(
    string memory sourceChain,
    bytes32 tradeId,
    address initiator,
    string memory reason
) external returns (bool);

/**
 * @notice Handle cross-chain profile update
 */
function handleCrossChainProfileUpdate(
    string memory sourceChain,
    address user,
    string memory contactInfo,
    string memory publicKey
) external returns (bool);
```

**Implement in Hub.sol**:

```solidity
// contracts/evm/contracts/Hub.sol

function handleCrossChainDispute(
    string memory sourceChain,
    bytes32 tradeId,
    address initiator,
    string memory reason
) external onlyAxelarBridge nonReentrant whenNotPaused returns (bool) {
    require(chainNameToId[sourceChain] != 0, "Unsupported chain");
    require(initiator != address(0), "Invalid initiator");
    require(bytes(reason).length > 0, "Reason required");

    uint256 localTradeId = uint256(tradeId);

    ITrade tradeContract = ITrade(_config.tradeContract);
    tradeContract.initiateDispute(localTradeId, initiator, reason);

    return true;
}

function handleCrossChainProfileUpdate(
    string memory sourceChain,
    address user,
    string memory contactInfo,
    string memory publicKey
) external onlyAxelarBridge nonReentrant whenNotPaused returns (bool) {
    require(chainNameToId[sourceChain] != 0, "Unsupported chain");
    require(user != address(0), "Invalid user");

    IProfile profileContract = IProfile(_config.profileContract);
    profileContract.updateContactInfo(user, contactInfo);

    return true;
}
```

## Implementation Tasks (In Order)

1. **Add Missing Payload Structures** (30 min)
   - [ ] Add DisputeTradePayload to MessageTypes.sol
   - [ ] Add UpdateProfilePayload to MessageTypes.sol
   - [ ] Add QueryStatusPayload to MessageTypes.sol
   - [ ] Add BatchOperationPayload to MessageTypes.sol

2. **Implement Critical Handlers** (2 days)
   - [ ] Complete _handleDisputeTrade implementation
   - [ ] Complete _handleUpdateProfile implementation
   - [ ] Complete _handleTokenBridge implementation
   - [ ] Complete _handleTokenRefund implementation

3. **Enhance Partial Handlers** (1 day)
   - [ ] Enhance _handleCreateTrade validation
   - [ ] Enhance _handleQueryStatus with offer/trade queries
   - [ ] Complete _handleBatchOperation with proper routing

4. **Add Hub Contract Methods** (1 day)
   - [ ] Add handleCrossChainDispute to IHub interface
   - [ ] Add handleCrossChainProfileUpdate to IHub interface
   - [ ] Implement both methods in Hub.sol

5. **Add Profile Contract Cross-Chain Support** (1 day)
   - [ ] Add updateCrossChainProfile method to IProfile
   - [ ] Implement in Profile.sol
   - [ ] Add cross-chain validation

6. **Add Trade Contract Dispute Support** (1 day)
   - [ ] Add initiateDispute method to ITrade (if not exists)
   - [ ] Ensure it can be called from Hub
   - [ ] Add proper access control

7. **Write Comprehensive Tests** (3-4 days)
   - [ ] Test _handleDisputeTrade with valid/invalid data
   - [ ] Test _handleUpdateProfile success/failure paths
   - [ ] Test _handleQueryStatus for offers and trades
   - [ ] Test _handleBatchOperation with multiple operations
   - [ ] Test _handleTokenBridge with valid tokens
   - [ ] Test _handleTokenRefund authorization
   - [ ] Test error handling and callbacks for all handlers
   - [ ] Test replay protection
   - [ ] Test invalid payload handling

8. **Integration Tests** (2 days)
   - [ ] Test complete offer creation flow
   - [ ] Test complete trade flow with escrow
   - [ ] Test dispute flow end-to-end
   - [ ] Test batch operations
   - [ ] Test callback delivery

9. **Gas Optimization** (1 day)
   - [ ] Profile gas usage for each handler
   - [ ] Optimize payload decoding
   - [ ] Optimize callback generation
   - [ ] Document gas costs

10. **Documentation** (1 day)
    - [ ] Document each handler's behavior
    - [ ] Add JSDoc comments
    - [ ] Update integration guide
    - [ ] Add troubleshooting section

## Validation Gates

### Compilation
```bash
cd contracts/evm
just compile
# Should compile without errors or warnings
```

### Unit Tests
```bash
just test test/crosschain/AxelarBridge.test.js
# All tests should pass with >95% coverage
```

### Integration Tests
```bash
just test test/crosschain/Integration.test.js
# End-to-end flows should complete successfully
```

### Gas Analysis
```bash
just gas-report
# Verify handler gas costs are reasonable (<500k per handler)
```

### Security Checks
```bash
just test-security
# No new security issues should be introduced
```

## Success Criteria

- [ ] All 12 handlers have complete implementations
- [ ] All handlers decode and validate payloads correctly
- [ ] All handlers forward to appropriate Hub/Offer/Trade methods
- [ ] All handlers implement proper error handling with try-catch
- [ ] All handlers send callbacks on success and failure
- [ ] All handlers store failed messages for recovery
- [ ] Test coverage >95% for all handlers
- [ ] Integration tests pass for complete flows
- [ ] Gas costs <500k per handler
- [ ] No security vulnerabilities introduced
- [ ] Documentation complete for all handlers

## Common Pitfalls to Avoid

1. **Missing Validation**: Always validate all payload fields before processing
2. **No Error Handling**: Wrap all external calls in try-catch
3. **Replay Attacks**: Handlers rely on handleAxelarMessage for replay protection
4. **Callback Failures**: Always attempt callback even on failure
5. **Type Conversion**: Be careful converting bytes32 ↔ uint256 ↔ address
6. **Gas Limits**: Keep handler logic simple to avoid out-of-gas
7. **State Inconsistency**: Ensure atomicity - either all operations succeed or all fail
8. **Unauthorized Access**: Handlers are internal but called from verified path

## Confidence Score

**8/10** - High confidence for one-pass implementation success

### Reasoning:
- ✅ Clear patterns exist in codebase
- ✅ Partial implementations show the way
- ✅ All required interfaces documented
- ✅ Test patterns established
- ⚠️ Some handlers require new Hub methods (adds complexity)
- ⚠️ Profile and Trade contract modifications needed (coordination required)

### Risk Mitigation:
- Start with handlers that don't need new Hub methods (DisputeTrade, QueryStatus)
- Implement and test incrementally
- Use existing handlers as reference
- Maintain consistent error handling patterns

## Notes for AI Agent

### Self-Validation Checklist
Before marking this PRP complete, verify:
1. ✅ Can compile all contracts without errors
2. ✅ Can run existing tests and they pass
3. ✅ New tests added and passing
4. ✅ Each handler decodes payload correctly
5. ✅ Each handler validates inputs
6. ✅ Each handler calls appropriate Hub method
7. ✅ Each handler sends callbacks
8. ✅ Each handler handles errors properly
9. ✅ Integration tests demonstrate end-to-end flows
10. ✅ Documentation updated

### Iterative Refinement
If tests fail:
1. Check payload structure matches MessageTypes definition
2. Verify Hub contract has required handler method
3. Check callback encoding format
4. Verify access control (onlyAxelarBridge)
5. Check gas limits aren't exceeded
6. Verify event emissions

### Debug Commands
```bash
# Compile with detailed errors
npx hardhat compile --show-stack-traces

# Run specific test with logs
npx hardhat test test/crosschain/AxelarBridge.test.js --grep "handleDisputeTrade" --logs

# Check contract size
just size

# Gas profiling
REPORT_GAS=true npx hardhat test
```