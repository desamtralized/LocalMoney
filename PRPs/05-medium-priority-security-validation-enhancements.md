# PRP: Security & Validation Enhancements

## Overview
Implement comprehensive input validation, rate limiting, emergency mechanisms, and security hardening across all cross-chain contracts.

**Status:** MEDIUM-HIGH - Security Hardening
**Estimated Time:** 1-2 weeks
**Dependencies:** All cross-chain contracts

## Reference Documentation
- **Input Validation**: https://docs.soliditylang.org/en/latest/security-considerations.html#input-validation
- **Rate Limiting**: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/ReentrancyGuard.sol
- **Emergency Controls**: https://docs.openzeppelin.com/contracts/4.x/api/security#Pausable

## Security Gaps

### Gap 1: Missing Input Validation in Hub
**Location**: `Hub.sol:524-669`

```solidity
// Missing validations:
require(token != address(0), "Invalid token");
require(amount >= _config.minTradeAmount, "Amount too small");
require(price < type(uint128).max, "Price overflow");
require(_isSupportedFiat(fiatCurrency), "Unsupported fiat");
```

### Gap 2: No Rate Limiting
Users can spam cross-chain messages.

### Gap 3: Missing Emergency Withdrawal
No way to recover funds if bridge fails permanently.

## Implementation Blueprint

### Step 1: Comprehensive Input Validation

```solidity
// contracts/evm/contracts/libraries/CrossChainValidation.sol
library CrossChainValidation {
    function validateOfferCreation(
        address token,
        uint256 amount,
        uint256 price,
        string memory fiatCurrency,
        IHub.HubConfig memory config
    ) internal pure {
        require(token != address(0), "Invalid token address");
        require(amount >= config.minTradeAmount, "Amount below minimum");
        require(amount <= config.maxTradeAmount, "Amount above maximum");
        require(price > 0, "Invalid price");
        require(price < type(uint128).max, "Price overflow risk");
        require(
            bytes(fiatCurrency).length >= 3 &&
            bytes(fiatCurrency).length <= 4,
            "Invalid fiat code length"
        );
    }

    function validateTradeCreation(
        bytes32 offerId,
        uint256 amount,
        address trader
    ) internal pure {
        require(offerId != bytes32(0), "Invalid offer ID");
        require(amount > 0, "Invalid amount");
        require(trader != address(0), "Invalid trader");
    }
}
```

### Step 2: Rate Limiting

```solidity
// In LocalMoneySatellite
mapping(address => uint256) public lastMessageTime;
mapping(address => uint256) public messagesInWindow;
uint256 public constant MIN_MESSAGE_INTERVAL = 30 seconds;
uint256 public constant MAX_MESSAGES_PER_HOUR = 10;
uint256 public constant RATE_LIMIT_WINDOW = 1 hours;

modifier rateLimited() {
    require(
        block.timestamp >= lastMessageTime[msg.sender] + MIN_MESSAGE_INTERVAL,
        "Rate limit: too frequent"
    );

    // Check hourly limit
    if (block.timestamp < lastMessageTime[msg.sender] + RATE_LIMIT_WINDOW) {
        require(
            messagesInWindow[msg.sender] < MAX_MESSAGES_PER_HOUR,
            "Rate limit: hourly quota exceeded"
        );
        messagesInWindow[msg.sender]++;
    } else {
        messagesInWindow[msg.sender] = 1;
    }

    lastMessageTime[msg.sender] = block.timestamp;
    _;
}

function createOffer(...) external payable rateLimited {
    // ... existing code
}
```

### Step 3: Emergency Withdrawal

```solidity
// In CrossChainEscrow
function emergencyWithdrawAll(
    address token,
    address recipient,
    string memory reason
) external onlyRole(EMERGENCY_ROLE) {
    require(paused(), "Must be paused for emergency withdrawal");
    require(
        block.timestamp >= lastEmergencyPauseTime + 7 days,
        "Must wait 7 days after pause"
    );

    uint256 balance = IERC20(token).balanceOf(address(this));
    require(balance > 0, "No balance to withdraw");

    IERC20(token).safeTransfer(recipient, balance);

    emit EmergencyWithdrawal(token, recipient, balance, reason);
}
```

### Step 4: Whitelist Supported Fiat Currencies

```solidity
// In Hub
mapping(string => bool) public supportedFiatCurrencies;

function addSupportedFiat(string memory currency) external onlyRole(ADMIN_ROLE) {
    require(bytes(currency).length == 3, "Invalid currency code");
    supportedFiatCurrencies[currency] = true;
    emit FiatCurrencyAdded(currency);
}

function _isSupportedFiatCurrency(string memory currency) internal view returns (bool) {
    return supportedFiatCurrencies[currency];
}
```

### Step 5: Token Whitelist for Bridge

```solidity
// In TokenBridge
mapping(address => bool) public whitelistedTokens;

modifier onlyWhitelistedToken(address token) {
    require(whitelistedTokens[token], "Token not whitelisted");
    _;
}

function bridgeToken(...) external payable onlyWhitelistedToken(token) {
    // ... existing code
}
```

## Implementation Tasks

1. **Create Validation Library** (1 day)
   - [ ] Create CrossChainValidation.sol
   - [ ] Add validation functions for all operations
   - [ ] Add comprehensive error messages

2. **Implement Rate Limiting** (1 day)
   - [ ] Add rate limit state variables
   - [ ] Create rateLimited modifier
   - [ ] Apply to all user functions
   - [ ] Add bypass for admin operations

3. **Add Emergency Controls** (1 day)
   - [ ] Add emergencyWithdrawAll to CrossChainEscrow
   - [ ] Add 7-day timelock requirement
   - [ ] Add comprehensive event emission
   - [ ] Test emergency scenarios

4. **Implement Fiat Whitelist** (1 day)
   - [ ] Add supportedFiatCurrencies mapping
   - [ ] Add addSupportedFiat function
   - [ ] Populate with initial currencies
   - [ ] Validate in offer creation

5. **Implement Token Whitelist** (1 day)
   - [ ] Add whitelistedTokens mapping
   - [ ] Add onlyWhitelistedToken modifier
   - [ ] Add/remove token functions
   - [ ] Apply to bridge operations

6. **Enhance Hub Validation** (1 day)
   - [ ] Add all missing validations
   - [ ] Use CrossChainValidation library
   - [ ] Add overflow checks
   - [ ] Add range checks

7. **Comprehensive Testing** (3 days)
   - [ ] Test all validation branches
   - [ ] Test rate limiting enforcement
   - [ ] Test emergency withdrawal
   - [ ] Test whitelist functionality
   - [ ] Security-focused testing

## Validation Gates

```bash
just compile
just test test/security/Validation.test.js
just test test/security/RateLimiting.test.js
just test test/security/Emergency.test.js
just test-security
```

## Success Criteria
- [ ] All inputs validated comprehensively
- [ ] Rate limiting prevents spam
- [ ] Emergency withdrawal works with timelock
- [ ] Fiat currencies whitelisted
- [ ] Tokens whitelisted for bridge
- [ ] No validation bypasses exist
- [ ] Security tests pass
- [ ] >95% test coverage

## Confidence Score: 8/10
Standard security patterns, well-understood implementations.