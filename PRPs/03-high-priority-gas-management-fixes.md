# PRP: Gas Management & Calculation Fixes

## Overview
Fix critical gas calculation bugs in TokenBridge and LocalMoneySatellite, and integrate GasEstimator properly across all cross-chain operations.

**Status:** HIGH - Will Cause Transaction Failures
**Estimated Time:** 1 week
**Dependencies:** TokenBridge, GasEstimator, LocalMoneySatellite

## Reference Documentation
- **Axelar Gas Service**: https://docs.axelar.dev/dev/gas-service/intro
- **Gas Payment**: https://docs.axelar.dev/dev/gas-service/pay-gas
- **Gas Estimation**: https://docs.axelar.dev/dev/gas-service/pricing

## Critical Bugs

### Bug 1: Incorrect Gas Buffer Calculation in TokenBridge
**Location**: `TokenBridge.sol:207-228`

```solidity
// ❌ WRONG: Applies buffer to total value, then subtracts from original
uint256 gasPayment = (msg.value * gasBufferPercentage) / 100; // If buffer is 120, this is 1.2x!
tokenService.interchainTransfer{value: msg.value - gasPayment}(...);
// Results in NEGATIVE value! Transaction reverts
```

**Fix**:
```solidity
// ✅ CORRECT: Buffer is percentage FOR gas, rest is for transfer
uint256 gasPayment = (msg.value * gasBufferPercentage) / 100;
uint256 remainingValue = msg.value - gasPayment;
require(remainingValue > 0, "Insufficient value for transfer");

gasService.payNativeGasForContractCall{value: gasPayment}(...);
tokenService.interchainTransfer{value: remainingValue}(...);
```

### Bug 2: GasEstimator Not Integrated
**Location**: `LocalMoneySatellite.sol:417-421`

```solidity
// Uses naive calculation instead of GasEstimator
function estimateGasFee() external view override returns (uint256) {
    uint256 baseFee = baseGasAmount * tx.gasprice;
    return (baseFee * gasMultiplier) / 100;
}
```

**Should be**:
```solidity
function estimateGasFee(
    MessageTypes.MessageType messageType,
    bytes memory payload
) external view returns (uint256) {
    return gasEstimator.estimateGas(
        HUB_CHAIN,
        uint8(messageType),
        payload
    );
}
```

### Bug 3: No Gas Refund Mechanism
**Location**: Multiple contracts

Missing refund for overpaid gas.

## Implementation Tasks

1. **Fix TokenBridge Gas Calculation** (2 hours)
   - [ ] Fix gas buffer formula
   - [ ] Add validation for remaining value
   - [ ] Add tests for gas split

2. **Integrate GasEstimator** (1 day)
   - [ ] Add GasEstimator to satellites
   - [ ] Replace naive calculations
   - [ ] Add payload-based estimation
   - [ ] Test accuracy

3. **Add Gas Refund Mechanism** (1 day)
   - [ ] Track gas paid vs used
   - [ ] Implement refund logic
   - [ ] Add tests

4. **Document Gas Costs** (1 day)
   - [ ] Measure actual costs per operation
   - [ ] Document gas requirements
   - [ ] Create gas estimation guide

## Validation Gates

```bash
just compile
just test test/crosschain/TokenBridge.test.js
just test test/crosschain/GasEstimator.test.js
just gas-report
```

## Success Criteria
- [ ] Gas calculations mathematically correct
- [ ] GasEstimator integrated and accurate
- [ ] Refunds work correctly
- [ ] No transaction reverts due to gas
- [ ] Gas costs documented

## Confidence Score: 9/10
Clear mathematical fix, well-defined integration points.