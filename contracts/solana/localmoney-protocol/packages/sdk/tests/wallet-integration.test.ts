/**
 * Wallet Integration Tests for LocalMoney SDK
 * 
 * This test file validates the enhanced wallet integration functionality
 */

import { Keypair } from '@solana/web3.js';
import { 
  LocalMoneySDK,
  LocalMoneyWallet,
  WalletType,
  WalletConnectionState,
  WalletUtils,
  createLocalMoneyWallet,
  quickStartWithEnhancedWallet
} from '../src/index';

/**
 * Test suite for wallet integration
 */
async function runWalletIntegrationTests() {
  console.log('\n🧪 Starting Wallet Integration Tests...\n');
  
  let passedTests = 0;
  let totalTests = 0;
  
  // Test 1: Basic wallet creation
  totalTests++;
  try {
    console.log('Test 1: Basic wallet creation');
    
    const connection = new (await import('@solana/web3.js')).Connection('http://localhost:8899');
    const wallet = createLocalMoneyWallet(connection);
    
    const state = wallet.getState();
    if (state.connectionState === WalletConnectionState.DISCONNECTED &&
        !state.connected &&
        state.publicKey === null) {
      console.log('✅ Wallet created with correct initial state');
      passedTests++;
    } else {
      console.log('❌ Wallet initial state incorrect');
    }
  } catch (error: any) {
    console.log('❌ Wallet creation failed:', error.message);
  }

  // Test 2: Keypair connection
  totalTests++;
  try {
    console.log('\nTest 2: Keypair wallet connection');
    
    const { sdk, wallet } = await quickStartWithEnhancedWallet({
      network: 'localhost',
      autoConnect: false
    });
    
    const keypair = Keypair.generate();
    const connected = await wallet.connectWithKeypair(keypair);
    
    if (connected && wallet.connected && wallet.publicKey?.equals(keypair.publicKey)) {
      console.log('✅ Keypair wallet connected successfully');
      passedTests++;
      
      // Test disconnection
      await wallet.disconnect();
      if (!wallet.connected && wallet.publicKey === null) {
        console.log('✅ Wallet disconnected successfully');
      } else {
        console.log('❌ Wallet disconnection failed');
      }
    } else {
      console.log('❌ Keypair wallet connection failed');
    }
  } catch (error: any) {
    console.log('❌ Keypair wallet test failed:', error.message);
  }

  // Test 3: Available wallets detection
  totalTests++;
  try {
    console.log('\nTest 3: Available wallets detection');
    
    const availableWallets = LocalMoneySDK.getAvailableWallets();
    
    if (Array.isArray(availableWallets) && availableWallets.length > 0) {
      console.log('✅ Available wallets detected:', availableWallets.length);
      
      // Check that expected wallet types are present
      const expectedTypes = [WalletType.PHANTOM, WalletType.SOLFLARE, WalletType.COINBASE];
      const foundTypes = availableWallets.map(w => w.type);
      
      if (expectedTypes.every(type => foundTypes.includes(type))) {
        console.log('✅ All expected wallet types found');
        passedTests++;
      } else {
        console.log('❌ Missing expected wallet types');
      }
      
      // Log wallet details
      availableWallets.forEach(wallet => {
        console.log(`  - ${wallet.name} (${wallet.type}): ${wallet.installed ? 'Installed' : 'Not installed'}`);
      });
    } else {
      console.log('❌ No wallets detected');
    }
  } catch (error: any) {
    console.log('❌ Wallet detection failed:', error.message);
  }

  // Test 4: Wallet utilities
  totalTests++;
  try {
    console.log('\nTest 4: Wallet utilities');
    
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toString();
    
    // Test address formatting
    const formatted = WalletUtils.formatAddress(keypair.publicKey, 4);
    if (formatted.includes('...') && formatted.length < address.length) {
      console.log('✅ Address formatting works correctly');
    } else {
      console.log('❌ Address formatting failed');
    }
    
    // Test address validation
    const isValid = WalletUtils.isValidAddress(address);
    const isInvalid = WalletUtils.isValidAddress('invalid-address');
    
    if (isValid && !isInvalid) {
      console.log('✅ Address validation works correctly');
      passedTests++;
    } else {
      console.log('❌ Address validation failed');
    }
  } catch (error: any) {
    console.log('❌ Wallet utilities test failed:', error.message);
  }

  // Test 5: SDK wallet integration
  totalTests++;
  try {
    console.log('\nTest 5: SDK wallet integration');
    
    const { sdk, wallet } = await quickStartWithEnhancedWallet({
      network: 'localhost',
      keypair: Keypair.generate(),
      autoConnect: true
    });
    
    // Test SDK wallet methods
    const walletFromSDK = sdk.getWallet();
    const walletState = sdk.getWalletState();
    
    if (walletFromSDK === wallet && 
        walletState?.connected && 
        walletState.walletType === WalletType.KEYPAIR) {
      console.log('✅ SDK wallet integration works correctly');
      passedTests++;
    } else {
      console.log('❌ SDK wallet integration failed');
    }
  } catch (error: any) {
    console.log('❌ SDK wallet integration test failed:', error.message);
  }

  // Test 6: Wallet event system
  totalTests++;
  try {
    console.log('\nTest 6: Wallet event system');
    
    const { sdk, wallet } = await quickStartWithEnhancedWallet({
      network: 'localhost',
      autoConnect: false
    });
    
    let connectEventFired = false;
    let readyEventFired = false;
    
    // Set up event listeners
    wallet.on('connect', () => {
      connectEventFired = true;
    });
    
    wallet.on('ready', () => {
      readyEventFired = true;
    });
    
    // Connect with keypair
    const keypair = Keypair.generate();
    await wallet.connectWithKeypair(keypair);
    
    // Give events time to fire
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (connectEventFired && readyEventFired) {
      console.log('✅ Wallet event system works correctly');
      passedTests++;
    } else {
      console.log('❌ Wallet event system failed - Connect:', connectEventFired, 'Ready:', readyEventFired);
    }
  } catch (error: any) {
    console.log('❌ Wallet event system test failed:', error.message);
  }

  // Test 7: Enhanced transaction handling
  totalTests++;
  try {
    console.log('\nTest 7: Enhanced transaction handling');
    
    const { sdk, wallet } = await quickStartWithEnhancedWallet({
      network: 'localhost',
      keypair: Keypair.generate(),
      autoConnect: true
    });
    
    // Test balance retrieval
    const balance = await sdk.getWalletBalance();
    
    if (typeof balance === 'number' && balance >= 0) {
      console.log('✅ Enhanced transaction handling - balance retrieval works');
      console.log(`    Balance: ${balance} SOL`);
      passedTests++;
    } else {
      console.log('❌ Enhanced transaction handling failed - invalid balance');
    }
  } catch (error: any) {
    console.log('❌ Enhanced transaction handling test failed:', error.message);
  }

  // Test 8: Wallet installation detection
  totalTests++;
  try {
    console.log('\nTest 8: Wallet installation detection');
    
    const phantomInstalled = WalletUtils.isWalletInstalled(WalletType.PHANTOM);
    const solflareInstalled = WalletUtils.isWalletInstalled(WalletType.SOLFLARE);
    
    // These should return boolean values (true/false, doesn't matter which in test environment)
    if (typeof phantomInstalled === 'boolean' && typeof solflareInstalled === 'boolean') {
      console.log('✅ Wallet installation detection works');
      console.log(`    Phantom: ${phantomInstalled}, Solflare: ${solflareInstalled}`);
      passedTests++;
    } else {
      console.log('❌ Wallet installation detection failed');
    }
  } catch (error: any) {
    console.log('❌ Wallet installation detection test failed:', error.message);
  }

  // Summary
  console.log('\n📊 Test Summary');
  console.log('================');
  console.log(`Passed: ${passedTests}/${totalTests}`);
  console.log(`Success Rate: ${(passedTests/totalTests * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All wallet integration tests passed!');
    return true;
  } else {
    console.log('⚠️  Some wallet integration tests failed');
    return false;
  }
}

/**
 * Performance test for wallet operations
 */
async function runWalletPerformanceTests() {
  console.log('\n⚡ Starting Wallet Performance Tests...\n');
  
  try {
    // Test wallet creation performance
    console.log('Performance Test 1: Wallet Creation');
    const startTime = Date.now();
    
    const wallets = [];
    for (let i = 0; i < 100; i++) {
      const connection = new (await import('@solana/web3.js')).Connection('http://localhost:8899');
      const wallet = createLocalMoneyWallet(connection);
      wallets.push(wallet);
    }
    
    const creationTime = Date.now() - startTime;
    console.log(`✅ Created 100 wallets in ${creationTime}ms (${(creationTime/100).toFixed(2)}ms per wallet)`);
    
    // Test address formatting performance
    console.log('\nPerformance Test 2: Address Formatting');
    const keypair = Keypair.generate();
    const formatStartTime = Date.now();
    
    for (let i = 0; i < 10000; i++) {
      WalletUtils.formatAddress(keypair.publicKey, 4);
    }
    
    const formatTime = Date.now() - formatStartTime;
    console.log(`✅ Formatted 10,000 addresses in ${formatTime}ms (${(10000/formatTime*1000).toFixed(0)} ops/sec)`);
    
    // Test available wallets detection performance
    console.log('\nPerformance Test 3: Wallet Detection');
    const detectionStartTime = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      LocalMoneySDK.getAvailableWallets();
    }
    
    const detectionTime = Date.now() - detectionStartTime;
    console.log(`✅ Detected wallets 1,000 times in ${detectionTime}ms (${(1000/detectionTime*1000).toFixed(0)} ops/sec)`);
    
    console.log('\n🎯 Performance tests completed successfully');
    
  } catch (error: any) {
    console.error('❌ Performance tests failed:', error.message);
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('LocalMoney SDK - Wallet Integration Test Suite');
  console.log('=============================================');
  
  try {
    const functionalTestsPassed = await runWalletIntegrationTests();
    await runWalletPerformanceTests();
    
    console.log('\n🏁 All tests completed');
    
    if (functionalTestsPassed) {
      console.log('✅ Wallet integration is ready for production use!');
      process.exit(0);
    } else {
      console.log('❌ Some issues need to be addressed');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { runWalletIntegrationTests, runWalletPerformanceTests };