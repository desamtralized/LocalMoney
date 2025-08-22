const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');

const OFFER_PROGRAM_ID = new PublicKey('DYJ8EBmhRJdKRg3wgapwX4ssTHRMwQd263hebwcsautj');

async function debugPDA() {
    // Test different seed combinations
    const offerId = 51671;
    
    console.log('🔍 Debugging Offer PDA Derivation');
    console.log('Offer ID:', offerId);
    console.log('Offer Program ID:', OFFER_PROGRAM_ID.toString());
    
    // Try with little-endian u64 buffer (8 bytes)
    const offerIdBuffer = Buffer.alloc(8);
    offerIdBuffer.writeBigUInt64LE(BigInt(offerId));
    console.log('\nOffer ID Buffer (LE u64):', offerIdBuffer.toString('hex'));
    
    // Test 1: Just "offer" + id
    try {
        const [pda1] = PublicKey.findProgramAddressSync(
            [Buffer.from("offer"), offerIdBuffer],
            OFFER_PROGRAM_ID
        );
        console.log('PDA with ["offer", id]:', pda1.toString());
    } catch (e) {
        console.log('Error with ["offer", id]:', e.message);
    }
    
    // Test 2: Just the id
    try {
        const [pda2] = PublicKey.findProgramAddressSync(
            [offerIdBuffer],
            OFFER_PROGRAM_ID
        );
        console.log('PDA with [id]:', pda2.toString());
    } catch (e) {
        console.log('Error with [id]:', e.message);
    }
    
    // Test 3: "offer_account" + id
    try {
        const [pda3] = PublicKey.findProgramAddressSync(
            [Buffer.from("offer_account"), offerIdBuffer],
            OFFER_PROGRAM_ID
        );
        console.log('PDA with ["offer_account", id]:', pda3.toString());
    } catch (e) {
        console.log('Error with ["offer_account", id]:', e.message);
    }
    
    // Test with different number formats
    console.log('\n📊 Testing different number formats:');
    
    // As u32
    const idU32 = Buffer.alloc(4);
    idU32.writeUInt32LE(offerId);
    const [pda4] = PublicKey.findProgramAddressSync(
        [Buffer.from("offer"), idU32],
        OFFER_PROGRAM_ID
    );
    console.log('PDA with u32 id:', pda4.toString());
    
    // As string
    const [pda5] = PublicKey.findProgramAddressSync(
        [Buffer.from("offer"), Buffer.from(offerId.toString())],
        OFFER_PROGRAM_ID
    );
    console.log('PDA with string id:', pda5.toString());
    
    console.log('\n🎯 Expected PDA from error: 9eezLSdE3XgG8zCVPP8QM26NnwDDMTK9VRRqUaQ2atES');
    console.log('📍 Client generated PDA: HEbmVfmXJ1WsWgRAGBt7PDuXU6KBRZs7HgMmzPg5Md77');
}

debugPDA().catch(console.error);