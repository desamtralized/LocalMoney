/**
 * Transaction Building Utilities Usage Examples
 * 
 * This file demonstrates how to use the LocalMoney SDK's transaction building utilities
 * for more advanced transaction construction, batching, and customization.
 */

import { 
  LocalMoneySDK, 
  TransactionBuilder,
  PDAGenerator,
  Utils,
  NETWORK_CONFIGS,
  FiatCurrency,
  ProgramAddresses
} from '../src/index';
import { PublicKey, Keypair, Connection, Transaction } from '@solana/web3.js';
import { BN } from 'bn.js';

// Example program addresses (would come from deployment)
const EXAMPLE_PROGRAM_ADDRESSES: ProgramAddresses = {
  hub: new PublicKey('J5FDxQmMpiF4vqKBSWQS3JRGLyE8djRgoHF8QQJJKWM1'),
  profile: new PublicKey('6HJHAiMENmYh4wW99YtHVY6tGDTzdrNeMtwSpDiyGu1k'),
  price: new PublicKey('7nkFUfmqKMKrQfm83HxreJHXyJdTK5feYqDEJtNihaw1'),
  offer: new PublicKey('DGjiY2hKsDpffEgBckNfrAkDt6B5jSxwsHshyQ1cRiP9'),
  trade: new PublicKey('AxX94noi3AvotjdqnRin3YpKgbQ1rGqQhjkkxpeGUfnM'),
  arbitration: new PublicKey('3XkiY4D1FBnpKHpuT2pi3AhnZ2WcXXGSsR4vSYJ87RbR'),
};

/**
 * Example 1: Basic Transaction Building
 * Shows how to build individual instructions for protocol operations
 */
async function basicTransactionBuilding() {
  console.log('=== Basic Transaction Building ===');
  
  // Create transaction builder
  const txBuilder = TransactionBuilder.create(EXAMPLE_PROGRAM_ADDRESSES);
  
  // Create a keypair for the user
  const userKeypair = Keypair.generate();
  
  // Build a profile creation instruction
  const profileInstruction = txBuilder.buildCreateProfileInstruction({
    owner: userKeypair.publicKey,
    contactInfo: 'telegram:@crypto_trader',
  });
  
  console.log('Profile instruction created:');
  console.log(`- Program ID: ${profileInstruction.instruction.programId.toString()}`);
  console.log(`- Accounts: ${profileInstruction.accounts.length}`);
  console.log(`- Account addresses: ${profileInstruction.accounts.map(a => a.toString()).join(', ')}`);
  
  // Build an offer creation instruction
  const offerInstruction = txBuilder.buildCreateOfferInstruction({
    maker: userKeypair.publicKey,
    offerType: 'Buy',
    fiatCurrency: FiatCurrency.USD,
    rate: new BN(50000), // $50,000 per BTC
    minAmount: Utils.parseAmount('0.1'), // 0.1 SOL minimum
    maxAmount: Utils.parseAmount('10'), // 10 SOL maximum
    description: 'Fast BTC purchase with USD',
  });
  
  console.log('Offer instruction created:');
  console.log(`- Program ID: ${offerInstruction.instruction.programId.toString()}`);
  console.log(`- Accounts: ${offerInstruction.accounts.length}`);
}

/**
 * Example 2: Batch Transaction Creation
 * Shows how to combine multiple instructions into a single transaction
 */
async function batchTransactionCreation() {
  console.log('\n=== Batch Transaction Creation ===');
  
  const txBuilder = TransactionBuilder.create(EXAMPLE_PROGRAM_ADDRESSES);
  const userKeypair = Keypair.generate();
  
  // Build complete offer creation (profile + offer in one transaction)
  const completeOfferTx = txBuilder.buildCompleteOfferCreationTransaction({
    maker: userKeypair.publicKey,
    offerType: 'Sell',
    fiatCurrency: FiatCurrency.EUR,
    rate: new BN(45000), // €45,000 per BTC
    minAmount: Utils.parseAmount('0.05'),
    maxAmount: Utils.parseAmount('5'),
    description: 'Selling BTC for EUR, bank transfer',
    contactInfo: 'email:trader@example.com',
  });
  
  console.log('Complete offer transaction created:');
  console.log(`- Instructions: ${completeOfferTx.instructions.length}`);
  console.log(`- Estimated compute units: ${TransactionBuilder.estimateComputeUnits(completeOfferTx.instructions.length - 2)}`); // -2 for compute budget instructions
  
  // Validate transaction size
  const sizeValidation = TransactionBuilder.validateTransactionSize(completeOfferTx);
  console.log(`- Transaction size validation:`, sizeValidation);
}

/**
 * Example 3: Custom Compute Budget and Priority Fees
 * Shows how to customize transaction execution parameters
 */
async function customComputeBudgetExample() {
  console.log('\n=== Custom Compute Budget Example ===');
  
  const txBuilder = TransactionBuilder.create(EXAMPLE_PROGRAM_ADDRESSES);
  const userKeypair = Keypair.generate();
  
  // Build individual instructions
  const profileInstruction = txBuilder.buildCreateProfileInstruction({
    owner: userKeypair.publicKey,
    contactInfo: 'discord:CryptoTrader#1234',
  });
  
  const offerInstruction = txBuilder.buildCreateOfferInstruction({
    maker: userKeypair.publicKey,
    offerType: 'Buy',
    fiatCurrency: FiatCurrency.GBP,
    rate: new BN(38000), // £38,000 per BTC
    minAmount: Utils.parseAmount('0.01'),
    maxAmount: Utils.parseAmount('2'),
    description: 'UK trader buying BTC',
  });
  
  // Create batch transaction with custom parameters
  const customTx = txBuilder.buildBatchTransaction(
    [profileInstruction.instruction, offerInstruction.instruction],
    {
      computeUnits: 100000, // Custom compute units
      priorityFee: 10000,   // Custom priority fee in microlamports
      urgency: 'high'       // High urgency for faster processing
    }
  );
  
  console.log('Custom transaction created:');
  console.log(`- Instructions: ${customTx.instructions.length}`);
  console.log(`- Compute units: 100,000 (custom)`);
  console.log(`- Priority fee: 10,000 microlamports`);
  
  // Calculate total fees
  const standardPriorityFee = TransactionBuilder.calculatePriorityFee('medium');
  const highPriorityFee = TransactionBuilder.calculatePriorityFee('high');
  
  console.log(`- Standard priority fee: ${standardPriorityFee} lamports`);
  console.log(`- High priority fee: ${highPriorityFee} lamports`);
}

/**
 * Example 4: Cross-Program Account Management
 * Shows how to build account metas for complex cross-program interactions
 */
async function crossProgramAccountExample() {
  console.log('\n=== Cross-Program Account Management ===');
  
  const txBuilder = TransactionBuilder.create(EXAMPLE_PROGRAM_ADDRESSES);
  
  // Build account metas for a complex operation involving multiple programs
  const crossProgramAccounts = txBuilder.buildCrossProgramAccountMetas({
    hubProgram: true,
    profileProgram: true,
    priceProgram: true,
    offerProgram: true,
  });
  
  console.log('Cross-program accounts:');
  crossProgramAccounts.forEach((account, index) => {
    console.log(`- Account ${index}: ${account.pubkey.toString()} (signer: ${account.isSigner}, writable: ${account.isWritable})`);
  });
  
  // Get PDA generator for manual PDA management
  const pdaGenerator = txBuilder.getPDAGenerator();
  
  // Generate some example PDAs
  const [globalConfigPDA, globalConfigBump] = pdaGenerator.getGlobalConfigPDA();
  const [priceConfigPDA, priceConfigBump] = pdaGenerator.getPriceConfigPDA();
  const [offerCounterPDA, offerCounterBump] = pdaGenerator.getOfferCounterPDA();
  
  console.log('\nGenerated PDAs:');
  console.log(`- Global Config: ${globalConfigPDA.toString()} (bump: ${globalConfigBump})`);
  console.log(`- Price Config: ${priceConfigPDA.toString()} (bump: ${priceConfigBump})`);
  console.log(`- Offer Counter: ${offerCounterPDA.toString()} (bump: ${offerCounterBump})`);
}

/**
 * Example 5: Advanced Trading Workflow
 * Shows how to build a complete trading workflow transaction
 */
async function advancedTradingWorkflow() {
  console.log('\n=== Advanced Trading Workflow ===');
  
  const txBuilder = TransactionBuilder.create(EXAMPLE_PROGRAM_ADDRESSES);
  const takerKeypair = Keypair.generate();
  
  // Build a complete trade transaction
  const tradeTx = txBuilder.buildCompleteTradeTransaction({
    taker: takerKeypair.publicKey,
    offerId: new BN(12345), // Existing offer ID
    amount: Utils.parseAmount('1.5'), // 1.5 SOL
    contactInfo: 'telegram:@btc_buyer',
  });
  
  console.log('Trading workflow transaction:');
  console.log(`- Instructions: ${tradeTx.instructions.length}`);
  console.log(`- Estimated cost: ${TransactionBuilder.calculatePriorityFee('medium')} lamports`);
  
  // Estimate transaction size
  const estimatedSize = TransactionBuilder.estimateTransactionSize(tradeTx.instructions.length);
  console.log(`- Estimated size: ${estimatedSize} bytes`);
  
  // Validate the transaction
  const validation = TransactionBuilder.validateTransactionSize(tradeTx);
  if (validation.valid) {
    console.log(`- Transaction is valid (${validation.size}/${validation.maxSize} bytes)`);
  } else {
    console.log(`- Transaction too large: ${validation.size}/${validation.maxSize} bytes`);
  }
}

/**
 * Example 6: Price Update Instruction Building
 * Shows how to build price oracle update instructions
 */
async function priceUpdateExample() {
  console.log('\n=== Price Update Example ===');
  
  const txBuilder = TransactionBuilder.create(EXAMPLE_PROGRAM_ADDRESSES);
  const priceProvider = Keypair.generate();
  
  // Build price update instruction
  const priceUpdateInstruction = txBuilder.buildUpdatePricesInstruction({
    priceProvider: priceProvider.publicKey,
    currency: FiatCurrency.USD,
    price: new BN(50000_00000000), // $50,000 with 8 decimal precision
    confidence: 95, // 95% confidence level
  });
  
  console.log('Price update instruction:');
  console.log(`- Program ID: ${priceUpdateInstruction.instruction.programId.toString()}`);
  console.log(`- Accounts: ${priceUpdateInstruction.accounts.length}`);
  console.log(`- Price Provider: ${priceProvider.publicKey.toString()}`);
  
  // Build batch transaction with multiple price updates
  const multiCurrencyPriceUpdates = [
    FiatCurrency.USD,
    FiatCurrency.EUR,
    FiatCurrency.GBP,
    FiatCurrency.JPY,
  ].map(currency => {
    const basePrice = currency === FiatCurrency.USD ? 50000 :
                     currency === FiatCurrency.EUR ? 45000 :
                     currency === FiatCurrency.GBP ? 38000 : 7000000; // JPY
    
    return txBuilder.buildUpdatePricesInstruction({
      priceProvider: priceProvider.publicKey,
      currency,
      price: new BN(basePrice * 100000000), // 8 decimal precision
      confidence: 90 + Math.floor(Math.random() * 10), // 90-99% confidence
    });
  });
  
  const batchPriceUpdateTx = txBuilder.buildBatchTransaction(
    multiCurrencyPriceUpdates.map(update => update.instruction),
    { urgency: 'high' } // Price updates should be processed quickly
  );
  
  console.log(`Multi-currency price update transaction:`);
  console.log(`- Instructions: ${batchPriceUpdateTx.instructions.length}`);
  console.log(`- Currencies updated: USD, EUR, GBP, JPY`);
}

/**
 * Main execution function
 */
async function main() {
  console.log('LocalMoney SDK - Transaction Building Utilities Examples\n');
  
  try {
    await basicTransactionBuilding();
    await batchTransactionCreation();
    await customComputeBudgetExample();
    await crossProgramAccountExample();
    await advancedTradingWorkflow();
    await priceUpdateExample();
    
    console.log('\n=== Examples completed successfully! ===');
    console.log('\nKey Benefits of Transaction Building Utilities:');
    console.log('• Batch multiple operations into single transactions');
    console.log('• Customize compute budget and priority fees');
    console.log('• Build transactions offline for later signing');
    console.log('• Optimize transaction costs and execution speed');
    console.log('• Handle complex cross-program interactions');
    console.log('• Validate transaction constraints before execution');
    
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  basicTransactionBuilding,
  batchTransactionCreation,
  customComputeBudgetExample,
  crossProgramAccountExample,
  advancedTradingWorkflow,
  priceUpdateExample,
};