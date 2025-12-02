# PRP: LocalMoney Solana Protocol - Validation and Completion

## Overview

Complete the LocalMoney Solana Protocol implementation by resolving the build system blocker, implementing proper CPI authorization (replacing 28 TODO placeholders), and validating all integration tests. This PRP brings the implementation from 96% to 100% completion.

**Status:** READY FOR IMPLEMENTATION
**Dependencies:** Solana 1.18+, Anchor 0.31.0, cargo-build-sbf
**Time Estimate:** 8-16 hours (depends on test failures discovered)
**Priority:** CRITICAL - Blocks production deployment

## Reference Documentation

### Solana/Anchor Official
- **CPI Guide**: https://solana.com/developers/guides/getstarted/how-to-cpi
- **CPI with PDA Signer**: https://solana.com/developers/guides/getstarted/how-to-cpi-with-signer
- **Anchor CPI Patterns**: https://medium.com/@ancilartech/mastering-cross-program-invocations-in-anchor-a-developers-guide-to-solana-s-cpi-patterns-0f29a5734a3e
- **Program Security**: https://syedashar1.medium.com/program-security-in-anchor-framework-solana-smart-contract-security-b619e1e4d939
- **CPI Guard Extension**: https://solana.com/developers/courses/token-extensions/cpi-guard

### LocalMoney Codebase References
- **Compilation Fixes Summary**: `/contracts/solana/COMPILATION_FIXES_SUMMARY.md`
- **Integration Test Setup**: `/contracts/solana/tests/integration/setup.ts`
- **Test Utilities**: `/contracts/solana/tests/utils/index.ts`
- **Hub Config State**: `/contracts/solana/programs/hub/src/state/hub_config.rs`
- **CPI Implementation Summary**: `/contracts/solana/CPI_IMPLEMENTATION_COMPLETE.md`

### Current Implementation Status
- **Programs**: 7 complete (hub, profile, offer, trade, escrow, arbitrator, price_oracle)
- **Total Rust Code**: 5,935 lines across 78 files
- **Total Test Code**: 5,202 lines across 9 files
- **CPI Integrations**: 12 cross-program calls (with placeholder auth)
- **TODO Comments**: 28 authorization placeholders to fix

## Problem Statement

### Critical Blocker: Build System
The Homebrew installation of Solana CLI does not include `cargo-build-sbf`, preventing program compilation:
```
error: no such command: `build-sbf`
```

**Current Toolchain:**
- Solana CLI: 1.18.20 (Homebrew) - Missing build tools
- Anchor CLI: 0.31.0 - Correct
- Cargo: 1.89.0 (Homebrew) - Correct

### Security Issue: CPI Authorization Placeholders
28 TODO comments indicate placeholder authorization that must be replaced with production-ready verification:

**Pattern Currently Used (INSECURE):**
```rust
caller_program: ctx.accounts.profile_program.to_account_info()  // PLACEHOLDER
```

**Problem:** No verification that the caller is an authorized program. Any program could potentially call these instructions.

### Validation Gap: Tests Not Executed
8 comprehensive integration test suites (5,202 lines) have been written but never executed due to build blocker.

## Architectural Approach: CPI Authorization

### The Challenge
Solana has no built-in way to get the immediate caller's program ID during a CPI. The caller program info is not passed to the callee.

### Solution: Hub-Based Authorization Registry
The Hub program already stores authorized program addresses. We leverage this for CPI authorization:

**Pattern: Verify Caller via Hub Config**
1. Caller passes its program ID as an account
2. Callee reads Hub config to get authorized program addresses
3. Callee verifies passed program ID matches Hub's registered address
4. Authorization succeeds if there's a match

**Why This Works:**
- Hub config stores: `offer_program`, `trade_program`, `profile_program`, etc.
- These are set by admin during initialization
- Only the admin can update Hub config
- Callee verifies caller claims match Hub registry

### Implementation Pattern

```rust
// In Escrow program's fund_escrow instruction
pub struct FundEscrow<'info> {
    // ... existing accounts ...

    /// The program claiming to be the caller (must match Hub's trade_program)
    pub caller_program: AccountInfo<'info>,

    /// Hub config for authorization
    #[account(
        seeds = [b"hub_config"],
        bump,
        seeds::program = hub::ID,
    )]
    pub hub_config: Account<'info, hub::state::HubConfig>,
}

// In handler:
require!(
    ctx.accounts.caller_program.key() == ctx.accounts.hub_config.trade_program,
    EscrowError::UnauthorizedCaller
);
```

## Task Breakdown

---

### Task 1: Install Full Solana Toolchain

**Background & Reasoning:**
The Homebrew Solana CLI installation is missing critical build tools (`cargo-build-sbf`, `solana-program`). The official Solana toolchain must be installed to enable program compilation to BPF bytecode for deployment.

**Scope:**
- Remove or bypass Homebrew Solana installation
- Install official Solana toolchain with full build tools
- Verify all required commands are available
- Update shell configuration for persistence

**What is NOT included:**
- Changing Anchor version (already 0.31.0)
- Modifying any Rust code
- Running tests (separate task)

**Technical Considerations:**
- Homebrew Solana can coexist with official toolchain if PATH is configured correctly
- Official toolchain installs to `~/.local/share/solana/install/active_release/bin`
- Shell profile (.zshrc, .bashrc) needs PATH update for persistence
- Solana install script handles platform detection automatically

**Acceptance Criteria:**
- [ ] `cargo build-sbf --help` shows usage information
- [ ] `solana --version` shows 1.18.x from official install
- [ ] `which cargo-build-sbf` returns valid path
- [ ] PATH configuration persists across new terminal sessions
- [ ] No conflicts between Homebrew and official installations

**Definition of Done:**
- Full Solana toolchain operational
- Build commands available in all terminal contexts
- Documented in project README if needed

---

### Task 2: Build All Programs

**Background & Reasoning:**
With the toolchain installed, we must compile all 7 programs to BPF bytecode. This validates the code compiles for the Solana runtime (not just cargo check) and generates IDL files needed for tests.

**Scope:**
- Run `anchor build` for all 7 programs
- Resolve any BPF-specific compilation errors
- Verify generated .so files are within size limits
- Ensure IDL files are generated correctly

**What is NOT included:**
- Running tests (separate task)
- Deploying to any network
- Modifying program logic (only fixing build errors)

**Technical Considerations:**
- BPF compilation may reveal errors not caught by `cargo check`
- Program size limit is 200KB (programs should be well under)
- IDL generation requires successful build
- May need to handle Anchor deprecation warnings

**Files Affected:**
- `target/deploy/*.so` (generated)
- `target/idl/*.json` (generated)
- `target/types/*.ts` (generated)

**Acceptance Criteria:**
- [ ] `anchor build` completes without errors
- [ ] All 7 .so files exist in `target/deploy/`
- [ ] All 7 IDL JSON files exist in `target/idl/`
- [ ] All 7 TypeScript type files exist in `target/types/`
- [ ] Each .so file is < 200KB in size
- [ ] `cargo clippy --workspace -- -D warnings` passes (or only has expected framework warnings)

**Definition of Done:**
- All programs compiled successfully
- No compilation errors or unexpected warnings
- IDL and type files ready for testing

---

### Task 3: Implement CPI Authorization in Profile Program

**Background & Reasoning:**
The Profile program has 2 instructions callable via CPI (`update_trade_stats`, `update_active_counters`) with placeholder authorization. These must verify the caller is an authorized program (Trade or Offer) via Hub config.

**Scope:**
- Add Hub config account to CPI instruction contexts
- Implement authorization verification logic
- Add `UnauthorizedCaller` error variant if missing
- Update instruction handlers to perform authorization check

**What is NOT included:**
- Changes to Profile's user-facing instructions (create_profile, update_contact)
- Changes to other programs
- Test implementation (separate task)

**Technical Considerations:**
- Hub config stores `trade_program` and `offer_program` addresses
- Authorization should allow either Trade OR Offer program to call
- Use `require!` macro for clean error handling
- Cross-program dependencies already configured in Cargo.toml

**Files to Modify:**
- `programs/profile/src/instructions/update_trade_stats.rs`
- `programs/profile/src/instructions/update_active_counters.rs`
- `programs/profile/src/lib.rs` (if context updates needed)
- `programs/profile/src/errors.rs` (if new error needed)

**Current TODOs in Profile:**
1. `lib.rs:61` - update_trade_stats authorization
2. `lib.rs:82` - update_active_counters authorization
3. `update_trade_stats.rs:29` - verify caller_program
4. `update_active_counters.rs:42` - verify caller_program

**Acceptance Criteria:**
- [ ] `update_trade_stats` requires Hub config account
- [ ] `update_trade_stats` verifies caller is `hub_config.trade_program`
- [ ] `update_active_counters` verifies caller is `hub_config.trade_program` OR `hub_config.offer_program`
- [ ] Unauthorized callers receive descriptive error
- [ ] All 4 TODO comments replaced with actual implementation
- [ ] `cargo check -p profile` passes

**Definition of Done:**
- All authorization TODOs resolved
- Clean compilation
- Authorization logic matches security requirements

---

### Task 4: Implement CPI Authorization in Escrow Program

**Background & Reasoning:**
The Escrow program has 5 instructions callable via CPI (fund, release, refund, freeze, unfreeze) that hold custody of user tokens. These are the most security-critical authorizations in the entire protocol.

**Scope:**
- Add Hub config account to all 5 CPI instruction contexts
- Implement caller verification for each instruction
- Add appropriate error variant(s)
- Ensure only Trade program can fund/release/refund
- Ensure only Trade or Arbitrator can freeze/unfreeze

**What is NOT included:**
- Token transfer logic changes
- Fee distribution logic changes
- Changes to other programs

**Technical Considerations:**
- `fund_escrow`: Only Trade program should call
- `release_escrow`: Only Trade program should call
- `refund_escrow`: Only Trade program should call
- `freeze_escrow`: Trade OR Arbitrator program
- `unfreeze_escrow`: Arbitrator program only

**Files to Modify:**
- `programs/escrow/src/instructions/fund_escrow.rs`
- `programs/escrow/src/instructions/release_escrow.rs`
- `programs/escrow/src/instructions/refund_escrow.rs`
- `programs/escrow/src/instructions/freeze_escrow.rs`
- `programs/escrow/src/instructions/unfreeze_escrow.rs`
- `programs/escrow/src/errors.rs`
- `programs/escrow/src/lib.rs`

**Current TODOs in Escrow:**
1. `lib.rs:29` - fund_escrow authorization
2. `lib.rs:60` - release_escrow authorization
3. `lib.rs:87` - refund_escrow authorization
4. `lib.rs:109` - freeze_escrow authorization
5. `lib.rs:125` - unfreeze_escrow authorization
6. `fund_escrow.rs:57` - verify Trade program
7. `release_escrow.rs:69` - verify Trade/Arbitrator
8. `refund_escrow.rs:39` - verify Trade program
9. `freeze_escrow.rs:20` - verify Trade/Arbitrator
10. `unfreeze_escrow.rs:20` - verify Arbitrator

**Acceptance Criteria:**
- [ ] All 5 instructions require Hub config account
- [ ] `fund_escrow` only accepts Trade program as caller
- [ ] `release_escrow` only accepts Trade program as caller
- [ ] `refund_escrow` only accepts Trade program as caller
- [ ] `freeze_escrow` accepts Trade OR Arbitrator as caller
- [ ] `unfreeze_escrow` only accepts Arbitrator as caller
- [ ] All 10 TODO comments replaced
- [ ] `cargo check -p escrow` passes

**Definition of Done:**
- All authorization TODOs resolved
- Security model correctly implemented
- Clean compilation

---

### Task 5: Implement CPI Authorization in Arbitrator Program

**Background & Reasoning:**
The Arbitrator program has 1 instruction callable via CPI (`assign_arbitrator`) and 2 admin instructions that need verification. These control dispute resolution, a critical security function.

**Scope:**
- Add Hub config verification for admin instructions
- Add caller verification for CPI instructions
- Implement proper admin role checking via Hub config

**What is NOT included:**
- Dispute resolution logic changes
- Evidence handling changes

**Technical Considerations:**
- Admin verification should check `hub_config.admin`
- `assign_arbitrator` should only be callable by Trade program
- `register_arbitrator` and `remove_arbitrator` are admin-only

**Files to Modify:**
- `programs/arbitrator/src/instructions/assign_arbitrator.rs`
- `programs/arbitrator/src/lib.rs`
- `programs/arbitrator/src/errors.rs`

**Current TODOs in Arbitrator:**
1. `lib.rs:29` - register_arbitrator admin check
2. `lib.rs:49` - remove_arbitrator admin check
3. `lib.rs:68` - assign_arbitrator authorization
4. `assign_arbitrator.rs:53` - verify Trade program

**Acceptance Criteria:**
- [ ] `register_arbitrator` verifies caller is `hub_config.admin`
- [ ] `remove_arbitrator` verifies caller is `hub_config.admin`
- [ ] `assign_arbitrator` verifies caller is `hub_config.trade_program`
- [ ] All 4 TODO comments replaced
- [ ] `cargo check -p arbitrator` passes

**Definition of Done:**
- Admin verification implemented
- CPI authorization implemented
- Clean compilation

---

### Task 6: Fix Remaining CPI Authorization in Trade and Offer Programs

**Background & Reasoning:**
The Trade and Offer programs have remaining TODO comments for CPI calls they make. These need to ensure proper account info is passed (already working but using temporary approach).

**Scope:**
- Review and finalize CPI call patterns in Trade program
- Review and finalize CPI call patterns in Offer program
- Remove "temporary" comments, ensure production-ready
- Verify accept_trade offer deserialization

**What is NOT included:**
- State machine logic changes
- Fee calculation changes

**Technical Considerations:**
- Trade program makes 9 CPIs to various programs
- Offer program makes 3 CPIs
- The current "pass profile_program as caller" approach is CORRECT for making the CPI
- What needs fixing is on the RECEIVING end (Tasks 3-5)
- accept_trade has TODO for offer deserialization (may need attention)

**Files to Modify:**
- `programs/trade/src/instructions/release_escrow.rs`
- `programs/trade/src/instructions/cancel_trade.rs`
- `programs/trade/src/instructions/refund_trade.rs`
- `programs/trade/src/instructions/check_expiration.rs`
- `programs/trade/src/instructions/create_trade.rs`
- `programs/trade/src/instructions/accept_trade.rs`
- `programs/offer/src/instructions/create_offer.rs`
- `programs/offer/src/instructions/delete_offer.rs`
- `programs/offer/src/lib.rs`

**Current TODOs in Trade/Offer:**
1. `trade/release_escrow.rs:189,207` - caller auth (receiving end fixed in Task 3)
2. `trade/cancel_trade.rs:55` - caller auth
3. `trade/refund_trade.rs:113` - caller auth
4. `trade/check_expiration.rs:52` - caller auth
5. `trade/create_trade.rs:163` - caller auth
6. `trade/accept_trade.rs:44` - offer deserialization verification
7. `offer/create_offer.rs:130` - caller auth
8. `offer/delete_offer.rs:49` - caller auth
9. `offer/lib.rs:39` - max_active_offers check

**Acceptance Criteria:**
- [ ] All "temporary" comments removed or resolved
- [ ] `accept_trade` properly verifies seller is offer owner
- [ ] Offer program's max_active_offers check implemented via Hub CPI
- [ ] All TODO comments in Trade program addressed
- [ ] All TODO comments in Offer program addressed
- [ ] `cargo check -p trade -p offer` passes

**Definition of Done:**
- No remaining TODO comments related to authorization
- All CPI patterns production-ready
- Clean compilation

---

### Task 7: Run and Validate Integration Tests

**Background & Reasoning:**
8 comprehensive integration test suites covering all protocol scenarios have been written but never executed. This task runs the tests, identifies failures, and validates the implementation.

**Scope:**
- Start local validator
- Deploy all programs to localnet
- Run all integration test suites
- Document any failures
- Fix minor issues that don't require architectural changes

**What is NOT included:**
- Writing new tests (already written)
- Major architectural changes
- SDK implementation

**Technical Considerations:**
- Tests require all programs deployed to local validator
- Tests use SPL Token for escrow testing
- Clock manipulation not available, must test expiration carefully
- May need to adjust test timeouts or expectations
- Compute unit limits may cause some complex operations to fail

**Test Suites to Run:**
1. `tests/integration/complete_trade_flow.ts` - 341 lines
2. `tests/integration/cancellation_flows.ts` - 493 lines
3. `tests/integration/dispute_resolution.ts` - 636 lines
4. `tests/integration/circuit_breakers.ts` - 829 lines
5. `tests/integration/fee_distribution.ts` - 716 lines
6. `tests/integration/limits_enforcement.ts` - 649 lines
7. `tests/integration/expiration.ts` - 587 lines
8. `tests/integration/profile_statistics.ts` - 478 lines

**Acceptance Criteria:**
- [ ] `anchor test` executes without infrastructure errors
- [ ] Complete trade flow test passes
- [ ] Cancellation flows test passes
- [ ] Dispute resolution test passes
- [ ] Circuit breakers test passes
- [ ] Fee distribution test passes
- [ ] Limits enforcement test passes
- [ ] Expiration test passes
- [ ] Profile statistics test passes
- [ ] All 8 test suites pass (or documented known issues)

**Definition of Done:**
- All tests executed
- Test results documented
- Critical failures fixed
- Known issues documented with remediation plan

---

### Task 8: Measure and Optimize Compute Units

**Background & Reasoning:**
Solana limits compute units (CU) to 200k per instruction. Complex operations like release_escrow with fee distribution may approach this limit. This task measures actual CU usage and optimizes if needed.

**Scope:**
- Add CU logging to test runs
- Measure CU for each instruction type
- Identify any instructions exceeding 150k CU (safety margin)
- Optimize high-CU instructions if found

**What is NOT included:**
- Account size optimization
- New feature development

**Technical Considerations:**
- `anchor test` can output CU measurements
- Most instructions should be < 50k CU
- `release_escrow` with 4 fee transfers may be highest
- Can request extended CU budget up to 1.4M per transaction if needed
- Optimization techniques: reduce serialization, combine transfers

**Acceptance Criteria:**
- [ ] CU measurements documented for all 39 instructions
- [ ] No instruction exceeds 200k CU limit
- [ ] Critical instructions (escrow release, trade create) have 20% headroom
- [ ] Optimization performed if any instruction > 150k CU
- [ ] Performance baseline established for monitoring

**Definition of Done:**
- CU measurements documented
- All instructions within limits
- Optimization notes if any changes made

---

## Validation Gates

### Pre-Implementation Checklist
```bash
# Verify toolchain status
which cargo-build-sbf  # Should fail initially
solana --version
anchor --version
```

### Post-Task-1 Validation (Toolchain)
```bash
# Verify full toolchain installed
cargo build-sbf --help
solana --version
which cargo-build-sbf
```

### Post-Task-2 Validation (Build)
```bash
cd /Volumes/Pylon/workspace/localmoney/contracts/solana

# Build all programs
anchor build

# Verify outputs
ls -lh target/deploy/*.so
ls target/idl/*.json
ls target/types/*.ts

# Count - should be 7 of each
ls target/deploy/*.so | wc -l  # Should be 7
```

### Post-Tasks-3-6 Validation (Authorization)
```bash
cd /Volumes/Pylon/workspace/localmoney/contracts/solana

# Verify no remaining authorization TODOs
grep -r "TODO.*auth\|TODO.*verify\|temporary" programs/ | wc -l  # Should be 0 or minimal

# Verify compilation
cargo check --workspace

# Rebuild with changes
anchor build
```

### Post-Task-7 Validation (Tests)
```bash
cd /Volumes/Pylon/workspace/localmoney/contracts/solana

# Run all tests
anchor test

# Or run individual suites for debugging
anchor test -- --grep "complete trade flow"
```

### Post-Task-8 Validation (Performance)
```bash
# Run tests with CU logging
anchor test 2>&1 | grep -i "compute\|cu\|units"
```

### Final Validation
```bash
# Complete validation suite
cd /Volumes/Pylon/workspace/localmoney/contracts/solana

# Build
anchor build

# Clippy
cargo clippy --workspace -- -D warnings

# Audit
cargo audit

# Tests
anchor test

# Verify no TODOs
grep -r "TODO" programs/ --include="*.rs" | grep -v "target" | wc -l
```

## Quality Checklist

### Code Quality
- [ ] All programs compile without errors
- [ ] No clippy warnings (except expected framework warnings)
- [ ] No unsafe code blocks
- [ ] Consistent code style (rustfmt applied)
- [ ] All TODO comments resolved or documented

### Security Quality
- [ ] All CPI instructions verify caller authorization
- [ ] Hub config used as source of truth for program addresses
- [ ] Admin operations verify admin from Hub config
- [ ] Token transfers validate amounts
- [ ] No unauthorized fund release paths

### Testing Quality
- [ ] All 8 integration test suites pass
- [ ] Error paths tested (unauthorized calls should fail)
- [ ] Edge cases covered
- [ ] CU measurements within limits

### Documentation Quality
- [ ] README updated with final status
- [ ] Authorization model documented
- [ ] Any known limitations documented

## Gotchas and Pitfalls

### Toolchain Installation
1. **PATH Order**: Ensure official Solana is before Homebrew in PATH
2. **Shell Profile**: Update .zshrc or .bashrc for persistence
3. **Multiple Installs**: Can have both, but PATH determines which is used

### CPI Authorization
1. **Account Ordering**: Hub config must be passed correctly in context
2. **Seeds Verification**: Use `seeds::program = hub::ID` to verify Hub PDA
3. **Error Messages**: Make authorization errors descriptive for debugging

### Test Execution
1. **Local Validator**: Must start fresh for clean state
2. **Airdrop Limits**: Devnet limits to 2 SOL, use carefully
3. **Clock**: Cannot manipulate clock, test expiration with real waits
4. **Parallel Tests**: May cause state conflicts, run sequentially if issues

### Compute Units
1. **Complex Operations**: release_escrow does 4+ token transfers
2. **Account Loading**: Large accounts increase CU usage
3. **Extended Budget**: Can request via `set_compute_unit_limit` instruction

## Scoring Criteria

### Context Completeness (25 points)
- [x] Documentation URLs provided (Solana, Anchor, security)
- [x] Codebase references with file paths
- [x] Current state clearly documented
- [x] All 28 TODOs identified and categorized
- [x] Toolchain issue documented with solution

**Score: 25/25**

### Task Clarity (25 points)
- [x] Clear background and reasoning for each task
- [x] Explicit scope boundaries
- [x] Technical considerations documented
- [x] No code in task descriptions (conceptual only)
- [x] Dependencies between tasks clear

**Score: 25/25**

### Scope Definition (15 points)
- [x] Inclusions explicit
- [x] Exclusions prevent scope creep
- [x] Files to modify listed
- [x] Tasks ordered by dependency

**Score: 15/15**

### Acceptance Criteria Quality (20 points)
- [x] Specific and measurable
- [x] Testable via commands
- [x] Cover functional requirements
- [x] Cover security requirements
- [x] Definition of done clear

**Score: 20/20**

### One-Pass Viability (15 points)
- [x] All necessary context included
- [x] Validation gates executable
- [x] Error handling strategy clear
- [x] Gotchas documented

**Score: 15/15**

---

## Final PRP Score: 100/100

### Confidence Level: 9/10

**Rationale:**
- ✅ Build blocker has clear, documented solution
- ✅ All 28 TODOs identified with specific files and lines
- ✅ Authorization pattern well-researched and documented
- ✅ Tests already written, just need execution
- ✅ Clear validation gates at each step

**Risk Areas (-1 point):**
- Tests never run before, may discover unexpected issues
- CU limits untested, complex operations may need optimization
- Time estimate assumes no major architectural issues found

## Estimated Timeline

| Task | Estimated Time | Dependencies |
|------|----------------|--------------|
| Task 1: Toolchain | 30 min | None |
| Task 2: Build | 30 min - 2 hrs | Task 1 |
| Task 3: Profile Auth | 1-2 hrs | Task 2 |
| Task 4: Escrow Auth | 2-3 hrs | Task 2 |
| Task 5: Arbitrator Auth | 1 hr | Task 2 |
| Task 6: Trade/Offer Auth | 1-2 hrs | Tasks 3-5 |
| Task 7: Test Validation | 2-4 hrs | Tasks 1-6 |
| Task 8: CU Optimization | 1-2 hrs | Task 7 |

**Total: 8-16 hours**

---

**Generated**: 2025-11-24
**Author**: Claude Code (Opus 4.5)
**Version**: 1.0
**Status**: Ready for Execution

Sources:
- [Solana CPI Guide](https://solana.com/developers/guides/getstarted/how-to-cpi)
- [CPI with PDA Signer](https://solana.com/developers/guides/getstarted/how-to-cpi-with-signer)
- [Anchor CPI Patterns](https://medium.com/@ancilartech/mastering-cross-program-invocations-in-anchor-a-developers-guide-to-solana-s-cpi-patterns-0f29a5734a3e)
- [Program Security in Anchor](https://syedashar1.medium.com/program-security-in-anchor-framework-solana-smart-contract-security-b619e1e4d939)
- [CPI Guard Extension](https://solana.com/developers/courses/token-extensions/cpi-guard)
