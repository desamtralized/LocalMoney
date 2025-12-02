# PRP: Fix Stack Overflow in Trade Program's release_escrow Instruction

## Executive Summary

The `release_escrow` instruction in the trade program exceeds Solana's 4096-byte stack limit by 392 bytes (total: 4608 bytes), causing build failures. This PRP outlines the approach to optimize stack usage while maintaining functionality and security.

## Problem Statement

### Current Error
```
Error: Function _ZN5trade9__private8__global14release_escrow17hd64d03b54f5b92ffE
Stack offset of 4488 exceeded max offset of 4096 by 392 bytes,
please minimize large stack variables.
Estimated function frame size: 4608 bytes.
```

### Why This Matters
- **Build Blocker**: The program won't compile to .so files, blocking deployment
- **Runtime Risk**: Even if it compiled, stack overflows can cause undefined behavior during execution
- **Critical Path**: This is the final step in a successful trade, handling escrow release and fee distribution

## Context & Background

### Solana's Stack Constraints
- **Hard Limit**: 4096 bytes per stack frame
- **No Runtime Heap Allocation**: Solana programs can't allocate heap memory at runtime for security reasons
- **Compile-Time Detection**: The Solana toolchain detects stack overflows during build

### Root Causes in release_escrow

1. **16 Accounts in Context Struct** (`programs/trade/src/instructions/release_escrow.rs:20-107`)
   - Each Account<'info, T> allocates stack space for the account data
   - Anchor deserializes account data into stack-allocated structs
   - Large structs (HubConfig, UserProfile, Trade, EscrowVault, Offer) compound the issue

2. **Multiple CPI Calls** (`release_escrow.rs:156-217`)
   - Escrow release CPI (lines 156-177)
   - Buyer profile stats update CPI (lines 183-199)
   - Seller profile stats update CPI (lines 202-217)
   - Each CPI creates temporary account structures on the stack

3. **Large Account Types**
   - `Trade`: Contains state machine, contact strings, amounts, timestamps
   - `UserProfile`: Trading statistics, contact info, reputation data
   - `HubConfig`: Global configuration with fee rates, circuit breakers
   - `EscrowVault`: Token custody state
   - `Offer`: Marketplace listing with payment methods, ranges

## Research & Solutions

### Documentation References

**Primary Resource - Stack Overflow Solutions**:
https://solana.stackexchange.com/questions/11706/stack-offset-of-4376-exceeded-max-offset-of-4096-by-280-bytes-please-minimize-l

**Key Techniques Identified**:
1. **Boxing Accounts**: Moves Account<'info, T> from stack to heap
2. **Zero-Copy**: For large data structures
3. **remaining_accounts**: For optional/conditional accounts
4. **Function Decomposition**: Split handler into smaller stack frames

**Additional References**:
- https://solana.stackexchange.com/questions/8766/how-to-reduce-stack-space-usage-for-anchor-programs
- https://solana.stackexchange.com/questions/21047/build-err-stack-offset-of-xxx-exceeded-max-offset-of-4096-by-xxx-bytes-please
- https://github.com/solana-foundation/anchor/issues/2476

### Anchor 0.31.0 Improvements
We're already using Anchor 0.31.0, which includes stack optimizations. However, the issue persists due to the complexity of release_escrow.

### Best Practice Pattern from Codebase

Reference `programs/trade/src/instructions/create_trade.rs:12-64` for a simpler instruction pattern:
- 10 accounts (vs 16 in release_escrow)
- Single CPI call
- Compiles successfully

## Architectural Approach

### Strategy: Incremental Boxing

We'll apply boxing to the largest accounts first, measuring impact iteratively:

1. **Phase 1**: Box the 5 largest account types
2. **Phase 2**: If still exceeding, box additional accounts or use remaining_accounts
3. **Phase 3**: Refactor handler function to use references

### Why Boxing Works

**Stack Allocation (Before)**:
```rust
pub buyer_profile: Account<'info, UserProfile>  // ~200+ bytes on stack
```

**Heap Allocation (After)**:
```rust
pub buyer_profile: Box<Account<'info, UserProfile>>  // 8 bytes pointer on stack
```

Savings: ~190+ bytes per large account

### Risk Mitigation

- **No Functional Changes**: Boxing doesn't alter program logic or security
- **Anchor Support**: Box<Account<'info, T>> is fully supported in Anchor
- **Existing Tests**: Integration tests validate behavior remains unchanged
- **Incremental Approach**: Apply boxing gradually to minimize risk

## Task Breakdown

---

### Task 1: Box Large Account Types in ReleaseEscrow Context

**Background & Reasoning**:
The ReleaseEscrow context struct contains 16 accounts, with several large account types consuming significant stack space. By boxing the 5 largest accounts (buyer_profile, seller_profile, hub_config, trade, offer), we move their data from the stack to the heap, reducing stack usage by an estimated 800-1000 bytes.

**Scope**:
- **File**: `programs/trade/src/instructions/release_escrow.rs`
- **Lines**: 20-107 (ReleaseEscrow struct definition)
- **Accounts to Box**:
  1. `buyer_profile: Account<'info, UserProfile>` → `buyer_profile: Box<Account<'info, UserProfile>>`
  2. `seller_profile: Account<'info, UserProfile>` → `seller_profile: Box<Account<'info, UserProfile>>`
  3. `hub_config: Account<'info, HubConfig>` → `hub_config: Box<Account<'info, HubConfig>>`
  4. `trade: Account<'info, Trade>` → `trade: Box<Account<'info, Trade>>`
  5. `offer: Account<'info, Offer>` → `offer: Box<Account<'info, Offer>>`

**NOT in Scope**:
- Changing handler function logic
- Modifying CPI call structures
- Altering test files
- Boxing token accounts (they're small)
- Boxing program accounts (can't be boxed)

**Technical Considerations**:
- **No Logic Changes**: Boxing changes memory location, not behavior
- **Deref Transparency**: Rust's `Deref` trait makes boxed accounts behave identically to unboxed ones in the handler
- **Anchor Compatibility**: `Box<Account<'info, T>>` is fully supported since Anchor 0.24.0
- **Performance**: Minimal impact; heap allocation happens once during deserialization
- **Stack Savings**: Each boxed account saves ~150-250 bytes of stack space

**Acceptance Criteria**:
- [ ] All 5 specified accounts wrapped in `Box<...>`
- [ ] No syntax errors in the modified file
- [ ] Anchor attribute macros (#[account(...)] constraints) remain unchanged
- [ ] Account field names remain unchanged (no breaking changes to client code)
- [ ] Code compiles with `cargo check --package trade`

**Definition of Done**:
- Code changes complete in `release_escrow.rs`
- File compiles without errors
- No modifications to handler function required yet (Deref handles access)
- Ready for build verification in Task 3

---

### Task 2: Optimize Handler Function Stack Usage

**Background & Reasoning**:
Even after boxing accounts, the handler function itself may create large temporary structures on the stack during CPI calls. By refactoring to use references more aggressively and avoiding unnecessary clones or copies, we can reduce the handler's stack frame size.

**Scope**:
- **File**: `programs/trade/src/instructions/release_escrow.rs`
- **Lines**: 109-235 (handler function)
- **Optimizations**:
  1. Ensure all account accesses use references (e.g., `&ctx.accounts.trade` not copies)
  2. Reuse `AccountInfo` references instead of calling `.to_account_info()` multiple times
  3. Avoid intermediate variable assignments where possible
  4. Extract the buyer CPI program clone to a single variable reused for both CPIs

**NOT in Scope**:
- Changing CPI call parameters or logic
- Modifying state transitions or validations
- Altering fee calculation logic
- Removing any functional requirements

**Technical Considerations**:
- **Reference Reuse**: CPI calls accept `&AccountInfo`, so multiple calls can share references
- **Clone Minimization**: `to_account_info()` creates a new AccountInfo; reuse when possible
- **Compiler Optimizations**: Release builds already optimize, but explicit reference usage helps stack analysis
- **Borrow Checker**: Ensure all reference lifetimes are valid

**Acceptance Criteria**:
- [ ] All account accesses in handler use references (`&ctx.accounts.X`)
- [ ] `buyer_cpi_program` variable reused for both buyer and seller CPI calls
- [ ] No unnecessary `.clone()` or `.to_account_info()` calls
- [ ] Handler function logic remains functionally identical
- [ ] Code compiles with `cargo check --package trade`

**Definition of Done**:
- Handler function refactored for minimal stack usage
- All existing validations and state transitions preserved
- Code compiles without errors
- Ready for build verification in Task 3

---

### Task 3: Build Verification and Stack Measurement

**Background & Reasoning**:
After applying optimizations, we must verify that the build succeeds and measure the actual stack usage to confirm we're under the 4096-byte limit. This task validates that our changes resolved the stack overflow issue.

**Scope**:
- **Action**: Run `anchor build` with the full Solana toolchain
- **Measurement**: Check build output for stack offset warnings/errors
- **Verification**: Confirm trade program compiles to .so file
- **Location**: Root of `/Volumes/Pylon/workspace/localmoney/contracts/solana/`

**NOT in Scope**:
- Running integration tests (that's Task 4)
- Deploying to testnet
- Modifying other programs
- Performance benchmarking

**Technical Considerations**:
- **Build Environment**: Must use Agave v3.1.1 with Rust 1.89.0 (already installed)
- **Anchor Version**: Using 0.31.0 (already configured)
- **Error Detection**: Solana's cargo-build-sbf performs static stack analysis
- **Success Criteria**: No stack offset errors for release_escrow or try_accounts

**Acceptance Criteria**:
- [ ] `anchor build` completes without stack overflow errors
- [ ] `target/deploy/trade.so` file is generated
- [ ] Build output shows no errors for `release_escrow` function
- [ ] Build output shows no errors for `ReleaseEscrow::try_accounts` method
- [ ] Stack usage for release_escrow is < 4096 bytes (check build output)

**Definition of Done**:
- Successful build with no stack-related errors
- Trade program .so file exists and is valid
- Stack offset measurements documented (if shown in build output)
- Ready to proceed to integration testing

---

### Task 4: Run Integration Tests for release_escrow

**Background & Reasoning**:
After confirming the build succeeds, we must validate that the functional behavior of release_escrow remains unchanged. Integration tests ensure that boxing and refactoring didn't introduce bugs or alter the program's business logic.

**Scope**:
- **Test File**: `tests/trade_integration_tests.ts`
- **Test Suite**: All tests that invoke `release_escrow` instruction
- **Focus Areas**:
  - Normal escrow release (seller releases to buyer)
  - Disputed escrow release (arbitrator releases)
  - Fee distribution (chain, warchest, arbitrator)
  - Profile statistics updates (buyer and seller)
  - Circuit breaker checks

**NOT in Scope**:
- Writing new tests
- Testing other instructions
- Performance testing
- Compute unit measurement (that's Task 5)

**Technical Considerations**:
- **Test Environment**: Requires local validator running
- **Dependencies**: Anchor test framework, TypeScript SDK
- **Test Data**: Tests use predefined accounts and scenarios
- **Assertions**: Verify account states, balances, and events match expected values

**Acceptance Criteria**:
- [ ] All existing `release_escrow` tests pass without modifications
- [ ] No new test failures introduced
- [ ] Escrow token transfers occur correctly
- [ ] Fee distributions to treasury, warchest, and arbitrator are accurate
- [ ] Buyer and seller profile statistics update correctly
- [ ] Trade state transitions to `EscrowReleased`
- [ ] `EscrowReleased` event is emitted with correct data

**Definition of Done**:
- All integration tests pass
- No regressions detected
- Test output logs reviewed and validated
- Ready for compute unit measurement

---

### Task 5: Measure and Document Compute Units

**Background & Reasoning**:
Solana charges fees based on compute units (CUs) consumed by transactions. After stack optimizations, we should measure the CU usage of `release_escrow` to ensure we haven't inadvertently increased computational cost and that we're within Solana's 200K CU per-instruction limit.

**Scope**:
- **Action**: Run integration tests with compute unit logging enabled
- **Measurement**: Record CU usage for release_escrow in different scenarios:
  - Normal flow (no dispute)
  - Disputed flow (arbitrator release)
- **Documentation**: Update TODAYS_PROGRESS or create a metrics file
- **Baseline**: Compare against expected range for similar instructions

**NOT in Scope**:
- Optimizing compute units (only measuring)
- Comparing all instructions
- Deployment cost estimation

**Technical Considerations**:
- **CU Logging**: Enable with `anchor test --skip-build -- --nocapture`
- **Solana Limits**: Max 200K CU per instruction, ~400K per transaction
- **Typical Range**: Similar complex instructions use 50K-100K CUs
- **Factors**: Account count, CPI calls, validation logic all affect CUs

**Acceptance Criteria**:
- [ ] CU usage measured for normal escrow release scenario
- [ ] CU usage measured for disputed escrow release scenario
- [ ] Both scenarios are < 200,000 CUs
- [ ] CU measurements documented in validation report
- [ ] Any anomalies or unexpected CU spikes are noted

**Definition of Done**:
- Compute unit measurements recorded
- Results compared against reasonable baselines
- Documentation updated with findings
- No blocking CU issues identified

---

### Task 6: Update Documentation and Validation Report

**Background & Reasoning**:
As the final step, we must document the stack overflow fix, the approach taken, and the validation results. This provides a clear record for future development, audits, and knowledge transfer.

**Scope**:
- **File**: Create or update `STACK_OPTIMIZATION_REPORT.md` in `/contracts/solana/`
- **Content**:
  - Problem description (stack overflow error)
  - Solution approach (boxing, refactoring)
  - Files modified and changes made
  - Build verification results
  - Integration test results
  - Compute unit measurements
  - Lessons learned and best practices for future instructions

**NOT in Scope**:
- Updating user-facing documentation
- Modifying inline code comments (beyond minimal clarity)
- Creating architectural documentation

**Technical Considerations**:
- **Audience**: Future developers, auditors, and maintainers
- **Clarity**: Use clear language, avoid jargon where possible
- **Evidence**: Include build output snippets, test results, CU measurements
- **Reproducibility**: Document steps to verify the fix

**Acceptance Criteria**:
- [ ] Documentation file created or updated
- [ ] Problem statement clearly described
- [ ] Solution approach explained with rationale
- [ ] All modified files listed with descriptions
- [ ] Build verification results included (stack usage, success confirmation)
- [ ] Integration test results summarized (pass/fail, any issues)
- [ ] Compute unit measurements documented
- [ ] Best practices section for future stack optimization

**Definition of Done**:
- Comprehensive documentation complete
- All validation results recorded
- File committed to repository
- Stack overflow fix fully validated and documented

---

## Validation Gates

### Build Validation
```bash
# Clean build to ensure no stale artifacts
anchor clean

# Build with full Solana toolchain (Agave v3.1.1)
export PATH="/Users/samb/.local/share/solana/install/active_release/bin:/Users/samb/.cargo/bin:$PATH"
anchor build

# Verify no stack overflow errors in output
# Expected: "Finished `release` profile [optimized] target(s) in X.XXs"
# Expected: No "Stack offset of XXX exceeded max offset of 4096" errors
```

### Test Validation
```bash
# Start local validator (in separate terminal)
solana-test-validator

# Run integration tests
anchor test --skip-deploy

# Expected: All release_escrow tests pass
# Expected: No new test failures
```

### Compute Unit Measurement
```bash
# Run tests with detailed logging
anchor test --skip-build -- --nocapture | grep -i "compute\|units"

# Review output for CU measurements
# Expected: release_escrow CU usage < 200,000
```

### Code Quality
```bash
# Check for syntax errors and warnings
cargo check --package trade

# Run Rust formatter (optional but recommended)
cargo fmt --package trade

# Run Clippy for best practices (optional)
cargo clippy --package trade -- -D warnings
```

## Success Metrics

### Primary Metrics
- **Stack Usage**: < 4096 bytes for `release_escrow` function (validated by build success)
- **Build Success**: `anchor build` completes without stack overflow errors
- **Functional Correctness**: All integration tests pass

### Secondary Metrics
- **Compute Units**: release_escrow uses reasonable CUs (< 100K for normal flow)
- **Code Clarity**: Modifications maintain or improve code readability
- **Test Coverage**: No reduction in test coverage

## Task Dependencies

```
Task 1 (Box Accounts)
    ↓
Task 2 (Optimize Handler)
    ↓
Task 3 (Build Verification) ← Blocks all subsequent tasks
    ↓
Task 4 (Integration Tests)
    ↓
Task 5 (CU Measurement)
    ↓
Task 6 (Documentation)
```

**Critical Path**: Task 3 must succeed before proceeding to testing and measurement.

## Gotchas and Considerations

### Anchor Boxing Gotchas
- **Can't Box Programs**: `Program<'info, T>` types cannot be boxed
- **Can't Box AccountInfo**: Raw `AccountInfo<'info>` cannot be boxed
- **Can Box Accounts**: Only `Account<'info, T>` and `AccountLoader<'info, T>` can be boxed

### Deref Behavior
- **Transparent Access**: Boxed accounts auto-deref, so `ctx.accounts.trade.id` works the same as before
- **No Client Changes**: Client code using the instruction doesn't need updates

### CPI Considerations
- **AccountInfo Cloning**: CPI calls still create temporary `AccountInfo` structures
- **Reference Reuse**: Reuse `.to_account_info()` results when calling multiple CPIs

### Alternative Approaches (If Boxing Insufficient)

If boxing all large accounts still doesn't reduce stack below 4096 bytes:

1. **Use remaining_accounts**: Move optional accounts (like `arbitrator_token_account`) out of the struct
2. **Split Instruction**: Break into two instructions (release + stats update)
3. **Zero-Copy**: Use `#[account(zero_copy)]` for extremely large structs

## References

### Documentation
- **Solana Stack Overflow Solutions**: https://solana.stackexchange.com/questions/11706
- **Anchor Account Boxing**: https://solana.stackexchange.com/questions/8766
- **Stack Optimization Guide**: https://solana.stackexchange.com/questions/21047
- **GitHub Issue Discussion**: https://github.com/solana-foundation/anchor/issues/2476

### Codebase References
- **File to Fix**: `programs/trade/src/instructions/release_escrow.rs`
- **Reference Pattern**: `programs/trade/src/instructions/create_trade.rs` (simpler instruction, builds successfully)
- **Account Types**:
  - `programs/trade/src/state/trade.rs` (Trade struct)
  - `programs/profile/src/state.rs` (UserProfile struct)
  - `programs/hub/src/state.rs` (HubConfig struct)
  - `programs/offer/src/state/offer.rs` (Offer struct)
  - `programs/escrow/src/state.rs` (EscrowVault struct)

### Build Environment
- **Solana Version**: Agave v3.1.1 (installed at `/Users/samb/.local/share/solana/install/active_release/bin`)
- **Rust Version**: 1.89.0 (bundled with Agave)
- **Anchor Version**: 0.31.0
- **Platform Tools**: v1.52 (Solana's cargo-build-sbf)

## Confidence Score: 9/10

### Why 9/10:

**Strengths (+)**:
- **Clear Problem**: Stack overflow is well-defined with exact byte count
- **Proven Solution**: Boxing is a standard, well-documented approach for this issue
- **Anchor Support**: Box<Account<'info, T>> is fully supported in Anchor 0.31.0
- **No Logic Changes**: Boxing doesn't alter program behavior, only memory location
- **Existing Tests**: Comprehensive integration tests will validate correctness
- **Incremental Approach**: Task breakdown allows for verification at each step

**Minor Risks (-)**:
- **Estimate Accuracy**: We estimate boxing 5 accounts saves 800-1000 bytes; if actual savings are lower, we may need Phase 2 (boxing more accounts or using remaining_accounts)
- **Build Environment**: Dependency on Agave v3.1.1 and specific toolchain setup, though this is already validated

### Why Not 10/10:
- We haven't empirically measured the exact stack savings per boxed account (though we have strong estimates based on struct sizes)
- There's a small chance boxing the 5 largest accounts isn't sufficient, requiring additional optimization (hence the phased approach)

### Mitigation:
- **Phased Tasks**: If Task 3 (build verification) still shows stack issues after Task 1+2, we have clear fallback options (Task 2 details, remaining_accounts, or instruction splitting)
- **Well-Documented Fallbacks**: The "Alternative Approaches" section provides clear next steps if primary approach is insufficient

### One-Pass Viability:
**High** - The PRP provides sufficient context, clear tasks, measurable acceptance criteria, and executable validation gates for successful one-pass implementation. The incremental task structure allows for course correction if needed.
