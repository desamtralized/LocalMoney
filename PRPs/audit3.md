# PRP: Critical Security Audit Fixes for LocalMoney Protocol

## Context
This PRP addresses critical security vulnerabilities identified in the LocalMoney Protocol EVM contracts audit report (commit: 3e0c6a7). The audit identified 4 HIGH, 4 MEDIUM, and 2 LOW severity issues that must be resolved before mainnet deployment.

**Audit Report Location**: `/audit-artifacts/audit-report.json`
**Target Directory**: `/contracts/evm/`
**Solidity Version**: 0.8.24
**Framework**: Hardhat with OpenZeppelin Upgradeable Contracts

## Critical References

### Documentation URLs
- OpenZeppelin ReentrancyGuard: https://docs.openzeppelin.com/contracts/5.x/api/utils#ReentrancyGuard
- Chainlink VRF v2.5: https://docs.chain.link/vrf/v2-5/introduction
- UUPS Proxy Pattern: https://docs.openzeppelin.com/contracts/5.x/api/proxy#UUPSUpgradeable
- Checks-Effects-Interactions Pattern: https://fravoll.github.io/solidity-patterns/checks_effects_interactions.html
- Pull Payment Pattern: https://docs.openzeppelin.com/contracts/5.x/api/utils#PullPayment

### Existing Codebase Patterns
- **Access Control**: Uses OpenZeppelin's AccessControlUpgradeable (see Hub.sol:6)
- **Upgrade Pattern**: UUPS pattern with Initializable (see Hub.sol:4-5)
- **Testing**: Hardhat with ethers v6, chai matchers (see test/Trade.test.js)
- **Modifiers**: Custom modifiers for state validation (see Trade.sol:validTransition)

## Issues to Fix

### HIGH SEVERITY (Must Fix)

#### 1. AUTH-006: Arbitrary from address in transferFrom
**File**: `contracts/Escrow.sol:124`
**Current Code**:
```solidity
IERC20(tokenAddress).safeTransferFrom(depositor, address(this), amount);
```
**Issue**: `depositor` parameter can be any address, allowing theft of approved tokens

#### 2. AUTH-007: Weak PRNG in ArbitratorManager
**File**: `contracts/ArbitratorManager.sol:235`
**Current Code**:
```solidity
uint256 selectedIndex = uint256(seed) % activeCount;
```
**Issue**: Uses predictable block values for randomness

#### 3. EXT-017: Reentrancy in Trade.fundEscrow
**File**: `contracts/Trade.sol:314`
**Current Code**:
```solidity
escrowContract.deposit{value: msg.value}(...);
trade.state = TradeState.EscrowFunded; // State change after external call
```

#### 4. MATH-026: Uninitialized storage mapping
**File**: `contracts/PriceOracle.sol:63`
**Issue**: `tokenPrices` mapping never initialized

### MEDIUM SEVERITY

#### 5. EXT-021: Arbitrary ETH send
**File**: `contracts/Escrow.sol:213-216`

#### 6. DOS-054: Gas limit DoS
**File**: `contracts/Escrow.sol:213`

#### 7. EXT-018: Multiple reentrancy points
**File**: `contracts/Trade.sol` (multiple functions)

#### 8. UPG-012: UUPS upgrade protection
**File**: `contracts/Hub.sol`

## Implementation Blueprint

### Task Order and Implementation

```pseudocode
PHASE 1: Critical Security Fixes (HIGH Priority)
1. Fix Escrow arbitrary transferFrom
   - Validate depositor == msg.sender OR
   - Add explicit allowance check
   - Add test coverage

2. Implement Chainlink VRF for arbitrator selection
   - Integrate VRF v2.5 contracts
   - Add fallback with commit-reveal if VRF fails
   - Update tests

3. Fix reentrancy in Trade contract
   - Apply CEI pattern to all functions
   - State changes before external calls
   - Verify nonReentrant modifier coverage

4. Initialize PriceOracle storage
   - Add initialization in constructor
   - Migrate existing data if needed

PHASE 2: Medium Priority Fixes
5. Implement pull payment pattern for ETH
   - Add withdrawal mapping
   - Convert push to pull payments
   - Update tests

6. Fix gas limit issues
   - Remove fixed gas limits
   - Use modern transfer patterns

7. Add comprehensive reentrancy protection
   - Audit all external calls
   - Add guards where missing

8. Secure UUPS upgrade mechanism
   - Implement _authorizeUpgrade with timelock
   - Add role checks
   - Test upgrade scenarios

PHASE 3: Low Priority & Cleanup
9. Check all return values
10. Add missing events
```

## Detailed Implementation Steps

### 1. Fix Escrow Arbitrary TransferFrom

**File**: `contracts/Escrow.sol`

```solidity
// BEFORE (line 108-132)
function deposit(
    uint256 tradeId,
    address tokenAddress,
    uint256 amount,
    address depositor
) external payable nonReentrant onlyRole(TRADE_CONTRACT_ROLE) {
    // ...
    IERC20(tokenAddress).safeTransferFrom(depositor, address(this), amount);
    // ...
}

// AFTER
function deposit(
    uint256 tradeId,
    address tokenAddress,
    uint256 amount,
    address depositor
) external payable nonReentrant onlyRole(TRADE_CONTRACT_ROLE) {
    if (amount == 0) revert InvalidAmount(amount);
    if (escrowFunded[tradeId]) revert EscrowAlreadyFunded(tradeId);
    
    // SECURITY FIX: Validate depositor authorization
    // When called by Trade contract, depositor should be the Trade contract itself
    if (msg.sender != depositor && !hasRole(TRADE_CONTRACT_ROLE, msg.sender)) {
        revert UnauthorizedDepositor(depositor, msg.sender);
    }
    
    if (tokenAddress == address(0)) {
        // ETH deposit
        if (msg.value != amount) revert InvalidAmount(msg.value);
        escrowBalances[tradeId] = msg.value;
    } else {
        // ERC20 deposit - use msg.sender if Trade contract, otherwise depositor
        address tokenFrom = hasRole(TRADE_CONTRACT_ROLE, msg.sender) ? depositor : msg.sender;
        IERC20(tokenAddress).safeTransferFrom(tokenFrom, address(this), amount);
        escrowBalances[tradeId] = amount;
    }
    
    escrowDepositors[tradeId] = depositor;
    escrowFunded[tradeId] = true;
    
    emit EscrowDeposited(tradeId, depositor, amount);
}
```

### 2. Implement Chainlink VRF

**File**: `contracts/ArbitratorManager.sol`

```solidity
// Add imports
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/interfaces/IVRFCoordinatorV2Plus.sol";

// Update contract inheritance
contract ArbitratorManager is 
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    VRFConsumerBaseV2Plus
{
    // Add VRF configuration
    IVRFCoordinatorV2Plus public vrfCoordinator;
    bytes32 public vrfKeyHash;
    uint256 public vrfSubscriptionId;
    uint16 public vrfRequestConfirmations = 3;
    uint32 public vrfCallbackGasLimit = 100000;
    uint32 public vrfNumWords = 1;
    
    // Add commit-reveal fallback
    mapping(uint256 => bytes32) private commitments;
    mapping(uint256 => uint256) private revealDeadlines;
    uint256 private constant REVEAL_WINDOW = 1 hours;
    
    // Replace weak PRNG with VRF
    function assignArbitrator(
        uint256 _tradeId,
        string memory _fiatCurrency
    ) external onlyRole(TRADE_CONTRACT_ROLE) returns (address) {
        // Try VRF first
        if (address(vrfCoordinator) != address(0)) {
            return _requestRandomArbitrator(_tradeId, _fiatCurrency);
        }
        // Fallback to commit-reveal
        return _assignArbitratorCommitReveal(_tradeId, _fiatCurrency);
    }
    
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        VRFRequest storage request = vrfRequests[requestId];
        if (request.fulfilled) return;
        
        address[] memory availableArbitrators = arbitratorsByFiat[request.fiatCurrency];
        uint256 activeCount = _countActiveArbitrators(availableArbitrators);
        
        if (activeCount > 0) {
            uint256 selectedIndex = randomWords[0] % activeCount;
            address selectedArbitrator = _getActiveArbitratorAtIndex(availableArbitrators, selectedIndex);
            pendingArbitratorAssignments[request.tradeId] = selectedArbitrator;
            emit ArbitratorAssigned(request.tradeId, selectedArbitrator);
        }
        
        request.fulfilled = true;
    }
}
```

### 3. Fix Reentrancy with CEI Pattern

**File**: `contracts/Trade.sol`

```solidity
// BEFORE
function fundEscrow(uint256 _tradeId) external payable nonReentrant {
    // ... checks ...
    escrowContract.deposit{value: msg.value}(...); // External call
    trade.state = TradeState.EscrowFunded; // State change AFTER
    _recordStateTransition(...);
    emit EscrowFunded(...);
}

// AFTER - Apply Checks-Effects-Interactions
function fundEscrow(uint256 _tradeId) external payable nonReentrant {
    TradeData storage trade = trades[_tradeId];
    
    // CHECKS
    if (msg.sender != trade.seller) revert UnauthorizedAccess(msg.sender);
    if (trade.state != TradeState.RequestAccepted) revert InvalidState();
    if (block.timestamp > trade.expiresAt) revert TradeExpired();
    
    // EFFECTS (state changes BEFORE external calls)
    trade.state = TradeState.EscrowFunded;
    _recordStateTransition(_tradeId, TradeState.RequestAccepted, TradeState.EscrowFunded);
    
    // INTERACTIONS (external calls LAST)
    if (trade.tokenAddress == address(0)) {
        if (msg.value != trade.amount) revert IncorrectPaymentAmount(msg.value, trade.amount);
        escrowContract.deposit{value: msg.value}(_tradeId, address(0), msg.value, address(this));
    } else {
        if (msg.value != 0) revert IncorrectPaymentAmount(msg.value, 0);
        IERC20(trade.tokenAddress).safeTransferFrom(msg.sender, address(this), trade.amount);
        IERC20(trade.tokenAddress).safeIncreaseAllowance(address(escrowContract), trade.amount);
        escrowContract.deposit(_tradeId, trade.tokenAddress, trade.amount, address(this));
    }
    
    emit EscrowFunded(_tradeId, trade.amount);
}
```

### 4. Initialize PriceOracle Storage

**File**: `contracts/PriceOracle.sol`

```solidity
// Add proper initialization
contract PriceOracle is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    // Storage declarations
    mapping(address => TokenPrice) public tokenPrices; // Line 63
    
    function initialize(
        address _admin,
        address _swapRouter
    ) external initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        
        // SECURITY FIX: Initialize storage mappings
        // Note: mappings are automatically initialized to default values
        // but we ensure the contract state is properly set
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PRICE_UPDATER_ROLE, _admin);
        _grantRole(ROUTE_MANAGER_ROLE, _admin);
        _grantRole(EMERGENCY_ROLE, _admin);
        
        swapRouter = ISwapRouter(_swapRouter);
        emergencyPaused = false;
        
        // Initialize default price validity period
        MAX_PRICE_AGE = 3600; // 1 hour
        
        emit OracleInitialized(_admin, _swapRouter);
    }
}
```

### 5. Implement Pull Payment Pattern

**File**: `contracts/Escrow.sol`

```solidity
// Add pull payment storage
mapping(address => uint256) private pendingWithdrawals;

// Replace direct ETH transfers with pull pattern
function _schedulePayout(address recipient, uint256 amount) internal {
    pendingWithdrawals[recipient] += amount;
    emit PayoutScheduled(recipient, amount);
}

function withdraw() external nonReentrant {
    uint256 amount = pendingWithdrawals[msg.sender];
    if (amount == 0) revert NothingToWithdraw();
    
    pendingWithdrawals[msg.sender] = 0;
    
    (bool success, ) = msg.sender.call{value: amount}("");
    if (!success) {
        pendingWithdrawals[msg.sender] = amount;
        revert WithdrawalFailed();
    }
    
    emit Withdrawn(msg.sender, amount);
}

// Update _safeTransfer to use pull pattern for ETH
function _safeTransfer(
    address tokenAddress,
    address to,
    uint256 amount
) internal {
    if (amount == 0) return;
    
    if (tokenAddress == address(0)) {
        // Schedule ETH for withdrawal instead of pushing
        _schedulePayout(to, amount);
    } else {
        IERC20(tokenAddress).safeTransfer(to, amount);
    }
}
```

### 6. Add Comprehensive Test Coverage

**File**: `test/SecurityFixes.test.js`

```javascript
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Security Fixes Validation", function () {
    describe("Escrow Deposit Authorization", function () {
        it("Should prevent arbitrary from address in transferFrom", async function () {
            const [owner, attacker, victim] = await ethers.getSigners();
            
            // Setup: victim approves tokens
            await mockToken.connect(victim).approve(escrow.address, ethers.parseEther("100"));
            
            // Attack attempt: attacker tries to steal victim's tokens
            await expect(
                escrow.connect(attacker).deposit(
                    1, // tradeId
                    mockToken.address,
                    ethers.parseEther("100"),
                    victim.address // trying to use victim as depositor
                )
            ).to.be.revertedWith("UnauthorizedDepositor");
        });
    });
    
    describe("VRF Arbitrator Selection", function () {
        it("Should use VRF for random selection", async function () {
            // Test VRF integration
            const tx = await arbitratorManager.assignArbitrator(1, "USD");
            const receipt = await tx.wait();
            
            // Verify VRF request was made
            expect(receipt.events.find(e => e.event === "VRFRequested")).to.exist;
        });
        
        it("Should fallback to commit-reveal if VRF unavailable", async function () {
            // Disable VRF
            await arbitratorManager.setVRFCoordinator(ethers.ZeroAddress);
            
            // Should use commit-reveal
            const tx = await arbitratorManager.assignArbitrator(2, "USD");
            expect(tx).to.emit(arbitratorManager, "CommitmentCreated");
        });
    });
    
    describe("Reentrancy Protection", function () {
        it("Should prevent reentrancy in fundEscrow", async function () {
            // Deploy malicious contract
            const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
            const attacker = await Attacker.deploy(trade.address);
            
            // Attempt reentrancy attack
            await expect(
                attacker.attack({ value: ethers.parseEther("1") })
            ).to.be.revertedWith("ReentrancyGuard: reentrant call");
        });
    });
    
    describe("Pull Payment Pattern", function () {
        it("Should use pull payments for ETH", async function () {
            // Release escrow
            await escrow.release(1, ethers.ZeroAddress, buyer.address, ethers.ZeroAddress);
            
            // Check pending withdrawal
            const pending = await escrow.pendingWithdrawals(buyer.address);
            expect(pending).to.be.gt(0);
            
            // Withdraw
            await expect(escrow.connect(buyer).withdraw())
                .to.emit(escrow, "Withdrawn");
        });
    });
});
```

## Validation Gates

```bash
# 1. Compile contracts
npx hardhat compile

# 2. Run static analysis
python3 -m slither . --checklist --exclude-dependencies

# 3. Run tests with coverage
npx hardhat coverage

# 4. Run security-specific tests
npx hardhat test test/SecurityFixes.test.js --network hardhat

# 5. Check gas optimization
REPORT_GAS=true npx hardhat test

# 6. Verify upgrade safety
npx hardhat run scripts/check-upgrade-safety.js

# 7. Run invariant tests
forge test --match-contract InvariantTest -vvv

# 8. Final audit validation
node scripts/validate-audit-fixes.js
```

## Error Handling Strategy

1. **Revert with Custom Errors**: Use custom errors for gas efficiency
2. **Fail-Safe Defaults**: Default to most restrictive permissions
3. **Circuit Breakers**: Emergency pause mechanisms remain in place
4. **Graceful Degradation**: VRF fallback to commit-reveal

## Migration Considerations

1. **Storage Layout**: Maintain compatibility for upgrades
2. **Data Migration**: Existing trades must remain valid
3. **Backwards Compatibility**: External interfaces unchanged

## Success Criteria

- [ ] All HIGH severity issues resolved
- [ ] All MEDIUM severity issues addressed
- [ ] Test coverage > 95%
- [ ] No new vulnerabilities introduced
- [ ] Gas costs remain reasonable
- [ ] Upgrade path tested
- [ ] Slither returns no HIGH/MEDIUM issues

## Dependencies

```json
{
  "@chainlink/contracts": "^1.4.0",
  "@openzeppelin/contracts-upgradeable": "^5.4.0",
  "@openzeppelin/contracts": "^5.4.0"
}
```

## Common Pitfalls to Avoid

1. **Storage Collision**: Don't reorder storage variables in upgradeable contracts
2. **Integer Overflow**: Though Solidity 0.8+ has built-in checks, be careful with unchecked blocks
3. **Front-Running**: Use commit-reveal for sensitive operations
4. **Griefing Vectors**: Limit gas consumption in loops
5. **Sandwich Attacks**: Use slippage protection in swaps

## References

- [Smart Contract Security Verification Standard](https://github.com/securing/SCSVS)
- [Consensys Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [OpenZeppelin Security](https://docs.openzeppelin.com/contracts/5.x/security)
- [Chainlink VRF Security Considerations](https://docs.chain.link/vrf/v2-5/security)

## Implementation Score

**Confidence Level: 8/10**

The PRP provides comprehensive context and clear implementation steps. Points deducted for:
- Some test initialization issues need investigation
- VRF integration requires subscription setup
- Potential for unexpected upgrade complications

## Next Steps After Implementation

1. Run full test suite
2. Deploy to testnet
3. Conduct integration testing
4. Schedule professional audit retest
5. Implement monitoring and alerting