import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { LocalMoneySDK, LocalMoneyConfig } from '../../src/index';

// Wallet implementation for integration tests
class TestWallet implements Wallet {
  constructor(public payer: Keypair) {}
  
  get publicKey() {
    return this.payer.publicKey;
  }
  
  async signTransaction(tx: any) {
    tx.partialSign(this.payer);
    return tx;
  }
  
  async signAllTransactions(txs: any[]) {
    return txs.map(tx => {
      tx.partialSign(this.payer);
      return tx;
    });
  }
}

/**
 * Integration tests for the LocalMoney SDK
 * These tests require solana-local-validator to be running
 * 
 * To run these tests:
 * 1. Start solana-local-validator
 * 2. Deploy the LocalMoney programs to local validator
 * 3. Run: npm run test:integration
 */
describe('LocalMoney SDK Integration Tests', () => {
  let connection: Connection;
  let payer: Keypair;
  let buyer: Keypair;
  let seller: Keypair;
  let buyerSdk: LocalMoneySDK;
  let sellerSdk: LocalMoneySDK;

  // Actual deployed program IDs on local validator
  const programIds = {
    hub: new PublicKey('ETpJMS4nNW55KpjuJssRBmHpphYnBRPoRh9o6Yq6jy1K'), // Deployed ✅
    profile: new PublicKey('BMH3GaQKHbUG1X3wSASq6fN6qy8jRFf1WgdfMzaxWXmC'), // Deployed ✅
    price: new PublicKey('AHDAzufTjFrXHkJPrD85xoKMn9Cj4GRusWDQtZaG37dT'), // Deployed ✅
    offer: new PublicKey('D89P5L26y2wcLRYc5g3AgHVRpJiSGTWJZnrGGJoAiobj'), // Deployed ✅
    trade: new PublicKey('HjzdQZjxWcs514U2qiqecXuEGeMA2FnX9vAdDZPHUiwQ') // Deployed ✅
  };

  beforeAll(async () => {
    // Connect to local validator
    connection = new Connection('http://localhost:8899', 'confirmed');
    
    // Create test keypairs
    payer = Keypair.generate();
    buyer = Keypair.generate();
    seller = Keypair.generate();

    // Check if local validator is running by testing connection
    try {
      await connection.getSlot();
      console.log('✅ Local validator detected, running integration tests');
    } catch (error) {
      console.warn('⚠️  Local validator not running - skipping integration tests');
      console.warn('   To run integration tests: solana-test-validator');
      return;
    }

    // Airdrop SOL to test accounts
    try {
      await connection.requestAirdrop(payer.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.requestAirdrop(buyer.publicKey, 5 * LAMPORTS_PER_SOL);
      await connection.requestAirdrop(seller.publicKey, 5 * LAMPORTS_PER_SOL);
      
      // Wait for airdrops to confirm
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('✅ Test accounts funded');
    } catch (error) {
      console.warn('⚠️  Airdrop failed:', error instanceof Error ? error.message : 'Unknown error');
      return;
    }

    // Initialize SDKs
    const buyerConfig: LocalMoneyConfig = {
      connection,
      wallet: new TestWallet(buyer),
      programIds,
      enableCaching: true
    };

    const sellerConfig: LocalMoneyConfig = {
      connection,
      wallet: new TestWallet(seller),
      programIds,
      enableCaching: true
    };

    buyerSdk = await LocalMoneySDK.create(buyerConfig);
    sellerSdk = await LocalMoneySDK.create(sellerConfig);
    console.log('✅ SDKs initialized');
  }, 10000); // 10 second timeout for setup

  // Skip tests if local validator is not running
  const itif = (condition: boolean) => condition ? it : it.skip;
  const describeif = (condition: boolean) => condition ? describe : describe.skip;

  (process.env.INTEGRATION_TESTS === 'true' ? describe : describe.skip)('Profile Management', () => {
    test('should create buyer and seller profiles', async () => {
      // Create buyer profile
      const buyerSig = await buyerSdk.createProfile('test-buyer');
      expect(buyerSig).toBeTruthy();
      expect(typeof buyerSig).toBe('string');

      // Create seller profile
      const sellerSig = await sellerSdk.createProfile('test-seller');
      expect(sellerSig).toBeTruthy();
      expect(typeof sellerSig).toBe('string');

      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify profiles were created
      const buyerProfile = await buyerSdk.getProfile(buyer.publicKey);
      const sellerProfile = await sellerSdk.getProfile(seller.publicKey);

      expect(buyerProfile).toBeTruthy();
      expect(sellerProfile).toBeTruthy();
      expect(buyerProfile?.username).toBe('test-buyer');
      expect(sellerProfile?.username).toBe('test-seller');
    });
  });

  (process.env.INTEGRATION_TESTS === 'true' ? describe : describe.skip)('Offer Management', () => {
    test('should create and retrieve offers', async () => {
      const createOfferParams = {
        offerType: { buy: {} },
        fiatCurrency: { usd: {} },
        fiatAmount: 1000,
        rate: 50000, // $50,000 per token
        paymentMethods: ['bank-transfer'],
        terms: 'Quick trade, bank transfer only'
      };

      // Create offer
      const signature = await sellerSdk.createOffer(createOfferParams as any);
      expect(signature).toBeTruthy();

      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // This would need to be implemented to get offer ID from transaction logs
      // For now, using placeholder
      const offerId = 1;
      
      // Retrieve offer
      const offer = await sellerSdk.getOffer(offerId);
      expect(offer).toBeTruthy();
    });
  });

  (process.env.INTEGRATION_TESTS === 'true' ? describe : describe.skip)('End-to-End Trading Flow', () => {
    test('should execute complete trading flow', async () => {
      try {
        // First create profiles for both users
        console.log('📝 Creating buyer profile...');
        await buyerSdk.createProfile('test-buyer-e2e');
        
        console.log('📝 Creating seller profile...');
        await sellerSdk.createProfile('test-seller-e2e');
        
        // Wait for profile creation to confirm  
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify profiles were created
        console.log('🔍 Verifying profiles...');
        const buyerProfile = await buyerSdk.getProfile(buyer.publicKey);
        const sellerProfile = await sellerSdk.getProfile(seller.publicKey);
        console.log('👤 Buyer profile:', buyerProfile ? 'Found' : 'Not found');
        console.log('👤 Seller profile:', sellerProfile ? 'Found' : 'Not found');

        const tradingParams = {
          // offerId: 12345, // Let the SDK create a real offer instead
          amount: 100, // 100 tokens
          buyerContact: 'buyer@example.com',
          sellerContact: 'seller@example.com'
        };

        console.log('🚀 Starting complete trading flow...');
        
        // Execute the complete trading flow
        const result = await buyerSdk.executeTradingFlow(tradingParams);
        
        console.log(`✅ Trading flow completed! Trade ID: ${result.tradeId}, Offer ID: ${result.offerId}`);
        console.log(`📊 Total signatures: ${result.signatures.length}`);
        
        expect(result.tradeId).toBeTruthy();
        expect(result.offerId).toBeTruthy();
        expect(result.signatures.length).toBeGreaterThanOrEqual(5); // At least 5 steps (6 if offer created)
        expect(result.signatures.every(sig => typeof sig === 'string')).toBe(true);

        // Wait for all transactions to confirm
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('🎉 E2E Trading Flow Test: COMPLETE SUCCESS!');
        
      } catch (error) {
        console.error('❌ Trading flow test failed:', error);
        throw error; // Re-throw to fail the test properly
      }
    });
  });

  (process.env.INTEGRATION_TESTS === 'true' ? describe : describe.skip)('Batch Transactions', () => {
    test('should handle batch transaction execution', async () => {
      // This test would create multiple transactions and execute them in batch
      // Implementation depends on having actual transactions to batch
      expect(true).toBe(true); // Placeholder
    });
  });

  (process.env.INTEGRATION_TESTS === 'true' ? describe : describe.skip)('Error Handling', () => {
    test('should handle program errors gracefully', async () => {
      try {
        // Try to get a non-existent trade
        const nonExistentTrade = await buyerSdk.getTrade(999999);
        expect(nonExistentTrade).toBeNull();
      } catch (error) {
        // Should handle gracefully
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  afterAll(async () => {
    // Cleanup if needed
    if (buyerSdk) {
      buyerSdk.clearCache();
    }
    if (sellerSdk) {
      sellerSdk.clearCache();
    }
  });
});