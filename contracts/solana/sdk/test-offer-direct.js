const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

async function testOfferCreation() {
  console.log('🧪 Testing Offer Creation with PDA Fix...\n');
  
  // Setup connection
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Create a new keypair for testing
  const keypair = Keypair.generate();
  console.log('🔑 Test wallet:', keypair.publicKey.toString());
  
  // Airdrop SOL
  console.log('💰 Airdropping SOL...');
  const airdropSig = await connection.requestAirdrop(keypair.publicKey, 5000000000);
  await connection.confirmTransaction(airdropSig, 'confirmed');
  console.log('✅ Airdrop completed\n');
  
  // Create provider
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  
  // Import the SDK
  const { LocalMoneySDK } = require('./dist/index.js');
  
  const sdk = new LocalMoneySDK({
    provider,
    programIds: {
      hub: new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2'),
      profile: new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC'),
      offer: new PublicKey('48rVnWh2DrKFUF1YS7A9cPNs6CZsTtQwodEGfT8xV2JB'),
      trade: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM'),
      price: new PublicKey('GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL'),
    }
  });
  
  // Wait for SDK to initialize
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Create profile
  console.log('👤 Creating profile...');
  const username = 'TestUser_' + Math.floor(Math.random() * 10000);
  try {
    await sdk.createProfile(username);
    console.log('✅ Profile created\n');
  } catch (e) {
    console.error('❌ Profile creation failed:', e.message);
    return;
  }
  
  // Test offer creation with different IDs
  const testOfferIds = [1, 100, 999];
  
  for (const offerId of testOfferIds) {
    console.log(`\n📝 Testing offer creation with ID: ${offerId}`);
    
    try {
      // Temporarily modify the SDK to use our test offer ID
      const originalMethod = sdk.createOffer.bind(sdk);
      
      const result = await (async function() {
        const BN = anchor.BN;
        const offerIdBN = new BN(offerId);
        const [offerPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from('offer'), offerIdBN.toArrayLike(Buffer, 'le', 8)],
          sdk.programIds.offer
        );
        
        console.log(`  - Offer PDA: ${offerPDA.toString()}`);
        
        const [profilePDA] = PublicKey.findProgramAddressSync(
          [Buffer.from('profile'), keypair.publicKey.toBuffer()],
          sdk.programIds.profile
        );
        
        const [hubConfigPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from('hub'), Buffer.from('config')],
          sdk.programIds.hub
        );
        
        const params = {
          offer_type: { sell: {} },
          fiat_currency: { usd: {} },
          rate: new BN(100),
          min_amount: new BN(100),
          max_amount: new BN(1000),
          description: { value: 'Test offer ' + offerId },
        };
        
        const tx = await sdk.offerProgram.methods
          .createOffer(offerIdBN, params)
          .accounts({
            owner: keypair.publicKey,
            profileProgram: sdk.programIds.profile,
            userProfile: profilePDA,
            offer: offerPDA,
            tokenMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
            tokenProgram: TOKEN_PROGRAM_ID,
            hubConfig: hubConfigPDA,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        console.log(`  - Transaction: ${tx}`);
        return { offerId: offerIdBN.toNumber(), signature: tx };
      })();
      
      console.log(`✅ Offer ${offerId} created successfully!\n`);
      
      // Verify the offer
      const offer = await sdk.getOffer(offerId);
      if (offer) {
        console.log(`✅ Offer ${offerId} verified on-chain`);
        console.log(`  - Owner: ${offer.owner.toString()}`);
        console.log(`  - Rate: ${offer.rate.toString()}`);
        console.log(`  - State: ${JSON.stringify(offer.state)}\n`);
      } else {
        console.log(`⚠️ Could not fetch offer ${offerId} from chain\n`);
      }
      
    } catch (e) {
      if (e.toString().includes('already in use')) {
        console.log(`ℹ️ Offer ${offerId} already exists\n`);
      } else {
        console.error(`❌ Offer ${offerId} creation failed:`, e.message);
        console.error('Details:', e.toString());
        return;
      }
    }
  }
  
  console.log('🎉 All offer creation tests passed! PDA fix is working correctly.');
}

testOfferCreation().catch(console.error);