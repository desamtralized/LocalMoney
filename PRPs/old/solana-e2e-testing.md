name: "Solana E2E Testing Infrastructure - Comprehensive Cross-Program Testing Suite"
description: |

## Purpose
Comprehensive PRP for implementing an end-to-end testing infrastructure for LocalMoney Solana Protocol, featuring automated local validator management, cross-program integration testing with real on-chain transactions, complete happy path trading flow validation, and advanced CPI testing across all 4 programs.

## Core Principles
1. **Real Transaction Testing**: No mocking/stubs - test with actual on-chain transactions
2. **Cross-Program Validation**: Test all CPI interactions between Trade, Offer, Profile, and Price programs
3. **Complete User Flows**: End-to-end validation of trading workflows from setup to completion
4. **Modern Testing Architecture**: Leverage Jest + Bankrun for performance while maintaining Mocha compatibility
5. **Automated Infrastructure**: Zero-manual-setup validator management and program deployment
6. **State Consistency**: Verify all account states, token balances, and reputation updates

---

## Goal
Implement a robust E2E testing infrastructure that validates the complete LocalMoney Solana trading protocol through real on-chain transactions, automated validator management, and comprehensive cross-program interaction testing.

## Why
- **Protocol Validation**: Ensure all 4 programs work together correctly in real trading scenarios
- **CPI Reliability**: Validate cross-program invocations handle errors and state changes properly
- **Trading Flow Integrity**: Test complete user journeys from profile creation to trade completion
- **Deployment Confidence**: Automated testing pipeline prevents regressions before mainnet deployment
- **Performance Baseline**: Establish metrics for transaction confirmation times and compute unit usage

## What
Complete E2E testing infrastructure with:
- Automated local validator management with background process supervision
- Cross-program integration testing with real CPI calls between all 4 programs
- Complete happy path trading flow validation between multiple test wallets
- Program deployment pipeline with key synchronization and funding verification
- Real-time wallet balance monitoring and automatic SOL airdrop management
- Advanced PDA and escrow testing with token interaction validation
- Price oracle verification and tolerance boundary testing

### Success Criteria
- [ ] All 4 programs (Trade, Offer, Profile, Price) tested in complete integration
- [ ] Happy path trade flow executes from profile creation to trade completion
- [ ] CPI error handling validated for all cross-program interactions
- [ ] Automated validator management works reliably in CI/CD environment
- [ ] Price oracle tolerance testing covers boundary conditions
- [ ] Token escrow and SPL token operations validated with real transactions
- [ ] Test suite completes in <5 minutes with >95% instruction coverage

## All Needed Context

### Documentation & References
```yaml
# MUST READ - Include these in your context window
- url: https://book.anchor-lang.com/anchor_in_depth/milestone_project_tic-tac-toe.html
  why: Anchor testing framework patterns and best practices
  critical: Use for test structure, account setup, and CPI testing patterns

- url: https://solana.com/developers/guides/advanced/testing-with-jest-and-bankrun
  why: Modern Solana testing with Jest and Bankrun for faster execution
  critical: Replaces solana-test-validator for better performance and control

- url: https://www.anchor-lang.com/docs/cross-program-invocations
  why: Cross-Program Invocation patterns for testing program interactions
  critical: Required for Trade → Price → Profile CPI testing

- url: https://solana.com/developers/guides/getstarted/solana-test-validator
  why: Local validator setup and management for traditional testing approach
  critical: Fallback approach and CI/CD validator automation

- url: https://spl.solana.com/token
  why: SPL Token program integration for token escrow testing
  critical: Required for understanding token operations in trade flow

- url: https://solanacookbook.com/guides/debugging-solana-programs.html
  why: Debugging strategies for complex cross-program scenarios
  critical: Error handling and troubleshooting CPI failures

- url: https://medium.com/@ancilartech/mastering-cross-program-invocations-in-anchor-a-developers-guide-to-solana-s-cpi-patterns-0f29a5734a3e
  why: Advanced CPI patterns and security considerations
  critical: Best practices for testing complex program interactions

- file: contracts/solana/Anchor.toml
  why: Current Anchor configuration and program IDs
  critical: Program IDs, wallet paths, and testing configuration

- file: contracts/solana/tests/utils.ts
  why: Existing testing utilities and patterns
  critical: Token operations, airdrops, account creation patterns

- file: contracts/solana/tests/price.test.ts
  why: Current price program testing approach
  critical: Oracle initialization, price updates, tolerance testing patterns

- file: contracts/solana/tests/trade.test.ts
  why: Current trade program testing with CPI examples
  critical: Trade lifecycle, escrow management, profile interaction patterns

- file: contracts/solana/sdk/src/clients/
  why: Program client implementations for all 4 programs
  critical: Type-safe interaction patterns and account management
```

### Current Testing Infrastructure Analysis
```typescript
// Existing Structure (contracts/solana/)
├── Anchor.toml (configured for localnet testing)
├── programs/
│   ├── trade/src/lib.rs
│   ├── price/src/lib.rs  
│   ├── profile/src/lib.rs
│   └── offer/src/lib.rs
├── sdk/src/clients/ (TypeScript clients for all programs)
├── tests/
│   ├── utils.ts (token utilities, airdrops, delays)
│   ├── price.test.ts (oracle testing)
│   ├── trade.test.ts (trade lifecycle with CPI)
│   └── package.json (Mocha + Chai setup)

// Key Patterns from Existing Tests
- Uses @project-serum/anchor v0.26.0
- Mocha + Chai testing framework
- Manual test wallet funding with airdrops
- Program client classes for type-safe interactions
- CPI testing in trade.test.ts shows cross-program patterns
- Token operations use @solana/spl-token utilities
```

### Program Interaction Architecture
```rust
// Cross-Program Dependencies (from trade.test.ts analysis)
Trade Program {
    // CPI to Price Program for price verification
    price_verification: {
        program: PRICE_PROGRAM_ID,
        account: priceOracle,
        instruction: "verify_price_for_trade"
    },
    
    // CPI to Profile Program for reputation updates  
    profile_updates: {
        program: PROFILE_PROGRAM_ID,
        accounts: [buyerProfile, sellerProfile],
        instruction: "update_trade_completion"
    }
}

Offer Program {
    // References Trade Program for escrow management
    trade_integration: {
        program: TRADE_PROGRAM_ID,
        instruction: "create_trade_from_offer"
    }
}

// All Programs use SPL Token Program
SPL_TOKEN_DEPENDENCIES = {
    mint_operations: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    escrow_transfers: "token_transfer_with_escrow",
    account_creation: "create_associated_token_account"
}
```

### Implementation Blueprint

```typescript
// 1. Enhanced Testing Infrastructure Setup
// File: contracts/solana/tests/infrastructure/validator-manager.ts
export class ValidatorManager {
  private static instance: ValidatorManager;
  private validatorProcess: ChildProcess | null = null;
  private isRunning = false;

  async startValidator(): Promise<void> {
    // Check if validator already running on port 8899
    const isAlreadyRunning = await this.checkValidatorStatus();
    if (isAlreadyRunning) {
      console.log("Validator already running, reusing...");
      return;
    }

    // Launch solana-test-validator with program deployments
    this.validatorProcess = spawn('solana-test-validator', [
      '--bpf-program', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'tests/fixtures/token.so',
      '--reset',
      '--quiet'
    ], { detached: true });

    await this.waitForValidator();
    this.isRunning = true;
  }

  async deployPrograms(): Promise<void> {
    // Execute deployment pipeline
    await execAsync('anchor keys sync');
    await execAsync('anchor build');
    await execAsync('anchor deploy --provider.cluster localnet');
    await delay(2000); // Wait for deployment confirmation
  }
}

// 2. Modern Testing Framework Integration (Jest + Bankrun)
// File: contracts/solana/tests/e2e/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/e2e'],
  testMatch: ['**/*.e2e.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/setup/jest.setup.ts'],
  testTimeout: 60000,
  maxWorkers: 1, // Sequential execution for blockchain tests
};

// 3. Bankrun E2E Test Example
// File: contracts/solana/tests/e2e/complete-trade-flow.e2e.test.ts
import { startAnchor } from "solana-bankrun";
import { PriceClient } from "../sdk/src/clients/price";
import { TradeClient } from "../sdk/src/clients/trade";
import { ProfileClient } from "../sdk/src/clients/profile";
import { OfferClient } from "../sdk/src/clients/offer";

describe("Complete Trading Flow E2E", () => {
  let context: any;
  let provider: AnchorProvider;
  let priceClient: PriceClient;
  let tradeClient: TradeClient;
  let profileClient: ProfileClient;
  let offerClient: OfferClient;

  beforeAll(async () => {
    // Start Bankrun with all programs
    context = await startAnchor("", [{
      name: "price", programId: PRICE_PROGRAM_ID
    }, {
      name: "trade", programId: TRADE_PROGRAM_ID  
    }, {
      name: "profile", programId: PROFILE_PROGRAM_ID
    }, {
      name: "offer", programId: OFFER_PROGRAM_ID
    }], []);

    provider = new AnchorProvider(context.banksClient, context.payer, {});
    
    // Initialize all clients
    priceClient = new PriceClient(PRICE_PROGRAM_ID, provider, priceIdl);
    tradeClient = new TradeClient(TRADE_PROGRAM_ID, provider, tradeIdl);
    profileClient = new ProfileClient(PROFILE_PROGRAM_ID, provider, profileIdl);
    offerClient = new OfferClient(OFFER_PROGRAM_ID, provider, offerIdl);
  });

  it("executes complete happy path trade flow", async () => {
    // 1. Setup Phase: Create and fund test wallets
    const seller = Keypair.generate();
    const buyer = Keypair.generate();
    const priceOracle = Keypair.generate();
    
    await fundAccount(context, seller.publicKey, 10 * LAMPORTS_PER_SOL);
    await fundAccount(context, buyer.publicKey, 10 * LAMPORTS_PER_SOL);
    await fundAccount(context, priceOracle.publicKey, 10 * LAMPORTS_PER_SOL);

    // 2. Deploy programs and initialize price oracle
    await priceClient.initialize(priceOracle, context.payer);
    await priceClient.updatePrices(priceOracle.publicKey, context.payer, [{
      currency: "USD",
      usdPrice: new BN(100_000), // $1.00 with 5 decimals
      updatedAt: new BN(Math.floor(Date.now() / 1000))
    }]);

    // 3. Profile Creation: Both trader wallets create user profiles
    const buyerProfile = await profileClient.createProfile(buyer, "test_buyer");
    const sellerProfile = await profileClient.createProfile(seller, "test_seller");

    // 4. Token Setup: Create test token mint and distribute tokens
    const tokenMint = await createTokenMint(
      context.banksClient,
      context.payer,
      context.payer.publicKey,
      null,
      6
    );

    const sellerTokenAccount = await createTokenAccount(
      context.banksClient,
      context.payer,
      tokenMint,
      seller.publicKey
    );

    const buyerTokenAccount = await createTokenAccount(
      context.banksClient,
      context.payer,
      tokenMint,
      buyer.publicKey
    );

    await mintTokens(
      context.banksClient,
      context.payer,
      tokenMint,
      sellerTokenAccount,
      context.payer,
      1000_000_000 // 1000 tokens
    );

    // 5. Offer Creation: Seller creates offer with constraints
    const amount = new BN(100_000_000); // 100 tokens
    const pricePerToken = new BN(100_000); // $1.00 per token

    const offerPDA = await offerClient.createOffer(
      seller,
      tokenMint,
      amount,
      pricePerToken,
      "USD", // fiat currency
      { minAmount: new BN(10_000_000), maxAmount: amount }
    );

    // 6. Trade Initiation: Buyer accepts offer, tokens transferred to escrow
    const escrowKeypair = Keypair.generate();
    const tradePDA = await tradeClient.createTradeFromOffer(
      buyer,
      offerPDA,
      escrowKeypair,
      new BN(50_000_000) // 50 tokens
    );

    // Verify escrow received tokens
    const escrowBalance = await getTokenBalance(context.banksClient, escrowKeypair.publicKey);
    expect(escrowBalance).toBe(50_000_000);

    // 7. Price Verification: Oracle validates trade price within tolerance
    await tradeClient.acceptTrade(tradePDA, buyer);

    // 8. Trade Completion: Escrow releases tokens, profiles updated
    await tradeClient.completeTrade(
      tradePDA,
      seller,
      buyer,
      escrowKeypair.publicKey,
      buyerTokenAccount,
      priceOracle.publicKey,
      PRICE_PROGRAM_ID,
      buyerProfile,
      sellerProfile,
      PROFILE_PROGRAM_ID
    );

    // 9. Verification: Assert all state changes
    const completedTrade = await tradeClient.getTrade(tradePDA);
    expect(completedTrade.status).toBe('completed');

    const finalBuyerBalance = await getTokenBalance(context.banksClient, buyerTokenAccount);
    expect(finalBuyerBalance).toBe(50_000_000); // Received 50 tokens

    const updatedBuyerProfile = await profileClient.getProfile(buyerProfile);
    const updatedSellerProfile = await profileClient.getProfile(sellerProfile);
    expect(updatedBuyerProfile.tradeCount).toBe(1);
    expect(updatedSellerProfile.tradeCount).toBe(1);
  });

  it("handles price tolerance violations", async () => {
    // Test scenario where oracle price deviates beyond tolerance
    const seller = Keypair.generate();
    const buyer = Keypair.generate();
    
    // Setup trade with current price
    const tradePDA = await setupBasicTrade(seller, buyer, new BN(100_000));

    // Update oracle with significantly different price (outside tolerance)
    await priceClient.updatePrices(priceOracle.publicKey, context.payer, [{
      currency: "USD",
      usdPrice: new BN(150_000), // $1.50 - 50% increase
      updatedAt: new BN(Math.floor(Date.now() / 1000))
    }]);

    // Attempt to complete trade should fail
    await expect(tradeClient.completeTrade(
      tradePDA,
      seller,
      buyer,
      escrowTokenAccount,
      buyerTokenAccount,
      priceOracle.publicKey,
      PRICE_PROGRAM_ID,
      buyerProfile,
      sellerProfile,
      PROFILE_PROGRAM_ID
    )).rejects.toThrow("PriceOutOfRange");
  });

  it("validates CPI error propagation", async () => {
    // Test CPI failure scenarios and error handling
    const seller = Keypair.generate();
    const buyer = Keypair.generate();
    
    const tradePDA = await setupBasicTrade(seller, buyer, new BN(100_000));

    // Test with invalid profile account to trigger CPI error
    const invalidProfile = Keypair.generate().publicKey;

    await expect(tradeClient.completeTrade(
      tradePDA,
      seller,
      buyer,
      escrowTokenAccount,
      buyerTokenAccount,
      priceOracle.publicKey,
      PRICE_PROGRAM_ID,
      invalidProfile, // Invalid profile should cause CPI failure
      sellerProfile,
      PROFILE_PROGRAM_ID
    )).rejects.toThrow("AccountNotInitialized");
  });
});

// 4. Infrastructure Automation Scripts
// File: contracts/solana/scripts/test-env-setup.sh
#!/bin/bash

# Check if validator is running
if lsof -Pi :8899 -sTCP:LISTEN -t >/dev/null ; then
    echo "Validator already running on port 8899"
else
    echo "Starting solana-test-validator..."
    solana-test-validator --reset --quiet &
    sleep 10 # Wait for validator startup
fi

# Deploy programs
echo "Building and deploying programs..."
anchor keys sync
anchor build
anchor deploy --provider.cluster localnet

# Verify deployment
echo "Verifying program deployment..."
solana program show $PRICE_PROGRAM_ID --url localhost
solana program show $TRADE_PROGRAM_ID --url localhost
solana program show $PROFILE_PROGRAM_ID --url localhost
solana program show $OFFER_PROGRAM_ID --url localhost

echo "Test environment ready!"

// 5. Enhanced Wallet and Token Management
// File: contracts/solana/tests/utils/test-env-manager.ts
export class TestEnvironmentManager {
  private wallets: Map<string, Keypair> = new Map();
  private tokenMints: Map<string, PublicKey> = new Map();

  async createTestWallet(name: string, fundingAmount = 10): Promise<Keypair> {
    const wallet = Keypair.generate();
    this.wallets.set(name, wallet);
    
    await this.fundWallet(wallet.publicKey, fundingAmount);
    return wallet;
  }

  async fundWallet(publicKey: PublicKey, solAmount: number): Promise<void> {
    const balance = await this.connection.getBalance(publicKey);
    if (balance < solAmount * LAMPORTS_PER_SOL * 0.8) { // Fund if below 80% threshold
      await airdropSol(this.connection, publicKey, solAmount);
      await delay(1000);
    }
  }

  async createTestToken(name: string, decimals = 6): Promise<PublicKey> {
    const mint = await createTokenMint(
      this.connection,
      this.payer,
      this.payer.publicKey,
      null,
      decimals
    );
    
    this.tokenMints.set(name, mint);
    return mint;
  }

  async distributeTokens(tokenName: string, recipients: Array<{wallet: PublicKey, amount: number}>): Promise<void> {
    const mint = this.tokenMints.get(tokenName);
    if (!mint) throw new Error(`Token ${tokenName} not found`);

    for (const recipient of recipients) {
      const tokenAccount = await createTokenAccount(
        this.connection,
        this.payer,
        mint,
        recipient.wallet
      );

      await mintTokens(
        this.connection,
        this.payer,
        mint,
        tokenAccount,
        this.payer,
        recipient.amount
      );
    }
  }
}
```

### Task Implementation Order

#### Phase 1: Infrastructure Enhancement (Days 1-2)
1. **Modern Testing Framework Setup**
   - Install Jest and Bankrun dependencies: `npm install --save-dev jest @types/jest ts-jest solana-bankrun`
   - Create Jest configuration for E2E tests
   - Set up Bankrun integration for faster testing
   - Create validator management utilities

2. **Enhanced Build/Deploy Automation**
   - Create deployment pipeline scripts
   - Implement program deployment verification
   - Add automated key synchronization
   - Set up environment variable management

#### Phase 2: Cross-Program Integration Testing (Days 3-4)
1. **CPI Testing Infrastructure**
   - Enhance Trade → Price integration tests
   - Implement Trade → Profile CPI validation
   - Create Offer → Trade flow testing
   - Add error propagation testing for failed CPIs

2. **Account State Validation**
   - Implement comprehensive PDA verification
   - Add token balance tracking utilities
   - Create reputation consistency checking
   - Build escrow state validation

#### Phase 3: Complete E2E Workflows (Days 5-6)
1. **Happy Path Implementation**
   - Complete trade lifecycle from profile creation to completion
   - Multi-user concurrent trading scenarios
   - Token escrow and release validation
   - Oracle price verification integration

2. **Edge Case and Error Testing**
   - Price tolerance boundary testing
   - Failed trade cleanup scenarios
   - Resource exhaustion testing
   - Invalid input validation

#### Phase 4: Performance and CI/CD (Days 7-8)
1. **Performance Optimization**
   - Implement parallel test execution where possible
   - Add performance benchmarking utilities
   - Monitor compute unit consumption
   - Optimize test data setup/teardown

2. **CI/CD Integration**
   - Create GitHub Actions workflow
   - Implement automated validator management
   - Add test result reporting
   - Set up performance regression detection

### Validation Gates

```bash
# Traditional Mocha tests (maintain compatibility)
cd contracts/solana/tests
npm run test:all

# New Jest E2E tests  
cd contracts/solana/tests
npm run test:e2e

# Full integration test suite
npm run test:integration

# Performance benchmarks
npm run test:performance

# CI/CD validation
npm run test:ci

# Coverage analysis
npm run test:coverage

# Specific test suites
npm run test:cross-program
npm run test:happy-path
npm run test:error-scenarios
```

### Environment Setup Commands

```bash
# Install new dependencies
npm install --save-dev jest @types/jest ts-jest solana-bankrun

# Set up test environment
chmod +x scripts/test-env-setup.sh
./scripts/test-env-setup.sh

# Verify program deployment
anchor keys list
solana program show $PRICE_PROGRAM_ID --url localhost

# Run validator health check
solana cluster-version --url localhost

# Clean test environment
./scripts/test-env-cleanup.sh
```

### Error Handling Strategy

1. **CPI Failures**: Test all cross-program invocation error scenarios
2. **Price Oracle Issues**: Handle stale prices, invalid currencies, out-of-tolerance scenarios  
3. **Token Operation Failures**: Insufficient balances, invalid accounts, authorization errors
4. **Profile Management**: Invalid usernames, reputation overflow/underflow, concurrent updates
5. **Escrow Security**: Unauthorized withdrawals, invalid escrow states, token custody validation
6. **Network Issues**: Transaction timeouts, validator unavailability, account confirmation delays

### Critical Success Factors

1. **Real Transaction Testing**: No mocked interactions - all tests use actual blockchain operations
2. **Complete Program Coverage**: All 4 programs tested individually and in integration
3. **CPI Reliability**: Cross-program invocations tested for success and failure paths
4. **State Consistency**: All account states verified after each operation
5. **Performance Standards**: Test suite completes reliably in CI/CD environment
6. **Error Resilience**: Comprehensive error scenario coverage with proper cleanup

## Confidence Score: 9/10

This PRP provides comprehensive context for implementing a robust Solana E2E testing infrastructure. The confidence is high due to:

- **Clear Technical Foundation**: Detailed analysis of existing codebase and patterns
- **Modern Tooling Integration**: Jest + Bankrun for performance with Mocha compatibility
- **Complete Implementation Blueprint**: Working code examples for all major components  
- **Proven Testing Strategies**: Based on 2025 Solana testing best practices and community standards
- **Executable Validation**: Clear success criteria and validation commands
- **Risk Mitigation**: Comprehensive error handling and edge case coverage

The slight uncertainty comes from the complexity of cross-program state management and potential timing issues in async blockchain operations, but the implementation strategy accounts for these challenges with proper confirmation checks and retry logic.