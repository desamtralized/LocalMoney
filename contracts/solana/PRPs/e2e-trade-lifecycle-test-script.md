# PRP: End-to-End Trade Lifecycle Test Script with Report Generation

## Executive Summary

Create a comprehensive standalone TypeScript e2e test script that exercises the complete LocalMoney trade lifecycle on Solana local devnet, validates all program interactions, measures performance metrics, and generates a detailed HTML test report. This script will serve as both a validation tool and documentation of the full protocol flow.

## Problem Statement

### Current State
- Integration tests exist in `tests/integration/` but are designed for mocha test runner
- No standalone script for running complete trade lifecycle with detailed reporting
- No automated performance/compute unit measurements
- No HTML report generation for test results
- Limited documentation of complete system behavior under real conditions

### Why This Matters
- **Deployment Validation**: Need confidence that all 7 programs work together correctly
- **Performance Baseline**: Need to measure and document compute unit usage
- **Documentation**: HTML report serves as living documentation of protocol flows
- **Debugging Aid**: Detailed logging and reporting helps identify integration issues
- **Demo Tool**: Standalone script can demonstrate complete protocol to stakeholders

### Success Criteria
- Complete trade lifecycle runs successfully on local devnet
- All program interactions validated (Hub, Profile, Offer, Trade, Escrow)
- Compute units measured for each instruction
- HTML report generated with:
  - Test execution timeline
  - Pass/fail status for each step
  - Account balances before/after
  - Fee calculations
  - Performance metrics
  - Pretty-printed transaction details

## Context & Background

### Solana Testing Ecosystem (2025)

**Primary Testing Approaches**:
- **Anchor Test Framework**: Default for Anchor projects, uses Mocha/Chai
- **Jest with Bankrun**: 10x faster tests, gaining popularity in 2025
- **solana-test-validator**: Local devnet for integration testing

**Documentation References**:
- Anchor Testing Guide: https://www.anchor-lang.com/docs/testing
- Helius Testing Guide: https://www.helius.dev/blog/a-guide-to-testing-solana-programs
- Bankrun Documentation: https://github.com/kevinheavey/solana-bankrun
- Solana Stack Exchange - Professional Testing Workflow: https://solana.stackexchange.com/questions/21115/professional-workflow-for-anchor-tests

### Report Generation Best Practices

**HTML Report Tools for TypeScript/JavaScript**:
1. **mochawesome**: De facto standard for Mocha HTML reports
   - npm package: https://www.npmjs.com/package/mochawesome
   - Generates beautiful HTML reports with charts
   - Supports custom context/metadata

2. **jest-html-reporter**: For Jest-based tests
   - npm package: https://www.npmjs.com/package/jest-html-reporter
   - Highly customizable

3. **Custom HTML Generation**: For standalone scripts
   - Simple approach: Template literals with embedded HTML/CSS
   - Advanced: Handlebars/EJS templates
   - Include inline CSS for portability

### Existing Codebase Patterns

**Integration Test Setup** (`tests/integration/setup.ts:1-473`):
- `IntegrationTestSetup` class provides comprehensive test infrastructure
- Initializes all 7 programs (Hub, Profile, Offer, Trade, Escrow, Arbitrator, PriceOracle)
- Creates test users with SOL airdrops
- Mints test tokens
- Configures hub with default fees and limits
- Patterns to follow: Test user management, PDA derivation, token operations

**Complete Trade Flow** (`tests/integration/complete_trade_flow.ts:1-342`):
- 9-step trade lifecycle:
  1. Create seller/buyer profiles
  2. Create sell offer
  3. Mint tokens to seller
  4. Buyer creates trade request
  5. Seller accepts trade
  6. Seller funds escrow
  7. Buyer confirms fiat deposit
  8. Seller releases escrow
  9. Verify balances and fee distribution
- Extensive logging and assertions
- Patterns to follow: Step-by-step execution, balance verification, state transitions

**Utilities** (`tests/utils/index.ts:1-200`):
- PDA derivation helpers for all programs
- TestUser class for keypair management
- Token operations (mint, balance, transfer)
- Fiat currency encoding/decoding
- Constants (BASIS_POINTS, program IDs)

### Trade Lifecycle Architecture

**Program Flow**:
```
Hub (Configuration) ←─────────────────────┐
  ↓                                        │
Profile (User Reputation) ←──┐             │
  ↓                          │             │
Offer (Marketplace) ──────────┼─────────┐  │
  ↓                          │         │  │
Trade (State Machine) ────────┼─────────┼──┘
  ↓                          │         │
Escrow (Token Custody) ───────┼─────────┘
  ↓                          │
SPL Token (Transfers) ←───────┘
```

**State Transitions**:
1. `RequestCreated` → Buyer creates trade
2. `RequestAccepted` → Seller accepts
3. `EscrowFunded` → Seller funds escrow
4. `FiatDeposited` → Buyer confirms fiat
5. `EscrowReleased` → Escrow released to buyer with fees

**Fee Structure** (from Hub configuration):
- Burn Fee: 0.5% (50 basis points)
- Chain Fee: 1% (100 basis points)
- Warchest Fee: 0.5% (50 basis points)
- Total: 2% (200 basis points)
- Basis: 10,000 = 100%

### Compute Unit Measurements

**Solana Limits**:
- Max per instruction: 200,000 CU
- Max per transaction: 1,400,000 CU
- Typical complex instruction: 50,000-100,000 CU

**Measurement Approach**:
- Use `simulateTransaction()` to get compute units without sending
- Or parse transaction response for actual CU used
- Document CU for each instruction type

### Common Pitfalls

1. **Airdrop Limits**: Local validator has airdrop limits, ensure sufficient SOL
2. **Account Rent**: All accounts must be rent-exempt
3. **PDA Derivation**: Seeds must match program expectations exactly
4. **Token Account Creation**: ATAs must be created before transfers
5. **Signer Requirements**: Each instruction requires specific signers
6. **State Validation**: Always verify state transitions completed correctly
7. **Fee Precision**: Use basis points (1% = 100) to avoid rounding errors

## Architectural Approach

### Design Philosophy

**Standalone Script**:
- Self-contained TypeScript file that can run independently
- No test framework dependencies (Mocha/Jest)
- Direct Anchor/Solana library usage
- Clear console output with progress indicators
- HTML report saved to `./reports/` directory

**Modularity**:
- Reusable functions for each protocol operation
- Clean separation: setup → execute → report
- Easy to extend for additional test scenarios

**Comprehensive Reporting**:
- Real-time console logging for monitoring
- Detailed HTML report for documentation
- JSON export for programmatic analysis (optional)

### Technology Stack

**Runtime**:
- Node.js 18+ with TypeScript
- ts-node for direct execution

**Dependencies**:
- @coral-xyz/anchor: Program interactions
- @solana/web3.js: Blockchain primitives
- @solana/spl-token: Token operations
- chalk: Colored console output
- (No test framework needed)

**Report Generation**:
- Pure HTML/CSS/JavaScript (no build step)
- Inline styles for portability
- Embedded Chart.js for visualizations (via CDN)

### File Structure

```
contracts/solana/
├── scripts/
│   └── e2e-trade-lifecycle.ts       # Main script
├── reports/                         # Generated reports
│   ├── trade-lifecycle-TIMESTAMP.html
│   └── trade-lifecycle-latest.html  # Symlink to latest
└── package.json                     # Add script entry
```

### Report Contents

**HTML Report Sections**:
1. **Executive Summary**
   - Total execution time
   - Pass/fail status
   - Total compute units used
   - Total fees paid

2. **Environment Info**
   - Solana cluster
   - Program IDs
   - Test token mint
   - Timestamp

3. **Test Steps Timeline**
   - Each step with timestamp
   - Duration
   - Status (pass/fail)
   - Compute units used
   - Transaction signature

4. **Account Balances**
   - Before/after tables for each participant
   - Token balances
   - SOL balances
   - Visual diff (green/red)

5. **Fee Distribution**
   - Breakdown by fee type
   - Recipient addresses
   - Amounts
   - Pie chart visualization

6. **Performance Metrics**
   - Compute units by instruction type
   - Bar chart
   - Average, min, max, total

7. **Transaction Details**
   - Expandable sections per transaction
   - Pretty-printed logs
   - Account reads/writes
   - Link to Solana Explorer (if applicable)

8. **Error Log** (if any failures)
   - Stack traces
   - Error messages
   - Account states at failure

## Task Breakdown

---

### Task 1: Create Script Foundation and Environment Setup

**Background & Reasoning**:
Before implementing the trade lifecycle, we need a robust foundation that handles Solana connection, program initialization, and test environment setup. This task establishes the infrastructure needed for all subsequent operations, including test user management, token minting, and program loading.

**Scope**:
- **File**: `scripts/e2e-trade-lifecycle.ts`
- **Create**:
  - Main script structure with clear entry point
  - Environment configuration (cluster, commitment, wallet)
  - Connection to local devnet
  - Program loading for all 7 programs (Hub, Profile, Offer, Trade, Escrow, Arbitrator, PriceOracle)
  - Test user generation with SOL airdrops
  - Test token mint creation
  - Colored console logging setup with chalk
- **Integrate**:
  - Import utilities from `tests/utils/index.ts`
  - Reuse PDA derivation helpers
  - Adapt TestUser class or create equivalent

**NOT in Scope**:
- Trade lifecycle implementation (Task 2)
- Report generation (Task 4)
- Actual program deployment (assumes programs already deployed to local validator)
- Network configuration beyond localnet

**Technical Considerations**:
- **Connection Management**: Use confirmed commitment for reliability
- **Airdrop Strategy**: Request 100 SOL per test account to avoid limits
- **Program Loading**: Use `anchor.workspace` pattern adapted for standalone script
- **Error Handling**: Wrap all async operations in try-catch with descriptive errors
- **Logging Levels**: Implement debug/info/success/error logging functions
- **Idempotency**: Check if local validator is running before proceeding

**Acceptance Criteria**:
- [ ] Script connects to local devnet successfully
- [ ] All 7 programs loaded with correct program IDs
- [ ] 5 test users created (admin, buyer, seller, arbitrator, price provider)
- [ ] Each test user has ≥100 SOL
- [ ] Test token mint created with 6 decimals
- [ ] Console output shows colored, formatted logs
- [ ] Script exits gracefully on connection failure with clear error message
- [ ] PDA helpers imported and functional

**Definition of Done**:
- Script runs without errors when local validator is running
- Console output confirms all programs loaded
- Test accounts funded and ready
- Foundation ready for trade lifecycle implementation
- Code is well-commented explaining each setup step

---

### Task 2: Implement Complete Trade Lifecycle Functions

**Background & Reasoning**:
The core of the e2e script is executing the full trade lifecycle from profile creation to escrow release. This task implements modular functions for each protocol operation, closely following the existing integration test patterns but adapted for standalone execution with detailed result capture.

**Scope**:
- **File**: `scripts/e2e-trade-lifecycle.ts`
- **Implement Functions**:
  1. `createProfile(user, contactInfo)` → Returns profile PDA
  2. `createSellOffer(seller, params)` → Returns offer PDA and ID
  3. `mintTokensToSeller(seller, amount)` → Returns token account
  4. `createTradeRequest(buyer, seller, offerId, params)` → Returns trade PDA and ID
  5. `acceptTrade(seller, tradePDA, sellerContact)` → Confirms acceptance
  6. `fundEscrow(seller, tradePDA, tradeId, amount)` → Transfers to escrow vault
  7. `confirmFiatDeposit(buyer, tradePDA)` → Buyer confirmation
  8. `releaseEscrow(seller, tradePDA, tradeId, buyer, fees)` → Releases with fee distribution
  9. `verifyFinalBalances(accounts, expectedBalances)` → Validates end state
- **Capture**:
  - Transaction signatures
  - Compute units used
  - Account balances before/after
  - State transitions
  - Timestamps for each step

**NOT in Scope**:
- Error scenarios (cancellations, disputes) - save for future enhancement
- Arbitrator flow (covered in separate integration tests)
- Multiple offers or concurrent trades
- Token types beyond SPL Token (not Token-2022)

**Technical Considerations**:
- **Pattern Reference**: Follow `tests/integration/complete_trade_flow.ts` closely
- **Compute Unit Measurement**: Use `simulateTransaction` before sending, or parse response
- **Balance Snapshots**: Query all relevant token accounts before/after each step
- **State Validation**: Fetch and assert trade state after each transition
- **PDA Derivation**: Use helpers from utils for all PDAs
- **ATA Creation**: Use `getOrCreateAssociatedTokenAccount` for buyer/treasury/warchest
- **CPI Awareness**: Release escrow involves multiple CPIs (escrow, profile updates)
- **Fee Calculation**: Verify fee distribution matches hub configuration

**Acceptance Criteria**:
- [ ] All 9 functions implemented and working
- [ ] Each function returns structured result object with: `{ success: boolean, signature: string, computeUnits: number, before: AccountState, after: AccountState, error?: string }`
- [ ] Profile creation succeeds for buyer and seller
- [ ] Offer creation returns valid PDA
- [ ] Trade state transitions through all 5 states correctly
- [ ] Escrow vault balance goes from 0 → tradeAmount → 0
- [ ] Buyer receives correct amount (tradeAmount - fees)
- [ ] Treasury, warchest, and burn fees correctly distributed
- [ ] No transactions fail (all return success)
- [ ] Console logs each step with ✓ or ✗ indicator

**Definition of Done**:
- Complete trade lifecycle executes end-to-end successfully
- All 9 steps complete without errors
- Balance changes match expected amounts
- Fee distribution verified correct
- Transaction signatures captured for all operations
- Compute units measured for each step
- Ready for report generation integration

---

### Task 3: Add Hub and Program Initialization

**Background & Reasoning**:
The trade lifecycle requires the Hub program to be initialized with configuration (fees, limits, timers) and counters to be set up for Offer and Trade programs. This task ensures the protocol is properly configured before any trades can occur.

**Scope**:
- **File**: `scripts/e2e-trade-lifecycle.ts`
- **Implement**:
  1. `initializeHub(admin, config)` → Initializes hub with fees, limits, program IDs
  2. `initializeOfferCounter(admin)` → Sets up sequential offer IDs
  3. `initializeTradeCounter(admin)` → Sets up sequential trade IDs
  4. `initializePriceOracle(admin, priceProvider)` → Registry and provider
  5. `seedPrices(admin, currencies)` → Initial price feeds for USD, EUR, GBP
  6. `registerArbitrator(admin, arbitrator, currency)` → Register USD arbitrator
- **Configuration**:
  - Default fees: burn 0.5%, chain 1%, warchest 0.5%
  - Limits: min $10, max $10,000, max 10 active offers, 20 active trades
  - Timers: 1 hour trade expiration, 2 hour dispute window
- **Verify**:
  - Hub config readable and contains correct values
  - Counters initialized to 0
  - Price oracle has USD price

**NOT in Scope**:
- Updating hub configuration mid-test
- Testing circuit breaker functionality
- Multiple arbitrators or currencies
- Dynamic fee adjustments

**Technical Considerations**:
- **Pattern Reference**: Follow `tests/integration/setup.ts:210-383`
- **Admin Authority**: All initialization requires admin signer
- **PDA Derivation**: Hub config, counters, registry all use specific seeds
- **Price Decimals**: Use 6 decimals for price feeds ($1.00 = 1,000,000)
- **Basis Points**: All fees as basis points (1% = 100, max 10000)
- **Sequential IDs**: Counters start at 0, increment on create operations
- **Rent Exemption**: All accounts must be rent-exempt

**Acceptance Criteria**:
- [ ] Hub initialized with admin as authority
- [ ] Hub config contains correct fee configuration (burn 50, chain 100, warchest 50)
- [ ] Hub config contains correct limits (min 1000, max 10000000 cents)
- [ ] Hub config contains correct timers (3600s, 7200s)
- [ ] Hub config references all 7 program IDs
- [ ] Offer counter initialized, count = 0
- [ ] Trade counter initialized, count = 0
- [ ] Price oracle registry initialized
- [ ] USD price initialized to $1.00 (1_000_000 with 6 decimals)
- [ ] Arbitrator registered for USD currency
- [ ] All initialization logged with ✓ indicators

**Definition of Done**:
- All protocol infrastructure initialized successfully
- Hub configuration verified correct
- Counters and oracles ready for trades
- Initialization logged clearly in console
- Ready for trade lifecycle execution

---

### Task 4: Implement HTML Report Generation

**Background & Reasoning**:
A comprehensive HTML report transforms raw test execution data into actionable documentation. The report should be visually appealing, self-contained, and provide both high-level summary and detailed drill-down capabilities. This serves as both validation artifact and protocol documentation.

**Scope**:
- **File**: `scripts/e2e-trade-lifecycle.ts`
- **Implement**:
  - `generateReport(results)` function that takes execution results
  - HTML template with embedded CSS (Bootstrap-like styling or custom)
  - Sections: Executive Summary, Environment, Timeline, Balances, Fees, Performance, Transactions
  - Chart.js integration via CDN for fee distribution pie chart and CU bar chart
  - Write HTML to `reports/trade-lifecycle-TIMESTAMP.html`
  - Create symlink `reports/trade-lifecycle-latest.html` pointing to latest
  - Console log report location
- **Data Structure**:
  - Accept structured results object from lifecycle execution
  - Include: steps, durations, signatures, balances, fees, CU metrics, errors
- **Styling**:
  - Responsive design (works on mobile)
  - Print-friendly CSS
  - Color coding: green for success, red for failure, yellow for warnings
  - Monospace font for addresses/signatures
  - Expandable/collapsible transaction details
  - Smooth scrolling to sections

**NOT in Scope**:
- PDF generation
- Email delivery
- Database storage
- Real-time dashboard
- Interactive test execution from UI

**Technical Considerations**:
- **HTML Generation**: Use template literals for simplicity
- **CSS Framework**: Inline modern CSS or minimal framework (no build step)
- **Charts**: Chart.js via CDN (https://cdn.jsdelivr.net/npm/chart.js)
- **File System**: Node.js `fs` module for writing
- **Timestamps**: Use ISO 8601 format for clarity
- **Links**: Solana Explorer links for mainnet-beta/devnet (skip for localnet)
- **Error Handling**: Graceful degradation if chart rendering fails
- **Portability**: Single HTML file, no external dependencies (except CDN)

**Acceptance Criteria**:
- [ ] HTML report generated successfully
- [ ] Report opens in browser without errors
- [ ] Executive summary shows: total time, pass/fail count, total CU, total fees
- [ ] Environment section lists all program IDs and test accounts
- [ ] Timeline shows all 9+ steps with timestamps and durations
- [ ] Balance tables show before/after for buyer, seller, escrow, treasury, warchest
- [ ] Fee distribution pie chart renders correctly
- [ ] Performance bar chart shows CU by instruction type
- [ ] Transaction details expandable per step
- [ ] Report is <2MB in size
- [ ] Console output shows report file path
- [ ] `reports/trade-lifecycle-latest.html` exists and is correct

**Definition of Done**:
- Report generation function complete and tested
- HTML report renders correctly in Chrome, Firefox, Safari
- All sections populated with actual data from test run
- Charts display correctly
- Report is visually appealing and professional
- File saved to reports/ directory with timestamp
- Ready for handoff to stakeholders

---

### Task 5: Add Compute Unit Measurement and Performance Tracking

**Background & Reasoning**:
Accurate compute unit (CU) measurement is critical for understanding program performance, estimating costs, and identifying optimization opportunities. This task instruments the script to capture CU usage for every transaction and aggregate performance metrics.

**Scope**:
- **File**: `scripts/e2e-trade-lifecycle.ts`
- **Implement**:
  - `measureComputeUnits(transaction, connection)` → Returns CU used
  - Wrap each transaction send with CU measurement
  - Aggregate CU metrics by instruction type
  - Calculate total CU for entire lifecycle
  - Add performance section to results
- **Metrics to Track**:
  - Per-instruction CU: createProfile, createOffer, createTrade, acceptTrade, fundEscrow, confirmFiat, releaseEscrow
  - Total CU for lifecycle
  - Average CU per instruction type
  - Min/max CU by type
  - Percentage breakdown by instruction
- **Measurement Methods**:
  1. Simulate transaction before sending (preflight)
  2. Parse `computeUnitsConsumed` from transaction response
  3. Use `getTransaction` with `maxSupportedTransactionVersion: 0`

**NOT in Scope**:
- Optimizing compute units (this is measurement only)
- Heap usage or memory profiling
- Micro-benchmarking individual operations
- Comparing against other implementations

**Technical Considerations**:
- **Simulation**: Use `simulateTransaction` with `replaceRecentBlockhash: true`
- **Response Parsing**: CU in `meta.computeUnitsConsumed` field
- **Commitment**: Use 'confirmed' or 'finalized' for accurate measurements
- **Retry Logic**: Handle transient errors in simulation
- **Logging**: Log CU for each transaction in console
- **Aggregation**: Use Map or object to group by instruction type
- **Precision**: CU is an integer, no decimal places

**Acceptance Criteria**:
- [ ] CU measured for every transaction
- [ ] Console logs CU after each step (e.g., "✓ Profile created (12,345 CU)")
- [ ] CU aggregated by instruction type
- [ ] Total CU for lifecycle calculated
- [ ] Average CU per instruction type computed
- [ ] No measurement errors (fallback to 0 if unavailable)
- [ ] Performance data included in report generation
- [ ] Bar chart in HTML report shows CU by instruction type
- [ ] Summary shows: "Total Compute Units: 789,234"
- [ ] All instructions < 200,000 CU (Solana limit)

**Definition of Done**:
- Compute unit measurement integrated into all transaction sends
- Performance metrics aggregated correctly
- Console output shows CU per step
- HTML report includes performance section with chart
- No impact on transaction success (measurement is non-blocking)
- Documentation added explaining CU measurement approach

---

### Task 6: Add Comprehensive Error Handling and Validation

**Background & Reasoning**:
Production-grade scripts must handle errors gracefully, provide actionable error messages, and validate preconditions. This task adds robust error handling, input validation, and recovery mechanisms to ensure the script fails safely and provides clear diagnostics.

**Scope**:
- **File**: `scripts/e2e-trade-lifecycle.ts`
- **Implement**:
  - Precondition checks (validator running, programs deployed, sufficient SOL)
  - Try-catch blocks around all async operations
  - Specific error messages for common failures
  - Validation functions for account states
  - Graceful shutdown on errors
  - Error section in HTML report
- **Validations**:
  - Local validator reachable
  - All program IDs resolve to accounts
  - Test accounts have sufficient SOL for rent + fees
  - Token accounts exist before transfers
  - State transitions match expected values
  - Balance changes match calculations
  - No account data deserialization errors

**NOT in Scope**:
- Automatic error recovery (retry logic)
- Network fault tolerance
- Distributed tracing
- Alerting or monitoring

**Technical Considerations**:
- **Error Types**: Network errors, program errors, assertion failures
- **Error Context**: Capture transaction signature, account addresses, step name
- **Logging**: Use different log levels (error, warn, info, debug)
- **Stack Traces**: Preserve and include in report
- **Exit Codes**: 0 for success, 1 for failure
- **Cleanup**: Close connections, stop timers on error
- **Assertion Library**: Consider chai for readable assertions, or custom

**Acceptance Criteria**:
- [ ] Script checks if local validator is running before proceeding
- [ ] Script validates all program accounts exist
- [ ] Script checks test accounts have ≥1 SOL before operations
- [ ] All async operations wrapped in try-catch
- [ ] Errors logged with context (step name, account, signature)
- [ ] Script exits with code 1 on any failure
- [ ] HTML report includes error section if failures occurred
- [ ] Error section shows: step that failed, error message, stack trace, account states
- [ ] Console output clearly indicates failure point with red ✗
- [ ] No unhandled promise rejections

**Definition of Done**:
- Comprehensive error handling implemented
- All edge cases handled gracefully
- Clear error messages for all failure modes
- Script fails safely without hanging
- HTML report captures error details
- Console output provides actionable diagnostics
- Test failure produces useful report for debugging

---

### Task 7: Add Script Entry Point and Package Configuration

**Background & Reasoning**:
To make the script easily executable and well-integrated with the project, we need proper package configuration, script entry, and documentation. This task ensures developers can run the script with a simple command and understand its purpose.

**Scope**:
- **Files**:
  - `package.json`: Add script entry
  - `scripts/e2e-trade-lifecycle.ts`: Add CLI arg parsing and help text
  - `README.md` (or new `scripts/README.md`): Document script usage
- **Add to package.json**:
  ```json
  "scripts": {
    "e2e:trade": "ts-node scripts/e2e-trade-lifecycle.ts",
    "e2e:trade:report": "open reports/trade-lifecycle-latest.html"
  }
  ```
- **CLI Features**:
  - `--help`: Show usage information
  - `--cluster <url>`: Override cluster (default: localnet)
  - `--verbose`: Enable debug logging
  - `--skip-report`: Skip HTML report generation
- **Documentation**:
  - Script purpose and overview
  - Prerequisites (local validator running)
  - Usage examples
  - Report location
  - Troubleshooting tips

**NOT in Scope**:
- CI/CD integration
- Automated scheduling
- Multi-cluster support
- Configuration file

**Technical Considerations**:
- **Arg Parsing**: Use native `process.argv` or `yargs` library
- **Help Text**: Clearly formatted with examples
- **Exit Codes**: 0 success, 1 failure, 2 invalid usage
- **Dependencies**: Add any new dependencies to package.json
- **TypeScript**: Ensure ts-node is in devDependencies
- **Reports Directory**: Create if doesn't exist

**Acceptance Criteria**:
- [ ] `npm run e2e:trade` executes script successfully
- [ ] `npm run e2e:trade -- --help` shows usage information
- [ ] `--verbose` flag enables detailed logging
- [ ] `--cluster` flag allows custom RPC URL
- [ ] `--skip-report` skips HTML generation
- [ ] Invalid flags show error and usage
- [ ] Script creates `reports/` directory if missing
- [ ] Documentation added to README or separate file
- [ ] Prerequisites clearly stated
- [ ] Example commands provided

**Definition of Done**:
- Script fully integrated into package.json
- CLI arguments parsed correctly
- Help text informative and accurate
- Documentation complete and clear
- Script runnable with simple npm command
- Ready for developer use

---

## Validation Gates

### Environment Validation
```bash
# Verify local validator is running
solana cluster-version

# Should output cluster info without errors

# Verify programs deployed
anchor keys list

# Should show all 7 program IDs matching Anchor.toml
```

### Build Validation
```bash
# Compile TypeScript
cd contracts/solana
npx tsc --noEmit

# Should complete without errors

# Lint (if applicable)
npm run lint

# Should pass or show only warnings
```

### Execution Validation
```bash
# Terminal 1: Start local validator
solana-test-validator

# Terminal 2: Run e2e script
npm run e2e:trade

# Expected output:
# ✓ Connected to local devnet
# ✓ Loaded 7 programs
# ✓ Created 5 test users
# ✓ Initialized Hub
# ... (9 trade lifecycle steps)
# ✓ Report generated: reports/trade-lifecycle-1234567890.html
# ✓ All steps passed (Total: 345,678 CU, Fees: 20,000 tokens)

# Exit code should be 0
echo $?
```

### Report Validation
```bash
# Open generated report
npm run e2e:trade:report

# Manual checks:
# - Report opens in browser without errors
# - All sections populated
# - Charts render correctly
# - No console errors in browser devtools
# - Report is visually appealing

# Verify report exists
ls -lh reports/trade-lifecycle-latest.html

# Should show file >100KB, <2MB
```

### Performance Validation
```bash
# Run script and check CU usage
npm run e2e:trade | grep "Total Compute Units"

# Expected: Total Compute Units: < 1,000,000
# (Realistic for 9-step lifecycle with CPIs)

# Check no instruction exceeds limit
npm run e2e:trade | grep "CU)"

# Each line should show < 200,000 CU
```

### Error Handling Validation
```bash
# Test without validator running
pkill solana-test-validator
npm run e2e:trade

# Expected: Error message and exit code 1

# Test with wrong cluster
npm run e2e:trade -- --cluster https://api.devnet.solana.com

# Expected: Programs not found error (unless deployed to devnet)
```

## Success Metrics

### Primary Metrics
- ✅ Script executes complete trade lifecycle successfully
- ✅ HTML report generated with all sections
- ✅ All 9 trade steps pass
- ✅ Balances verify correctly (buyer receives trade amount - fees)
- ✅ Fee distribution matches hub configuration
- ✅ Compute units measured for all instructions
- ✅ No unhandled errors or exceptions

### Secondary Metrics
- 📊 Total compute units < 1,000,000 (reasonable for 9 steps + CPIs)
- 📊 Each instruction < 200,000 CU (Solana limit)
- 📊 Script execution time < 60 seconds (on local validator)
- 📊 Report file size < 2MB
- 📊 Report loads in <2 seconds
- 📊 Code well-commented (>10% comment ratio)

## Task Dependencies

```
Task 1 (Foundation & Setup)
    ↓
Task 3 (Hub Initialization) ← Must initialize before trades
    ↓
Task 2 (Trade Lifecycle) ← Requires setup and hub config
    ↓
Task 5 (CU Measurement) ← Integrate during execution
    ↓
Task 4 (Report Generation) ← Needs data from Tasks 2, 3, 5
    ↓
Task 6 (Error Handling) ← Add after core functionality works
    ↓
Task 7 (CLI & Docs) ← Polish and packaging
```

**Critical Path**: Tasks 1 → 3 → 2 → 4 form the critical path. Task 5 can be done in parallel with Task 2. Tasks 6 and 7 are enhancements.

## Gotchas and Considerations

### Solana-Specific Gotchas

1. **Airdrop Rate Limits**: Local validator throttles airdrops. Request large amounts (100 SOL) infrequently rather than small amounts repeatedly.

2. **Account Rent**: All accounts must be rent-exempt. For test token accounts, ensure sufficient balance for rent (~0.002 SOL).

3. **PDA Uniqueness**: PDAs must be unique. Sequential IDs (offer_id, trade_id) prevent collisions.

4. **Transaction Size**: Complex transactions can exceed size limits. Test lifecycle fits in single transactions per step.

5. **Commitment Levels**: Use 'confirmed' or 'finalized' for reading account data after writes. 'processed' may read stale data.

6. **Blockhash Expiry**: Transactions expire after ~60 seconds. Don't pre-build transactions too early.

### Anchor-Specific Gotchas

1. **Program Loading**: `anchor.workspace` works in tests but not standalone scripts. Must use `anchor.Program` with explicit IDL.

2. **IDL Types**: Import TypeScript types from `target/types/` for type safety.

3. **Account Ordering**: Accounts in instruction context must match Rust struct order exactly.

4. **Signer Arrays**: Multiple signers passed as array to `.signers([])`.

5. **PDA Bumps**: First PDA derivation finds bump, subsequent uses should use same bump.

### Testing Gotchas

1. **Local Validator State**: Validator state persists between runs. May need to restart for clean state.

2. **Token Minting**: Mint authority required for minting test tokens. Admin keypair must be mint authority.

3. **ATA Creation**: Creating ATAs costs rent (~0.002 SOL). Script must fund account creation.

4. **Fee Calculation**: Fees deducted from trade amount, not added. Buyer receives `amount - fees`, not `amount`.

5. **CPI Depth**: Solana allows max 4 CPI depth. Trade → Escrow → Token is depth 3, should be fine.

### Report Generation Gotchas

1. **Large Accounts**: Don't embed full account data in HTML (can be MBs). Show summaries with expandable details.

2. **Chart.js CDN**: Requires internet connection to load. Warn if offline or bundle library.

3. **File Permissions**: Script needs write access to `reports/` directory. Create if missing.

4. **Symlinks**: Windows doesn't always support symlinks. Handle gracefully with copy fallback.

5. **HTML Escaping**: Escape user-controlled data (contact info, descriptions) to prevent XSS in report.

### Alternative Approaches (If Issues Arise)

**If Script Too Slow**:
- Switch to Bankrun for ~10x speedup
- Reference: https://github.com/kevinheavey/solana-bankrun

**If Report Too Complex**:
- Use mochawesome by wrapping script in Mocha test
- Reference: https://www.npmjs.com/package/mochawesome

**If Compute Units Too High**:
- Split complex instructions
- Optimize account reads
- Use lookup tables for frequent accounts

**If PDA Derivation Issues**:
- Use Anchor's PDA utilities: `anchor.web3.PublicKey.findProgramAddressSync`
- Double-check seed order matches Rust program

## References

### Documentation
- **Anchor Testing Guide**: https://www.anchor-lang.com/docs/testing
- **Helius Testing Guide**: https://www.helius.dev/blog/a-guide-to-testing-solana-programs
- **Solana Stack Exchange - Testing Workflows**: https://solana.stackexchange.com/questions/21115/professional-workflow-for-anchor-tests
- **Bankrun (Fast Tests)**: https://github.com/kevinheavey/solana-bankrun
- **Mochawesome (Report Generator)**: https://www.npmjs.com/package/mochawesome
- **Jest HTML Reporter**: https://www.npmjs.com/package/jest-html-reporter
- **Chart.js Documentation**: https://www.chartjs.org/docs/latest/

### Codebase References
- **Integration Test Setup**: `tests/integration/setup.ts` (lines 1-473)
- **Complete Trade Flow**: `tests/integration/complete_trade_flow.ts` (lines 1-342)
- **PDA Utilities**: `tests/utils/index.ts` (lines 1-200)
- **Program State Definitions**: `programs/*/src/state/`
- **Instruction Handlers**: `programs/*/src/instructions/`
- **Anchor Configuration**: `Anchor.toml`
- **Program IDs**: Referenced in Anchor.toml programs.localnet

### Solana Program References
- **Hub Program**: Lines 9-235 in `programs/hub/src/lib.rs`
- **Trade Program**: Lines 10-450+ in `programs/trade/src/lib.rs`
- **Escrow Program**: Lines 11-150 in `programs/escrow/src/lib.rs`
- **Profile Program**: Lines 11-200 in `programs/profile/src/lib.rs`

### Best Practices
- **Solana Testing Best Practices**: Test beyond happy paths, validate state transitions, handle errors
- **TypeScript Style**: Use async/await, strong typing, descriptive names
- **Report Design**: Mobile-responsive, print-friendly, accessible (WCAG AA)
- **Performance**: Batch RPC calls where possible, reuse connections

## Confidence Score: 8/10

### Why 8/10:

**Strengths (+)**:
- **Clear Problem**: Need for standalone e2e test with reporting is well-defined
- **Existing Patterns**: Can closely follow existing integration tests
- **Comprehensive Context**: Detailed references to codebase and external docs
- **Proven Technologies**: Anchor, Solana Web3.js, standard HTML/CSS/JS
- **Modular Approach**: Clear task breakdown with dependencies
- **Self-Contained**: Standalone script, no complex infrastructure
- **Well-Documented**: Extensive references and gotchas included

**Minor Risks (-)**:
- **HTML Generation Complexity**: Custom HTML generation can be tedious, but template literals + Chart.js CDN is straightforward
- **Compute Unit Measurement**: Different methods (simulate vs. parse response) may give different results; need to test both
- **Local Validator Flakiness**: Sometimes test validator has issues; script should detect and report clearly

### Why Not 9-10/10:
- First implementation of standalone script (no existing pattern to copy exactly)
- HTML report design requires some trial and error for aesthetics
- CU measurement approach may need iteration if simulation doesn't match actual usage
- Edge cases in error handling may require refinement after initial implementation

### Mitigation:
- **Incremental Development**: Build foundation first, then add complexity (reports, CU measurement)
- **Test Early**: Run script frequently during development to catch issues
- **Fallbacks**: If CU measurement fails, log warning and continue (non-critical)
- **Iterative Refinement**: First pass focuses on functionality, second pass on polish

### One-Pass Viability:
**High** - With the comprehensive context, existing test patterns, and clear task breakdown, this PRP has strong potential for successful one-pass implementation. The modular approach allows course correction if issues arise. The primary challenge is aesthetic (HTML report), not functional, so even if the report isn't perfect, the core script will work.

---

**Last Updated**: November 19, 2025
**Author**: Claude Code (AI Agent)
**Status**: Ready for Implementation
**Priority**: HIGH - Validation and Documentation Tool
