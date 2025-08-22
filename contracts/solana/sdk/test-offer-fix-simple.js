const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

async function testOfferCreationFix() {
  console.log('🧪 Testing Offer Creation PDA Fix...\n');
  
  // Setup connection and wallet
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const wallet = anchor.Wallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  
  // Load IDLs and programs
  const offerIdl = JSON.parse(fs.readFileSync('./target/idl/offer.json', 'utf8'));
  const profileIdl = JSON.parse(fs.readFileSync('./target/idl/profile.json', 'utf8'));
  const hubIdl = JSON.parse(fs.readFileSync('./target/idl/hub.json', 'utf8'));
  
  const offerProgram = new anchor.Program(offerIdl, '48rVnWh2DrKFUF1YS7A9cPNs6CZsTtQwodEGfT8xV2JB', provider);
  const profileProgram = new anchor.Program(profileIdl, '6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC', provider);
  
  // Test different offer IDs
  const testOfferIds = [1, 42, 999, 123456];
  
  // First create a profile
  const username = 'TestUser_' + Math.floor(Math.random() * 10000);
  const [profilePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('profile'), wallet.publicKey.toBuffer()],
    profileProgram.programId
  );
  
  console.log('👤 Creating profile...');
  try {
    await profileProgram.methods
      .createProfile(username)
      .accounts({
        profile: profilePDA,
        user: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('✅ Profile created\n');
  } catch (e) {
    if (!e.toString().includes('already in use')) {
      console.error('❌ Profile creation failed:', e.toString());
      return;
    }
    console.log('ℹ️ Profile already exists\n');
  }
  
  // Test offer creation with each ID
  for (const offerId of testOfferIds) {
    console.log(`📝 Testing offer creation with ID: ${offerId}`);
    
    const offerIdBN = new anchor.BN(offerId);
    const [offerPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('offer'), offerIdBN.toArrayLike(Buffer, 'le', 8)],
      offerProgram.programId
    );
    
    console.log(`  - Offer PDA: ${offerPDA.toString()}`);
    
    const [hubConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('hub'), Buffer.from('config')],
      new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2')
    );
    
    try {
      const params = {
        offerType: { sell: {} },
        fiatCurrency: { usd: {} },
        rate: new anchor.BN(100),
        minAmount: new anchor.BN(100),
        maxAmount: new anchor.BN(1000),
        description: { value: 'Test offer' },
      };
      
      const tx = await offerProgram.methods
        .createOffer(offerIdBN, params)
        .accounts({
          owner: wallet.publicKey,
          profileProgram: profileProgram.programId,
          userProfile: profilePDA,
          offer: offerPDA,
          tokenMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
          tokenProgram: TOKEN_PROGRAM_ID,
          hubConfig: hubConfigPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log(`✅ Offer ${offerId} created successfully!`);
      console.log(`  - Transaction: ${tx}\n`);
      
      // Verify the offer was created
      const offer = await offerProgram.account.offer.fetchNullable(offerPDA);
      if (offer) {
        console.log(`✅ Offer ${offerId} verified on-chain`);
        console.log(`  - Owner: ${offer.owner.toString()}`);
        console.log(`  - Rate: ${offer.rate.toString()}`);
        console.log(`  - Min Amount: ${offer.minAmount.toString()}`);
        console.log(`  - Max Amount: ${offer.maxAmount.toString()}\n`);
      }
      
    } catch (e) {
      if (e.toString().includes('already in use')) {
        console.log(`ℹ️ Offer ${offerId} already exists, skipping...\n`);
      } else {
        console.error(`❌ Offer ${offerId} creation failed:`, e.toString());
        console.error('\nFull error:', e);
        return;
      }
    }
  }
  
  console.log('🎉 Offer creation PDA fix validated successfully!');
}

testOfferCreationFix().catch(console.error);