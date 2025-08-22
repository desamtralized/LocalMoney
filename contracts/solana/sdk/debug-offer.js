#!/usr/bin/env node

const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { LocalMoneySDK } = require('./dist/index.js');

// Minimal debugging script for offer creation
async function debugOfferCreation() {
  try {
    console.log('🔍 Starting offer creation debug...');
    
    // Connect to local validator
    const connection = new Connection('http://localhost:8899', 'confirmed');
    
    // Test program IDs from the running validator
    const programIds = {
      hub: new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2'),
      profile: new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC'),
      price: new PublicKey('GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL'),
      offer: new PublicKey('48rVnWh2DrKFUF1YS7A9cPNs6CZsTtQwodEGfT8xV2JB'),
      trade: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM')
    };
    
    // Create test keypair
    const testUser = Keypair.fromSeed(new Uint8Array(32).fill(3)); // Seller from tests
    
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
    
    // Initialize SDK
    const sdk = await LocalMoneySDK.create({
      connection,
      wallet: new TestWallet(testUser),
      programIds,
      enableCaching: false
    });
    
    console.log('✅ SDK initialized');
    console.log('👤 User:', testUser.publicKey.toString());
    
    // Check if profile exists
    const [profilePDA] = sdk.getProfilePDA(testUser.publicKey);
    console.log('📍 Profile PDA:', profilePDA.toString());
    console.log('📍 Profile PDA derived with program ID:', programIds.profile.toString());
    
    // Verify profile PDA derivation manually
    const { PublicKey: PK } = require('@solana/web3.js');
    const [manualProfilePDA] = PK.findProgramAddressSync(
      [Buffer.from('profile'), testUser.publicKey.toBuffer()],
      programIds.profile
    );
    console.log('📍 Manual profile PDA derivation:', manualProfilePDA.toString());
    console.log('📍 Profile PDA match:', profilePDA.equals(manualProfilePDA) ? '✅' : '❌');
    
    const profile = await sdk.profileProgram.account.profile.fetchNullable(profilePDA);
    console.log('👤 Profile exists:', !!profile);
    
    if (!profile) {
      console.log('📝 Creating profile...');
      await sdk.createProfile('debug-seller');
      console.log('✅ Profile created');
    }
    
    // Check hub config
    const [hubConfigPDA] = sdk.getHubConfigPDA();
    console.log('🏢 Hub Config PDA:', hubConfigPDA.toString());
    console.log('🏢 Hub Config PDA derived with program ID:', programIds.hub.toString());
    
    // Verify hub config PDA derivation manually
    const [manualHubConfigPDA] = PK.findProgramAddressSync(
      [Buffer.from('hub'), Buffer.from('config')],
      programIds.hub
    );
    console.log('🏢 Manual hub config PDA derivation:', manualHubConfigPDA.toString());
    console.log('🏢 Hub Config PDA match:', hubConfigPDA.equals(manualHubConfigPDA) ? '✅' : '❌');
    
    const hubConfig = await sdk.hubProgram.account.hubConfig.fetchNullable(hubConfigPDA);
    console.log('🏢 Hub Config exists:', !!hubConfig);
    
    if (!hubConfig) {
      console.log('🏢 Initializing hub...');
      await sdk.initializeHub();
      console.log('✅ Hub initialized');
    }
    
    // Create test token mint
    console.log('🪙 Creating test token mint...');
    const tokenMint = await sdk.createTestTokenMint();
    console.log('✅ Token mint:', tokenMint.toString());
    
    // Check what PDA the program expects for offer ID 1
    console.log('🔍 Testing PDA calculations for offer ID 1...');
    const offerId1 = 1;
    const offerId1BN = require('bn.js');
    const offerId1Buffer = new offerId1BN(offerId1).toArrayLike(Buffer, 'le', 8);
    console.log('   Offer ID 1 buffer (hex):', offerId1Buffer.toString('hex'));
    
    const [offerPDA1] = PK.findProgramAddressSync(
      [Buffer.from('offer'), offerId1Buffer],
      programIds.offer
    );
    console.log('   Expected PDA for offer ID 1:', offerPDA1.toString());
    
    // The program always expects this PDA - let's see what could generate it
    const expectedPDA = new PK('Hmb9x5xy4RxdhXzqbypQzQMFJFjX5XGEa23ui8PF8Au');
    console.log('   Program expects:', expectedPDA.toString());
    console.log('   Match:', offerPDA1.equals(expectedPDA) ? '✅' : '❌');
    
    // Try some other seed combinations to see if we can match the expected PDA
    console.log('🔍 Testing other seed combinations...');
    
    // Test with different offer IDs
    for (let i = 0; i < 10; i++) {
      const testBuffer = new offerId1BN(i).toArrayLike(Buffer, 'le', 8);
      const [testPDA] = PK.findProgramAddressSync(
        [Buffer.from('offer'), testBuffer],
        programIds.offer
      );
      if (testPDA.equals(expectedPDA)) {
        console.log(`   ✅ Match found with offer ID ${i}:`, testPDA.toString());
        break;
      }
    }
    
    // Now try to create offer
    console.log('🎯 Creating offer...');
    const offerInput = {
      offerType: { buy: {} },
      fiatCurrency: { usd: {} },
      rate: 50000,
      fiatAmount: 1000,
      terms: 'Debug test offer',
      tokenMint: tokenMint
    };
    
    const result = await sdk.createOffer(offerInput);
    console.log('✅ Offer created!');
    console.log('   Offer ID:', result.offerId);
    console.log('   Signature:', result.signature);
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (error.logs) {
      console.error('📋 Program logs:');
      error.logs.forEach(log => console.error('   ', log));
    }
  }
}

debugOfferCreation().catch(console.error);