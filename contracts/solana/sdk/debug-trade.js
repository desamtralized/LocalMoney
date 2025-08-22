#!/usr/bin/env node

const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { LocalMoneySDK } = require('./dist/index.js');

// Debug script to test trade creation capabilities
async function debugTradeCreation() {
  try {
    console.log('🔍 Testing trade creation capabilities...');
    
    // Connect to local validator
    const connection = new Connection('http://localhost:8899', 'confirmed');
    
    // Test program IDs
    const programIds = {
      hub: new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2'),
      profile: new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC'),
      price: new PublicKey('GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL'),
      offer: new PublicKey('48rVnWh2DrKFUF1YS7A9cPNs6CZsTtQwodEGfT8xV2JB'),
      trade: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM')
    };
    
    // Create test keypairs
    const buyer = Keypair.fromSeed(new Uint8Array(32).fill(2)); // Buyer from tests
    const seller = Keypair.fromSeed(new Uint8Array(32).fill(3)); // Seller from tests
    
    class TestWallet {
      constructor(keypair) {
        this.payer = keypair;
      }
      
      get publicKey() {
        return this.payer.publicKey;
      }
      
      async signTransaction(tx) {
        tx.partialSign(this.payer);
        return tx;
      }
      
      async signAllTransactions(txs) {
        return txs.map(tx => {
          tx.partialSign(this.payer);
          return tx;
        });
      }
    }
    
    // Initialize SDK for buyer
    const buyerSdk = await LocalMoneySDK.create({
      connection,
      wallet: new TestWallet(buyer),
      programIds,
      enableCaching: false
    });
    
    console.log('✅ Buyer SDK initialized');
    console.log('👤 Buyer:', buyer.publicKey.toString());
    console.log('👤 Seller:', seller.publicKey.toString());
    
    // Test PDA derivations for trade
    console.log('📍 Testing Trade PDA derivations...');
    const testTradeId = 12345;
    const [tradePDA] = buyerSdk.getTradePDA(testTradeId);
    console.log('   Trade PDA for ID', testTradeId + ':', tradePDA.toString());
    
    // Test if we can at least check trade existence (should be null)
    console.log('🔍 Testing trade retrieval...');
    const trade = await buyerSdk.getTrade(testTradeId);
    console.log('   Trade exists:', !!trade);
    
    // Test acceptTradeRequest method (should exist)
    console.log('🔍 Testing acceptTradeRequest method...');
    console.log('   Method exists:', typeof buyerSdk.acceptTradeRequest === 'function');
    
    // Test what happens if we try to create a trade request with a non-existent offer
    console.log('🎯 Testing createTradeRequest with non-existent offer...');
    try {
      await buyerSdk.createTradeRequest({
        offerId: 999999, // Non-existent offer
        amount: 100,
        buyerContact: 'test@buyer.com'
      });
      console.log('❌ Unexpected success - should have failed');
    } catch (error) {
      console.log('✅ Expected error for non-existent offer:', error.message);
    }
    
    console.log('✅ Trade creation capabilities tested');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugTradeCreation().catch(console.error);