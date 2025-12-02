# MASTER PRP: Axelar Integration - Complete Production Readiness

## Executive Summary

**Objective**: Transform the LocalMoney Axelar integration from 60% complete to 100% production-ready by implementing all missing components, fixing critical bugs, establishing operational infrastructure, and achieving security audit approval.

**Status**: CRITICAL - Production Deployment Blocked
**Estimated Time**: 16-24 weeks (full production readiness)
**Confidence Score**: 8.5/10 for one-pass implementation success
**Dependencies**: All existing contracts, Axelar Network, deployment infrastructure

---

## Table of Contents

1. [Context & Current State](#context--current-state)
2. [Critical Path to Production](#critical-path-to-production)
3. [Reference Documentation](#reference-documentation)
4. [Implementation Strategy](#implementation-strategy)
5. [Detailed Implementation Blueprint](#detailed-implementation-blueprint)
6. [Validation Gates](#validation-gates)
7. [Production Checklist](#production-checklist)
8. [Risk Assessment & Mitigation](#risk-assessment--mitigation)
9. [Success Criteria](#success-criteria)

---

## Context & Current State

### What's Been Built (The Good News ✅)

**Smart Contract Infrastructure** (~60% Complete)
- ✅ AxelarBridge.sol: 927 lines, UUPS upgradeable, 12 message types
- ✅ AxelarHandler.sol: 118 lines, non-upgradeable entry point
- ✅ LocalMoneySatellite.sol: 444 lines, satellite implementation
- ✅ CrossChainEscrow.sol: 405 lines, token escrow with ITS
- ✅ ITSTokenRegistry.sol: 272 lines, token management
- ✅ GasEstimator.sol: 342 lines, gas calculation
- ✅ MessageTypes.sol: Library with 12 message types
- ✅ Test Suite: ~2,585 lines of tests

**Deployment Infrastructure**
- ✅ Satellite deployment script (deploy-all-satellites.js)
- ✅ Chain configuration (chains.config.js)
- ✅ 5 chains configured (Ethereum, BSC, Polygon, Avalanche, Base)

**Existing Production Deployment on BSC**
- ✅ Hub: `0x696F771E329DF4550044686C995AB9028fD3a724`
- ✅ Trade: `0xe0cdc4bDb60fCeC0ED1FFedcbbFb86839206862f`
- ✅ Escrow: `0xA07BfE2A3eE903Dde4e62ADc76cC32b57B0e0Cd2`
- ✅ Offer: `0x5B1E3C79A6A84BD436Fe2141A13E1767C178E621`
- ✅ Profile: `0x9a1AD40c90E5f282152Aa9F56d18B99F31794B68`

### Critical Gaps (What Blocks Production ❌)

**1. Integration Gaps**
- ❌ Hub.sol has no AxelarBridge integration
- ❌ Trade.sol has no CrossChainEscrow integration
- ❌ Offer.sol has no cross-chain support
- ❌ 10 of 12 message handlers are empty placeholders

**2. No Live Deployments**
- ❌ AxelarBridge not deployed
- ❌ CrossChainEscrow not deployed
- ❌ ITSTokenRegistry not deployed
- ❌ GasEstimator not deployed
- ❌ No satellites deployed on any chain

**3. Frontend Integration**
- ❌ No satellite contract support in UI
- ❌ No cross-chain offer/trade flows
- ❌ No gas estimation display
- ❌ No transaction tracking

**4. Operational Infrastructure**
- ❌ No monitoring/alerting
- ❌ No relayer service
- ❌ No analytics dashboard
- ❌ No incident response runbooks

**5. Security & Testing**
- ❌ No external audit
- ❌ No testnet validation
- ❌ No integration tests with real Axelar
- ❌ No load testing

---

## Critical Path to Production

### Phase 0: Foundation Fixes (2-3 weeks) ⚡ BLOCKING
*Must be completed before anything else*

**Objective**: Fix critical bugs that would cause immediate failures

**Tasks**:
1. ✅ **PRP-01: Hub-Bridge Bidirectional Integration** (1-2 weeks)
   - Replace unsafe low-level calls with typed interfaces
   - Implement callback mechanism
   - Enable Hub to send responses to satellites
   - **Blocks**: All cross-chain communication

2. ✅ **PRP-02: Message Handler Implementation** (2-3 weeks)
   - Implement all 12 empty message handlers
   - Add proper payload validation
   - Implement error handling with try-catch
   - **Blocks**: All cross-chain operations

3. ✅ **PRP-03: Gas Management Fixes** (1 week)
   - Fix critical gas calculation bug (TokenBridge line 207-228)
   - Integrate GasEstimator properly
   - Add gas refund mechanism
   - **Blocks**: Cross-chain transactions from succeeding

**Validation Gates**:
```bash
cd contracts/evm
just compile  # Must compile without errors
just test test/crosschain/  # All tests must pass
just gas-report  # Verify gas costs reasonable
```

**Dependencies**: None (can start immediately)
**Confidence**: 9/10

---

### Phase 1: Core Contract Integration (3-4 weeks) 🔴 CRITICAL

**Objective**: Integrate cross-chain functionality into existing Hub/Trade/Offer contracts

#### Task 1.1: Hub.sol Cross-Chain Integration (1 week)

**Current State**: Hub.sol:82-93 has placeholder AxelarBridge state variables but no integration

**Implementation**:

```solidity
// contracts/evm/contracts/Hub.sol

// ADD: Proper import
import "./crosschain/interfaces/IAxelarBridge.sol";

// ALREADY EXISTS: State variable (line 82)
IAxelarBridge public axelarBridge;

// IMPLEMENT: In handleCrossChainOfferCreation (line 524-567)
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

    // Create offer via Offer contract
    IOffer offerContract = IOffer(_config.offerContract);

    try offerContract.createOffer(
        isBuy ? IOffer.OfferType.Buy : IOffer.OfferType.Sell,
        fiatCurrency,
        token,
        0, // minAmount
        amount, // maxAmount
        price,
        string(abi.encodePacked("Cross-chain offer from ", sourceChain))
    ) returns (uint256 createdOfferId) {
        localOfferId = createdOfferId;

        // ✅ NEW: Send success callback to satellite
        _sendSatelliteCallback(
            sourceChain,
            offerId,
            MessageTypes.MessageType.CREATE_OFFER,
            true,
            abi.encode(localOfferId, "Offer created successfully")
        );

        emit CrossChainOfferCreated(offerId, sourceChain, creator);

    } catch Error(string memory reason) {
        // ✅ NEW: Send failure callback
        _sendSatelliteCallback(
            sourceChain,
            offerId,
            MessageTypes.MessageType.CREATE_OFFER,
            false,
            abi.encode(reason)
        );

        revert(reason);
    }
}

// ✅ NEW: Internal callback sender
function _sendSatelliteCallback(
    string memory destinationChain,
    bytes32 originalId,
    MessageTypes.MessageType originalType,
    bool success,
    bytes memory data
) internal {
    require(address(axelarBridge) != address(0), "Bridge not configured");

    MessageTypes.CrossChainMessage memory callback = MessageTypes.CrossChainMessage({
        messageType: MessageTypes.MessageType.CALLBACK_RESPONSE,
        sender: address(this),
        sourceChainId: block.chainid,
        nonce: crossChainMessageNonce++,
        payload: abi.encode(originalId, uint8(originalType), success, data)
    });

    try axelarBridge.sendMessage(destinationChain, callback) {
        emit SatelliteCallbackSent(destinationChain, originalId, success);
    } catch Error(string memory reason) {
        emit SatelliteCallbackFailed(destinationChain, originalId, reason);
        // Don't revert - callback failure shouldn't block main operation
    }
}
```

**Files to Modify**:
- `contracts/evm/contracts/Hub.sol` (lines 524-669)
- `contracts/evm/contracts/interfaces/IHub.sol` (add callback events)

**Validation**:
```bash
just test test/Hub.test.js
just test test/crosschain/HubIntegration.test.js
```

#### Task 1.2: Trade.sol Cross-Chain Integration (1 week)

**Current State**: Trade.sol has no cross-chain escrow support

**Implementation**:

```solidity
// contracts/evm/contracts/Trade.sol

// ADD: State variable
ICrossChainEscrow public crossChainEscrow;

// ADD: Setter (admin only)
function setCrossChainEscrow(address _escrow) external onlyRole(ADMIN_ROLE) {
    require(_escrow != address(0), "Invalid escrow");
    crossChainEscrow = ICrossChainEscrow(_escrow);
    emit CrossChainEscrowUpdated(_escrow);
}

// MODIFY: createTrade to support cross-chain
function createTrade(
    uint256 _offerId,
    uint256 _amount,
    string memory _buyerContact
) external returns (uint256 tradeId) {
    // ... existing validation ...

    // Check if this is cross-chain trade
    bool isCrossChain = _isCrossChainOffer(_offerId);

    if (isCrossChain) {
        // Use CrossChainEscrow instead of regular Escrow
        require(address(crossChainEscrow) != address(0), "CrossChain escrow not set");

        // Create cross-chain trade record
        tradeId = _createCrossChainTrade(_offerId, _amount, _buyerContact);
    } else {
        // Use regular Escrow
        tradeId = _createLocalTrade(_offerId, _amount, _buyerContact);
    }
}

function _isCrossChainOffer(uint256 offerId) internal view returns (bool) {
    // Check if offer originated from satellite chain
    // This requires adding origin tracking to Offer.sol
    IOffer offerContract = IOffer(hub.getConfig().offerContract);
    OfferData memory offer = offerContract.getOffer(offerId);

    // If offer description contains "Cross-chain offer from", it's cross-chain
    return bytes(offer.description).length > 23 &&
           keccak256(bytes(substring(offer.description, 0, 23))) ==
           keccak256(bytes("Cross-chain offer from "));
}
```

**Files to Modify**:
- `contracts/evm/contracts/Trade.sol` (add cross-chain detection and routing)
- `contracts/evm/contracts/interfaces/ITrade.sol` (add cross-chain functions)

**Validation**:
```bash
just test test/Trade.test.js
just test test/crosschain/CrossChainTrade.test.js
```

#### Task 1.3: Offer.sol Cross-Chain Support (1 week)

**Current State**: Offer.sol has no origin chain tracking

**Implementation**:

```solidity
// contracts/evm/contracts/Offer.sol

struct OfferData {
    uint256 id;
    address owner;
    OfferType offerType;
    OfferState state;
    string fiatCurrency;
    address tokenAddress;
    uint256 minAmount;
    uint256 maxAmount;
    uint256 rate;
    string description;
    uint256 createdAt;
    uint256 updatedAt;

    // ✅ NEW: Cross-chain tracking
    bool isCrossChain;
    string originChain;
    bytes32 originOfferId;
}

// Add to createOffer to support cross-chain offers created by Hub
function createCrossChainOffer(
    OfferType _type,
    string memory _fiatCurrency,
    address _token,
    uint256 _minAmount,
    uint256 _maxAmount,
    uint256 _rate,
    string memory _description,
    string memory _originChain,
    bytes32 _originOfferId
) external onlyRole(HUB_ROLE) returns (uint256) {
    // ... standard offer creation ...

    offers[offerId].isCrossChain = true;
    offers[offerId].originChain = _originChain;
    offers[offerId].originOfferId = _originOfferId;

    return offerId;
}
```

**Files to Modify**:
- `contracts/evm/contracts/Offer.sol` (add cross-chain fields and functions)
- `contracts/evm/contracts/interfaces/IOffer.sol` (update interface)

**Validation**:
```bash
just test test/Offer.test.js
just test test/crosschain/CrossChainOffer.test.js
```

#### Task 1.4: Complete Message Handlers (From PRP-02) (1 week)

**Reference**: PRP-02 provides complete implementation for all 12 handlers

**Files to Modify**:
- `contracts/evm/contracts/crosschain/AxelarBridge.sol` (lines 273-698)

**Validation**:
```bash
just test test/crosschain/MessageHandlers.test.js
```

**Deliverables**:
- [ ] Hub integrated with AxelarBridge
- [ ] Trade supports cross-chain escrow
- [ ] Offer tracks origin chain
- [ ] All 12 message handlers implemented
- [ ] All integration tests pass
- [ ] Gas costs < 500k per operation

---

### Phase 2: Token Bridge & ITS Setup (2-3 weeks) 🟠 HIGH

**Objective**: Enable cross-chain token transfers via Axelar ITS

#### Task 2.1: Deploy Canonical Tokens on Axelar ITS (1 week)

**Required Tokens**:
1. **USDT** - Across all chains
2. **USDC** - Across all chains
3. **KUJI** - BSC ↔ Kujira bridge
4. **Native tokens** - As needed per chain

**Process** (Using Axelar ITS Portal + Programmatic):

```solidity
// contracts/evm/scripts/deployITSTokens.js
const { ethers } = require("hardhat");
const {
  InterchainTokenFactory
} = require("@axelar-network/interchain-token-service");

async function deployCanonicalToken(tokenAddress, chains) {
    const factory = await InterchainTokenFactory.attach(ITS_FACTORY_ADDRESS);

    // Register as canonical token (can only be done once)
    const tx = await factory.registerCanonicalInterchainToken(tokenAddress);
    await tx.wait();

    console.log(`Registered ${tokenAddress} as canonical token`);

    // Deploy to other chains
    for (const chain of chains) {
        const deployTx = await factory.deployRemoteCanonicalInterchainToken(
            tokenAddress,
            chain,
            0 // No additional gas
        );
        await deployTx.wait();
        console.log(`Deployed to ${chain}`);
    }
}

// Deploy USDT across all chains
await deployCanonicalToken(
    "0x55d398326f99059fF775485246999027B3197955", // USDT on BSC
    ["Polygon", "Avalanche", "Base", "Ethereum"]
);
```

**Resources**:
- ITS Portal: https://www.axelar.network/its
- ITS Docs: https://docs.axelar.dev/dev/send-tokens/interchain-tokens/intro/
- Factory Contract: https://docs.axelar.dev/dev/send-tokens/interchain-tokens/developer-guides/programmatically-create-a-canonical-token

#### Task 2.2: Configure ITSTokenRegistry (3 days)

```solidity
// After deploying ITS tokens, register them in ITSTokenRegistry

const registry = await ITSTokenRegistry.attach(REGISTRY_ADDRESS);

// Register USDT
await registry.registerToken(
    "USDT",
    usdtTokenId, // From ITS deployment
    [
        { chainId: 1, tokenAddress: usdtEthAddress },
        { chainId: 56, tokenAddress: usdtBscAddress },
        { chainId: 137, tokenAddress: usdtPolygonAddress },
        { chainId: 43114, tokenAddress: usdtAvalancheAddress },
        { chainId: 8453, tokenAddress: usdtBaseAddress }
    ]
);

// Set bridge limits
await registry.setTokenLimits(
    "USDT",
    ethers.parseUnits("10", 6),    // Min: $10
    ethers.parseUnits("100000", 6)  // Max: $100k per transaction
);
```

#### Task 2.3: Grant Roles for Token Operations (2 days)

```solidity
// Grant BRIDGE_ROLE to AxelarBridge on CrossChainEscrow
const escrow = await CrossChainEscrow.attach(ESCROW_ADDRESS);
const BRIDGE_ROLE = await escrow.BRIDGE_ROLE();
await escrow.grantRole(BRIDGE_ROLE, AXELAR_BRIDGE_ADDRESS);

// Grant MINTER_ROLE to CrossChainEscrow on ITS tokens
// This allows escrow to mint/burn as needed
const itsToken = await IInterchainToken.attach(ITS_USDT_ADDRESS);
const MINTER_ROLE = await itsToken.MINTER_ROLE();
await itsToken.grantRole(MINTER_ROLE, ESCROW_ADDRESS);
```

**Deliverables**:
- [ ] USDT deployed across all 5 chains
- [ ] USDC deployed across all 5 chains
- [ ] KUJI deployed for BSC ↔ Kujira
- [ ] All tokens registered in ITSTokenRegistry
- [ ] Bridge limits configured
- [ ] Roles granted correctly
- [ ] Test token bridge transfers

**Validation**:
```bash
# Test token bridge functionality
just test test/crosschain/TokenBridge.test.js
just test test/crosschain/ITSIntegration.test.js

# Verify on testnet
node scripts/testTokenBridge.js
```

---

### Phase 3: Testnet Deployment & Validation (2-3 weeks) 🟡 MEDIUM-HIGH

**Objective**: Deploy complete system to testnets and validate all flows

#### Task 3.1: Deploy to BSC Testnet (3 days)

**Deployment Order** (Critical!):

```bash
# 1. Deploy AxelarHandler (non-upgradeable)
npx hardhat run scripts/deploy/deployAxelarHandler.js --network bscTestnet

# 2. Deploy AxelarBridge (upgradeable)
npx hardhat run scripts/deploy/deployAxelarBridge.js --network bscTestnet

# 3. Deploy CrossChainEscrow
npx hardhat run scripts/deploy/deployCrossChainEscrow.js --network bscTestnet

# 4. Deploy ITSTokenRegistry
npx hardhat run scripts/deploy/deployITSTokenRegistry.js --network bscTestnet

# 5. Deploy GasEstimator
npx hardhat run scripts/deploy/deployGasEstimator.js --network bscTestnet

# 6. Configure AxelarBridge
npx hardhat run scripts/configure/configureAxelarBridge.js --network bscTestnet

# 7. Integrate with existing Hub
npx hardhat run scripts/configure/integrateHubBridge.js --network bscTestnet

# 8. Grant roles
npx hardhat run scripts/configure/grantRoles.js --network bscTestnet
```

**Configuration Script Example**:

```javascript
// scripts/configure/configureAxelarBridge.js
const { ethers } = require("hardhat");

async function main() {
    const bridge = await ethers.getContractAt("AxelarBridge", BRIDGE_ADDRESS);

    // 1. Set Hub address
    await bridge.setHub(HUB_ADDRESS);
    console.log("Hub set");

    // 2. Set CrossChainEscrow
    await bridge.setCrossChainEscrow(ESCROW_ADDRESS);
    console.log("Escrow set");

    // 3. Set TokenRegistry
    await bridge.setTokenRegistry(REGISTRY_ADDRESS);
    console.log("Registry set");

    // 4. Register chain IDs
    await bridge.registerChainId(97, "bsc-testnet");
    await bridge.registerChainId(80001, "mumbai");
    await bridge.registerChainId(43113, "fuji");
    await bridge.registerChainId(84531, "base-goerli");
    console.log("Chain IDs registered");
}

main().catch(console.error);
```

#### Task 3.2: Deploy Satellites to Testnet Chains (4 days)

**Chains**: Mumbai (Polygon), Fuji (Avalanche), Base Goerli

```bash
# Deploy to all testnets in parallel
node scripts/deploy/deploy-all-satellites.js --network testnet

# This script already exists at:
# contracts/evm/deploy/deploy-all-satellites.js
```

**Post-Deployment Configuration**:

```javascript
// For each satellite:
const satellite = await LocalMoneySatellite.attach(SATELLITE_ADDRESS);

// 1. Update hub address
await satellite.updateHubAddress(
    "bsc-testnet",
    BSC_AXELAR_BRIDGE_ADDRESS
);

// 2. Configure gas
await satellite.updateGasConfig(
    ethers.parseEther("0.1"), // Base gas fee
    150 // Gas multiplier percentage
);

// 3. Fund with testnet tokens for gas
await deployer.sendTransaction({
    to: SATELLITE_ADDRESS,
    value: ethers.parseEther("1") // 1 native token
});
```

#### Task 3.3: Register All Chains Bidirectionally (2 days)

```javascript
// On BSC: Register all satellites
const bridge = await AxelarBridge.attach(BSC_BRIDGE_ADDRESS);

await bridge.registerChain("mumbai", MUMBAI_SATELLITE_ADDRESS);
await bridge.registerChain("fuji", FUJI_SATELLITE_ADDRESS);
await bridge.registerChain("base-goerli", BASE_SATELLITE_ADDRESS);

// On each satellite: Already configured hub in Task 3.2
```

#### Task 3.4: End-to-End Testing (1 week)

**Test Scenarios** (Execute in order):

1. **Cross-Chain Offer Creation**
```javascript
// On Mumbai satellite
const satellite = await LocalMoneySatellite.attach(MUMBAI_SATELLITE);

// User creates offer
const tx = await satellite.createOffer(
    USDT_ADDRESS,
    ethers.parseUnits("100", 6), // 100 USDT
    105, // $1.05 rate
    false, // Sell offer
    { value: ethers.parseEther("0.05") } // Gas payment
);

// Wait for Axelar to relay
await waitForAxelarRelay(tx.hash);

// Verify offer exists on BSC hub
const hub = await Hub.attach(BSC_HUB_ADDRESS);
const offers = await hub.getOffers();
// Should see new offer from Mumbai
```

2. **Cross-Chain Trade Flow**
```javascript
// On Base satellite: User accepts Mumbai offer
const baseSatellite = await LocalMoneySatellite.attach(BASE_SATELLITE);

const tradeTx = await baseSatellite.createTrade(
    offerIdFromMumbai,
    ethers.parseUnits("50", 6), // Trade 50 USDT
    "telegram:@buyer",
    { value: ethers.parseEther("0.1") } // Gas
);

await waitForAxelarRelay(tradeTx.hash);

// Verify trade created on BSC hub
const trades = await hub.getTrades();
// Should see new trade linking Mumbai offer + Base taker
```

3. **Token Bridge Flow**
```javascript
// User deposits USDT from Mumbai to escrow on BSC
const depositTx = await mumbaiSatellite.depositToTrade(
    tradeId,
    ethers.parseUnits("50", 6),
    { value: ethers.parseEther("0.1") }
);

await waitForAxelarRelay(depositTx.hash);

// Verify escrow funded on BSC
const escrow = await CrossChainEscrow.attach(BSC_ESCROW);
const balance = await escrow.getTradeBalance(tradeId);
expect(balance).to.equal(ethers.parseUnits("50", 6));
```

4. **Callback Verification**
```javascript
// After each operation, verify satellite received callback
const callbacks = await satellite.getCallbacks(userAddress);
// Should show success callbacks for offer creation, trade creation, etc.

// Verify cache updated
const cachedOffer = await satellite.getOfferDetails(offerId);
expect(cachedOffer.isActive).to.be.true; // Not pending
```

5. **Failed Message Recovery**
```javascript
// Simulate failure by pausing destination
await bridge.pauseChain("mumbai");

// Try to send message
await satellite.createOffer(...);

// Message should be stored as failed
const failedMessages = await bridge.getFailedMessages();
expect(failedMessages.length).to.be.gt(0);

// Unpause and retry
await bridge.unpauseChain("mumbai");
await bridge.retryFailedMessage(messageId, "mumbai");

// Should succeed on retry
```

6. **Gas Cost Validation**
```javascript
// Measure actual gas costs
const costs = await measureGasCosts([
    "createOffer",
    "createTrade",
    "fundEscrow",
    "releaseFunds"
]);

// Verify against estimates
for (const op of costs) {
    const estimate = await gasEstimator.estimateGas(op.type);
    expect(op.actual).to.be.closeTo(estimate, estimate * 0.1); // Within 10%
}
```

**Deliverables**:
- [ ] All contracts deployed to BSC testnet
- [ ] Satellites deployed to 3 testnet chains
- [ ] All chains registered bidirectionally
- [ ] Complete offer creation flow works
- [ ] Complete trade flow works
- [ ] Token bridging works
- [ ] Callbacks received and processed
- [ ] Failed messages can be recovered
- [ ] Gas estimates accurate to within 10%
- [ ] No stuck transactions
- [ ] Average cross-chain time < 5 minutes

**Validation**:
```bash
# Run full integration test suite
npm run test:integration:testnet

# Generate test report
npm run test:report
```

---

### Phase 4: Frontend Integration (3-4 weeks) 🟡 MEDIUM

**Objective**: Enable users to interact with cross-chain functionality via UI

#### Task 4.1: Satellite Service Layer (1 week)

**Create**: `app/src/services/satellite.ts`

```typescript
import { ethers } from 'ethers';
import { LocalMoneySatellite__factory } from '../contracts';

export class SatelliteService {
    private satellite: ethers.Contract;
    private chainName: string;

    constructor(satelliteAddress: string, chainName: string, provider: ethers.Provider) {
        this.satellite = LocalMoneySatellite__factory.connect(satelliteAddress, provider);
        this.chainName = chainName;
    }

    /**
     * Create cross-chain offer
     */
    async createCrossChainOffer(params: {
        token: string;
        amount: bigint;
        rate: number;
        isBuy: boolean;
        fiatCurrency: string;
    }): Promise<{ tx: ethers.TransactionResponse; offerId: string }> {
        // Estimate gas fee for cross-chain message
        const gasFee = await this.satellite.estimateGasFee();

        // Create offer with gas payment
        const tx = await this.satellite.createOffer(
            params.token,
            params.amount,
            params.rate,
            params.isBuy,
            { value: gasFee }
        );

        const receipt = await tx.wait();

        // Extract offer ID from event
        const event = receipt.logs.find(log =>
            log.topics[0] === this.satellite.interface.getEvent('OfferCreated').topicHash
        );

        const offerId = event?.args?.offerId;

        return { tx, offerId };
    }

    /**
     * Get offer details (from satellite cache)
     */
    async getOfferDetails(offerId: string): Promise<OfferDetails> {
        const [token, amount, rate, isBuy, isActive, lastUpdate] =
            await this.satellite.getOfferDetails(offerId);

        return {
            offerId,
            token,
            amount,
            rate,
            isBuy,
            isActive,
            lastUpdate: new Date(lastUpdate.toNumber() * 1000),
            chainName: this.chainName
        };
    }

    /**
     * Create cross-chain trade
     */
    async createCrossChainTrade(params: {
        offerId: string;
        amount: bigint;
        contact: string;
    }): Promise<{ tx: ethers.TransactionResponse; tradeId: string }> {
        const gasFee = await this.satellite.estimateGasFee();

        const tx = await this.satellite.createTrade(
            params.offerId,
            params.amount,
            params.contact,
            { value: gasFee }
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find(log =>
            log.topics[0] === this.satellite.interface.getEvent('TradeCreated').topicHash
        );

        return {
            tx,
            tradeId: event?.args?.tradeId
        };
    }

    /**
     * Get user's pending operations (awaiting callbacks)
     */
    async getPendingOperations(userAddress: string): Promise<PendingOperation[]> {
        const requests = await this.satellite.getPendingRequests(userAddress);

        return requests.map(req => ({
            nonce: req.nonce,
            type: this.getMessageTypeName(req.messageType),
            targetId: req.targetId,
            timestamp: new Date(req.timestamp.toNumber() * 1000),
            isCompleted: req.isCompleted
        }));
    }

    /**
     * Track cross-chain transaction status
     */
    async trackTransaction(txHash: string): Promise<TransactionStatus> {
        // Use Axelarscan API to track
        const response = await fetch(
            `https://testnet.axelarscan.io/api/gmp/${txHash}`
        );

        const data = await response.json();

        return {
            status: data.status, // 'pending', 'executed', 'failed'
            sourceChain: data.call?.chain,
            destinationChain: data.call?.returnValues?.destinationChain,
            estimatedTime: data.estimated_time_spent,
            actualTime: data.time_spent,
            error: data.error
        };
    }
}
```

#### Task 4.2: Chain Selector Component (3 days)

**Create**: `app/src/ui/components/ChainSelector.vue`

```vue
<template>
  <div class="chain-selector">
    <h3>Select Chain</h3>
    <div class="chain-grid">
      <div
        v-for="chain in availableChains"
        :key="chain.id"
        :class="['chain-card', { selected: selectedChain?.id === chain.id }]"
        @click="selectChain(chain)"
      >
        <img :src="chain.logo" :alt="chain.name" />
        <div class="chain-info">
          <span class="chain-name">{{ chain.name }}</span>
          <span class="chain-balance">
            {{ formatBalance(balances[chain.id]) }}
          </span>
        </div>
        <div v-if="chain.satelliteAddress" class="satellite-badge">
          Satellite
        </div>
        <div v-else class="hub-badge">
          Hub
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useWallet } from '../composables/useWallet';

const { address, getBalance } = useWallet();

const selectedChain = ref<Chain | null>(null);
const balances = ref<Record<number, bigint>>({});

const availableChains = computed(() => [
  {
    id: 56,
    name: 'BSC',
    logo: '/chains/bsc.png',
    satelliteAddress: null, // Hub chain
    rpcUrl: 'https://bsc-dataseed.binance.org/'
  },
  {
    id: 137,
    name: 'Polygon',
    logo: '/chains/polygon.png',
    satelliteAddress: '0x...', // From deployment
    rpcUrl: 'https://polygon-rpc.com/'
  },
  {
    id: 43114,
    name: 'Avalanche',
    logo: '/chains/avalanche.png',
    satelliteAddress: '0x...',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc'
  },
  {
    id: 8453,
    name: 'Base',
    logo: '/chains/base.png',
    satelliteAddress: '0x...',
    rpcUrl: 'https://mainnet.base.org'
  }
]);

onMounted(async () => {
  // Load balances for all chains
  for (const chain of availableChains.value) {
    balances.value[chain.id] = await getBalance(address.value, chain.id);
  }
});

function selectChain(chain: Chain) {
  selectedChain.value = chain;
  // Emit event or update global state
}

function formatBalance(balance: bigint): string {
  return ethers.formatEther(balance) + ' ' + 'TOKEN';
}
</script>
```

#### Task 4.3: Cross-Chain Trade Modal (4 days)

**Create**: `app/src/ui/components/CrossChainTradeModal.vue`

```vue
<template>
  <Modal v-model:visible="isVisible" title="Create Cross-Chain Trade">
    <!-- Step 1: Select Source Chain -->
    <div v-if="step === 1" class="step-select-chain">
      <h4>Select Your Chain</h4>
      <ChainSelector v-model="sourceChain" />
      <Button @click="step = 2">Next</Button>
    </div>

    <!-- Step 2: Enter Trade Details -->
    <div v-if="step === 2" class="step-trade-details">
      <h4>Trade Details</h4>

      <div class="offer-summary">
        <h5>{{ offer.isBuy ? 'Buying' : 'Selling' }} {{ offer.token }}</h5>
        <p>Rate: ${{ offer.rate }} per {{ offer.token }}</p>
        <p>Available: {{ formatAmount(offer.amount) }}</p>
        <p>From: {{ offer.chainName }}</p>
      </div>

      <FormInput
        v-model="tradeAmount"
        label="Amount"
        type="number"
        :min="offer.minAmount"
        :max="offer.maxAmount"
      />

      <FormInput
        v-model="contactInfo"
        label="Contact Information"
        placeholder="telegram:@username or email"
      />

      <!-- Gas Estimation -->
      <div class="gas-estimate">
        <h5>Estimated Fees</h5>
        <div class="fee-breakdown">
          <div class="fee-item">
            <span>Source Chain Gas:</span>
            <span>${{ gasEstimate.sourceChainUSD }}</span>
          </div>
          <div class="fee-item">
            <span>Axelar Relay:</span>
            <span>${{ gasEstimate.axelarUSD }}</span>
          </div>
          <div class="fee-item">
            <span>Destination Chain:</span>
            <span>${{ gasEstimate.destChainUSD }}</span>
          </div>
          <div class="fee-total">
            <span>Total Gas Cost:</span>
            <span>${{ gasEstimate.totalUSD }}</span>
          </div>
        </div>
        <p class="estimate-note">
          Estimated time: {{ gasEstimate.estimatedMinutes }} minutes
        </p>
      </div>

      <div class="action-buttons">
        <Button @click="step = 1" variant="secondary">Back</Button>
        <Button @click="createTrade" :loading="isSubmitting">
          Create Trade
        </Button>
      </div>
    </div>

    <!-- Step 3: Transaction Progress -->
    <div v-if="step === 3" class="step-progress">
      <h4>Transaction in Progress</h4>

      <div class="progress-tracker">
        <div :class="['progress-step', { active: progress >= 1, complete: progress > 1 }]">
          <div class="step-number">1</div>
          <div class="step-label">Submitting on {{ sourceChain.name }}</div>
          <div v-if="txHash" class="step-detail">
            <a :href="getExplorerUrl(sourceChain.id, txHash)" target="_blank">
              View Transaction
            </a>
          </div>
        </div>

        <div :class="['progress-step', { active: progress >= 2, complete: progress > 2 }]">
          <div class="step-number">2</div>
          <div class="step-label">Relaying via Axelar</div>
          <div v-if="axelarTxHash" class="step-detail">
            <a :href="`https://axelarscan.io/gmp/${axelarTxHash}`" target="_blank">
              Track on Axelarscan
            </a>
          </div>
        </div>

        <div :class="['progress-step', { active: progress >= 3, complete: progress > 3 }]">
          <div class="step-number">3</div>
          <div class="step-label">Executing on BSC Hub</div>
        </div>

        <div :class="['progress-step', { active: progress >= 4 }]">
          <div class="step-number">4</div>
          <div class="step-label">Receiving Confirmation</div>
        </div>
      </div>

      <div v-if="error" class="error-message">
        <strong>Error:</strong> {{ error }}
        <Button @click="retryTransaction">Retry</Button>
      </div>

      <div v-if="progress === 4" class="success-message">
        <h5>✓ Trade Created Successfully!</h5>
        <p>Trade ID: {{ tradeId }}</p>
        <Button @click="closeModal">Done</Button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { SatelliteService } from '../../services/satellite';
import { GasEstimatorService } from '../../services/gasEstimator';

const props = defineProps<{
  offer: OfferDetails;
}>();

const isVisible = ref(false);
const step = ref(1);
const sourceChain = ref<Chain | null>(null);
const tradeAmount = ref('');
const contactInfo = ref('');
const isSubmitting = ref(false);
const progress = ref(0);
const txHash = ref('');
const axelarTxHash = ref('');
const tradeId = ref('');
const error = ref('');

const gasEstimate = ref({
  sourceChainUSD: 0,
  axelarUSD: 0,
  destChainUSD: 0,
  totalUSD: 0,
  estimatedMinutes: 0
});

// Watch trade amount to update gas estimate
watch([tradeAmount, sourceChain], async () => {
  if (tradeAmount.value && sourceChain.value) {
    const estimator = new GasEstimatorService();
    gasEstimate.value = await estimator.estimateTradeGas(
      sourceChain.value.id,
      56, // BSC hub
      ethers.parseUnits(tradeAmount.value, 6)
    );
  }
});

async function createTrade() {
  isSubmitting.value = true;
  step.value = 3;
  progress.value = 1;

  try {
    const satellite = new SatelliteService(
      sourceChain.value!.satelliteAddress!,
      sourceChain.value!.name,
      getProvider(sourceChain.value!.id)
    );

    // Submit transaction
    const { tx, tradeId: newTradeId } = await satellite.createCrossChainTrade({
      offerId: props.offer.offerId,
      amount: ethers.parseUnits(tradeAmount.value, 6),
      contact: contactInfo.value
    });

    txHash.value = tx.hash;
    tradeId.value = newTradeId;

    // Wait for transaction confirmation
    await tx.wait();
    progress.value = 2;

    // Track via Axelarscan
    axelarTxHash.value = tx.hash; // Same hash used by Axelar

    // Poll for callback
    const pollInterval = setInterval(async () => {
      const status = await satellite.trackTransaction(tx.hash);

      if (status.status === 'executed') {
        progress.value = 3;

        // Wait for callback
        setTimeout(() => {
          progress.value = 4;
          clearInterval(pollInterval);
        }, 5000);

      } else if (status.status === 'failed') {
        error.value = status.error || 'Transaction failed';
        clearInterval(pollInterval);
      }
    }, 5000); // Poll every 5 seconds

  } catch (err) {
    error.value = err.message;
    console.error('Trade creation failed:', err);
  } finally {
    isSubmitting.value = false;
  }
}

function retryTransaction() {
  error.value = '';
  progress.value = 0;
  step.value = 2;
}

function closeModal() {
  isVisible.value = false;
  // Reset state
  step.value = 1;
  progress.value = 0;
}
</script>
```

#### Task 4.4: Transaction Status Tracker (3 days)

**Create**: `app/src/ui/components/CrossChainStatus.vue`

```vue
<template>
  <div class="cross-chain-status">
    <h3>Your Cross-Chain Transactions</h3>

    <div class="filter-tabs">
      <button
        :class="{ active: filter === 'pending' }"
        @click="filter = 'pending'"
      >
        Pending ({{ pending.length }})
      </button>
      <button
        :class="{ active: filter === 'completed' }"
        @click="filter = 'completed'"
      >
        Completed ({{ completed.length }})
      </button>
      <button
        :class="{ active: filter === 'failed' }"
        @click="filter = 'failed'"
      >
        Failed ({{ failed.length }})
      </button>
    </div>

    <div class="transactions-list">
      <TransactionCard
        v-for="tx in filteredTransactions"
        :key="tx.id"
        :transaction="tx"
        @retry="retryTransaction"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { SatelliteService } from '../../services/satellite';

const filter = ref<'pending' | 'completed' | 'failed'>('pending');
const transactions = ref<CrossChainTransaction[]>([]);

const pending = computed(() =>
  transactions.value.filter(tx => tx.status === 'pending')
);

const completed = computed(() =>
  transactions.value.filter(tx => tx.status === 'completed')
);

const failed = computed(() =>
  transactions.value.filter(tx => tx.status === 'failed')
);

const filteredTransactions = computed(() => {
  if (filter.value === 'pending') return pending.value;
  if (filter.value === 'completed') return completed.value;
  return failed.value;
});

onMounted(async () => {
  // Load user's cross-chain transactions
  await loadTransactions();

  // Poll for updates every 10 seconds
  setInterval(loadTransactions, 10000);
});

async function loadTransactions() {
  // Get pending operations from all satellites
  const allChains = getAvailableChains();

  for (const chain of allChains) {
    if (chain.satelliteAddress) {
      const satellite = new SatelliteService(
        chain.satelliteAddress,
        chain.name,
        getProvider(chain.id)
      );

      const pending = await satellite.getPendingOperations(userAddress);

      // Update transactions list
      for (const op of pending) {
        const existing = transactions.value.find(tx => tx.nonce === op.nonce);
        if (existing) {
          existing.isCompleted = op.isCompleted;
        } else {
          transactions.value.push({
            id: `${chain.id}-${op.nonce}`,
            type: op.type,
            sourceChain: chain.name,
            targetId: op.targetId,
            timestamp: op.timestamp,
            status: op.isCompleted ? 'completed' : 'pending',
            nonce: op.nonce
          });
        }
      }
    }
  }
}
</script>
```

**Deliverables**:
- [ ] SatelliteService implemented
- [ ] ChainSelector component created
- [ ] CrossChainTradeModal with progress tracking
- [ ] Transaction status tracker
- [ ] Gas estimation display
- [ ] Error handling and retry mechanism
- [ ] Axelarscan integration for tracking
- [ ] UI/UX tested and polished

**Validation**:
```bash
cd app
npm run dev
# Test all cross-chain flows in UI
npm run test:e2e
```

---

### Phase 5: Operational Infrastructure (2-3 weeks) 🟠 HIGH

**Objective**: Set up monitoring, alerting, and operational tools for production

#### Task 5.1: Monitoring Dashboard (1 week)

**Stack**: Grafana + Prometheus + Custom Exporters

**Create**: `infrastructure/monitoring/prometheus-exporter.js`

```javascript
const express = require('express');
const { register, Counter, Gauge, Histogram } = require('prom-client');
const { ethers } = require('ethers');

const app = express();

// Metrics
const messagesSent = new Counter({
  name: 'axelar_messages_sent_total',
  help: 'Total messages sent via Axelar',
  labelNames: ['source_chain', 'dest_chain', 'message_type']
});

const messagesProcessed = new Counter({
  name: 'axelar_messages_processed_total',
  help: 'Total messages processed successfully',
  labelNames: ['source_chain', 'message_type']
});

const messagesFailed = new Counter({
  name: 'axelar_messages_failed_total',
  help: 'Total messages that failed',
  labelNames: ['source_chain', 'reason']
});

const messageLatency = new Histogram({
  name: 'axelar_message_latency_seconds',
  help: 'Time taken for message to be processed',
  labelNames: ['source_chain', 'dest_chain'],
  buckets: [30, 60, 120, 300, 600, 1200] // 30s to 20min
});

const bridgeBalance = new Gauge({
  name: 'axelar_bridge_balance',
  help: 'Balance of bridge contract',
  labelNames: ['chain', 'token']
});

const gasWalletBalance = new Gauge({
  name: 'axelar_gas_wallet_balance',
  help: 'Balance of gas payment wallet',
  labelNames: ['chain']
});

// Collect metrics from contracts
async function collectMetrics() {
  const chains = [
    { id: 56, name: 'bsc', rpc: process.env.BSC_RPC },
    { id: 137, name: 'polygon', rpc: process.env.POLYGON_RPC },
    // ... other chains
  ];

  for (const chain of chains) {
    const provider = new ethers.JsonRpcProvider(chain.rpc);

    // Get bridge balance
    const bridge = new ethers.Contract(
      BRIDGE_ADDRESSES[chain.name],
      BRIDGE_ABI,
      provider
    );

    const balance = await provider.getBalance(bridge.address);
    bridgeBalance.set(
      { chain: chain.name, token: 'native' },
      Number(ethers.formatEther(balance))
    );

    // Get gas wallet balance
    const gasBalance = await provider.getBalance(GAS_WALLET_ADDRESS);
    gasWalletBalance.set(
      { chain: chain.name },
      Number(ethers.formatEther(gasBalance))
    );

    // Listen to events and update counters
    bridge.on('MessageSent', (messageId, destChain, sender, event) => {
      messagesSent.inc({
        source_chain: chain.name,
        dest_chain: destChain,
        message_type: 'unknown' // Parse from event
      });
    });

    bridge.on('MessageProcessed', (messageId, sourceChain, sender, event) => {
      messagesProcessed.inc({
        source_chain: sourceChain,
        message_type: 'unknown'
      });
    });

    bridge.on('MessageFailed', (messageId, reason, event) => {
      messagesFailed.inc({
        source_chain: chain.name,
        reason: reason
      });
    });
  }
}

// Start collecting
collectMetrics().catch(console.error);
setInterval(collectMetrics, 60000); // Every minute

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(9090, () => {
  console.log('Prometheus exporter running on :9090');
});
```

**Grafana Dashboard Config**: `infrastructure/monitoring/grafana-dashboard.json`

```json
{
  "dashboard": {
    "title": "LocalMoney Axelar Bridge",
    "panels": [
      {
        "title": "Messages Sent (24h)",
        "targets": [{
          "expr": "sum(increase(axelar_messages_sent_total[24h])) by (source_chain, dest_chain)"
        }],
        "type": "graph"
      },
      {
        "title": "Success Rate",
        "targets": [{
          "expr": "sum(rate(axelar_messages_processed_total[5m])) / sum(rate(axelar_messages_sent_total[5m]))"
        }],
        "type": "singlestat"
      },
      {
        "title": "Failed Messages",
        "targets": [{
          "expr": "sum(increase(axelar_messages_failed_total[1h])) by (reason)"
        }],
        "type": "table"
      },
      {
        "title": "Message Latency (p99)",
        "targets": [{
          "expr": "histogram_quantile(0.99, rate(axelar_message_latency_seconds_bucket[5m]))"
        }],
        "type": "graph"
      },
      {
        "title": "Bridge Balances",
        "targets": [{
          "expr": "axelar_bridge_balance"
        }],
        "type": "graph"
      },
      {
        "title": "Gas Wallet Balances (Alert if < 0.1)",
        "targets": [{
          "expr": "axelar_gas_wallet_balance"
        }],
        "alert": {
          "conditions": [{
            "evaluator": { "params": [0.1], "type": "lt" },
            "query": { "params": ["A", "5m", "now"] }
          }]
        },
        "type": "graph"
      }
    ]
  }
}
```

#### Task 5.2: Alerting System (3 days)

**Create**: `infrastructure/monitoring/alerts.yml`

```yaml
groups:
  - name: axelar_bridge_alerts
    interval: 1m
    rules:
      # Critical Alerts
      - alert: BridgeContractPaused
        expr: axelar_bridge_paused == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Bridge contract is paused on {{ $labels.chain }}"

      - alert: HighMessageFailureRate
        expr: rate(axelar_messages_failed_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High message failure rate: {{ $value }}/sec"

      - alert: GasWalletLow
        expr: axelar_gas_wallet_balance < 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Gas wallet balance low on {{ $labels.chain }}: {{ $value }}"

      # Warning Alerts
      - alert: SlowMessageProcessing
        expr: histogram_quantile(0.99, rate(axelar_message_latency_seconds_bucket[10m])) > 600
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Messages taking >10 minutes to process"

      - alert: BridgeBalanceLow
        expr: axelar_bridge_balance < 1.0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Bridge balance low on {{ $labels.chain }}: {{ $value }}"

      - alert: StuckMessages
        expr: increase(axelar_messages_sent_total[30m]) - increase(axelar_messages_processed_total[30m]) > 10
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "{{ $value }} messages stuck in transit"

# Alert receivers
alertmanager:
  receivers:
    - name: 'telegram'
      telegram_configs:
        - bot_token: '<bot_token>'
          chat_id: <chat_id>

    - name: 'pagerduty'
      pagerduty_configs:
        - service_key: '<service_key>'

  route:
    receiver: 'telegram'
    group_by: ['alertname', 'severity']
    routes:
      - match:
          severity: critical
        receiver: 'pagerduty'
        continue: true
```

#### Task 5.3: Incident Response Runbooks (2 days)

**Create**: `docs/runbooks/`

**1. Emergency Pause Procedure** (`docs/runbooks/emergency-pause.md`)

```markdown
# Emergency Pause Procedure

## When to Use
- Critical bug discovered
- Unusual activity detected
- Security vulnerability found
- Oracle failure

## Steps

### 1. Immediate Pause
```bash
# Connect to multi-sig wallet
export PRIVATE_KEY=<emergency_key>

# Pause globally
npx hardhat run scripts/emergency/pauseAll.js --network mainnet

# Verify paused
npx hardhat run scripts/emergency/checkPauseStatus.js --network mainnet
```

### 2. Notify Team
- Post in #incidents channel
- Update status page: status.localmoney.io
- Notify users via Twitter/Discord

### 3. Investigate
- Check recent transactions
- Review error logs
- Analyze failed messages
- Determine root cause

### 4. Plan Fix
- Estimate fix time
- Decide if upgrade needed
- Test fix on testnet
- Prepare deployment

### 5. Resume
Only after:
- [ ] Fix deployed and tested
- [ ] Multi-sig approval obtained
- [ ] Monitoring confirms normal operation
- [ ] Post-mortem completed

```bash
npx hardhat run scripts/emergency/resume.js --network mainnet
```

## Contacts
- Lead Dev: +1-XXX-XXX-XXXX
- Security: security@localmoney.io
- Multi-sig signers: See #multi-sig channel
```

**2. Failed Message Recovery** (`docs/runbooks/failed-message-recovery.md`)

```markdown
# Failed Message Recovery

## Diagnosis
```bash
# Get failed messages
npx hardhat run scripts/diagnostics/getFailedMessages.js --network mainnet

# Output:
# MessageID: 0xabc...
# Source: polygon
# Reason: "Unknown satellite"
# Timestamp: 2025-09-30 14:30:00
```

## Common Failures

### 1. Unknown Satellite (Chain Not Registered)
**Fix**:
```bash
npx hardhat run scripts/configure/registerChain.js \
  --network mainnet \
  --chain polygon \
  --satellite 0x...

# Retry message
npx hardhat run scripts/recovery/retryMessage.js \
  --network mainnet \
  --message-id 0xabc...
```

### 2. Insufficient Gas
**Fix**:
```bash
# Top up gas wallet
npx hardhat run scripts/admin/fundGasWallet.js \
  --network mainnet \
  --amount 1.0

# Retry with higher gas
npx hardhat run scripts/recovery/retryMessageWithGas.js \
  --network mainnet \
  --message-id 0xabc... \
  --gas-limit 500000
```

### 3. Contract Paused
**Fix**:
```bash
# Check pause status
npx hardhat run scripts/diagnostics/checkPauseStatus.js --network polygon

# Unpause if safe
npx hardhat run scripts/admin/unpauseChain.js \
  --network mainnet \
  --chain polygon

# Retry
npx hardhat run scripts/recovery/retryMessage.js \
  --network mainnet \
  --message-id 0xabc...
```

## Bulk Recovery
```bash
# Get all failed messages in last 24h
npx hardhat run scripts/diagnostics/getFailedMessages.js \
  --network mainnet \
  --since 24h \
  > failed.json

# Retry all
npx hardhat run scripts/recovery/retryBatch.js \
  --network mainnet \
  --file failed.json
```
```

**3. Gas Wallet Refill** (`docs/runbooks/gas-wallet-refill.md`)

```markdown
# Gas Wallet Refill Procedure

## Monitoring
Alert triggers when balance < 0.1 on any chain

## Steps

### 1. Check Current Balances
```bash
npx hardhat run scripts/diagnostics/checkGasBalances.js

# Output:
# BSC: 0.05 BNB (⚠️ LOW)
# Polygon: 1.2 MATIC (OK)
# Avalanche: 0.3 AVAX (OK)
# Base: 0.08 ETH (⚠️ LOW)
```

### 2. Calculate Required Amount
- Estimate: 1000 transactions per day
- Gas per tx: 0.0001 native token
- Daily need: 0.1 native token
- Refill to: 1.0 native token (10 days buffer)

### 3. Refill
```bash
# Refill BSC
npx hardhat run scripts/admin/fundGasWallet.js \
  --network bsc \
  --amount 1.0

# Refill Base
npx hardhat run scripts/admin/fundGasWallet.js \
  --network base \
  --amount 1.0
```

### 4. Verify
```bash
npx hardhat run scripts/diagnostics/checkGasBalances.js

# Confirm alert cleared in Grafana
```

## Auto-Refill Setup
```javascript
// scripts/automation/autoRefillGas.js
// Runs every 6 hours via cron

const thresholds = {
  bsc: 0.3,
  polygon: 0.5,
  avalanche: 0.5,
  base: 0.3
};

const refillTo = {
  bsc: 1.0,
  polygon: 2.0,
  avalanche: 2.0,
  base: 1.0
};

for (const [chain, threshold] of Object.entries(thresholds)) {
  const balance = await getGasBalance(chain);
  if (balance < threshold) {
    await refillGas(chain, refillTo[chain]);
    await notifyTeam(`Refilled ${chain} gas wallet to ${refillTo[chain]}`);
  }
}
```
```

**Deliverables**:
- [ ] Prometheus exporter deployed
- [ ] Grafana dashboard configured
- [ ] Alerts configured in AlertManager
- [ ] Telegram/PagerDuty integration working
- [ ] All runbooks documented
- [ ] Auto-refill script deployed
- [ ] 24/7 monitoring active

**Validation**:
```bash
# Test alert system
npx hardhat run scripts/test/triggerTestAlert.js

# Verify metrics collection
curl http://localhost:9090/metrics

# Check Grafana dashboard
open http://grafana.localmoney.io/d/axelar-bridge
```

---

### Phase 6: Security Audit & Hardening (4-6 weeks) 🔴 CRITICAL

**Objective**: Achieve security audit approval and fix all findings

#### Task 6.1: Internal Security Review (1 week)

**Checklist**:

```markdown
## Smart Contract Security

### Access Control
- [ ] All admin functions protected by roles
- [ ] Multi-sig required for critical operations
- [ ] Timelock enforced for upgrades
- [ ] Emergency pause by EMERGENCY_ROLE only
- [ ] No EOA admin access in production

### Cross-Chain Security
- [ ] Message replay protection (nonce + message ID)
- [ ] Source chain validation (registered chains only)
- [ ] Source address validation (known satellites only)
- [ ] Payload validation before processing
- [ ] Rate limiting on message volume

### Token Security
- [ ] Token whitelist enforced
- [ ] Bridge limits (min/max) enforced
- [ ] Fee calculations can't overflow
- [ ] Token transfer amount validation
- [ ] Reentrancy protection on all token operations

### Gas Security
- [ ] Gas payment validation
- [ ] Refund mechanism for overpayment
- [ ] Gas price oracle can't be manipulated
- [ ] Reserve pool for underpayment
- [ ] Maximum gas limit enforced

### Upgrade Security
- [ ] UUPS pattern correctly implemented
- [ ] _authorizeUpgrade enforces timelock
- [ ] Storage gaps for future variables
- [ ] Initialization protection
- [ ] No selfdestruct or delegatecall to untrusted

### Error Handling
- [ ] All external calls in try-catch
- [ ] Failed messages stored for recovery
- [ ] Callbacks handle failure gracefully
- [ ] No silent failures
- [ ] Descriptive error messages
```

**Tools to Run**:

```bash
# Static analysis
npm install -g slither-analyzer
slither contracts/evm/contracts/crosschain/ --exclude-dependencies

# Mythril
myth analyze contracts/evm/contracts/crosschain/AxelarBridge.sol

# Manticore symbolic execution
manticore contracts/evm/contracts/crosschain/AxelarBridge.sol

# Gas optimization
npx hardhat gas-reporter

# Test coverage
npx hardhat coverage --testfiles "test/crosschain/**/*.js"
# Target: >95% coverage
```

#### Task 6.2: External Audit (3-4 weeks)

**Recommended Auditors**:
1. **Trail of Bits** - $80k-120k, 4 weeks
2. **ConsenSys Diligence** - $60k-100k, 3-4 weeks
3. **OpenZeppelin** - $50k-80k, 3 weeks
4. **Certik** - $40k-70k, 2-3 weeks

**Audit Scope**:
- AxelarBridge.sol (927 lines)
- AxelarHandler.sol (118 lines)
- LocalMoneySatellite.sol (444 lines)
- CrossChainEscrow.sol (405 lines)
- ITSTokenRegistry.sol (272 lines)
- MessageTypes.sol
- Hub.sol cross-chain integration (lines 480-669)
- Trade.sol cross-chain integration

**Total**: ~2,500 lines of Solidity

**Deliverables from Audit**:
- Audit report with findings
- Severity classification (Critical/High/Medium/Low/Informational)
- Recommended fixes
- Re-audit of fixes

#### Task 6.3: Fix Audit Findings (1-2 weeks)

**Process**:

```markdown
For each finding:

1. **Understand**
   - Read finding description
   - Reproduce issue if possible
   - Assess actual impact

2. **Fix**
   - Implement recommended fix
   - Or implement alternative if better
   - Add test case for the finding

3. **Verify**
   - Run test case
   - Check no regressions
   - Measure gas impact

4. **Document**
   - Note fix in CHANGELOG
   - Update inline comments
   - Add to security docs

5. **Re-audit**
   - Submit fix to auditor
   - Get confirmation
   - Mark as resolved
```

**Common Finding Categories** (based on similar projects):

1. **Message Replay** - Add nonce tracking ✅ (already implemented)
2. **Reentrancy** - Add ReentrancyGuard ✅ (already implemented)
3. **Integer Overflow** - Use Solidity 0.8+ ✅ (already using 0.8.24)
4. **Access Control** - Verify all role checks ⚠️ (needs review)
5. **Gas Limits** - Add maximum gas checks ❌ (needs implementation)
6. **Error Handling** - Improve try-catch coverage ⚠️ (needs review)

#### Task 6.4: Security Documentation (3 days)

**Create**: `docs/security/`

```markdown
# SECURITY.md

## Security Model

### Trust Assumptions
1. **Axelar Network**: We trust Axelar validators to relay messages correctly
2. **Oracle**: We trust the price oracle for gas estimation
3. **Multi-sig**: We trust the multi-sig signers for admin operations
4. **Registered Chains**: We trust that registered satellite addresses are correct

### Security Boundaries
- Each chain is isolated; a compromise on one chain doesn't affect others
- The Hub (BSC) is the source of truth for all state
- Satellites only cache state; they can't modify Hub state directly

### Attack Vectors & Mitigations

#### 1. Message Replay Attack
**Attack**: Attacker replays a valid message to execute it twice
**Mitigation**:
- Unique message ID (hash of sender + nonce + chain + type)
- `processedMessages` mapping prevents replays
- Nonce increments monotonically

#### 2. Unauthorized Source
**Attack**: Attacker sends message from unregistered chain/address
**Mitigation**:
- `registeredChains` mapping
- `satelliteAddresses` mapping
- Strict validation in `handleAxelarMessage`

#### 3. Gas Griefing
**Attack**: Attacker sends messages with insufficient gas
**Mitigation**:
- GasEstimator provides reliable estimates
- Minimum gas requirement enforced
- Failed messages stored for retry

#### 4. Token Theft
**Attack**: Attacker drains escrow funds
**Mitigation**:
- Escrow only releases on valid message from registered chain
- Multi-sig required for emergency withdrawals
- Per-token bridge limits

#### 5. Upgrade Attack
**Attack**: Malicious admin upgrades contract
**Mitigation**:
- Timelock enforced (minimum 48 hours)
- Multi-sig required for upgrades
- No single EOA can upgrade

### Incident Response
- See: docs/runbooks/emergency-pause.md
- Security contact: security@localmoney.io
- Bug bounty: https://immunefi.com/localmoney

## Responsible Disclosure
Please report vulnerabilities to security@localmoney.io
```

**Deliverables**:
- [ ] Internal security review completed
- [ ] All tools (Slither, Mythril, etc.) run
- [ ] Test coverage >95%
- [ ] External audit contracted
- [ ] Audit report received
- [ ] All critical/high findings fixed
- [ ] Re-audit completed
- [ ] Security documentation published
- [ ] Bug bounty program launched

---

### Phase 7: Mainnet Deployment (1-2 weeks) 🟢 FINAL

**Objective**: Deploy to production with gradual rollout

#### Task 7.1: Pre-Deployment Checklist (2 days)

```markdown
## Code
- [ ] All audit findings resolved
- [ ] Test coverage >95%
- [ ] Gas optimizations applied
- [ ] No compiler warnings
- [ ] Contract sizes < 24kb

## Configuration
- [ ] Multi-sig wallet deployed on all chains
- [ ] Timelock controller configured (48h delay)
- [ ] All contract addresses documented
- [ ] Chain configurations verified
- [ ] Token addresses verified

## Infrastructure
- [ ] Monitoring deployed
- [ ] Alerting configured
- [ ] Runbooks documented
- [ ] Incident response team ready
- [ ] Gas wallets funded (10 days buffer)

## Testing
- [ ] Testnet deployment successful
- [ ] All end-to-end flows tested
- [ ] Load testing completed
- [ ] Failure scenarios tested
- [ ] Recovery procedures tested

## Legal & Compliance
- [ ] Terms of service updated
- [ ] Privacy policy updated
- [ ] Regulatory compliance verified
- [ ] User notifications prepared

## Communications
- [ ] Launch blog post ready
- [ ] Social media scheduled
- [ ] User guide published
- [ ] Support team trained
```

#### Task 7.2: Deployment to Mainnet (3 days)

**Deployment Script**: `scripts/deploy/mainnet-deployment.js`

```javascript
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");

async function deployMainnet() {
    console.log("🚀 LocalMoney Axelar Integration - Mainnet Deployment");
    console.log("==================================================\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying from:", deployer.address);
    console.log("Balance:", ethers.formatEther(await deployer.getBalance()), "ETH\n");

    const deployments = {};

    // === BSC (Hub) ===
    console.log("📍 Deploying to BSC (Hub Chain)...\n");

    // 1. Deploy AxelarHandler
    console.log("1/6 Deploying AxelarHandler...");
    const AxelarHandler = await ethers.getContractFactory("AxelarHandler");
    const axelarHandler = await AxelarHandler.deploy(
        BSC_AXELAR_GATEWAY // From config
    );
    await axelarHandler.waitForDeployment();
    deployments.bsc.axelarHandler = await axelarHandler.getAddress();
    console.log("   ✅ AxelarHandler:", deployments.bsc.axelarHandler);

    // 2. Deploy AxelarBridge (Upgradeable)
    console.log("2/6 Deploying AxelarBridge...");
    const AxelarBridge = await ethers.getContractFactory("AxelarBridge");
    const axelarBridge = await upgrades.deployProxy(
        AxelarBridge,
        [
            BSC_HUB_ADDRESS, // Existing Hub
            BSC_AXELAR_GAS_SERVICE,
            deployments.bsc.axelarHandler
        ],
        {
            kind: 'uups',
            initializer: 'initialize'
        }
    );
    await axelarBridge.waitForDeployment();
    deployments.bsc.axelarBridge = await axelarBridge.getAddress();
    console.log("   ✅ AxelarBridge:", deployments.bsc.axelarBridge);

    // 3. Deploy CrossChainEscrow
    console.log("3/6 Deploying CrossChainEscrow...");
    const CrossChainEscrow = await ethers.getContractFactory("CrossChainEscrow");
    const escrow = await upgrades.deployProxy(
        CrossChainEscrow,
        [BSC_HUB_ADDRESS, deployments.bsc.axelarBridge],
        { kind: 'uups' }
    );
    await escrow.waitForDeployment();
    deployments.bsc.crossChainEscrow = await escrow.getAddress();
    console.log("   ✅ CrossChainEscrow:", deployments.bsc.crossChainEscrow);

    // 4. Deploy ITSTokenRegistry
    console.log("4/6 Deploying ITSTokenRegistry...");
    const ITSTokenRegistry = await ethers.getContractFactory("ITSTokenRegistry");
    const registry = await upgrades.deployProxy(
        ITSTokenRegistry,
        [BSC_AXELAR_ITS_ADDRESS],
        { kind: 'uups' }
    );
    await registry.waitForDeployment();
    deployments.bsc.tokenRegistry = await registry.getAddress();
    console.log("   ✅ ITSTokenRegistry:", deployments.bsc.tokenRegistry);

    // 5. Deploy GasEstimator
    console.log("5/6 Deploying GasEstimator...");
    const GasEstimator = await ethers.getContractFactory("GasEstimator");
    const gasEstimator = await upgrades.deployProxy(
        GasEstimator,
        [],
        { kind: 'uups' }
    );
    await gasEstimator.waitForDeployment();
    deployments.bsc.gasEstimator = await gasEstimator.getAddress();
    console.log("   ✅ GasEstimator:", deployments.bsc.gasEstimator);

    // 6. Configure AxelarBridge
    console.log("6/6 Configuring AxelarBridge...");
    await axelarBridge.setCrossChainEscrow(deployments.bsc.crossChainEscrow);
    await axelarBridge.setTokenRegistry(deployments.bsc.tokenRegistry);
    console.log("   ✅ Configuration complete");

    console.log("\n📍 Deploying Satellites...\n");

    // === Polygon ===
    await deploySatellite("polygon", POLYGON_RPC, {
        hubChain: "bsc",
        hubAddress: deployments.bsc.axelarBridge,
        axelarGateway: POLYGON_AXELAR_GATEWAY,
        gasService: POLYGON_AXELAR_GAS_SERVICE
    });

    // === Avalanche ===
    await deploySatellite("avalanche", AVALANCHE_RPC, {
        hubChain: "bsc",
        hubAddress: deployments.bsc.axelarBridge,
        axelarGateway: AVALANCHE_AXELAR_GATEWAY,
        gasService: AVALANCHE_AXELAR_GAS_SERVICE
    });

    // === Base ===
    await deploySatellite("base", BASE_RPC, {
        hubChain: "bsc",
        hubAddress: deployments.bsc.axelarBridge,
        axelarGateway: BASE_AXELAR_GATEWAY,
        gasService: BASE_AXELAR_GAS_SERVICE
    });

    console.log("\n📍 Registering Chains...\n");

    // Register satellites on bridge
    await axelarBridge.registerChain("polygon", deployments.polygon.satellite);
    await axelarBridge.registerChain("avalanche", deployments.avalanche.satellite);
    await axelarBridge.registerChain("base", deployments.base.satellite);

    console.log("   ✅ All chains registered");

    console.log("\n📍 Integrating with Hub...\n");

    // Connect to existing Hub
    const hub = await ethers.getContractAt("Hub", BSC_HUB_ADDRESS);

    // Set AxelarBridge on Hub (requires multi-sig in production)
    console.log("⚠️  MANUAL STEP REQUIRED:");
    console.log("   Execute via multi-sig:");
    console.log(`   hub.setAxelarBridge("${deployments.bsc.axelarBridge}")`);

    // Save deployments
    fs.writeFileSync(
        "deployments/mainnet.json",
        JSON.stringify(deployments, null, 2)
    );

    console.log("\n✅ Deployment Complete!");
    console.log("📄 Addresses saved to: deployments/mainnet.json");

    // Verify contracts
    console.log("\n🔍 Verifying contracts...");
    await verifyContract(deployments.bsc.axelarHandler, [BSC_AXELAR_GATEWAY]);
    await verifyContract(deployments.bsc.axelarBridge, []);
    // ... verify all contracts

    console.log("\n✅ Verification Complete!");
}

async function deploySatellite(chain, rpc, config) {
    const provider = new ethers.JsonRpcProvider(rpc);
    const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log(`   Deploying to ${chain}...`);

    const LocalMoneySatellite = await ethers.getContractFactory("LocalMoneySatellite", deployer);
    const satellite = await LocalMoneySatellite.deploy(
        config.hubChain,
        config.hubAddress,
        config.axelarGateway,
        config.gasService
    );
    await satellite.waitForDeployment();

    deployments[chain] = {
        satellite: await satellite.getAddress()
    };

    console.log(`   ✅ ${chain} Satellite:`, deployments[chain].satellite);
}

deployMainnet().catch(console.error);
```

**Run Deployment**:

```bash
# Dry run first
npx hardhat run scripts/deploy/mainnet-deployment.js --network mainnet --dry-run

# Review gas costs
# Review all parameters

# Deploy for real
npx hardhat run scripts/deploy/mainnet-deployment.js --network mainnet

# Verify all contracts
npx hardhat verify --network mainnet <contract_address> <constructor_args>
```

#### Task 7.3: Gradual Rollout (1 week)

**Phase 1: Soft Launch** (Days 1-2)

```markdown
## Configuration
- [ ] Set very conservative limits:
  - Max trade: $100
  - Max daily volume: $10k per chain
  - Rate limit: 10 tx/hour per user

## User Access
- [ ] Whitelist 10 beta testers
- [ ] Only allow on testnet tokens first
- [ ] Monitor every transaction

## Success Criteria
- [ ] 50+ transactions completed
- [ ] No errors or stuck messages
- [ ] Gas costs as expected
- [ ] Callbacks working 100%
```

**Phase 2: Limited Launch** (Days 3-4)

```markdown
## Configuration
- [ ] Increase limits:
  - Max trade: $1,000
  - Max daily volume: $100k per chain
  - Rate limit: 50 tx/hour per user

## User Access
- [ ] Open to first 100 users
- [ ] Add real tokens (USDT, USDC)
- [ ] Monitor closely

## Success Criteria
- [ ] 500+ transactions completed
- [ ] <1% failure rate
- [ ] Average processing time <5 min
- [ ] No critical issues
```

**Phase 3: Full Launch** (Days 5-7)

```markdown
## Configuration
- [ ] Set production limits:
  - Max trade: $100,000
  - Max daily volume: $10M per chain
  - Rate limit: 100 tx/hour per user

## User Access
- [ ] Open to all users
- [ ] All tokens available
- [ ] Full feature set

## Communications
- [ ] Launch blog post
- [ ] Social media announcement
- [ ] Press release
- [ ] User guide published
```

**Monitoring During Rollout**:

```bash
# Watch Grafana dashboard continuously
open http://grafana.localmoney.io/d/axelar-bridge

# Check for alerts
curl http://alertmanager:9093/api/v2/alerts

# Monitor gas wallets
npx hardhat run scripts/diagnostics/checkGasBalances.js --network all

# Check failed messages
npx hardhat run scripts/diagnostics/getFailedMessages.js --network mainnet
```

**Rollback Criteria** (If any occur, immediately pause and rollback):
- ❌ >5% message failure rate
- ❌ Any funds lost or stuck
- ❌ Critical security issue discovered
- ❌ Average message time >15 minutes
- ❌ Multiple users reporting issues

**Deliverables**:
- [ ] All contracts deployed to mainnet
- [ ] All chains registered and verified
- [ ] Multi-sig integrated with Hub
- [ ] Monitoring confirmed working
- [ ] Soft launch completed (50+ tx)
- [ ] Limited launch completed (500+ tx)
- [ ] Full launch completed
- [ ] Post-launch review conducted

---

## Validation Gates

### Compilation & Static Analysis
```bash
cd contracts/evm

# Compile all contracts
just compile
# ✅ Must compile without errors or warnings

# Run Slither
slither contracts/crosschain/ --exclude-dependencies
# ✅ No high or critical issues

# Check contract sizes
just size
# ✅ All contracts < 24kb
```

### Testing
```bash
# Unit tests
just test test/crosschain/
# ✅ 100% pass rate

# Integration tests
just test test/integration/
# ✅ 100% pass rate

# Coverage
npx hardhat coverage
# ✅ >95% coverage

# Gas report
just gas-report
# ✅ All operations < 500k gas
```

### Security
```bash
# Mythril
myth analyze contracts/crosschain/AxelarBridge.sol
# ✅ No critical vulnerabilities

# External audit
# ✅ Audit report with no unresolved critical/high findings

# Bug bounty
# ✅ Program launched on Immunefi
```

### Testnet Validation
```bash
# End-to-end flow
npm run test:e2e:testnet
# ✅ All flows complete successfully

# Load test
npm run test:load:testnet
# ✅ System handles 100 concurrent tx

# Failure recovery
npm run test:recovery:testnet
# ✅ All failed messages recoverable
```

### Production Readiness
```bash
# Monitoring
curl http://prometheus:9090/metrics
# ✅ All metrics reporting

# Alerting
# ✅ Test alerts received on Telegram/PagerDuty

# Runbooks
# ✅ Team trained on all runbooks

# Multi-sig
# ✅ All admin operations require multi-sig
```

---

## Production Checklist

### Pre-Launch ✅

**Smart Contracts**
- [ ] AxelarBridge deployed and configured
- [ ] AxelarHandler deployed
- [ ] CrossChainEscrow deployed
- [ ] ITSTokenRegistry deployed
- [ ] GasEstimator deployed
- [ ] All satellites deployed (Polygon, Avalanche, Base)
- [ ] All chains registered bidirectionally
- [ ] Hub integrated with AxelarBridge
- [ ] Trade integrated with CrossChainEscrow
- [ ] Offer supports cross-chain tracking

**Token Setup**
- [ ] USDT deployed via ITS on all chains
- [ ] USDC deployed via ITS on all chains
- [ ] KUJI bridge token deployed
- [ ] All tokens registered in ITSTokenRegistry
- [ ] Bridge limits configured
- [ ] Roles granted correctly

**Infrastructure**
- [ ] Prometheus exporter deployed
- [ ] Grafana dashboard configured
- [ ] Alerts configured
- [ ] Telegram/PagerDuty integration working
- [ ] Gas wallets funded (10 days buffer)
- [ ] Auto-refill script deployed

**Security**
- [ ] External audit completed
- [ ] All critical/high findings resolved
- [ ] Re-audit completed
- [ ] Bug bounty launched
- [ ] Multi-sig deployed on all chains
- [ ] Timelock configured (48h minimum)
- [ ] Emergency pause tested

**Testing**
- [ ] Unit tests >95% coverage
- [ ] Integration tests passing
- [ ] End-to-end flows tested on testnet
- [ ] Load testing completed
- [ ] Failure recovery tested
- [ ] Gas costs validated

**Operations**
- [ ] Monitoring dashboard live
- [ ] Alerting tested
- [ ] Runbooks documented
- [ ] Incident response team ready
- [ ] 24/7 on-call rotation established

**Documentation**
- [ ] User guide published
- [ ] Developer docs updated
- [ ] Security docs published
- [ ] API documentation generated
- [ ] Troubleshooting guide created

**Legal & Compliance**
- [ ] Terms of service updated
- [ ] Privacy policy updated
- [ ] Regulatory compliance verified
- [ ] User notifications prepared

### Launch ✅

**Soft Launch**
- [ ] Conservative limits set
- [ ] Beta testers whitelisted
- [ ] 50+ transactions completed
- [ ] No critical issues
- [ ] Callbacks working 100%

**Limited Launch**
- [ ] Limits increased
- [ ] 100 users onboarded
- [ ] 500+ transactions completed
- [ ] <1% failure rate
- [ ] Performance metrics met

**Full Launch**
- [ ] Production limits set
- [ ] Open to all users
- [ ] Launch communications sent
- [ ] Monitoring confirmed stable

### Post-Launch ✅

**Week 1**
- [ ] Daily monitoring reviews
- [ ] User feedback collected
- [ ] Performance metrics tracked
- [ ] Any issues resolved quickly

**Month 1**
- [ ] Post-launch review completed
- [ ] Lessons learned documented
- [ ] Optimizations identified
- [ ] Roadmap updated

**Ongoing**
- [ ] Weekly monitoring reviews
- [ ] Monthly security reviews
- [ ] Quarterly audits
- [ ] Continuous improvement

---

## Risk Assessment & Mitigation

### High Risk Items

#### 1. Smart Contract Bugs in Message Handlers
**Impact**: Loss of funds, stuck transactions
**Probability**: Medium (lots of new code)
**Mitigation**:
- ✅ Comprehensive test coverage (>95%)
- ✅ External security audit
- ✅ Gradual rollout with limits
- ✅ Emergency pause mechanism
- ✅ Failed message recovery system

#### 2. Gas Payment Failures
**Impact**: Stuck messages, poor UX
**Probability**: Medium (complex gas calculation)
**Mitigation**:
- ✅ GasEstimator with dynamic calculation
- ✅ Reserve pools for underpayment
- ✅ Refund mechanism for overpayment
- ✅ Monitoring and alerts on gas wallet balance
- ✅ Auto-refill script

#### 3. Axelar Network Downtime
**Impact**: Cross-chain functionality unavailable
**Probability**: Low (Axelar is battle-tested)
**Mitigation**:
- ✅ Monitor Axelar network status
- ✅ Communication plan for users
- ✅ Fallback to local-only trading
- ✅ Message retry mechanism

#### 4. Token Mapping Errors
**Impact**: Wrong token minted on destination
**Probability**: Low (careful configuration)
**Mitigation**:
- ✅ Careful ITSTokenRegistry configuration
- ✅ Extensive testing on testnet
- ✅ Verification before mainnet
- ✅ Token whitelist enforcement

### Medium Risk Items

#### 5. Frontend Integration Bugs
**Impact**: Poor UX, user errors
**Probability**: Medium (complex UI flows)
**Mitigation**:
- ✅ Comprehensive E2E testing
- ✅ User guides and tooltips
- ✅ Error handling with retry
- ✅ Beta testing period

#### 6. Gas Price Volatility
**Impact**: High costs for users, underpayment
**Probability**: Medium (market dependent)
**Mitigation**:
- ✅ Dynamic gas estimation
- ✅ Gas buffers (10-20%)
- ✅ User warnings for high gas
- ✅ Reserve pool coverage

#### 7. Monitoring Gaps
**Impact**: Undetected issues, slow response
**Probability**: Low (comprehensive monitoring)
**Mitigation**:
- ✅ Grafana dashboard with all metrics
- ✅ Alerts on critical conditions
- ✅ 24/7 on-call rotation
- ✅ Runbooks for all scenarios

### Low Risk Items

#### 8. Documentation Gaps
**Impact**: Developer confusion
**Probability**: Low
**Mitigation**:
- ✅ Comprehensive documentation
- ✅ User guides and tutorials
- ✅ API documentation auto-generated

#### 9. Analytics Missing
**Impact**: Limited insights
**Probability**: Low
**Mitigation**:
- ✅ Basic metrics in Grafana
- ✅ Add more over time

---

## Success Criteria

### Technical Metrics

**Reliability**
- ✅ 100% message delivery rate (no stuck transactions)
- ✅ <5 minute average cross-chain transaction time
- ✅ 99.9% uptime for bridge functionality
- ✅ <1% failed transaction rate
- ✅ Gas estimation accuracy >90%

**Performance**
- ✅ All operations <500k gas
- ✅ Message processing <5 minutes p99
- ✅ Callback delivery <1 minute p99
- ✅ Frontend loads in <2 seconds

**Security**
- ✅ Zero critical vulnerabilities
- ✅ Zero fund losses
- ✅ <24 hour incident response time
- ✅ 100% of contracts audited
- ✅ Multi-sig on all admin functions

### Business Metrics

**Adoption**
- ✅ 1,000+ cross-chain transactions in first month
- ✅ $1M+ cross-chain volume in first quarter
- ✅ 10+ supported chains by end of year
- ✅ 50+ registered tokens for bridging
- ✅ User satisfaction score >4.5/5

**Growth**
- ✅ 20% month-over-month growth in cross-chain volume
- ✅ 50% of trades are cross-chain within 6 months
- ✅ Average trade size increasing

### Operational Metrics

**Efficiency**
- ✅ <1 hour average incident response time
- ✅ <5 minute average issue resolution time (for known issues)
- ✅ 100% of alerts acknowledged within 15 minutes
- ✅ 95% of gas wallets maintained >10% balance

---

## Confidence Score: 8.5/10

### Reasoning

**Why High Confidence (8.5/10)**:
1. ✅ **Solid Foundation**: ~60% already built, tested contracts exist
2. ✅ **Clear Implementation Path**: All steps documented with examples
3. ✅ **Proven Patterns**: Using Axelar (battle-tested), OpenZeppelin, UUPS
4. ✅ **Comprehensive Testing**: Test suite exists, patterns established
5. ✅ **Reference Implementation**: Axelar examples, similar projects
6. ✅ **Existing Deployments**: Hub already on BSC, know deployment works
7. ✅ **Detailed PRPs**: Individual PRPs (01-05) provide granular guidance
8. ✅ **Clear Validation**: Executable validation gates at each phase

**Risk Factors (-1.5 points)**:
1. ⚠️ **Integration Complexity**: Coordinating Hub/Trade/Offer/Bridge (-0.5)
2. ⚠️ **Message Handler Complexity**: 12 handlers with proper error handling (-0.5)
3. ⚠️ **External Dependencies**: Axelar network, ITS, oracles (-0.3)
4. ⚠️ **Frontend Complexity**: Multi-chain UI with transaction tracking (-0.2)

**Mitigation**:
- Gradual rollout catches issues early
- Comprehensive testing at each phase
- External audit before production
- Existing PRPs address specific risks
- Runbooks for all failure scenarios

---

## Notes for AI Agent

### Self-Validation Checklist

**After Each Phase**:
1. ✅ All files compile without errors
2. ✅ All unit tests pass
3. ✅ All integration tests pass
4. ✅ Gas costs within budget
5. ✅ No security warnings from tools
6. ✅ Documentation updated
7. ✅ Validation gates passed
8. ✅ Changes committed to git

**Before Moving to Next Phase**:
1. ✅ All tasks in phase completed
2. ✅ All deliverables produced
3. ✅ All tests passing
4. ✅ Code reviewed
5. ✅ Deployed to testnet (if applicable)
6. ✅ Performance validated

### Debugging Tips

**Contract Compilation Issues**:
```bash
# Clear cache and rebuild
npx hardhat clean
npx hardhat compile --force

# Check specific contract
npx hardhat compile --contracts contracts/crosschain/AxelarBridge.sol
```

**Test Failures**:
```bash
# Run single test file
npx hardhat test test/crosschain/AxelarBridge.test.js

# Run specific test
npx hardhat test --grep "should send message"

# Enable console.log in tests
npx hardhat test --logs
```

**Cross-Chain Message Tracking**:
```bash
# Check on Axelarscan
open https://testnet.axelarscan.io/gmp/<tx_hash>

# Check bridge events
npx hardhat run scripts/diagnostics/checkBridgeEvents.js --tx-hash <hash>

# Check satellite events
npx hardhat run scripts/diagnostics/checkSatelliteEvents.js --chain polygon --tx-hash <hash>
```

**Gas Issues**:
```bash
# Test gas estimation
npx hardhat run scripts/test/testGasEstimation.js

# Compare estimated vs actual
npx hardhat run scripts/diagnostics/compareGasCosts.js --tx-hash <hash>
```

### Expected Improvements

**Type Safety**: Compile-time checking via interfaces
**Error Messages**: Clear, actionable error messages
**Debugging**: Stack traces with function names
**Gas Efficiency**: No overhead from low-level calls
**Maintainability**: Easy refactoring, safe changes
**User Experience**: Satellites show real-time status
**Reliability**: No stuck transactions
**Performance**: <5 minute cross-chain operations
**Security**: Multi-layer security, audited

---

## Appendix: Key Resources

### Axelar Documentation
- **GMP Overview**: https://docs.axelar.dev/dev/general-message-passing/overview/
- **EVM GMP Messages**: https://docs.axelar.dev/dev/general-message-passing/gmp-messages/
- **ITS Introduction**: https://docs.axelar.dev/dev/send-tokens/interchain-tokens/intro/
- **Gas Service**: https://docs.axelar.dev/dev/gas-service/intro
- **Axelar Examples**: https://github.com/axelarnetwork/axelar-examples
- **Axelarscan API**: https://docs.axelarscan.io/

### Solidity Best Practices
- **Security**: https://docs.soliditylang.org/en/latest/security-considerations.html
- **Interfaces**: https://docs.soliditylang.org/en/latest/contracts.html#interfaces
- **Error Handling**: https://docs.soliditylang.org/en/latest/control-structures.html#error-handling
- **Upgrades**: https://docs.openzeppelin.com/contracts/5.x/upgradeable

### LocalMoney Codebase
- **Hub Contract**: `contracts/evm/contracts/Hub.sol`
- **AxelarBridge**: `contracts/evm/contracts/crosschain/AxelarBridge.sol`
- **Satellite**: `contracts/evm/contracts/satellites/LocalMoneySatellite.sol`
- **Test Patterns**: `contracts/evm/test/crosschain/`
- **Existing PRPs**: `PRPs/01-*.md` through `PRPs/05-*.md`

### Tools
- **Hardhat**: https://hardhat.org/docs
- **Slither**: https://github.com/crytic/slither
- **Mythril**: https://github.com/ConsenSys/mythril
- **Grafana**: https://grafana.com/docs/
- **Prometheus**: https://prometheus.io/docs/

---

**Document Version**: 1.0
**Created**: October 2, 2025
**Last Updated**: October 2, 2025
**Status**: Ready for Implementation
**Next Review**: After Phase 0 completion
