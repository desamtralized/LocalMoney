/**
 * Basic usage example for LocalMoney Solana SDK
 * 
 * This example demonstrates the core functionality of the SDK including:
 * - Creating an SDK instance
 * - Generating PDAs
 * - Utility functions
 * - Basic operations
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

async function main() {
  console.log('🚀 LocalMoney SDK Basic Usage Example\n');

  try {
    // 1. Create SDK instance using quickStart
    console.log('1. Creating SDK instance...');
    const sdk = await quickStart({
      endpoint: 'http://localhost:8899' // Use localnet
    });
    
    console.log('✅ SDK created successfully');
    console.log('Program addresses:', sdk.programAddresses);
    console.log();

    // 2. Generate some sample PDAs
    console.log('2. Generating PDAs...');
    
    const userKeypair = Keypair.generate();
    const userPublicKey = userKeypair.publicKey;
    
    const [globalConfigPDA, globalConfigBump] = sdk.getGlobalConfigPDA();
    const [profilePDA, profileBump] = sdk.getProfilePDA(userPublicKey);
    const [priceConfigPDA, priceConfigBump] = sdk.getPriceConfigPDA();
    const [usdPricePDA, usdPriceBump] = sdk.getCurrencyPricePDA(FiatCurrency.USD);
    const [offerPDA, offerBump] = sdk.getOfferPDA(new BN(1));
    const [tradePDA, tradeBump] = sdk.getTradePDA(new BN(1));

    console.log('Global Config PDA:', globalConfigPDA.toString());
    console.log('Profile PDA for user:', profilePDA.toString());
    console.log('Price Config PDA:', priceConfigPDA.toString());
    console.log('USD Price PDA:', usdPricePDA.toString());
    console.log('Offer #1 PDA:', offerPDA.toString());
    console.log('Trade #1 PDA:', tradePDA.toString());
    console.log();

    // 3. Demonstrate utility functions
    console.log('3. Testing utility functions...');
    
    // Amount formatting
    const amount1 = new BN(1500000000); // 1.5 SOL
    const formatted1 = LocalMoneySDK.formatAmount(amount1, 9);
    console.log(`Amount ${amount1.toString()} lamports = ${formatted1} SOL`);
    
    const amount2 = LocalMoneySDK.parseAmount('2.5', 9);
    console.log(`Parsed "2.5" SOL = ${amount2.toString()} lamports`);
    
    // Fee calculations
    const tradeFee = LocalMoneySDK.calculateFee(amount1, 250); // 2.5%
    console.log(`2.5% fee on ${formatted1} SOL = ${LocalMoneySDK.formatAmount(tradeFee, 9)} SOL`);
    
    // BPS conversions
    const feePercentage = LocalMoneySDK.bpsToPercentage(250);
    const feeBps = LocalMoneySDK.percentageToBps(2.5);
    console.log(`250 BPS = ${feePercentage}%`);
    console.log(`2.5% = ${feeBps} BPS`);
    console.log();

    // 4. Show protocol constants
    console.log('4. Protocol constants:');
    console.log('Max platform fee:', CONSTANTS.MAX_PLATFORM_FEE_BPS, 'BPS');
    console.log('Max trade expiration:', CONSTANTS.MAX_TRADE_EXPIRATION_SECONDS, 'seconds');
    console.log('Max dispute timer:', CONSTANTS.MAX_DISPUTE_TIMER_SECONDS, 'seconds');
    console.log('Price precision:', CONSTANTS.PRICE_PRECISION);
    console.log('Amount precision:', CONSTANTS.AMOUNT_PRECISION);
    console.log();

    // 5. Show enum usage
    console.log('5. Enum examples:');
    console.log('Fiat currencies:', Object.values(FiatCurrency).slice(0, 5).join(', '), '...');
    console.log('Offer types:', Object.values(OfferType).join(', '));
    console.log('Trade states:', Object.values(TradeState).slice(0, 5).join(', '), '...');
    console.log();

    // 6. Connection and provider access
    console.log('6. Connection info:');
    const connection = sdk.getConnection();
    const provider = sdk.getProvider();
    
    try {
      const blockHeight = await connection.getBlockHeight();
      const balance = await connection.getBalance(userPublicKey);
      
      console.log('RPC endpoint:', connection.rpcEndpoint);
      console.log('Current block height:', blockHeight);
      console.log('User balance:', LocalMoneySDK.formatAmount(new BN(balance), 9), 'SOL');
      console.log('Provider wallet:', provider.wallet.publicKey.toString());
    } catch (error) {
      console.log('⚠️  Could not fetch blockchain data (localnet might not be running)');
    }
    console.log();

    // 7. Calculate complex fees
    console.log('7. Complex fee calculation example:');
    const tradeAmount = new BN(5000000000); // 5 SOL
    const chainFeeBps = 50;    // 0.5%
    const burnFeeBps = 25;     // 0.25%
    const warchestFeeBps = 100; // 1%
    const arbitrationFeeBps = 200; // 2%
    
    const chainFee = LocalMoneySDK.calculateFee(tradeAmount, chainFeeBps);
    const burnFee = LocalMoneySDK.calculateFee(tradeAmount, burnFeeBps);
    const warchestFee = LocalMoneySDK.calculateFee(tradeAmount, warchestFeeBps);
    const arbitrationFee = LocalMoneySDK.calculateFee(tradeAmount, arbitrationFeeBps);
    
    const totalFees = chainFee.add(burnFee).add(warchestFee).add(arbitrationFee);
    const netAmount = tradeAmount.sub(totalFees);
    
    console.log(`Trade amount: ${LocalMoneySDK.formatAmount(tradeAmount, 9)} SOL`);
    console.log(`Chain fee (${chainFeeBps} BPS): ${LocalMoneySDK.formatAmount(chainFee, 9)} SOL`);
    console.log(`Burn fee (${burnFeeBps} BPS): ${LocalMoneySDK.formatAmount(burnFee, 9)} SOL`);
    console.log(`Warchest fee (${warchestFeeBps} BPS): ${LocalMoneySDK.formatAmount(warchestFee, 9)} SOL`);
    console.log(`Arbitration fee (${arbitrationFeeBps} BPS): ${LocalMoneySDK.formatAmount(arbitrationFee, 9)} SOL`);
    console.log(`Total fees: ${LocalMoneySDK.formatAmount(totalFees, 9)} SOL`);
    console.log(`Net amount: ${LocalMoneySDK.formatAmount(netAmount, 9)} SOL`);
    console.log();

    console.log('🎉 All examples completed successfully!');
    
  } catch (error) {
    console.error('❌ Error running example:', error);
    process.exit(1);
  }
}

// Helper function to demonstrate PDA generation patterns
function demonstratePDAGeneration(sdk: LocalMoneySDK) {
  console.log('📍 PDA Generation Patterns:');
  
  // Generate multiple offer PDAs
  for (let i = 1; i <= 3; i++) {
    const [offerPDA] = sdk.getOfferPDA(new BN(i));
    console.log(`Offer #${i}: ${offerPDA.toString()}`);
  }
  
  // Generate PDAs for different users
  const users = [Keypair.generate(), Keypair.generate()];
  users.forEach((user, index) => {
    const [profilePDA] = sdk.getProfilePDA(user.publicKey);
    console.log(`User #${index + 1} profile: ${profilePDA.toString()}`);
  });
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}