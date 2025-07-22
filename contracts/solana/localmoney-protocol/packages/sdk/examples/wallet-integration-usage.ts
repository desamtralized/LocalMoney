/**
 * LocalMoney SDK Wallet Integration Usage Examples
 * 
 * This file demonstrates how to use the enhanced wallet integration features
 * of the LocalMoney SDK with different wallet types and connection patterns.
 */

import { Keypair } from '@solana/web3.js';
import { 
  LocalMoneySDK,
  LocalMoneyWallet,
  WalletType,
  WalletUtils,
  quickStartWithEnhancedWallet,
  createConnection
} from '../src/index';

/**
 * Example 1: Basic wallet integration with Phantom
 */
async function examplePhantomWalletIntegration() {
  console.log('\n=== Example 1: Phantom Wallet Integration ===');
  
  try {
    // Create SDK with enhanced wallet
    const { sdk, wallet } = await quickStartWithEnhancedWallet({
      network: 'localhost',
      autoConnect: false
    });

    // Check if Phantom is installed
    const availableWallets = LocalMoneySDK.getAvailableWallets();
    const phantom = availableWallets.find(w => w.type === WalletType.PHANTOM);
    
    if (!phantom?.installed) {
      console.log('Phantom wallet is not installed');
      console.log('Install from:', WalletUtils.getWalletInstallUrl(WalletType.PHANTOM));
      return;
    }

    // Set up event listeners
    wallet.on('connect', (publicKey) => {
      console.log('Wallet connected:', WalletUtils.formatAddress(publicKey));
    });

    wallet.on('disconnect', () => {
      console.log('Wallet disconnected');
    });

    wallet.on('error', (error) => {
      console.error('Wallet error:', error.message);
    });

    // Connect to Phantom
    const connected = await wallet.connectWallet(WalletType.PHANTOM);
    
    if (connected) {
      console.log('Successfully connected to Phantom');
      console.log('Wallet state:', wallet.getState());
      
      // Get balance
      const balance = await wallet.getBalance();
      console.log('Wallet balance:', balance, 'SOL');
      
      // Get protocol status
      const protocolStatus = await sdk.getProtocolStatus();
      console.log('Protocol status:', protocolStatus);
    } else {
      console.log('Failed to connect to Phantom');
    }

  } catch (error) {
    console.error('Error in Phantom integration:', error);
  }
}

/**
 * Example 2: Multi-wallet support with user selection
 */
async function exampleMultiWalletSupport() {
  console.log('\n=== Example 2: Multi-Wallet Support ===');
  
  // Get all available wallets
  const availableWallets = LocalMoneySDK.getAvailableWallets();
  console.log('Available wallets:');
  
  availableWallets.forEach(wallet => {
    console.log(`- ${wallet.name} (${wallet.type}): ${wallet.installed ? 'Installed' : 'Not installed'}`);
    if (!wallet.installed && wallet.url) {
      console.log(`  Install from: ${wallet.url}`);
    }
  });

  // Find the first installed wallet
  const installedWallet = availableWallets.find(w => w.installed);
  
  if (!installedWallet) {
    console.log('No wallets are installed');
    return;
  }

  try {
    // Create SDK with enhanced wallet
    const { sdk, wallet } = await quickStartWithEnhancedWallet({
      network: 'localhost',
      autoConnect: false
    });

    // Connect to the first available wallet
    console.log(`\nConnecting to ${installedWallet.name}...`);
    const connected = await wallet.connectWallet(installedWallet.type);
    
    if (connected) {
      console.log(`Successfully connected to ${installedWallet.name}`);
      
      // Demonstrate wallet switching
      console.log('\nWallet switching demonstration:');
      await wallet.disconnect();
      console.log('Disconnected from wallet');
      
      // Reconnect
      const reconnected = await wallet.autoReconnect();
      console.log('Auto-reconnect result:', reconnected);
      
    } else {
      console.log(`Failed to connect to ${installedWallet.name}`);
    }

  } catch (error) {
    console.error('Error in multi-wallet support:', error);
  }
}

/**
 * Example 3: Development with keypair wallet
 */
async function exampleKeypairWallet() {
  console.log('\n=== Example 3: Keypair Wallet for Development ===');
  
  try {
    // Generate a keypair for development
    const keypair = Keypair.generate();
    console.log('Generated keypair with public key:', keypair.publicKey.toString());

    // Create SDK with enhanced wallet using keypair
    const { sdk, wallet } = await quickStartWithEnhancedWallet({
      network: 'localhost',
      keypair: keypair,
      autoConnect: true
    });

    console.log('Wallet state:', wallet.getState());
    
    // Request airdrop for development
    try {
      const connection = sdk.getConnection();
      await connection.requestAirdrop(keypair.publicKey, 2 * 1e9); // 2 SOL
      console.log('Airdrop successful');
      
      // Update balance
      await wallet.updateBalance();
      console.log('Updated balance:', await wallet.getBalance(), 'SOL');
      
    } catch (airdropError) {
      console.log('Airdrop failed (this is normal on some networks):', airdropError.message);
    }

    // Test protocol functionality
    const protocolConfig = await sdk.getProtocolConfig();
    if (protocolConfig) {
      console.log('Protocol configuration loaded successfully');
      console.log('Hub config exists:', !!protocolConfig.globalConfig);
      console.log('Price config exists:', !!protocolConfig.priceConfig);
    } else {
      console.log('Protocol configuration not available');
    }

  } catch (error) {
    console.error('Error in keypair wallet example:', error);
  }
}

/**
 * Example 4: Enhanced transaction handling
 */
async function exampleEnhancedTransactions() {
  console.log('\n=== Example 4: Enhanced Transaction Handling ===');
  
  try {
    const keypair = Keypair.generate();
    const { sdk, wallet } = await quickStartWithEnhancedWallet({
      network: 'localhost',
      keypair: keypair,
      autoConnect: true
    });

    console.log('Connected with enhanced wallet');
    
    // Demonstrate enhanced transaction handling
    console.log('Enhanced transaction features:');
    console.log('- Automatic retry logic');
    console.log('- User-friendly error messages');
    console.log('- Transaction confirmation tracking');
    console.log('- Wallet state management during signing');
    
    // Get wallet balance with error handling
    try {
      const balance = await sdk.getWalletBalance();
      console.log('Wallet balance:', balance, 'SOL');
    } catch (error) {
      console.error('Balance query failed:', error.message);
    }

    // Demonstrate wallet state monitoring
    const walletState = sdk.getWalletState();
    if (walletState) {
      console.log('Wallet connection state:', walletState.connectionState);
      console.log('Wallet type:', walletState.walletType);
      console.log('Last connected:', walletState.lastConnected);
    }

  } catch (error) {
    console.error('Error in enhanced transaction example:', error);
  }
}

/**
 * Example 5: Wallet event handling and state management
 */
async function exampleWalletEventHandling() {
  console.log('\n=== Example 5: Wallet Event Handling ===');
  
  try {
    const { sdk, wallet } = LocalMoneySDK.createLocalWithEnhancedWallet({
      autoConnect: false
    });

    // Set up comprehensive event handling
    wallet.on('connect', (publicKey) => {
      console.log(`🟢 Wallet connected: ${WalletUtils.formatAddress(publicKey)}`);
    });

    wallet.on('disconnect', () => {
      console.log('🔴 Wallet disconnected');
    });

    wallet.on('accountChanged', (publicKey) => {
      if (publicKey) {
        console.log(`🔄 Account changed: ${WalletUtils.formatAddress(publicKey)}`);
      } else {
        console.log('🔄 Account changed: null');
      }
    });

    wallet.on('error', (error) => {
      console.error('❌ Wallet error:', error.message);
    });

    wallet.on('ready', (wallet) => {
      console.log('✅ Wallet ready for use');
    });

    // Simulate wallet connection with keypair
    const keypair = Keypair.generate();
    console.log('Connecting with keypair...');
    await wallet.connectWithKeypair(keypair);
    
    // Simulate account changes and disconnection
    setTimeout(async () => {
      console.log('Simulating disconnection...');
      await wallet.disconnect();
    }, 2000);

  } catch (error) {
    console.error('Error in wallet event handling:', error);
  }
}

/**
 * Example 6: Production-ready wallet integration
 */
async function exampleProductionIntegration() {
  console.log('\n=== Example 6: Production-Ready Integration ===');
  
  try {
    // Production configuration
    const { sdk, wallet } = await quickStartWithEnhancedWallet({
      network: 'devnet', // Use devnet for production testing
      autoConnect: false,
    });

    // Production wallet setup
    console.log('Production wallet integration features:');
    console.log('- Auto-reconnect on page refresh');
    console.log('- Persistent wallet selection');
    console.log('- Connection timeout handling');
    console.log('- Error recovery mechanisms');
    
    // Check wallet availability for production
    const wallets = LocalMoneySDK.getAvailableWallets();
    const productionWallets = wallets.filter(w => w.installed);
    
    console.log('Production-ready wallets available:');
    productionWallets.forEach(w => {
      console.log(`- ${w.name} (${w.type})`);
    });

    if (productionWallets.length === 0) {
      console.log('No production wallets available. User should install a wallet.');
      return;
    }

    // Production connection flow
    const primaryWallet = productionWallets[0];
    console.log(`\nAttempting production connection to ${primaryWallet.name}...`);
    
    // In production, you would handle user interaction here
    console.log('(In production, this would show a wallet selection UI)');
    
    // Demonstrate protocol validation
    const validation = await sdk.validatePrograms();
    console.log('Protocol validation:', validation.valid ? 'PASSED' : 'FAILED');
    
    if (!validation.valid) {
      console.log('Program validation details:', validation.results);
    }

  } catch (error) {
    console.error('Error in production integration:', error);
  }
}

/**
 * Main function to run all examples
 */
async function runWalletIntegrationExamples() {
  console.log('LocalMoney SDK - Wallet Integration Examples');
  console.log('===========================================');

  try {
    await exampleKeypairWallet(); // Start with this since it's most likely to work
    await exampleWalletEventHandling();
    await exampleEnhancedTransactions();
    await exampleMultiWalletSupport();
    await exampleProductionIntegration();
    
    // Only try browser wallet if in browser environment
    if (typeof window !== 'undefined') {
      await examplePhantomWalletIntegration();
    } else {
      console.log('\n=== Skipping browser wallet examples (not in browser environment) ===');
    }

  } catch (error) {
    console.error('Error running examples:', error);
  }
  
  console.log('\n=== Wallet Integration Examples Complete ===');
}

// Export for use in other files
export {
  examplePhantomWalletIntegration,
  exampleMultiWalletSupport,
  exampleKeypairWallet,
  exampleEnhancedTransactions,
  exampleWalletEventHandling,
  exampleProductionIntegration,
  runWalletIntegrationExamples
};

// Run examples if this file is executed directly
if (require.main === module) {
  runWalletIntegrationExamples().catch(console.error);
}