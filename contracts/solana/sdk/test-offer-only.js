const anchor = require('@coral-xyz/anchor');
const { PublicKey, Keypair, SystemProgram, Connection } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, createMint, mintTo, getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

const connection = new Connection('http://127.0.0.1:8899', 'confirmed');

async function testOfferCreation() {
    console.log('🚀 Testing Offer Creation Only\n');
    
    // Create provider
    const wallet = Keypair.generate();
    const provider = new anchor.AnchorProvider(
        connection,
        new anchor.Wallet(wallet),
        { commitment: 'confirmed' }
    );
    anchor.setProvider(provider);
    
    // Airdrop SOL
    console.log('💰 Airdropping SOL...');
    const airdropSig = await connection.requestAirdrop(wallet.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await connection.confirmTransaction(airdropSig);
    console.log('✅ Airdrop complete\n');
    
    // Create token mint
    console.log('🪙 Creating token mint...');
    const tokenMint = await createMint(
        connection,
        wallet,
        wallet.publicKey,
        wallet.publicKey,
        6
    );
    console.log('✅ Token mint created:', tokenMint.toString(), '\n');
    
    // Load IDLs
    const offerIdl = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/types/offer.json'), 'utf8'));
    const profileIdl = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/types/profile.json'), 'utf8'));
    const hubIdl = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/types/hub.json'), 'utf8'));
    
    // Program IDs
    const OFFER_PROGRAM_ID = new PublicKey('DYJ8EBmhRJdKRg3wgapwX4ssTHRMwQd263hebwcsautj');
    const PROFILE_PROGRAM_ID = new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC');
    const HUB_PROGRAM_ID = new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2');
    
    // Create programs
    const offerProgram = new anchor.Program(offerIdl, OFFER_PROGRAM_ID, provider);
    const profileProgram = new anchor.Program(profileIdl, PROFILE_PROGRAM_ID, provider);
    const hubProgram = new anchor.Program(hubIdl, HUB_PROGRAM_ID, provider);
    
    // Initialize hub if needed
    const [hubConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('hub'), Buffer.from('config')],
        HUB_PROGRAM_ID
    );
    
    try {
        const hubConfig = await hubProgram.account.hubConfig.fetch(hubConfigPDA);
        console.log('✅ Hub already initialized\n');
    } catch {
        console.log('🏢 Initializing hub...');
        await hubProgram.methods
            .initialize({
                treasuryPercentage: 100,
                burnReservePercentage: 50,
                warchestPercentage: 25,
                chainFeePercentage: 25,
                maxOfferPages: 10,
                maxOffersPerPage: 50,
                treasury: wallet.publicKey,
                burnReserve: wallet.publicKey,
                warchestAddress: wallet.publicKey,
                chainFeeCollector: wallet.publicKey,
                profileProgram: PROFILE_PROGRAM_ID,
                offerProgram: OFFER_PROGRAM_ID,
                tradeProgram: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM'),
                priceProgram: new PublicKey('GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL'),
                pauseAuthority: wallet.publicKey,
            })
            .accounts({
                hubConfig: hubConfigPDA,
                authority: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        console.log('✅ Hub initialized\n');
    }
    
    // Create profile
    const [profilePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('profile'), wallet.publicKey.toBuffer()],
        PROFILE_PROGRAM_ID
    );
    
    console.log('👤 Creating profile...');
    try {
        await profileProgram.methods
            .createProfile('testuser', 'Test User')
            .accounts({
                profile: profilePDA,
                user: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        console.log('✅ Profile created\n');
    } catch (e) {
        if (e.toString().includes('already in use')) {
            console.log('✅ Profile already exists\n');
        } else {
            throw e;
        }
    }
    
    // Create offer
    const offerId = Math.floor(Math.random() * 10000);
    const offerIdBN = new anchor.BN(offerId);
    
    console.log(`🎯 Creating offer with ID: ${offerId}`);
    
    const [offerPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('offer'), offerIdBN.toArrayLike(Buffer, 'le', 8)],
        OFFER_PROGRAM_ID
    );
    
    console.log('📍 PDAs:');
    console.log('  - Profile PDA:', profilePDA.toString());
    console.log('  - Offer PDA:', offerPDA.toString());
    console.log('  - Hub Config PDA:', hubConfigPDA.toString());
    
    const params = {
        offerType: { sell: {} },
        fiatCurrency: { usd: {} },
        rate: new anchor.BN(50000),
        minAmount: new anchor.BN(10),
        maxAmount: new anchor.BN(1000),
        description: null,
    };
    
    console.log('\n📝 Creating offer transaction...');
    try {
        const tx = await offerProgram.methods
            .createOffer(offerIdBN, params)
            .accounts({
                owner: wallet.publicKey,
                profileProgram: PROFILE_PROGRAM_ID,
                userProfile: profilePDA,
                offer: offerPDA,
                tokenMint: tokenMint,
                tokenProgram: TOKEN_PROGRAM_ID,
                hubConfig: hubConfigPDA,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        
        console.log('✅ Offer created successfully!');
        console.log('  - Transaction:', tx);
        
        // Fetch and verify
        const offer = await offerProgram.account.offer.fetch(offerPDA);
        console.log('\n📊 Offer details:');
        console.log('  - ID:', offer.id.toString());
        console.log('  - Owner:', offer.owner.toString());
        console.log('  - Rate:', offer.rate.toString());
        console.log('  - Min amount:', offer.minAmount.toString());
        console.log('  - Max amount:', offer.maxAmount.toString());
        
    } catch (e) {
        console.error('❌ Offer creation failed:', e.message);
        if (e.logs) {
            console.error('\n📋 Program logs:');
            e.logs.forEach(log => console.error('  ', log));
        }
    }
}

testOfferCreation().catch(console.error);