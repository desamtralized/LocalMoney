#!/usr/bin/env ts-node

/**
 * End-to-End Integration Test for LocalMoney SDK
 * 
 * This test suite validates the SDK against the deployed protocol on localnet.
 * It tests real interactions with the blockchain and verifies:
 * - SDK initialization and configuration
 * - PDA generation accuracy
 * - Connection to deployed programs
 * - Account fetching and validation
 * - Protocol status verification
 * - Utility functions correctness
 */

import { 
  LocalMoneySDK,
  quickStart,
  Keypair,
  PublicKey,
  Connection,
  FiatCurrency,
  OfferType,
  TradeState,
  CONSTANTS,
  ENDPOINTS
} from '../dist/simple-index';
import BN from 'bn.js';

// Test configuration
const TEST_CONFIG = {
  rpcEndpoint: 'http://localhost:8899',
  timeout: 30000, // 30 seconds
  commitment: 'confirmed' as const,
};

// Expected program addresses from deployment
const EXPECTED_PROGRAM_ADDRESSES = {
  hub: 'J5FDxQmMpiF4vqKBSWQS3JRGLyE8djRgoHF8QQJJKWM1',
  profile: '6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k',
  price: '7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1',
  offer: 'DGjiY2hKsDpffEgBckNfrAkDt6B5jSxwsHshyQ1cRiP9',
  trade: 'AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM',
  arbitration: '3XkiY4D1FBnpKHpuT2pi3AhnZ2WcXXGSsR4vSYJ87RbR',
};

// Test result tracking
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class E2ETestRunner {
  private results: TestResult[] = [];
  private sdk!: LocalMoneySDK;
  private connection!: Connection;
  private testKeypair!: Keypair;

  async runAllTests(): Promise<void> {
    console.log('🧪 Starting LocalMoney SDK E2E Integration Tests');
    console.log('=' .repeat(60));
    console.log(`RPC Endpoint: ${TEST_CONFIG.rpcEndpoint}`);
    console.log(`Timeout: ${TEST_CONFIG.timeout}ms`);
    console.log('=' .repeat(60));
    console.log();

    const startTime = Date.now();

    try {
      await this.setupTest();
      await this.runTests();
      await this.teardownTest();
    } catch (error) {
      console.error('❌ Fatal error during test setup:', error);
      process.exit(1);
    }

    const totalTime = Date.now() - startTime;
    this.printResults(totalTime);
  }

  private async setupTest(): Promise<void> {
    console.log('🔧 Setting up test environment...');
    
    // Create SDK instance
    this.testKeypair = Keypair.generate();
    this.sdk = await quickStart({
      keypair: this.testKeypair,
      endpoint: TEST_CONFIG.rpcEndpoint
    });
    
    this.connection = this.sdk.getConnection();
    
    console.log('✅ Test environment ready');
    console.log(`Test wallet: ${this.testKeypair.publicKey.toString()}`);
    console.log();
  }

  private async teardownTest(): Promise<void> {
    // No cleanup needed for read-only tests
  }

  private async runTests(): Promise<void> {
    // Core SDK tests
    await this.runTest('SDK Initialization', this.testSDKInitialization.bind(this));
    await this.runTest('Program Address Validation', this.testProgramAddresses.bind(this));
    await this.runTest('Connection Health Check', this.testConnectionHealth.bind(this));
    
    // PDA generation tests
    await this.runTest('PDA Generation', this.testPDAGeneration.bind(this));
    await this.runTest('PDA Consistency', this.testPDAConsistency.bind(this));
    
    // Account existence tests (read-only)
    await this.runTest('Protocol Account Validation', this.testProtocolAccounts.bind(this));
    
    // Utility function tests
    await this.runTest('Amount Formatting', this.testAmountFormatting.bind(this));
    await this.runTest('Fee Calculations', this.testFeeCalculations.bind(this));
    await this.runTest('BPS Conversions', this.testBPSConversions.bind(this));
    
    // Protocol validation tests
    await this.runTest('Protocol Constants', this.testProtocolConstants.bind(this));
    await this.runTest('Enum Definitions', this.testEnumDefinitions.bind(this));
    
    // Integration tests
    await this.runTest('Multi-Program PDA Generation', this.testMultiProgramPDAs.bind(this));
    await this.runTest('Complex Calculations', this.testComplexCalculations.bind(this));
  }

  private async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`🏃 Running: ${name}...`);
      await testFn();
      const duration = Date.now() - startTime;
      
      this.results.push({
        name,
        passed: true,
        duration
      });
      
      console.log(`✅ Passed: ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.results.push({
        name,
        passed: false,
        error: errorMessage,
        duration
      });
      
      console.log(`❌ Failed: ${name} (${duration}ms)`);
      console.log(`   Error: ${errorMessage}`);
    }
    console.log();
  }

  // Test implementations
  
  private async testSDKInitialization(): Promise<void> {
    if (!this.sdk) {
      throw new Error('SDK not initialized');
    }
    
    if (!this.sdk.programAddresses) {
      throw new Error('Program addresses not set');
    }
    
    if (!this.sdk.getConnection()) {
      throw new Error('Connection not available');
    }
    
    if (!this.sdk.getProvider()) {
      throw new Error('Provider not available');
    }
  }

  private async testProgramAddresses(): Promise<void> {
    const addresses = this.sdk.programAddresses;
    
    // Validate all expected programs are present
    const requiredPrograms = ['hub', 'profile', 'price', 'offer', 'trade', 'arbitration'];
    for (const program of requiredPrograms) {
      if (!(program in addresses)) {
        throw new Error(`Missing program address: ${program}`);
      }
    }
    
    // Validate addresses match expected deployment
    for (const [program, expectedAddress] of Object.entries(EXPECTED_PROGRAM_ADDRESSES)) {
      const actualAddress = (addresses as any)[program].toString();
      if (actualAddress !== expectedAddress) {
        throw new Error(`Program ${program} address mismatch. Expected: ${expectedAddress}, Got: ${actualAddress}`);
      }
    }
  }

  private async testConnectionHealth(): Promise<void> {
    try {
      const blockHeight = await this.connection.getBlockHeight();
      if (blockHeight <= 0) {
        throw new Error('Invalid block height received');
      }
      
      const slot = await this.connection.getSlot();
      if (slot <= 0) {
        throw new Error('Invalid slot received');
      }
      
      console.log(`   Current block height: ${blockHeight}`);
      console.log(`   Current slot: ${slot}`);
      
    } catch (error) {
      throw new Error(`Connection health check failed: ${error}`);
    }
  }

  private async testPDAGeneration(): Promise<void> {
    // Test Hub PDAs
    const [globalConfigPDA, globalConfigBump] = this.sdk.getGlobalConfigPDA();
    if (!globalConfigPDA || globalConfigBump < 0 || globalConfigBump > 255) {
      throw new Error('Invalid global config PDA generation');
    }
    
    // Test Profile PDAs
    const [profilePDA, profileBump] = this.sdk.getProfilePDA(this.testKeypair.publicKey);
    if (!profilePDA || profileBump < 0 || profileBump > 255) {
      throw new Error('Invalid profile PDA generation');
    }
    
    // Test Price PDAs
    const [priceConfigPDA, priceConfigBump] = this.sdk.getPriceConfigPDA();
    if (!priceConfigPDA || priceConfigBump < 0 || priceConfigBump > 255) {
      throw new Error('Invalid price config PDA generation');
    }
    
    const [usdPricePDA, usdPriceBump] = this.sdk.getCurrencyPricePDA(FiatCurrency.USD);
    if (!usdPricePDA || usdPriceBump < 0 || usdPriceBump > 255) {
      throw new Error('Invalid USD price PDA generation');
    }
    
    // Test Offer PDAs
    const [offerPDA, offerBump] = this.sdk.getOfferPDA(new BN(1));
    if (!offerPDA || offerBump < 0 || offerBump > 255) {
      throw new Error('Invalid offer PDA generation');
    }
    
    // Test Trade PDAs
    const [tradePDA, tradeBump] = this.sdk.getTradePDA(new BN(1));
    if (!tradePDA || tradeBump < 0 || tradeBump > 255) {
      throw new Error('Invalid trade PDA generation');
    }
    
    console.log(`   Generated ${6} different PDA types successfully`);
  }

  private async testPDAConsistency(): Promise<void> {
    // Test that same inputs produce same PDAs
    const user = this.testKeypair.publicKey;
    
    const [pda1, bump1] = this.sdk.getProfilePDA(user);
    const [pda2, bump2] = this.sdk.getProfilePDA(user);
    
    if (!pda1.equals(pda2) || bump1 !== bump2) {
      throw new Error('PDA generation is not consistent');
    }
    
    // Test different inputs produce different PDAs
    const otherUser = Keypair.generate().publicKey;
    const [otherPDA, otherBump] = this.sdk.getProfilePDA(otherUser);
    
    if (pda1.equals(otherPDA)) {
      throw new Error('Different users should produce different PDAs');
    }
    
    console.log(`   PDA consistency verified for profile accounts`);
  }

  private async testProtocolAccounts(): Promise<void> {
    // Test if we can check account existence (they may not exist yet, but shouldn't error)
    const [globalConfigPDA] = this.sdk.getGlobalConfigPDA();
    
    try {
      const accountInfo = await this.connection.getAccountInfo(globalConfigPDA);
      if (accountInfo) {
        console.log(`   Global config account exists (${accountInfo.data.length} bytes)`);
      } else {
        console.log(`   Global config account not found (may not be initialized)`);
      }
    } catch (error) {
      // This is okay - the account might not exist yet
      console.log(`   Could not fetch global config account info`);
    }
    
    // Test program account existence
    for (const [name, programId] of Object.entries(this.sdk.programAddresses)) {
      try {
        const accountInfo = await this.connection.getAccountInfo(programId);
        if (accountInfo && accountInfo.executable) {
          console.log(`   Program ${name} is deployed and executable`);
        } else {
          throw new Error(`Program ${name} is not executable`);
        }
      } catch (error) {
        throw new Error(`Failed to verify program ${name}: ${error}`);
      }
    }
  }

  private async testAmountFormatting(): Promise<void> {
    // Test amount formatting
    const testCases = [
      { lamports: new BN(1000000000), expected: '1' },
      { lamports: new BN(1500000000), expected: '1.5' },
      { lamports: new BN(123456789), expected: '0.123456789' },
      { lamports: new BN(1000000), expected: '0.001' },
    ];
    
    for (const testCase of testCases) {
      const formatted = LocalMoneySDK.formatAmount(testCase.lamports, 9);
      if (formatted !== testCase.expected) {
        throw new Error(`Format mismatch: ${testCase.lamports.toString()} -> expected ${testCase.expected}, got ${formatted}`);
      }
    }
    
    // Test amount parsing
    const parseCases = [
      { input: '1', expected: new BN(1000000000) },
      { input: '1.5', expected: new BN(1500000000) },
      { input: '0.001', expected: new BN(1000000) },
    ];
    
    for (const testCase of parseCases) {
      const parsed = LocalMoneySDK.parseAmount(testCase.input, 9);
      if (!parsed.eq(testCase.expected)) {
        throw new Error(`Parse mismatch: ${testCase.input} -> expected ${testCase.expected.toString()}, got ${parsed.toString()}`);
      }
    }
    
    console.log(`   Verified ${testCases.length} formatting and ${parseCases.length} parsing cases`);
  }

  private async testFeeCalculations(): Promise<void> {
    const amount = new BN(1000000000); // 1 SOL
    
    // Test various fee percentages
    const testCases = [
      { bps: 250, expectedLamports: 25000000 }, // 2.5% of 1 SOL
      { bps: 100, expectedLamports: 10000000 }, // 1% of 1 SOL
      { bps: 50, expectedLamports: 5000000 },   // 0.5% of 1 SOL
    ];
    
    for (const testCase of testCases) {
      const fee = LocalMoneySDK.calculateFee(amount, testCase.bps);
      if (!fee.eq(new BN(testCase.expectedLamports))) {
        throw new Error(`Fee calculation error: ${testCase.bps} BPS of ${amount.toString()} should be ${testCase.expectedLamports}, got ${fee.toString()}`);
      }
    }
    
    console.log(`   Verified ${testCases.length} fee calculation cases`);
  }

  private async testBPSConversions(): Promise<void> {
    const testCases = [
      { bps: 250, percentage: 2.5 },
      { bps: 100, percentage: 1.0 },
      { bps: 50, percentage: 0.5 },
      { bps: 1000, percentage: 10.0 },
    ];
    
    for (const testCase of testCases) {
      const percentage = LocalMoneySDK.bpsToPercentage(testCase.bps);
      const bps = LocalMoneySDK.percentageToBps(testCase.percentage);
      
      if (percentage !== testCase.percentage) {
        throw new Error(`BPS to percentage conversion error: ${testCase.bps} BPS should be ${testCase.percentage}%, got ${percentage}%`);
      }
      
      if (bps !== testCase.bps) {
        throw new Error(`Percentage to BPS conversion error: ${testCase.percentage}% should be ${testCase.bps} BPS, got ${bps} BPS`);
      }
    }
    
    console.log(`   Verified ${testCases.length} BPS conversion cases`);
  }

  private async testProtocolConstants(): Promise<void> {
    // Verify constants are properly defined
    if (typeof CONSTANTS.MAX_PLATFORM_FEE_BPS !== 'number' || CONSTANTS.MAX_PLATFORM_FEE_BPS !== 1000) {
      throw new Error('Invalid MAX_PLATFORM_FEE_BPS constant');
    }
    
    if (typeof CONSTANTS.PRICE_PRECISION !== 'number' || CONSTANTS.PRICE_PRECISION !== 100000000) {
      throw new Error('Invalid PRICE_PRECISION constant');
    }
    
    if (typeof CONSTANTS.AMOUNT_PRECISION !== 'number' || CONSTANTS.AMOUNT_PRECISION !== 1000000000) {
      throw new Error('Invalid AMOUNT_PRECISION constant');
    }
    
    console.log(`   Protocol constants validated: ${Object.keys(CONSTANTS).length} constants`);
  }

  private async testEnumDefinitions(): Promise<void> {
    // Test FiatCurrency enum
    const currencies = Object.values(FiatCurrency);
    if (!currencies.includes(FiatCurrency.USD) || !currencies.includes(FiatCurrency.EUR)) {
      throw new Error('FiatCurrency enum missing expected values');
    }
    
    // Test OfferType enum
    const offerTypes = Object.values(OfferType);
    if (!offerTypes.includes(OfferType.Buy) || !offerTypes.includes(OfferType.Sell)) {
      throw new Error('OfferType enum missing expected values');
    }
    
    // Test TradeState enum
    const tradeStates = Object.values(TradeState);
    if (!tradeStates.includes(TradeState.RequestCreated) || !tradeStates.includes(TradeState.EscrowReleased)) {
      throw new Error('TradeState enum missing expected values');
    }
    
    console.log(`   Validated enums: ${currencies.length} currencies, ${offerTypes.length} offer types, ${tradeStates.length} trade states`);
  }

  private async testMultiProgramPDAs(): Promise<void> {
    const user = this.testKeypair.publicKey;
    const offerId = new BN(42);
    const tradeId = new BN(123);
    
    // Generate PDAs for different programs
    const pdas = {
      globalConfig: this.sdk.getGlobalConfigPDA(),
      profile: this.sdk.getProfilePDA(user),
      priceConfig: this.sdk.getPriceConfigPDA(),
      usdPrice: this.sdk.getCurrencyPricePDA(FiatCurrency.USD),
      eurPrice: this.sdk.getCurrencyPricePDA(FiatCurrency.EUR),
      offer: this.sdk.getOfferPDA(offerId),
      trade: this.sdk.getTradePDA(tradeId),
    };
    
    // Verify all PDAs are unique
    const addresses = Object.values(pdas).map(([pda]) => pda.toString());
    const uniqueAddresses = new Set(addresses);
    
    if (uniqueAddresses.size !== addresses.length) {
      throw new Error('Generated PDAs are not unique');
    }
    
    // Verify all bumps are valid
    for (const [name, [pda, bump]] of Object.entries(pdas)) {
      if (bump < 0 || bump > 255) {
        throw new Error(`Invalid bump for ${name}: ${bump}`);
      }
    }
    
    console.log(`   Generated ${addresses.length} unique PDAs across all programs`);
  }

  private async testComplexCalculations(): Promise<void> {
    // Test complex fee distribution scenario
    const tradeAmount = new BN(5000000000); // 5 SOL
    const fees = {
      chain: 50,     // 0.5%
      burn: 25,      // 0.25%
      warchest: 100, // 1%
      arbitration: 200, // 2%
    };
    
    const chainFee = LocalMoneySDK.calculateFee(tradeAmount, fees.chain);
    const burnFee = LocalMoneySDK.calculateFee(tradeAmount, fees.burn);
    const warchestFee = LocalMoneySDK.calculateFee(tradeAmount, fees.warchest);
    const arbitrationFee = LocalMoneySDK.calculateFee(tradeAmount, fees.arbitration);
    
    const totalFees = chainFee.add(burnFee).add(warchestFee).add(arbitrationFee);
    const netAmount = tradeAmount.sub(totalFees);
    
    // Verify total fee percentage
    const totalBps = Object.values(fees).reduce((sum, bps) => sum + bps, 0);
    const expectedTotalFee = LocalMoneySDK.calculateFee(tradeAmount, totalBps);
    
    if (!totalFees.eq(expectedTotalFee)) {
      throw new Error('Complex fee calculation mismatch');
    }
    
    // Verify net amount is reasonable
    if (netAmount.lte(new BN(0)) || netAmount.gte(tradeAmount)) {
      throw new Error('Invalid net amount after fee deduction');
    }
    
    console.log(`   Complex calculation verified: ${LocalMoneySDK.formatAmount(tradeAmount, 9)} SOL -> ${LocalMoneySDK.formatAmount(netAmount, 9)} SOL net`);
  }

  private printResults(totalTime: number): void {
    console.log('📊 Test Results Summary');
    console.log('=' .repeat(60));
    
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => r.passed === false).length;
    const total = this.results.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    console.log(`Total Time: ${totalTime}ms`);
    console.log();
    
    if (failed > 0) {
      console.log('❌ Failed Tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(result => {
          console.log(`  • ${result.name}: ${result.error}`);
        });
      console.log();
    }
    
    console.log('📋 Detailed Results:');
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`  ${status} ${result.name} (${result.duration}ms)`);
    });
    
    console.log();
    
    if (failed === 0) {
      console.log('🎉 All tests passed! SDK is working correctly with the deployed protocol.');
    } else {
      console.log(`⚠️  ${failed} test(s) failed. Please review the errors above.`);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const runner = new E2ETestRunner();
  await runner.runAllTests();
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

// Run the tests
if (require.main === module) {
  main().catch(console.error);
}

export { E2ETestRunner };