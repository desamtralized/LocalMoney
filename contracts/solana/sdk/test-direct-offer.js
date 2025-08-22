const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, createMint } = require('@solana/spl-token');

async function testDirectOffer() {
  console.log('Testing direct offer creation with Anchor...\n');
  
  // Setup
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const keypair = Keypair.generate();
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  
  // Airdrop
  console.log('Airdropping SOL...');
  const sig = await connection.requestAirdrop(keypair.publicKey, 5000000000);
  await connection.confirmTransaction(sig, 'confirmed');
  
  // Create token mint
  console.log('Creating token mint...');
  const tokenMint = await createMint(
    connection,
    keypair,
    keypair.publicKey,
    keypair.publicKey,
    6
  );
  console.log('Token mint:', tokenMint.toString());
  
  // Load programs
  const offerProgram = new PublicKey('DYJ8EBmhRJdKRg3wgapwX4ssTHRMwQd263hebwcsautj');
  const profileProgram = new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC');
  const hubProgram = new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2');
  
  // Load IDLs
  const offerIdl = require('./src/types/offer.json');
  const profileIdl = require('./src/types/profile.json');
  const hubIdl = require('./src/types/hub.json');
  
  const offerProg = new anchor.Program(offerIdl, offerProgram, provider);
  const profileProg = new anchor.Program(profileIdl, profileProgram, provider);
  const hubProg = new anchor.Program(hubIdl, hubProgram, provider);
  
  // Initialize hub if needed
  const [hubConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('hub'), Buffer.from('config')],
    hubProgram
  );
  
  try {
    await hubProg.account.hubConfig.fetch(hubConfig);
    console.log('Hub already initialized');
  } catch {
    console.log('Initializing hub...');
    await hubProg.methods.initialize().rpc();
  }
  
  // Create profile
  const [profilePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('profile'), keypair.publicKey.toBuffer()],
    profileProgram
  );
  
  console.log('\nCreating profile...');
  await profileProg.methods
    .createProfile('TestUser123')
    .accounts({
      user: keypair.publicKey,
      profile: profilePDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log('Profile created');
  
  // Create offer
  console.log('\nCreating offer...');
  const BN = anchor.BN;
  const offerId = new BN(1);
  
  // Calculate PDA with new program ID
  const [offerPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('offer'), offerId.toArrayLike(Buffer, 'le', 8)],
    offerProgram
  );
  
  console.log('Offer ID:', offerId.toString());
  console.log('Offer PDA:', offerPDA.toString());
  console.log('Offer Program:', offerProgram.toString());
  
  const params = {
    offerType: { sell: {} },
    fiatCurrency: { usd: {} },
    rate: new BN(100),
    minAmount: new BN(100),
    maxAmount: new BN(1000),
    description: { value: 'Test offer' },
  };
  
  const tx = await offerProg.methods
    .createOffer(offerId, params)
    .accounts({
      owner: keypair.publicKey,
      profileProgram: profileProgram,
      userProfile: profilePDA,
      offer: offerPDA,
      tokenMint: tokenMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      hubConfig: hubConfig,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  
  console.log('✅ Offer created! Transaction:', tx);
  
  // Verify
  const offer = await offerProg.account.offer.fetch(offerPDA);
  console.log('\nOffer data:');
  console.log('  ID:', offer.id.toString());
  console.log('  Owner:', offer.owner.toString());
  console.log('  Token Mint:', offer.tokenMint.toString());
  console.log('  Rate:', offer.rate.toString());
}

testDirectOffer().catch(console.error);