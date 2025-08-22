const anchor = require('@coral-xyz/anchor');
const { PublicKey, Connection, Keypair } = require('@solana/web3.js');

const OFFER_PROGRAM_ID = new PublicKey('DYJ8EBmhRJdKRg3wgapwX4ssTHRMwQd263hebwcsautj');
const PROFILE_PROGRAM_ID = new PublicKey('6Lka8dnn5mEZ83Mv4HjWonqC6ZcwREUpTesJgnEd7mSC');

async function debugPDA() {
    // Create test wallet
    const wallet = Keypair.generate();
    const owner = new PublicKey('A9kBrUbQAdd8A5MyH9PRjf7kGLitAwV7TggK74WeKheq'); // From test output
    
    console.log('🔍 Debugging PDA Derivations');
    console.log('Owner:', owner.toString());
    console.log('Profile Program:', PROFILE_PROGRAM_ID.toString());
    console.log('Offer Program:', OFFER_PROGRAM_ID.toString());
    
    // Test profile PDA
    const [profilePDA, profileBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("profile"), owner.toBuffer()],
        PROFILE_PROGRAM_ID
    );
    console.log('\n📝 Profile PDA:', profilePDA.toString());
    console.log('Profile Bump:', profileBump);
    
    // Test offer PDA with ID 6022 from the test
    const offerId = 6022;
    const offerIdBuffer = Buffer.alloc(8);
    offerIdBuffer.writeBigUInt64LE(BigInt(offerId));
    
    const [offerPDA, offerBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("offer"), offerIdBuffer],
        OFFER_PROGRAM_ID
    );
    console.log('\n🎯 Offer PDA for ID', offerId);
    console.log('Offer PDA:', offerPDA.toString());
    console.log('Offer Bump:', offerBump);
    console.log('Offer ID Buffer:', offerIdBuffer.toString('hex'));
    
    // Check what happens if profile program ID is used for offer PDA
    const [wrongOfferPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("offer"), offerIdBuffer],
        PROFILE_PROGRAM_ID
    );
    console.log('\n⚠️ If we use wrong program ID:');
    console.log('Wrong Offer PDA:', wrongOfferPDA.toString());
    
    console.log('\n📊 From Test Output:');
    console.log('Expected (Left):', 'FdvgwcKUvpFeZgprrxqtgwZhbkhi9P9gKrXb3QApYrb4');
    console.log('Actual (Right):', 'GXLvDijHnC1266JcmnJ4SFGLVCoKx3VRjYbVPNApjahy');
    console.log('Our calculation:', offerPDA.toString());
    console.log('Match:', offerPDA.toString() === 'FdvgwcKUvpFeZgprrxqtgwZhbkhi9P9gKrXb3QApYrb4' ? '✅' : '❌');
}

debugPDA().catch(console.error);