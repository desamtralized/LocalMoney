# PR Comments Task List

## Trade Program Issues to Fix

### Task 1: Fix hardcoded values in create_trade function
**Location**: `contracts/solana/localmoney-protocol/programs/trade/src/lib.rs` lines 58-69
**Issue**: Fields seller, arbitrator, and fiat_currency are set to default or hardcoded values without validation
**Solution**: 
- [ ] Modify instruction to accept offer account as parameter
- [ ] Read and assign seller, arbitrator, and fiat_currency from offer data
- [ ] Add validation checks to ensure fields are properly set
- [ ] Add proper state transition validation

### Task 2: Add access control to initialize_counter function
**Location**: `contracts/solana/localmoney-protocol/programs/trade/src/lib.rs` lines 14-19
**Issue**: Function lacks access control, allowing anyone to initialize the counter
**Solution**:
- [ ] Add check to verify signer is authorized user (program admin)
- [ ] Add constraint in Context or explicit signer verification
- [ ] Check signer's public key against stored admin key or multisig authority

### Task 3: Implement trade state transition validation
**Location**: `contracts/solana/localmoney-protocol/programs/trade/src/lib.rs` lines 350-384
**Issue**: validate_trade_state_transition function exists but is not used in trade instructions
**Solution**:
- [ ] Insert calls to validate_trade_state_transition before state updates in accept_trade
- [ ] Add validation calls to all functions where trade state changes
- [ ] Ensure only valid transitions occur and prevent invalid state updates

### Task 4: Add maker authorization check in accept_trade
**Location**: `contracts/solana/localmoney-protocol/programs/trade/src/lib.rs` lines 121-123
**Issue**: No validation that only the maker (offer owner) can accept the trade
**Solution**:
- [ ] Add check to verify signer matches offer owner
- [ ] Enforce proper authorization before proceeding with trade acceptance

### Task 5: Optimize add_state_history method
**Location**: `contracts/solana/localmoney-protocol/programs/trade/src/lib.rs` lines 253-256
**Issue**: Inefficient clone() call and no limit on state_history entries
**Solution**:
- [ ] Remove clone() call if TradeState implements Copy
- [ ] Add check to ensure state_history doesn't exceed 20 entries
- [ ] Handle case when limit is reached (error or remove oldest entry)

### Task 6: Fix seller validation in cancel_trade
**Location**: `contracts/solana/localmoney-protocol/programs/trade/src/lib.rs` lines 161-166
**Issue**: Validates signer against seller without checking if seller is properly initialized
**Solution**:
- [ ] Check that seller is not equal to Pubkey::default() before validation
- [ ] Ensure seller is properly set before authorization checks
- [ ] Prevent unauthorized cancellations or rejections

### Task 7: Refactor validation in create_trade
**Location**: `contracts/solana/localmoney-protocol/programs/trade/src/lib.rs` lines 38-47
**Issue**: Explicit length checks instead of using existing helper function
**Solution**:
- [ ] Replace explicit length checks with validate_trade_creation helper function
- [ ] Remove redundant amount validation at line 49
- [ ] Ensure consistent validation across the codebase

## Implementation Priority
1. Task 2 (Access control) - Security critical
2. Task 1 (Hardcoded values) - Data integrity critical  
3. Task 3 (State validation) - Business logic critical
4. Task 4 (Maker authorization) - Security important
5. Task 6 (Seller validation) - Security important
6. Task 7 (Validation refactoring) - Code quality
7. Task 5 (Optimization) - Performance improvement