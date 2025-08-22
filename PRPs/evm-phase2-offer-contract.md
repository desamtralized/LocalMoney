name: "EVM Translation Phase 2: Offer Contract Implementation"
description: |

## Purpose
Implement the Offer contract for the LocalMoney EVM protocol, enabling users to create, manage, and query buy/sell offers for P2P trading. This contract integrates with the Hub and Profile contracts from Phase 1 and sets the foundation for the Trade contract in Phase 3.

## Core Principles
1. **State Management**: Efficient offer storage and retrieval
2. **User Limits**: Enforce max active offers per user from Hub config
3. **Profile Integration**: Update user statistics in Profile contract
4. **Gas Optimization**: Minimize storage operations
5. **Query Efficiency**: Implement paginated queries for offer listings

---

## Goal
Create a fully functional Offer contract that allows users to create and manage trading offers, with proper integration to Hub configuration and Profile statistics, matching the CosmWasm offer contract functionality.

## Why
- **Trading Foundation**: Offers are the basis for all trades
- **User Experience**: Need efficient offer discovery and management
- **Market Liquidity**: More offers mean better trading opportunities
- **Profile Building**: Track user activity and reputation

## What
Complete implementation including:
- **Offer Contract**: Full CRUD operations for offers
- **State Management**: Efficient storage of offer data
- **Query System**: Paginated queries by type, currency, token
- **Hub Integration**: Respect configuration limits
- **Profile Updates**: Track active offer counts
- **Events**: Comprehensive event emission
- **Testing**: Full test coverage

### Success Criteria
- [ ] Users can create offers with validation
- [ ] Offer queries support pagination
- [ ] Integration with Hub config works
- [ ] Profile statistics update correctly
- [ ] Gas costs optimized (< 150k for create)
- [ ] Test coverage > 90%
- [ ] All edge cases handled

## All Needed Context

### Critical Documentation Sources
```yaml
# SOLIDITY PATTERNS
enumerable_set: https://docs.openzeppelin.com/contracts/5.x/api/utils#EnumerableSet
pagination: https://github.com/OpenZeppelin/openzeppelin-contracts/issues/1235

# GAS OPTIMIZATION
storage_patterns: https://docs.soliditylang.org/en/v0.8.24/internals/layout_in_storage.html
memory_vs_storage: https://docs.soliditylang.org/en/v0.8.24/types.html#data-location
```

### Reference Files to Analyze
```yaml
# COSMWASM IMPLEMENTATION
offer_contract: contracts/cosmwasm/contracts/offer/src/contract.rs
offer_state: contracts/cosmwasm/contracts/offer/src/state.rs
offer_lib: contracts/cosmwasm/contracts/offer/src/lib.rs

# PHASE 1 CONTRACTS (Prerequisites)
hub_interface: contracts/evm/contracts/interfaces/IHub.sol
profile_interface: contracts/evm/contracts/interfaces/IProfile.sol

# TRANSLATION GUIDE
guide: COSMWASM_TO_EVM_TRANSLATION_GUIDE.md (lines 162-242)
```

### Implementation Blueprint

#### 1. Offer Contract Structure
```solidity
// Based on COSMWASM_TO_EVM_TRANSLATION_GUIDE.md lines 164-194
contract Offer is Initializable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    enum OfferType { Buy, Sell }
    enum OfferState { Active, Paused, Archived }
    
    struct OfferData {
        uint256 id;
        address owner;
        OfferType offerType;
        OfferState state;
        string fiatCurrency;      // e.g., "USD", "EUR"
        address tokenAddress;      // 0x0 for native token
        uint256 minAmount;        // In token decimals
        uint256 maxAmount;        
        uint256 rate;            // Price per token in fiat cents
        string description;       // Max 280 chars
        uint256 createdAt;
        uint256 updatedAt;
    }
    
    // State variables
    uint256 public nextOfferId;
    mapping(uint256 => OfferData) public offers;
    mapping(address => uint256[]) public userOffers;
    
    // Indexes for queries
    mapping(bytes32 => uint256[]) private offersByType; // hash(type, fiat, token) => ids
    EnumerableSet.UintSet private activeOfferIds;
    
    IHub public hub;
}
```

#### 2. Core Functions
```solidity
function createOffer(
    OfferType _type,
    string memory _fiatCurrency,
    address _token,
    uint256 _minAmount,
    uint256 _maxAmount,
    uint256 _rate,
    string memory _description
) external nonReentrant returns (uint256);

function updateOffer(
    uint256 _offerId,
    OfferState _newState,
    uint256 _newRate,
    uint256 _newMin,
    uint256 _newMax
) external;

function pauseOffer(uint256 _offerId) external;
function activateOffer(uint256 _offerId) external;
function archiveOffer(uint256 _offerId) external;
```

#### 3. Query Functions
```solidity
// Get offers by criteria with pagination
function getOffersByType(
    OfferType _type,
    string memory _fiatCurrency,
    address _token,
    uint256 _offset,
    uint256 _limit
) external view returns (OfferData[] memory, uint256 total);

// Get user's offers
function getUserOffers(
    address _user,
    uint256 _offset,
    uint256 _limit
) external view returns (OfferData[] memory, uint256 total);

// Get single offer
function getOffer(uint256 _offerId) external view returns (OfferData memory);

// Count active offers for user
function getUserActiveOfferCount(address _user) external view returns (uint256);
```

## Tasks Implementation Order

1. **Contract Setup** (30 mins)
   - Create Offer.sol with imports
   - Define enums and structs
   - Setup storage variables
   - Add upgrade functionality

2. **Create Offer Function** (1 hour)
   - Input validation (min <= max, description length)
   - Check user limits from Hub
   - Generate sequential offer ID
   - Store offer data
   - Update indexes for queries
   - Update Profile contract
   - Emit events

3. **Update Functions** (45 mins)
   - UpdateOffer with validation
   - Pause/Activate/Archive functions
   - Owner authorization checks
   - Update Profile statistics
   - Emit state change events

4. **Query Implementation** (1.5 hours)
   - Implement getOffersByType with pagination
   - Implement getUserOffers
   - Add sorting options (by rate, created date)
   - Optimize gas for large result sets
   - Handle edge cases (empty results)

5. **Integration Points** (45 mins)
   - Hub configuration checks
   - Profile contract updates
   - Access control setup
   - Event definitions

6. **Testing Suite** (2 hours)
   - Unit tests for all functions
   - Integration tests with Hub/Profile
   - Pagination edge cases
   - Gas optimization tests
   - Stress tests with many offers

## Complex Implementation Details

### Pagination Strategy
```solidity
function getOffersByType(
    OfferType _type,
    string memory _fiatCurrency,
    address _token,
    uint256 _offset,
    uint256 _limit
) external view returns (OfferData[] memory results, uint256 total) {
    bytes32 key = keccak256(abi.encodePacked(_type, _fiatCurrency, _token));
    uint256[] storage offerIds = offersByType[key];
    total = offerIds.length;
    
    if (_offset >= total) {
        return (new OfferData[](0), total);
    }
    
    uint256 end = _offset + _limit;
    if (end > total) {
        end = total;
    }
    
    results = new OfferData[](end - _offset);
    for (uint256 i = _offset; i < end; i++) {
        results[i - _offset] = offers[offerIds[i]];
    }
}
```

### Profile Integration
```solidity
function _updateProfileOfferCount(address _user, bool _increment) private {
    IProfile profile = IProfile(hub.profileContract());
    if (_increment) {
        profile.incrementActiveOffers(_user);
    } else {
        profile.decrementActiveOffers(_user);
    }
}
```

## Validation Gates

```bash
# Compile with Phase 1 contracts
npx hardhat compile

# Run comprehensive tests
npx hardhat test test/Offer.test.js

# Test pagination with large datasets
npx hardhat test test/OfferPagination.test.js --grep "pagination"

# Gas profiling
REPORT_GAS=true npx hardhat test test/Offer.test.js

# Verify gas costs
# - createOffer < 150,000 gas
# - updateOffer < 50,000 gas
# - queries < 30,000 gas per page

# Integration tests
npx hardhat test test/integration/OfferIntegration.test.js

# Coverage report
npx hardhat coverage --testfiles "test/Offer*.js"

# Size verification
npx hardhat size-contracts | grep Offer
```

## Test Scenarios

1. **Create Offer Tests**
   - Valid offer creation
   - Invalid amount ranges
   - Description length limits
   - Max active offers enforcement
   - Different token addresses

2. **Update Tests**
   - State transitions (Active -> Paused -> Active)
   - Archive prevents further updates
   - Only owner can update
   - Rate and amount updates

3. **Query Tests**
   - Pagination with 0, 1, many offers
   - Filter by type, currency, token
   - User-specific queries
   - Edge cases (offset > total)

4. **Integration Tests**
   - Hub config limits respected
   - Profile counts update correctly
   - Events emitted properly

## Common Pitfalls to Avoid

1. **Storage Optimization**: Pack struct fields efficiently
2. **Array Limits**: Don't return unbounded arrays
3. **String Comparison**: Use bytes32 for fiat currency internally
4. **Reentrancy**: Protect state-changing functions
5. **Integer Overflow**: Validate arithmetic operations

## Migration Notes from CosmWasm

Key differences:
- Replace `OffersCount` with `nextOfferId` counter
- Convert query pagination from `last` to `offset/limit`
- Replace `Addr` type with `address`
- Convert `Uint128` amounts to `uint256`
- Use events instead of attributes

## Dependencies

```json
{
  "additional_dependencies": {
    "@openzeppelin/contracts-upgradeable": "^5.0.0"
  }
}
```

## Confidence Score: 9/10

This PRP provides detailed implementation guidance with clear integration points to Phase 1 contracts. The pagination strategy and query optimization ensure scalability, while comprehensive testing validates functionality.