#!/usr/bin/env node

const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const { AnchorProvider, BN, Program, Wallet } = require('@coral-xyz/anchor');
const { TOKEN_PROGRAM_ID, createMint } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Program IDs
const OFFER_PROGRAM_ID = new PublicKey('DYJ8EBmhRJdKRg3wgapwX4ssTHRMwQd263hebwcsautj');
const PROFILE_PROGRAM_ID = new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC');
const HUB_PROGRAM_ID = new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2');

// Will create a local test token mint for isolated runs
let TEST_TOKEN_MINT = null;

async function main() {
    console.log('🚀 Starting direct Anchor offer creation test...');
    
    // Setup connection and wallet
    const connection = new Connection('http://localhost:8899', 'confirmed');
    const wallet = new Wallet(Keypair.generate());
    const provider = new AnchorProvider(connection, wallet, {});
    
    console.log('👤 Wallet address:', wallet.publicKey.toString());
    
    // Airdrop SOL
    console.log('💰 Requesting airdrop...');
    const airdropSig = await connection.requestAirdrop(wallet.publicKey, 10_000_000_000);
    await connection.confirmTransaction(airdropSig);
    console.log('✅ Airdrop confirmed');
    
    // Load IDLs
    const offerIdlPath = path.join(__dirname, 'src/types/offer.json');
    const offerIdl = JSON.parse(fs.readFileSync(offerIdlPath, 'utf8'));
    offerIdl.address = OFFER_PROGRAM_ID.toString();
    const offerProgram = new Program(offerIdl, provider);

    const hubIdlPath = path.join(__dirname, 'src/types/hub.json');
    const hubIdl = JSON.parse(fs.readFileSync(hubIdlPath, 'utf8'));
    hubIdl.address = HUB_PROGRAM_ID.toString();
    const hubProgram = new Program(hubIdl, provider);

    const profileIdlPath = path.join(__dirname, 'src/types/profile.json');
    const profileIdl = JSON.parse(fs.readFileSync(profileIdlPath, 'utf8'));
    profileIdl.address = PROFILE_PROGRAM_ID.toString();
    const profileProgram = new Program(profileIdl, provider);
    
    // Generate offer ID
    const offerIdNum = Math.floor(Math.random() * 100000) + 1;
    const offerIdBN = new BN(offerIdNum);
    
    // Derive PDAs
    const [offerPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('offer'), offerIdBN.toArrayLike(Buffer, 'le', 8)],
        OFFER_PROGRAM_ID
    );
    
    const [profilePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('profile'), wallet.publicKey.toBuffer()],
        PROFILE_PROGRAM_ID
    );
    
    const [hubConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('hub'), Buffer.from('config')],
        HUB_PROGRAM_ID
    );
    
    console.log('📝 PDAs:');
    console.log('  - Offer PDA:', offerPDA.toString());
    console.log('  - Profile PDA:', profilePDA.toString());
    console.log('  - Hub Config PDA:', hubConfigPDA.toString());
    
    // Ensure Hub Config exists (initialize if missing)
    try {
        const hubConfig = await hubProgram.account.hubConfig.fetchNullable(hubConfigPDA);
        if (!hubConfig) {
            console.log('🏗️ Initializing Hub config...');
            const params = {
                profileProgram: PROFILE_PROGRAM_ID,
                offerProgram: OFFER_PROGRAM_ID,
                tradeProgram: new PublicKey('5osZqhJj2SYGDHtUre2wpWiCFoBZQFmQ4x5b4Ln2TQQM'),
                priceProgram: new PublicKey('GMBAxgH2GZncN2zUfyjxDTYfeMwwhrebSfvqCe2w1YNL'),
                treasury: wallet.publicKey,
                localTokenMint: PublicKey.default,
                jupiterProgram: PublicKey.default,
                chainFeeCollector: wallet.publicKey,
                warchestAddress: wallet.publicKey,
                burnFeePct: 0,
                chainFeePct: 0,
                warchestFeePct: 0,
                conversionFeePct: 0,
                maxSlippageBps: 100, // 1%
                minConversionAmount: new BN(0),
                maxConversionRoutes: 1,
                feeRate: 0,
                burnRate: 0,
                warchestRate: 0,
                tradeLimitMin: new BN(0),
                tradeLimitMax: new BN(1_000_000_000),
                tradeExpirationTimer: new BN(3600),
                tradeDisputeTimer: new BN(3600),
                arbitrationFeeRate: 0,
                profileProgramVersion: 1,
                offerProgramVersion: 1,
                tradeProgramVersion: 1,
                priceProgramVersion: 1,
                upgradeAuthority: wallet.publicKey,
                requiredSignatures: 2,
            };

            await hubProgram.methods
                .initialize(params)
                .accounts({
                    hubConfig: hubConfigPDA,
                    authority: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            console.log('✅ Hub config initialized');
        } else {
            console.log('ℹ️ Hub config already exists');
        }
    } catch (e) {
        console.warn('⚠️ Hub init check failed, proceeding:', e.message || e);
    }

    // Ensure Profile exists (create if missing)
    try {
        const existing = await profileProgram.account.profile.fetchNullable(profilePDA);
        if (!existing) {
            console.log('👤 Creating profile...');
            await profileProgram.methods
                .createProfile('test-user')
                .accounts({
                    profile: profilePDA,
                    user: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            console.log('✅ Profile created');
        } else {
            console.log('ℹ️ Profile already exists');
        }
    } catch (e) {
        console.warn('⚠️ Profile init check failed, proceeding:', e.message || e);
    }

    // Create a local test token mint
    try {
        console.log('🪙 Creating local test token mint...');
        TEST_TOKEN_MINT = await createMint(connection, wallet.payer, wallet.publicKey, null, 6);
        console.log('✅ Test token mint created:', TEST_TOKEN_MINT.toString());
    } catch (e) {
        console.warn('⚠️ Failed to create local mint, proceeding with default USDC mint. Error:', e.message || e);
        TEST_TOKEN_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    }

    // Create offer parameters
    const params = {
        offerType: { buy: {} },
        fiatCurrency: { usd: {} },
        rate: new BN(10100), // 1.01% above market
        minAmount: new BN(100 * 1000000),
        maxAmount: new BN(10000 * 1000000),
        description: { value: 'Test offer via direct Anchor call' }
    };
    
    try {
        console.log('🎯 Creating offer with ID:', offerIdNum);
        
        // Create offer using direct Anchor call with strict accounts
        const tx = await offerProgram.methods
            .createOffer(offerIdBN, params)
            .accountsStrict({
                owner: wallet.publicKey,
                offer: offerPDA,
                profileProgram: PROFILE_PROGRAM_ID,
                userProfile: profilePDA,
                tokenMint: TEST_TOKEN_MINT,
                tokenProgram: TOKEN_PROGRAM_ID,
                hubConfig: hubConfigPDA,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        
        console.log('✅ Offer created successfully!');
        console.log('  - Transaction signature:', tx);
        console.log('  - Offer ID:', offerIdNum);
        console.log('  - Offer PDA:', offerPDA.toString());
        
        // Fetch and display the created offer
        const offer = await offerProgram.account.offer.fetch(offerPDA);
        console.log('📋 Created offer details:');
        console.log('  - Owner:', offer.owner.toString());
        console.log('  - Type:', Object.keys(offer.offerType)[0]);
        console.log('  - Currency:', Object.keys(offer.fiatCurrency)[0]);
        console.log('  - Rate:', offer.rate.toString());
        console.log('  - Min amount:', offer.minAmount.toString());
        console.log('  - Max amount:', offer.maxAmount.toString());
        console.log('  - Token mint:', offer.tokenMint.toString());
        console.log('  - State:', Object.keys(offer.state)[0]);
        
    } catch (error) {
        console.error('❌ Error creating offer:', error);
        if (error.logs) {
            console.error('📜 Transaction logs:');
            error.logs.forEach(log => console.error('  ', log));
        }
        process.exit(1);
    }
}

main().catch(console.error);
