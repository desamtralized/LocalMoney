const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { AnchorProvider, Wallet, Program } = require('@coral-xyz/anchor');

// Import IDL files
const HubIDL = require('../target/idl/hub.json');
const ProfileIDL = require('../target/idl/profile.json');
const OfferIDL = require('../target/idl/offer.json');
const TradeIDL = require('../target/idl/trade.json');
const PriceIDL = require('../target/idl/price.json');

// Program IDs from our deployment
const programIds = {
  hub: new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2'),
  profile: new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC'), 
  price: new PublicKey('GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL'),
  offer: new PublicKey('48rVnWh2DrKFUF1YS7A9cPNs6CZsTtQwodEGfT8xV2JB'),
  trade: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM')
};

// Simple wallet implementation
class TestWallet {
  constructor(payer) {
    this.payer = payer;
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

async function runMinimalTest() {
  console.log('🚀 Running minimal Solana LocalMoney test...');
  
  // Connect to local validator
  const connection = new Connection('http://localhost:8899', 'confirmed');
  
  // Create test keypair
  const payer = Keypair.fromSeed(new Uint8Array(32).fill(1));
  const wallet = new TestWallet(payer);
  const provider = new AnchorProvider(connection, wallet, {});
  
  console.log('💰 Test wallet:', payer.publicKey.toString());
  
  try {
    // Check connection
    const slot = await connection.getSlot();
    console.log('✅ Connected to validator at slot:', slot);
    
    // Airdrop SOL
    await connection.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const balance = await connection.getBalance(payer.publicKey);
    console.log('💰 Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    
    // Initialize programs
    const profileProgram = new Program(ProfileIDL, programIds.profile, provider);
    const hubProgram = new Program(HubIDL, programIds.hub, provider);
    
    console.log('📋 Programs initialized successfully');
    
    // Try to create a profile
    console.log('👤 Creating user profile...');
    
    const [profilePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('profile'), payer.publicKey.toBuffer()],
      programIds.profile
    );
    
    try {
      const signature = await profileProgram.methods
        .createProfile('test-user-minimal')
        .accounts({
          profile: profilePDA,
          user: payer.publicKey,
          systemProgram: require('@solana/web3.js').SystemProgram.programId,
        })
        .rpc();
      
      console.log('✅ Profile created! Signature:', signature);
      
      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try to fetch the profile
      const profile = await profileProgram.account.profile.fetch(profilePDA);
      console.log('📋 Profile data:', {
        username: profile.username,
        user: profile.user.toString(),
        bump: profile.bump
      });
      
      console.log('🎉 MINIMAL TEST SUCCESS! Basic profile creation works!');
      
    } catch (error) {
      if (error.message.includes('already in use')) {
        console.log('ℹ️ Profile already exists, trying to fetch...');
        const profile = await profileProgram.account.profile.fetch(profilePDA);
        console.log('✅ Existing profile found:', profile.username);
        console.log('🎉 MINIMAL TEST SUCCESS! Profile system works!');
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the test
runMinimalTest().catch(console.error);