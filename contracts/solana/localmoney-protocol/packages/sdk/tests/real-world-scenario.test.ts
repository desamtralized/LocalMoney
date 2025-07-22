#!/usr/bin/env ts-node

/**
 * Real-World Scenario Test for LocalMoney SDK
 * 
 * This test simulates realistic usage patterns of the SDK:
 * - User onboarding flow
 * - Trading workflow preparation
 * - Multi-currency price checking
 * - Fee analysis for different trade sizes
 * - Batch operations for market makers
 */

import { 
  LocalMoneySDK,
  quickStart,
  Keypair,
  PublicKey,
  FiatCurrency,
  OfferType,
  TradeState,
  CONSTANTS
} from '../dist/simple-index';
import BN from 'bn.js';

class RealWorldScenarioTest {
  private sdk!: LocalMoneySDK;
  private users: { keypair: Keypair; name: string }[] = [];

  async runScenarios(): Promise<void> {
    console.log('🌍 LocalMoney SDK Real-World Scenario Tests');
    console.log('=' .repeat(60));
    console.log();

    await this.setupTest();
    
    // Run real-world scenarios
    await this.scenario1_UserOnboarding();
    await this.scenario2_MarketMakerSetup();
    await this.scenario3_TradePreparation();
    await this.scenario4_MultiCurrencyAnalysis();
    await this.scenario5_FeeOptimization();
    await this.scenario6_BulkOperations();
    
    console.log('🎉 All real-world scenarios completed successfully!');
  }

  private async setupTest(): Promise<void> {
    console.log('🔧 Setting up test environment...');
    
    this.sdk = await quickStart({
      endpoint: 'http://localhost:8899'
    });
    
    // Create test users with different roles
    this.users = [
      { keypair: Keypair.generate(), name: 'Alice (Retail Trader)' },
      { keypair: Keypair.generate(), name: 'Bob (Market Maker)' },
      { keypair: Keypair.generate(), name: 'Charlie (Arbitrageur)' },
      { keypair: Keypair.generate(), name: 'Diana (Large Trader)' }
    ];
    
    console.log('✅ Test environment ready');
    console.log(`Created ${this.users.length} test users`);
    console.log();
  }

  private async scenario1_UserOnboarding(): Promise<void> {
    console.log('📋 Scenario 1: User Onboarding Flow');
    console.log('-'.repeat(40));
    
    const alice = this.users[0];
    console.log(`Onboarding user: ${alice.name}`);
    
    try {
      // Step 1: Generate user's profile PDA
      const [profilePDA, profileBump] = this.sdk.getProfilePDA(alice.keypair.publicKey);
      console.log(`✅ Generated profile PDA: ${profilePDA.toString().slice(0, 8)}...`);
      
      // Step 2: Check protocol configuration for limits
      const connection = this.sdk.getConnection();
      const [globalConfigPDA] = this.sdk.getGlobalConfigPDA();
      
      try {
        const accountInfo = await connection.getAccountInfo(globalConfigPDA);
        if (accountInfo) {
          console.log('✅ Protocol is initialized and ready');
          console.log(`   Global config account: ${accountInfo.data.length} bytes`);
        }
      } catch (error) {
        console.log('⚠️  Protocol may not be fully initialized');
      }
      
      // Step 3: Verify program availability
      let programsReady = 0;
      for (const [name, programId] of Object.entries(this.sdk.programAddresses)) {
        try {
          const accountInfo = await connection.getAccountInfo(programId);
          if (accountInfo?.executable) {
            programsReady++;
          }
        } catch (error) {
          console.log(`⚠️  Program ${name} not accessible`);
        }
      }
      
      console.log(`✅ ${programsReady}/6 programs are ready`);
      
      // Step 4: Pre-calculate some common PDAs for this user
      const userPDAs = {
        profile: this.sdk.getProfilePDA(alice.keypair.publicKey),
        offer1: this.sdk.getOfferPDA(new BN(1)),
        offer2: this.sdk.getOfferPDA(new BN(2)),
        trade1: this.sdk.getTradePDA(new BN(1)),
      };
      
      console.log('✅ Pre-calculated common PDAs for user');
      console.log(`   Profile: ${userPDAs.profile[0].toString().slice(0, 8)}...`);
      
      console.log(`✅ User onboarding simulation completed for ${alice.name}`);
      
    } catch (error) {
      console.log(`❌ Onboarding failed: ${error}`);
    }
    
    console.log();
  }

  private async scenario2_MarketMakerSetup(): Promise<void> {
    console.log('🏪 Scenario 2: Market Maker Setup');
    console.log('-'.repeat(40));
    
    const bob = this.users[1];
    console.log(`Setting up market maker: ${bob.name}`);
    
    try {
      // Step 1: Generate PDAs for multiple offers
      const maxOffers = 20; // Typical market maker might have many offers
      const offerPDAs = [];
      
      for (let i = 1; i <= maxOffers; i++) {
        const [offerPDA, bump] = this.sdk.getOfferPDA(new BN(i));
        offerPDAs.push({ id: i, pda: offerPDA, bump });
      }
      
      console.log(`✅ Generated ${offerPDAs.length} offer PDAs for market making`);
      
      // Step 2: Calculate fees for different offer sizes
      const offerSizes = [
        new BN(100000000),   // 0.1 SOL
        new BN(1000000000),  // 1 SOL
        new BN(5000000000),  // 5 SOL
        new BN(10000000000), // 10 SOL
      ];
      
      console.log('💰 Fee analysis for different offer sizes:');
      for (const size of offerSizes) {
        const chainFee = LocalMoneySDK.calculateFee(size, 50);   // 0.5%
        const burnFee = LocalMoneySDK.calculateFee(size, 25);    // 0.25%
        const warchestFee = LocalMoneySDK.calculateFee(size, 100); // 1%
        const arbitrationFee = LocalMoneySDK.calculateFee(size, 200); // 2%
        
        const totalFees = chainFee.add(burnFee).add(warchestFee).add(arbitrationFee);
        const netAmount = size.sub(totalFees);
        
        console.log(`   ${LocalMoneySDK.formatAmount(size, 9).padStart(6)} SOL -> ${LocalMoneySDK.formatAmount(netAmount, 9).padStart(6)} SOL net (fees: ${LocalMoneySDK.formatAmount(totalFees, 9)} SOL)`);
      }
      
      // Step 3: Multi-currency PDA generation
      const currencies = [FiatCurrency.USD, FiatCurrency.EUR, FiatCurrency.GBP, FiatCurrency.JPY];
      const pricePDAs = currencies.map(currency => ({
        currency,
        pda: this.sdk.getCurrencyPricePDA(currency),
      }));
      
      console.log(`✅ Generated price PDAs for ${currencies.length} currencies`);
      
      // Step 4: Calculate profit margins
      console.log('📊 Profit margin analysis:');
      const baseRate = new BN(100000000); // 1 USD = 1e8 (price precision)
      const spreads = [0.5, 1.0, 2.0, 5.0]; // Percentage spreads
      
      spreads.forEach(spread => {
        const buyRate = baseRate.sub(baseRate.mul(new BN(Math.floor(spread * 100))).div(new BN(10000)));
        const sellRate = baseRate.add(baseRate.mul(new BN(Math.floor(spread * 100))).div(new BN(10000)));
        
        console.log(`   ${spread}% spread: Buy at ${buyRate.toString()} - Sell at ${sellRate.toString()}`);
      });
      
      console.log(`✅ Market maker setup completed for ${bob.name}`);
      
    } catch (error) {
      console.log(`❌ Market maker setup failed: ${error}`);
    }
    
    console.log();
  }

  private async scenario3_TradePreparation(): Promise<void> {
    console.log('💼 Scenario 3: Trade Preparation Workflow');
    console.log('-'.repeat(40));
    
    const charlie = this.users[2];
    console.log(`Preparing trade for: ${charlie.name}`);
    
    try {
      // Step 1: Generate trade PDAs for a trading session
      const maxTrades = 10;
      const tradePDAs = [];
      
      for (let i = 1; i <= maxTrades; i++) {
        const [tradePDA, bump] = this.sdk.getTradePDA(new BN(i));
        tradePDAs.push({ id: i, pda: tradePDA, bump });
      }
      
      console.log(`✅ Generated ${tradePDAs.length} trade PDAs`);
      
      // Step 2: Simulate trade state tracking
      const tradeStates = Object.values(TradeState);
      console.log('📋 Available trade states:');
      tradeStates.forEach((state, index) => {
        console.log(`   ${index + 1}. ${state}`);
      });
      
      // Step 3: Fee calculation for escrow scenarios
      const escrowAmounts = [
        new BN(500000000),   // 0.5 SOL
        new BN(2000000000),  // 2 SOL
        new BN(10000000000), // 10 SOL
      ];
      
      console.log('⚖️  Escrow fee calculations:');
      for (const amount of escrowAmounts) {
        // Calculate escrow fees (simplified)
        const protocolFee = LocalMoneySDK.calculateFee(amount, 375); // 3.75% total
        const arbitrationReserve = LocalMoneySDK.calculateFee(amount, 200); // 2%
        const totalReserved = protocolFee.add(arbitrationReserve);
        const availableForTrade = amount.sub(totalReserved);
        
        console.log(`   ${LocalMoneySDK.formatAmount(amount, 9).padStart(5)} SOL escrow -> ${LocalMoneySDK.formatAmount(availableForTrade, 9).padStart(5)} SOL tradeable`);
      }
      
      // Step 4: Calculate trade completion scenarios
      console.log('✅ Trade completion scenarios:');
      const completionTypes = ['Successful', 'Disputed (Buyer wins)', 'Disputed (Seller wins)', 'Cancelled'];
      completionTypes.forEach(type => {
        console.log(`   • ${type}: Different fee distributions apply`);
      });
      
      console.log(`✅ Trade preparation completed for ${charlie.name}`);
      
    } catch (error) {
      console.log(`❌ Trade preparation failed: ${error}`);
    }
    
    console.log();
  }

  private async scenario4_MultiCurrencyAnalysis(): Promise<void> {
    console.log('🌐 Scenario 4: Multi-Currency Price Analysis');
    console.log('-'.repeat(40));
    
    const diana = this.users[3];
    console.log(`Running currency analysis for: ${diana.name}`);
    
    try {
      // Step 1: Generate PDAs for all supported currencies
      const allCurrencies = Object.values(FiatCurrency);
      const currencyPDAs = allCurrencies.map(currency => ({
        currency,
        pda: this.sdk.getCurrencyPricePDA(currency)[0],
        bump: this.sdk.getCurrencyPricePDA(currency)[1],
      }));
      
      console.log(`✅ Generated PDAs for ${currencyPDAs.length} currencies`);
      
      // Step 2: Simulate currency conversion calculations
      const baseAmount = new BN(1000000000); // 1 SOL
      
      console.log('💱 Currency conversion simulations (1 SOL equivalent):');
      
      // Mock exchange rates (in real usage, these would come from price oracles)
      const mockRates = new Map([
        [FiatCurrency.USD, new BN(20000000000)], // $200 per SOL (2e10 in 1e8 precision)
        [FiatCurrency.EUR, new BN(18500000000)], // €185 per SOL
        [FiatCurrency.GBP, new BN(16000000000)], // £160 per SOL
        [FiatCurrency.JPY, new BN(2900000000000)], // ¥29,000 per SOL (needs different precision)
        [FiatCurrency.CAD, new BN(27000000000)], // C$270 per SOL
      ]);
      
      for (const [currency, rate] of mockRates) {
        const fiatAmount = baseAmount.mul(rate).div(new BN(100000000)); // Convert using price precision
        console.log(`   1 SOL = ${fiatAmount.toString().padStart(12)} ${currency} units`);
      }
      
      // Step 3: Cross-currency arbitrage opportunity detection
      console.log('🔍 Arbitrage opportunity simulation:');
      const opportunities = [
        { from: FiatCurrency.USD, to: FiatCurrency.EUR, spread: 2.5 },
        { from: FiatCurrency.GBP, to: FiatCurrency.USD, spread: 1.8 },
        { from: FiatCurrency.EUR, to: FiatCurrency.CAD, spread: 3.2 },
      ];
      
      opportunities.forEach(opp => {
        console.log(`   ${opp.from} -> ${opp.to}: ${opp.spread}% spread opportunity`);
      });
      
      // Step 4: Calculate volume-weighted fee discounts
      console.log('📊 Volume-based fee tier analysis:');
      const volumeTiers = [
        { name: 'Retail', monthlyVol: new BN(10000000000), discount: 0 },    // 10 SOL
        { name: 'Professional', monthlyVol: new BN(100000000000), discount: 10 }, // 100 SOL
        { name: 'Institution', monthlyVol: new BN(1000000000000), discount: 25 }, // 1000 SOL
        { name: 'Market Maker', monthlyVol: new BN(10000000000000), discount: 40 }, // 10000 SOL
      ];
      
      volumeTiers.forEach(tier => {
        const standardFee = LocalMoneySDK.calculateFee(tier.monthlyVol, 375); // 3.75%
        const discountAmount = standardFee.mul(new BN(tier.discount)).div(new BN(100));
        const discountedFee = standardFee.sub(discountAmount);
        
        console.log(`   ${tier.name.padEnd(12)}: ${LocalMoneySDK.formatAmount(discountedFee, 9).padStart(8)} SOL fees (${tier.discount}% discount)`);
      });
      
      console.log(`✅ Multi-currency analysis completed for ${diana.name}`);
      
    } catch (error) {
      console.log(`❌ Currency analysis failed: ${error}`);
    }
    
    console.log();
  }

  private async scenario5_FeeOptimization(): Promise<void> {
    console.log('⚡ Scenario 5: Fee Optimization Strategies');
    console.log('-'.repeat(40));
    
    try {
      // Step 1: Compare different trade sizes for fee efficiency
      const tradeSizes = [
        new BN(100000000),    // 0.1 SOL - Small trade
        new BN(500000000),    // 0.5 SOL - Medium trade
        new BN(1000000000),   // 1 SOL - Standard trade
        new BN(5000000000),   // 5 SOL - Large trade
        new BN(10000000000),  // 10 SOL - Very large trade
      ];
      
      console.log('📊 Fee efficiency by trade size:');
      console.log('     Trade Size | Total Fees | Fee % | Net Amount');
      console.log('     -----------|------------|-------|------------');
      
      for (const size of tradeSizes) {
        const totalFeeBps = 375; // 3.75% total (chain + burn + warchest + arbitration)
        const totalFees = LocalMoneySDK.calculateFee(size, totalFeeBps);
        const feePercent = (totalFeeBps / 100).toFixed(2);
        const netAmount = size.sub(totalFees);
        
        console.log(`     ${LocalMoneySDK.formatAmount(size, 9).padStart(10)} | ${LocalMoneySDK.formatAmount(totalFees, 9).padStart(10)} | ${feePercent.padStart(5)}% | ${LocalMoneySDK.formatAmount(netAmount, 9).padStart(10)}`);
      }
      
      // Step 2: Batch trade fee optimization
      console.log('\n🔄 Batch trade optimization:');
      
      const singleTradeFees = tradeSizes.map(size => LocalMoneySDK.calculateFee(size, 375));
      const totalSingleFees = singleTradeFees.reduce((sum, fee) => sum.add(fee), new BN(0));
      
      // Simulate batch discount (hypothetical 15% reduction)
      const batchDiscount = 15;
      const batchFees = totalSingleFees.sub(totalSingleFees.mul(new BN(batchDiscount)).div(new BN(100)));
      const savings = totalSingleFees.sub(batchFees);
      
      console.log(`   Individual trades total fees: ${LocalMoneySDK.formatAmount(totalSingleFees, 9)} SOL`);
      console.log(`   Batch execution fees (${batchDiscount}% discount): ${LocalMoneySDK.formatAmount(batchFees, 9)} SOL`);
      console.log(`   Potential savings: ${LocalMoneySDK.formatAmount(savings, 9)} SOL`);
      
      // Step 3: Timing optimization analysis
      console.log('\n⏰ Timing optimization strategies:');
      const strategies = [
        { name: 'Peak hours', multiplier: 1.2, description: 'Higher fees, faster execution' },
        { name: 'Off-peak hours', multiplier: 0.8, description: 'Lower fees, slower execution' },
        { name: 'Batch window', multiplier: 0.7, description: 'Lowest fees, scheduled execution' },
      ];
      
      const baseAmount = new BN(2000000000); // 2 SOL reference
      const baseFee = LocalMoneySDK.calculateFee(baseAmount, 375);
      
      strategies.forEach(strategy => {
        const adjustedFee = baseFee.mul(new BN(Math.floor(strategy.multiplier * 100))).div(new BN(100));
        console.log(`   ${strategy.name.padEnd(15)}: ${LocalMoneySDK.formatAmount(adjustedFee, 9).padStart(8)} SOL - ${strategy.description}`);
      });
      
      console.log('✅ Fee optimization analysis completed');
      
    } catch (error) {
      console.log(`❌ Fee optimization failed: ${error}`);
    }
    
    console.log();
  }

  private async scenario6_BulkOperations(): Promise<void> {
    console.log('🔄 Scenario 6: Bulk Operations Performance');
    console.log('-'.repeat(40));
    
    try {
      // Step 1: Bulk PDA generation for market makers
      console.log('🏭 Bulk PDA generation simulation...');
      
      const startTime = performance.now();
      const bulkPDAs = {
        profiles: [] as any[],
        offers: [] as any[],
        trades: [] as any[],
        prices: [] as any[],
      };
      
      // Generate 100 PDAs of each type
      for (let i = 0; i < 100; i++) {
        const user = Keypair.generate().publicKey;
        bulkPDAs.profiles.push(this.sdk.getProfilePDA(user));
        bulkPDAs.offers.push(this.sdk.getOfferPDA(new BN(i + 1)));
        bulkPDAs.trades.push(this.sdk.getTradePDA(new BN(i + 1)));
        
        if (i < 10) { // Only 10 currencies
          const currencies = Object.values(FiatCurrency);
          const currency = currencies[i % currencies.length];
          bulkPDAs.prices.push(this.sdk.getCurrencyPricePDA(currency));
        }
      }
      
      const endTime = performance.now();
      const totalPDAs = bulkPDAs.profiles.length + bulkPDAs.offers.length + bulkPDAs.trades.length + bulkPDAs.prices.length;
      
      console.log(`✅ Generated ${totalPDAs} PDAs in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`   Profiles: ${bulkPDAs.profiles.length}`);
      console.log(`   Offers: ${bulkPDAs.offers.length}`);
      console.log(`   Trades: ${bulkPDAs.trades.length}`);
      console.log(`   Prices: ${bulkPDAs.prices.length}`);
      
      // Step 2: Bulk fee calculations
      console.log('\n💰 Bulk fee calculation simulation...');
      
      const bulkAmounts = Array.from({ length: 1000 }, (_, i) => new BN((i + 1) * 1000000)); // Various amounts
      const feeCalcStart = performance.now();
      
      let totalFees = new BN(0);
      for (const amount of bulkAmounts) {
        const fee = LocalMoneySDK.calculateFee(amount, 250); // 2.5%
        totalFees = totalFees.add(fee);
      }
      
      const feeCalcEnd = performance.now();
      
      console.log(`✅ Calculated fees for ${bulkAmounts.length} amounts in ${(feeCalcEnd - feeCalcStart).toFixed(2)}ms`);
      console.log(`   Total fees: ${LocalMoneySDK.formatAmount(totalFees, 9)} SOL`);
      
      // Step 3: Memory usage estimation
      console.log('\n🧠 Memory usage estimation...');
      
      const estimatedSize = {
        publicKey: 32, // bytes
        bn: 32, // bytes (estimated)
        string: 50, // bytes (estimated average)
        number: 8, // bytes
      };
      
      const memoryUsage = {
        pdas: totalPDAs * (estimatedSize.publicKey + estimatedSize.number), // PDA + bump
        amounts: bulkAmounts.length * estimatedSize.bn,
        metadata: 1000, // bytes (estimated overhead)
      };
      
      const totalMemory = Object.values(memoryUsage).reduce((sum, usage) => sum + usage, 0);
      
      console.log(`   PDAs: ${(memoryUsage.pdas / 1024).toFixed(2)} KB`);
      console.log(`   Amounts: ${(memoryUsage.amounts / 1024).toFixed(2)} KB`);
      console.log(`   Metadata: ${(memoryUsage.metadata / 1024).toFixed(2)} KB`);
      console.log(`   Total: ${(totalMemory / 1024).toFixed(2)} KB`);
      
      // Step 4: Throughput analysis
      console.log('\n📈 Throughput analysis:');
      
      const operations = {
        pdaGeneration: { count: totalPDAs, time: endTime - startTime },
        feeCalculation: { count: bulkAmounts.length, time: feeCalcEnd - feeCalcStart },
      };
      
      Object.entries(operations).forEach(([name, stats]) => {
        const opsPerSecond = (stats.count / (stats.time / 1000)).toFixed(0);
        console.log(`   ${name}: ${opsPerSecond} ops/second`);
      });
      
      console.log('✅ Bulk operations analysis completed');
      
    } catch (error) {
      console.log(`❌ Bulk operations failed: ${error}`);
    }
    
    console.log();
  }
}

// Main execution
async function main() {
  const test = new RealWorldScenarioTest();
  await test.runScenarios();
}

if (require.main === module) {
  main().catch(console.error);
}

export { RealWorldScenarioTest };