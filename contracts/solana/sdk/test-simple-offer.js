const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { createMint, mintTo, createAssociatedTokenAccount } = require('@solana/spl-token');

async function testSimpleOffer() {
  console.log('🚀 Testing Simple Offer Creation...\n');
  
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const testKeypair = Keypair.generate();
  
  console.log('💰 Airdropping SOL...');
  const airdropSig = await connection.requestAirdrop(testKeypair.publicKey, 5000000000);
  await connection.confirmTransaction(airdropSig, 'confirmed');
  
  // Create token mint
  console.log('🪙 Creating test token mint...');
  const mintKeypair = Keypair.generate();
  const tokenMint = await createMint(
    connection,
    testKeypair,
    testKeypair.publicKey,
    testKeypair.publicKey,
    6,
    mintKeypair
  );
  console.log('✅ Token mint:', tokenMint.toString());
  
  // Create token account and mint
  const tokenAccount = await createAssociatedTokenAccount(
    connection,
    testKeypair,
    tokenMint,
    testKeypair.publicKey
  );
  
  await mintTo(
    connection,
    testKeypair,
    tokenMint,
    tokenAccount,
    testKeypair,
    1000 * 1e6
  );
  
  const programIds = {
    hub: new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2'),
    profile: new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC'),
    offer: new PublicKey('DYJ8EBmhRJdKRg3wgapwX4ssTHRMwQd263hebwcsautj'),
    trade: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM'),
    price: new PublicKey('GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL'),
  };
  
  const { LocalMoneySDK } = require('./dist/index.js');
  
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(testKeypair),
    { commitment: 'confirmed' }
  );
  
  console.log('🔧 Initializing SDK...');
  const sdk = await LocalMoneySDK.create({
    provider,
    programIds
  });
  
  // Initialize hub if needed
  try {
    const [hubConfigPDA] = sdk.getHubConfigPDA();
    const hubConfig = await connection.getAccountInfo(hubConfigPDA);
    if (!hubConfig) {
      console.log('🏢 Initializing hub...');
      await sdk.initializeHub();
    }
  } catch (e) {
    console.log('⚠️ Hub initialization optional');
  }
  
  // Create profile
  console.log('👤 Creating profile...');
  try {
    await sdk.createProfile('TestUser');
  } catch (e) {
    if (!e.toString().includes('already in use')) {
      throw e;
    }
  }
  
  // Test with specific offer IDs
  const testIds = [1, 42, 999, 12345];
  
  for (const offerId of testIds) {
    console.log(`\n📝 Testing offer ID: ${offerId}`);
    
    try {
      const offerResult = await sdk.createOffer({
        offerId: offerId,
        offerType: { sell: {} },
        fiatCurrency: { usd: {} },
        rate: 50000,
        minAmount: 10,
        maxAmount: 1000,
        tokenMint: tokenMint,
        terms: 'Test offer ' + offerId
      });
      
      console.log('✅ Offer created!');
      console.log('  - Offer ID:', offerResult.offerId);
      console.log('  - Transaction:', offerResult.signature);
      
      // Verify
      const offer = await sdk.getOffer(offerResult.offerId);
      if (offer) {
        console.log('✅ Verified on-chain');
        console.log('  - State:', JSON.stringify(offer.state));
      }
      
      break; // Stop after first success
      
    } catch (e) {
      console.error('❌ Failed:', e.message);
      if (e.logs) {
        console.error('Logs:', e.logs.slice(0, 5));
      }
    }
  }
  
  console.log('\n✨ Test complete!');
}

testSimpleOffer()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });