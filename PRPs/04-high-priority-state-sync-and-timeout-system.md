# PRP: State Synchronization & Message Timeout System

## Overview
Implement proper state synchronization between Hub and Satellites with message timeout, retry mechanisms, and cache staleness prevention.

**Status:** HIGH - Data Consistency Risk
**Estimated Time:** 1-2 weeks
**Dependencies:** AxelarBridge, LocalMoneySatellite, Hub

## Reference Documentation
- **Two-Way Messaging**: https://docs.axelar.dev/dev/general-message-passing/gmp-examples#two-way-messaging
- **State Machines**: https://docs.openzeppelin.com/contracts/4.x/utilities#state_machines

## Problems

### Problem 1: Satellite Cache Staleness
**Location**: `LocalMoneySatellite.sol:114-122`

```solidity
// Optimistically sets to active immediately
offerCache[offerId].isActive = true;
// But if hub rejects, cache never updated!
```

**Impact**: Users see offers that don't exist on hub.

### Problem 2: No Message Timeout
Messages can remain pending forever if callbacks fail.

### Problem 3: No Retry Mechanism
Failed messages are stored but never retried.

## Implementation Blueprint

### Step 1: Add Message States to Satellite

```solidity
enum MessageState { PENDING, CONFIRMED, FAILED, EXPIRED }

struct TrackedMessage {
    bytes32 messageId;
    uint8 messageType;
    bytes32 targetId;
    address sender;
    uint256 timestamp;
    MessageState state;
    string failureReason;
}

mapping(bytes32 => TrackedMessage) public trackedMessages;
uint256 public constant MESSAGE_TIMEOUT = 1 hours;
```

### Step 2: Implement Timeout Mechanism

```solidity
function checkMessageTimeout(bytes32 messageId) external view returns (bool) {
    TrackedMessage memory msg = trackedMessages[messageId];
    return msg.state == MessageState.PENDING &&
           block.timestamp >= msg.timestamp + MESSAGE_TIMEOUT;
}

function markMessageExpired(bytes32 messageId) external {
    require(checkMessageTimeout(messageId), "Not expired");
    trackedMessages[messageId].state = MessageState.EXPIRED;

    // Revert optimistic cache update
    _revertCacheUpdate(messageId);
}
```

### Step 3: Add Retry Mechanism

```solidity
function retryMessage(bytes32 messageId) external payable {
    TrackedMessage memory msg = trackedMessages[messageId];
    require(
        msg.state == MessageState.FAILED || msg.state == MessageState.EXPIRED,
        "Cannot retry"
    );
    require(msg.sender == msg.sender, "Not sender");
    require(msg.value > 0, "Gas required");

    // Resend with new nonce
    // ... implementation
}
```

### Step 4: Implement Periodic State Sync

```solidity
// In Hub contract
function syncStateToSatellite(
    string memory targetChain,
    bytes32[] memory offerIds,
    bytes32[] memory tradeIds
) external onlyRole(OPERATOR_ROLE) {
    for (uint i = 0; i < offerIds.length; i++) {
        // Get current state from Offer contract
        IOffer.OfferData memory offer = offerContract.getOffer(
            uint256(offerIds[i])
        );

        // Send state update
        bytes memory stateUpdate = abi.encode(
            offerIds[i],
            offer.state,
            offer.maxAmount
        );

        axelarBridge.sendMessage(targetChain, encodeStateUpdateMessage(stateUpdate));
    }
}
```

## Implementation Tasks

1. **Add Message State Tracking** (1 day)
   - [ ] Add MessageState enum
   - [ ] Add TrackedMessage struct
   - [ ] Track all outgoing messages
   - [ ] Update on callback receipt

2. **Implement Timeout System** (1 day)
   - [ ] Add timeout constant
   - [ ] Add checkMessageTimeout function
   - [ ] Add markMessageExpired function
   - [ ] Revert optimistic updates on expiry

3. **Implement Retry Mechanism** (1 day)
   - [ ] Add retryMessage function
   - [ ] Validate retry conditions
   - [ ] Generate new nonce
   - [ ] Pay gas for retry

4. **Add Periodic State Sync** (2 days)
   - [ ] Add syncStateToSatellite to Hub
   - [ ] Add STATE_UPDATE message type
   - [ ] Handle state updates on satellite
   - [ ] Add automated sync scheduler

5. **Add Cache Consistency Checks** (1 day)
   - [ ] Add getCacheConsistency view function
   - [ ] Compare with hub state
   - [ ] Alert on mismatches

6. **Comprehensive Testing** (2 days)
   - [ ] Test timeout detection
   - [ ] Test retry with new gas
   - [ ] Test state sync updates cache
   - [ ] Test consistency checks

## Validation Gates

```bash
just compile
just test test/crosschain/StateSync.test.js
just test test/satellites/LocalMoneySatellite.test.js
```

## Success Criteria
- [ ] Messages have PENDING/CONFIRMED/FAILED states
- [ ] Timeouts detected and handled
- [ ] Retry mechanism works
- [ ] Periodic state sync implemented
- [ ] Cache consistency verifiable
- [ ] No stale data in satellites

## Confidence Score: 7/10
Moderate complexity due to state machine coordination.