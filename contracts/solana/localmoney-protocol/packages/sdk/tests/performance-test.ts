#!/usr/bin/env ts-node

/**
 * Performance Test for LocalMoney SDK
 * 
 * This test measures SDK performance under various load conditions:
 * - PDA generation speed
 * - Batch operations
 * - Memory usage
 * - Connection handling
 */

import { 
  LocalMoneySDK,
  quickStart,
  Keypair,
  FiatCurrency,
  CONSTANTS
} from '../dist/simple-index';
import BN from 'bn.js';

interface PerformanceMetric {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  opsPerSecond: number;
  minTime: number;
  maxTime: number;
}

class PerformanceTest {
  private sdk!: LocalMoneySDK;
  private metrics: PerformanceMetric[] = [];

  async runPerformanceTests(): Promise<void> {
    console.log('⚡ LocalMoney SDK Performance Tests');
    console.log('=' .repeat(50));
    console.log();

    await this.setupTest();
    
    // Run performance tests
    await this.testPDAGeneration();
    await this.testAmountFormatting();
    await this.testFeeCalculations();
    await this.testBatchOperations();
    await this.testMemoryUsage();
    
    this.printResults();
  }

  private async setupTest(): Promise<void> {
    this.sdk = await quickStart({
      keypair: Keypair.generate(),
      endpoint: 'http://localhost:8899'
    });
  }

  private async testPDAGeneration(): Promise<void> {
    console.log('🏃 Testing PDA Generation Performance...');
    
    const iterations = 10000;
    const users = Array.from({ length: 100 }, () => Keypair.generate().publicKey);
    const times: number[] = [];
    
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const iterStart = performance.now();
      
      const user = users[i % users.length];
      this.sdk.getProfilePDA(user);
      this.sdk.getOfferPDA(new BN(i));
      this.sdk.getTradePDA(new BN(i));
      this.sdk.getCurrencyPricePDA(FiatCurrency.USD);
      
      const iterEnd = performance.now();
      times.push(iterEnd - iterStart);
    }
    
    const totalTime = performance.now() - startTime;
    
    this.metrics.push({
      name: 'PDA Generation (4 PDAs per iteration)',
      iterations,
      totalTime,
      avgTime: totalTime / iterations,
      opsPerSecond: (iterations * 4) / (totalTime / 1000),
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
    });
    
    console.log(`   Generated ${iterations * 4} PDAs in ${totalTime.toFixed(2)}ms`);
  }

  private async testAmountFormatting(): Promise<void> {
    console.log('🏃 Testing Amount Formatting Performance...');
    
    const iterations = 50000;
    const amounts = Array.from({ length: 1000 }, (_, i) => new BN((i + 1) * 1000000));
    const times: number[] = [];
    
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const iterStart = performance.now();
      
      const amount = amounts[i % amounts.length];
      LocalMoneySDK.formatAmount(amount, 9);
      LocalMoneySDK.parseAmount('1.5', 9);
      
      const iterEnd = performance.now();
      times.push(iterEnd - iterStart);
    }
    
    const totalTime = performance.now() - startTime;
    
    this.metrics.push({
      name: 'Amount Formatting (format + parse per iteration)',
      iterations,
      totalTime,
      avgTime: totalTime / iterations,
      opsPerSecond: (iterations * 2) / (totalTime / 1000),
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
    });
    
    console.log(`   Processed ${iterations * 2} amount operations in ${totalTime.toFixed(2)}ms`);
  }

  private async testFeeCalculations(): Promise<void> {
    console.log('🏃 Testing Fee Calculation Performance...');
    
    const iterations = 100000;
    const amounts = Array.from({ length: 100 }, (_, i) => new BN((i + 1) * 1000000000));
    const feeBps = [50, 100, 250, 500, 1000];
    const times: number[] = [];
    
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const iterStart = performance.now();
      
      const amount = amounts[i % amounts.length];
      const bps = feeBps[i % feeBps.length];
      LocalMoneySDK.calculateFee(amount, bps);
      
      const iterEnd = performance.now();
      times.push(iterEnd - iterStart);
    }
    
    const totalTime = performance.now() - startTime;
    
    this.metrics.push({
      name: 'Fee Calculations',
      iterations,
      totalTime,
      avgTime: totalTime / iterations,
      opsPerSecond: iterations / (totalTime / 1000),
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
    });
    
    console.log(`   Calculated ${iterations} fees in ${totalTime.toFixed(2)}ms`);
  }

  private async testBatchOperations(): Promise<void> {
    console.log('🏃 Testing Batch Operations Performance...');
    
    const batchSize = 1000;
    const numBatches = 10;
    const times: number[] = [];
    
    const startTime = performance.now();
    
    for (let batch = 0; batch < numBatches; batch++) {
      const batchStart = performance.now();
      
      // Simulate batch PDA generation
      const pdas = [];
      for (let i = 0; i < batchSize; i++) {
        const user = Keypair.generate().publicKey;
        pdas.push(this.sdk.getProfilePDA(user));
      }
      
      const batchEnd = performance.now();
      times.push(batchEnd - batchStart);
    }
    
    const totalTime = performance.now() - startTime;
    const totalOps = batchSize * numBatches;
    
    this.metrics.push({
      name: 'Batch PDA Generation',
      iterations: totalOps,
      totalTime,
      avgTime: totalTime / totalOps,
      opsPerSecond: totalOps / (totalTime / 1000),
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
    });
    
    console.log(`   Generated ${totalOps} PDAs in ${numBatches} batches in ${totalTime.toFixed(2)}ms`);
  }

  private async testMemoryUsage(): Promise<void> {
    console.log('🏃 Testing Memory Usage...');
    
    const initialMemory = process.memoryUsage();
    
    // Create many SDK instances and PDAs to test memory usage
    const sdks: LocalMoneySDK[] = [];
    const pdas: any[] = [];
    
    const iterations = 1000;
    
    for (let i = 0; i < iterations; i++) {
      // Create PDA references
      const user = Keypair.generate().publicKey;
      pdas.push(this.sdk.getProfilePDA(user));
      pdas.push(this.sdk.getOfferPDA(new BN(i)));
      pdas.push(this.sdk.getTradePDA(new BN(i)));
    }
    
    const finalMemory = process.memoryUsage();
    
    const memoryDiff = {
      heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
      heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
      external: finalMemory.external - initialMemory.external,
      rss: finalMemory.rss - initialMemory.rss,
    };
    
    console.log(`   Memory usage after ${iterations * 3} operations:`);
    console.log(`     Heap Used: ${(memoryDiff.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`     Heap Total: ${(memoryDiff.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`     External: ${(memoryDiff.external / 1024 / 1024).toFixed(2)} MB`);
    console.log(`     RSS: ${(memoryDiff.rss / 1024 / 1024).toFixed(2)} MB`);
    
    // Calculate memory per operation
    const memoryPerOp = memoryDiff.heapUsed / (iterations * 3);
    console.log(`     Memory per operation: ${memoryPerOp.toFixed(2)} bytes`);
  }

  private printResults(): void {
    console.log();
    console.log('📊 Performance Test Results');
    console.log('=' .repeat(80));
    
    console.log();
    console.log('| Test Name                              | Iterations | Total Time | Avg Time | Ops/Sec  |');
    console.log('|----------------------------------------|------------|------------|----------|----------|');
    
    this.metrics.forEach(metric => {
      const name = metric.name.padEnd(38);
      const iterations = metric.iterations.toLocaleString().padStart(10);
      const totalTime = `${metric.totalTime.toFixed(1)}ms`.padStart(10);
      const avgTime = `${metric.avgTime.toFixed(3)}ms`.padStart(8);
      const opsPerSec = metric.opsPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(8);
      
      console.log(`| ${name} | ${iterations} | ${totalTime} | ${avgTime} | ${opsPerSec} |`);
    });
    
    console.log();
    console.log('📈 Performance Summary:');
    
    const totalOps = this.metrics.reduce((sum, m) => sum + m.iterations, 0);
    const totalTime = this.metrics.reduce((sum, m) => sum + m.totalTime, 0);
    const avgOpsPerSec = this.metrics.reduce((sum, m) => sum + m.opsPerSecond, 0) / this.metrics.length;
    
    console.log(`• Total Operations: ${totalOps.toLocaleString()}`);
    console.log(`• Total Time: ${totalTime.toFixed(2)}ms`);
    console.log(`• Average Ops/Sec: ${avgOpsPerSec.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    
    // Find fastest and slowest operations
    const fastest = this.metrics.reduce((prev, current) => 
      current.opsPerSecond > prev.opsPerSecond ? current : prev
    );
    
    const slowest = this.metrics.reduce((prev, current) => 
      current.opsPerSecond < prev.opsPerSecond ? current : prev
    );
    
    console.log();
    console.log(`⚡ Fastest: ${fastest.name} (${fastest.opsPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 })} ops/sec)`);
    console.log(`🐌 Slowest: ${slowest.name} (${slowest.opsPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 })} ops/sec)`);
    
    console.log();
    console.log('✨ Performance tests completed successfully!');
  }
}

// Main execution
async function main() {
  const test = new PerformanceTest();
  await test.runPerformanceTests();
}

if (require.main === module) {
  main().catch(console.error);
}

export { PerformanceTest };