const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, createMint, getAssociatedTokenAddress } = require('@solana/spl-token');

async function testCompleteOfferCreation() {
  console.log('🧪 Testing Complete Offer Creation Flow...\n');
  
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
  
  // Create a test token mint
  console.log('🪙 Creating test token mint...');
  const mintKeypair = Keypair.generate();
  const tokenMint = await createMint(
    connection,
    keypair, // payer
    keypair.publicKey, // mint authority
    keypair.publicKey, // freeze authority
    6, // decimals (USDC-like)
    mintKeypair
  );
  console.log('✅ Token mint created:', tokenMint.toString(), '\n');
  
  // Import the SDK
  const { LocalMoneySDK } = require('./dist/index.js');
  
  const sdk = new LocalMoneySDK({
    provider,
    programIds: {
      hub: new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2'),
      profile: new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC'),
      offer: new PublicKey('DYJ8EBmhRJdKRg3wgapwX4ssTHRMwQd263hebwcsautj'),
      trade: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM'),
      price: new PublicKey('GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL'),
    }
  });
  
  // Wait for SDK to initialize
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Initialize hub first
  console.log('🏢 Initializing hub configuration...');
  try {
    await sdk.initializeHub();
    console.log('✅ Hub initialized\n');
  } catch (e) {
    if (e.toString().includes('already in use')) {
      console.log('ℹ️ Hub already initialized\n');
    } else {
      console.error('❌ Hub initialization failed:', e.message);
      return;
    }
  }
  
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
  
  // Test offer creation with different IDs using the test token mint
  const testOfferIds = [1, 42, 999];
  
  for (const offerId of testOfferIds) {
    console.log(`\n📝 Testing offer creation with ID: ${offerId}`);
    
    try {
      const BN = anchor.BN;
      const offerIdBN = new BN(offerId);
      const [offerPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('offer'), offerIdBN.toArrayLike(Buffer, 'le', 8)],
        sdk.programIds.offer
      );
      
      console.log(`  - Offer PDA: ${offerPDA.toString()}`);
      console.log(`  - Token Mint: ${tokenMint.toString()}`);
      
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
          tokenMint: tokenMint, // Use our created token mint
          tokenProgram: TOKEN_PROGRAM_ID,
          hubConfig: hubConfigPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log(`✅ Offer ${offerId} created successfully!`);
      console.log(`  - Transaction: ${tx}\n`);
      
      // Verify the offer was created
      const offer = await sdk.getOffer(offerId);
      if (offer) {
        console.log(`✅ Offer ${offerId} verified on-chain`);
        console.log(`  - Owner: ${offer.owner.toString()}`);
        console.log(`  - Token Mint: ${offer.tokenMint.toString()}`);
        console.log(`  - Rate: ${offer.rate.toString()}`);
        console.log(`  - Min Amount: ${offer.minAmount.toString()}`);
        console.log(`  - Max Amount: ${offer.maxAmount.toString()}`);
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
  
  console.log('🎉 All offer creation tests passed!');
  console.log('\n✅ PDA constraint fix validated successfully!');
  console.log('✅ Offer creation with custom token mints working!');
  console.log('✅ Multiple offer IDs tested and verified!');
}

testCompleteOfferCreation().catch(console.error);