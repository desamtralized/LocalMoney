name: "EVM Translation Phase 3: Trade Contract Basic Implementation"
description: |

## Purpose
Implement the core Trade contract for LocalMoney EVM protocol, handling trade lifecycle from creation through escrow funding to completion. This phase focuses on basic trade flow without dispute resolution (Phase 4), establishing the escrow mechanism and state management system.

## Core Principles
1. **Escrow Safety**: Secure handling of user funds
2. **State Machine**: Clear, auditable state transitions
3. **Atomic Operations**: No partial state changes
4. **Reentrancy Protection**: Prevent attack vectors
5. **Event Logging**: Complete audit trail

---

## Goal
Create a functional Trade contract that handles the complete happy-path trading flow: trade creation, acceptance, escrow funding, fiat confirmation, and escrow release, with proper integration to Offer, Hub, and Profile contracts.

## Why
- **Core Functionality**: Trade execution is the heart of the protocol
- **User Trust**: Secure escrow builds confidence
- **State Management**: Clear tracking of trade progress
- **Integration Point**: Connects all other contracts

## What
Complete implementation including:
- **Trade Contract**: State machine for trade lifecycle
- **Escrow Management**: Secure fund handling for ETH and ERC20
- **State Transitions**: Validated state changes
- **Fee Calculation**: Basic fee structure (dispute fees in Phase 4)
- **Timer Management**: Trade expiration handling
- **Profile Updates**: Trade statistics tracking
- **Event System**: Comprehensive logging

### Success Criteria
- [X] Complete trade flow works end-to-end
- [X] Escrow holds funds securely
- [X] State transitions are validated
- [X] Expiration timers work correctly
- [X] Fees calculate and distribute properly
- [X] Integration with other contracts works
- [~] Gas costs reasonable (< 200k per operation) - Trade creation ~630k, other ops within range
- [X] Test coverage > 90% - Achieved 94.64% statement coverage

## All Needed Context

### Critical Documentation Sources
```yaml
# ESCROW PATTERNS
escrow_pattern: https://docs.openzeppelin.com/contracts/5.x/api/utils#Escrow
pull_payment: https://docs.openzeppelin.com/contracts/5.x/api/security#PullPayment

# ERC20 HANDLING
safe_erc20: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20
ierc20: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#IERC20

# STATE MACHINE
state_pattern: https://medium.com/coinmonks/state-machines-in-solidity-9e2d8a6d7a11
```

### Reference Files to Analyze
```yaml
# COSMWASM IMPLEMENTATION
trade_contract: contracts/cosmwasm/contracts/trade/src/contract.rs
trade_lib: contracts/cosmwasm/contracts/trade/src/lib.rs

# PREREQUISITE CONTRACTS
hub_contract: contracts/evm/contracts/Hub.sol
offer_contract: contracts/evm/contracts/Offer.sol
profile_contract: contracts/evm/contracts/Profile.sol

# TRANSLATION GUIDE
guide: COSMWASM_TO_EVM_TRANSLATION_GUIDE.md (lines 244-344)
```

### Implementation Blueprint

#### 1. Trade Contract Structure
```solidity
// Based on COSMWASM_TO_EVM_TRANSLATION_GUIDE.md lines 246-286
contract Trade is Initializable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    
    enum TradeState {
        RequestCreated,     // 0: Initial state
        RequestAccepted,    // 1: Maker accepted
        EscrowFunded,      // 2: Seller deposited crypto
        FiatDeposited,     // 3: Buyer confirmed fiat sent
        EscrowReleased,    // 4: Successful completion
        EscrowCancelled,   // 5: Cancelled before funding
        EscrowRefunded,    // 6: Refunded after expiry
        EscrowDisputed,    // 7: Under dispute (Phase 4)
        DisputeResolved    // 8: Dispute settled (Phase 4)
    }
    
    struct TradeData {
        uint256 id;
        uint256 offerId;
        address buyer;           // Fiat sender
        address seller;          // Crypto sender
        address tokenAddress;    // 0x0 for ETH
        uint256 amount;         // Crypto amount
        uint256 fiatAmount;     // Fiat amount in cents
        string fiatCurrency;
        uint256 rate;           // Locked rate at creation
        TradeState state;
        uint256 createdAt;
        uint256 expiresAt;      // Funding deadline
        uint256 disputeDeadline; // Dispute window (Phase 4)
        address arbitrator;      // For disputes (Phase 4)
        string buyerContact;     // Encrypted
        string sellerContact;    // Encrypted
    }
    
    struct StateTransition {
        TradeState fromState;
        TradeState toState;
        uint256 timestamp;
        address actor;
    }
    
    // Storage
    mapping(uint256 => TradeData) public trades;
    mapping(uint256 => uint256) public escrowBalances;
    mapping(uint256 => StateTransition[]) public tradeHistory;
    uint256 public nextTradeId;
    
    IHub public hub;
    IOffer public offerContract;
    IProfile public profileContract;
}
```

#### 2. Core Trade Functions
```solidity
// Create trade from offer
function createTrade(
    uint256 _offerId,
    uint256 _amount,      // Crypto amount to trade
    string memory _contact // Buyer's encrypted contact
) external nonReentrant returns (uint256);

// Maker accepts trade request
function acceptRequest(
    uint256 _tradeId,
    string memory _makerContact
) external nonReentrant;

// Fund escrow (seller deposits crypto)
function fundEscrow(
    uint256 _tradeId,
    string memory _sellerContact
) external payable nonReentrant;

// Buyer confirms fiat sent
function markFiatDeposited(uint256 _tradeId) external nonReentrant;

// Seller releases escrow to buyer
function releaseEscrow(uint256 _tradeId) external nonReentrant;

// Cancel trade (before funding)
function cancelRequest(uint256 _tradeId) external nonReentrant;

// Refund expired trade
function refundExpiredTrade(uint256 _tradeId) external nonReentrant;
```

#### 3. State Validation
```solidity
modifier validTransition(uint256 _tradeId, TradeState _expectedState) {
    require(trades[_tradeId].state == _expectedState, "Invalid state transition");
    _;
}

modifier onlyTradeParty(uint256 _tradeId) {
    TradeData memory trade = trades[_tradeId];
    require(
        msg.sender == trade.buyer || msg.sender == trade.seller,
        "Not a trade party"
    );
    _;
}

modifier notExpired(uint256 _tradeId) {
    require(block.timestamp <= trades[_tradeId].expiresAt, "Trade expired");
    _;
}
```

## Tasks Implementation Order

1. **Contract Setup** (30 mins)
   - Create Trade.sol with imports
   - Define enums and structs
   - Setup storage mappings
   - Initialize upgrade functionality

2. **Trade Creation** (1 hour)
   - Load and validate offer
   - Check amount in range
   - Lock current rate
   - Set expiration timer
   - Determine buyer/seller roles
   - Update Profile statistics
   - Emit creation event

3. **Accept & Fund Flow** (1.5 hours)
   - AcceptRequest validation
   - FundEscrow for ETH/ERC20
   - Balance tracking
   - State transition logging
   - Contact info exchange
   - Timer updates

4. **Completion Flow** (1 hour)
   - MarkFiatDeposited validation
   - ReleaseEscrow with fee calculation
   - Transfer mechanisms (ETH vs ERC20)
   - Profile updates
   - Event emissions

5. **Cancellation & Refund** (45 mins)
   - Cancel before funding
   - Refund after expiry
   - Return escrowed funds
   - State cleanup
   - Profile decrements

6. **Testing Suite** (2.5 hours)
   - Happy path tests
   - State transition tests
   - Expiration tests
   - ETH vs ERC20 tests
   - Integration tests

## Complex Implementation Details

### Trade Creation Logic
```solidity
function createTrade(
    uint256 _offerId,
    uint256 _amount,
    string memory _contact
) external nonReentrant returns (uint256) {
    // Load offer from Offer contract
    IOffer.OfferData memory offer = offerContract.getOffer(_offerId);
    require(offer.state == IOffer.OfferState.Active, "Offer not active");
    require(_amount >= offer.minAmount && _amount <= offer.maxAmount, "Amount out of range");
    require(msg.sender != offer.owner, "Cannot trade with yourself");
    
    // Check user limits
    IHub.HubConfig memory config = hub.getConfig();
    require(profileContract.getUserActiveTrades(msg.sender) < config.maxActiveTrades, "Max trades reached");
    
    // Determine roles based on offer type
    address buyer;
    address seller;
    if (offer.offerType == IOffer.OfferType.Buy) {
        buyer = offer.owner;    // Maker wants to buy crypto
        seller = msg.sender;    // Taker will sell crypto
    } else {
        buyer = msg.sender;     // Taker wants to buy crypto
        seller = offer.owner;   // Maker will sell crypto
    }
    
    // Create trade
    uint256 tradeId = nextTradeId++;
    trades[tradeId] = TradeData({
        id: tradeId,
        offerId: _offerId,
        buyer: buyer,
        seller: seller,
        tokenAddress: offer.tokenAddress,
        amount: _amount,
        fiatAmount: (_amount * offer.rate) / 1e18, // Calculate fiat amount
        fiatCurrency: offer.fiatCurrency,
        rate: offer.rate,
        state: TradeState.RequestCreated,
        createdAt: block.timestamp,
        expiresAt: block.timestamp + config.tradeExpirationTimer,
        disputeDeadline: 0, // Set later
        arbitrator: address(0),
        buyerContact: buyer == msg.sender ? _contact : "",
        sellerContact: seller == msg.sender ? _contact : ""
    });
    
    // Update profiles
    profileContract.incrementActiveTrades(buyer);
    profileContract.incrementActiveTrades(seller);
    
    emit TradeCreated(tradeId, _offerId, buyer, seller, _amount);
    return tradeId;
}
```

### Escrow Funding Logic
```solidity
function fundEscrow(
    uint256 _tradeId,
    string memory _sellerContact
) external payable nonReentrant 
  validTransition(_tradeId, TradeState.RequestAccepted) 
  notExpired(_tradeId) {
    
    TradeData storage trade = trades[_tradeId];
    require(msg.sender == trade.seller, "Only seller can fund");
    
    if (trade.tokenAddress == address(0)) {
        // ETH payment
        require(msg.value == trade.amount, "Incorrect ETH amount");
        escrowBalances[_tradeId] = msg.value;
    } else {
        // ERC20 payment
        require(msg.value == 0, "No ETH needed for token trades");
        IERC20(trade.tokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            trade.amount
        );
        escrowBalances[_tradeId] = trade.amount;
    }
    
    // Update state
    trade.state = TradeState.EscrowFunded;
    trade.sellerContact = _sellerContact;
    
    // Log transition
    _recordStateTransition(_tradeId, TradeState.RequestAccepted, TradeState.EscrowFunded);
    
    emit EscrowFunded(_tradeId, trade.amount, trade.tokenAddress);
}
```

### Fee Calculation (Basic - Extended in Phase 4)
```solidity
function _calculateFees(uint256 _amount) 
    private 
    view 
    returns (uint256 buyerAmount, uint256 platformFee) {
    
    IHub.HubConfig memory config = hub.getConfig();
    
    // Calculate total platform fee
    uint256 totalFeeBps = config.burnFeePct + config.chainFeePct + config.warchestFeePct;
    platformFee = (_amount * totalFeeBps) / 10000;
    buyerAmount = _amount - platformFee;
}
```

## Validation Gates

```bash
# Compile all contracts
npx hardhat compile

# Run trade contract tests
npx hardhat test test/Trade.test.js

# Test state machine
npx hardhat test test/TradeStateMachine.test.js

# Gas profiling
REPORT_GAS=true npx hardhat test test/Trade.test.js

# Verify gas costs
# - createTrade < 200,000 gas
# - fundEscrow < 150,000 gas
# - releaseEscrow < 100,000 gas

# Integration tests with all contracts
npx hardhat test test/integration/FullTradeFlow.test.js

# Test with different tokens
npx hardhat test test/TokenVariations.test.js

# Security tests
npx hardhat test test/security/TradeReentrancy.test.js

# Coverage
npx hardhat coverage --testfiles "test/Trade*.js"
```

## Test Scenarios

1. **Happy Path**
   - Create -> Accept -> Fund -> Fiat -> Release
   - ETH trades
   - ERC20 trades
   - Different amounts and rates

2. **Cancellation Flows**
   - Cancel before acceptance
   - Cancel after acceptance
   - Refund after expiry

3. **Edge Cases**
   - Trade at min/max amounts
   - Expiration during process
   - Multiple simultaneous trades

4. **Security Tests**
   - Reentrancy attempts
   - State manipulation
   - Unauthorized access

## Common Pitfalls to Avoid

1. **Reentrancy**: Always use guards on fund transfers
2. **State Order**: Check state before any external calls
3. **Integer Math**: Careful with rate calculations
4. **ETH Handling**: Distinguish ETH from ERC20 flows
5. **Timer Logic**: Account for block timestamp variations

## Migration Notes from CosmWasm

Key differences:
- No SubMsg - use direct contract calls
- Replace `CosmosMsg::Bank` with transfer/safeTransfer
- Convert timer from seconds to block.timestamp
- Use events for all state changes
- No separate reply handler

## Dependencies

```json
{
  "additional_dependencies": {
    "@openzeppelin/contracts-upgradeable": "^5.0.0",
    "@openzeppelin/contracts": "^5.0.0"
  }
}
```

## Confidence Score: 8/10

This PRP covers the core trading functionality with detailed implementation guidance. The escrow mechanism and state machine are well-defined, though dispute resolution complexity is deferred to Phase 4. Integration points are clear and testing is comprehensive.