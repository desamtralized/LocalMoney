const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');

// Program IDs
const OFFER_PROGRAM_ID = new PublicKey('DYJ8EBmhRJdKRg3wgapwX4ssTHRMwQd263hebwcsautj');
const PROFILE_PROGRAM_ID = new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC');
const HUB_PROGRAM_ID = new PublicKey('2VqFPzXYsBvCLY6pYfrKxbqatVV4ASpjWEMXQoKNBZE2');

async function debugAccountOrder() {
    const owner = new PublicKey('3g3ZQhMNLMjbB9uHyiDfH8Cv2XQzCnKuTxkGbr1BPQXG');
    const offerId = 1234;
    const offerIdBN = new anchor.BN(offerId);
    
    // Derive PDAs
    const [offerPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('offer'), offerIdBN.toArrayLike(Buffer, 'le', 8)],
        OFFER_PROGRAM_ID
    );
    
    const [profilePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('profile'), owner.toBuffer()],
        PROFILE_PROGRAM_ID
    );
    
    const [hubConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('hub'), Buffer.from('config')],
        HUB_PROGRAM_ID
    );
    
    const tokenMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const SystemProgram = anchor.web3.SystemProgram;
    
    console.log('Expected account order for CreateOffer:');
    console.log('1. owner:', owner.toString());
    console.log('2. offer:', offerPDA.toString());
    console.log('3. profileProgram:', PROFILE_PROGRAM_ID.toString());
    console.log('4. userProfile:', profilePDA.toString());
    console.log('5. tokenMint:', tokenMint.toString());
    console.log('6. tokenProgram:', TOKEN_PROGRAM_ID.toString());
    console.log('7. hubConfig:', hubConfigPDA.toString());
    console.log('8. systemProgram:', SystemProgram.programId.toString());
    
    console.log('\nAccounts being passed by SDK:');
    const accounts = {
        owner: owner,
        offer: offerPDA,
        profileProgram: PROFILE_PROGRAM_ID,
        userProfile: profilePDA,
        tokenMint: tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        hubConfig: hubConfigPDA,
        systemProgram: SystemProgram.programId,
    };
    
    Object.entries(accounts).forEach(([key, value], index) => {
        console.log(`${index + 1}. ${key}:`, value.toString());
    });
}

debugAccountOrder().catch(console.error);