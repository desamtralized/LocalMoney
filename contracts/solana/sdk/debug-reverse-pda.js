const { PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');

console.log('Debugging expected PDA...\n');

const offerProgram = new PublicKey('48rVnWh2DrKFUF1YS7A9cPNs6CZsTtQwodEGfT8xV2JB');
const expectedPDA = new PublicKey('Bh59PHySGkxbBvvKmaixJoFDhGCMVPNEEt6f3rkRL3hx');

// Try different encodings to find what generates the expected PDA
console.log('Testing what seeds generate the expected PDA: Bh59PHySGkxbBvvKmaixJoFDhGCMVPNEEt6f3rkRL3hx\n');

const BN = anchor.BN;

// Test with owner's pubkey as seed (old implementation)
const testOwner = new PublicKey('9YsxZeGbcUJRGTzLLdMQyAPm7wEBUbaytnkkGcTRMgN3');
const [pdaWithOwner, bump1] = PublicKey.findProgramAddressSync(
  [Buffer.from('offer'), testOwner.toBuffer()],
  offerProgram
);
console.log('With owner pubkey as seed:');
console.log('  PDA:', pdaWithOwner.toString());
console.log('  Match:', pdaWithOwner.equals(expectedPDA) ? '✅ YES!' : '❌ No');

// Try with just 'offer' seed
const [pdaJustOffer, bump2] = PublicKey.findProgramAddressSync(
  [Buffer.from('offer')],
  offerProgram
);
console.log('\nWith just "offer" seed:');
console.log('  PDA:', pdaJustOffer.toString());
console.log('  Match:', pdaJustOffer.equals(expectedPDA) ? '✅ YES!' : '❌ No');

// Try incrementing through numbers to find a match
console.log('\nSearching for offer_id that generates expected PDA...');
for (let i = 0; i < 1000; i++) {
  const offerIdBN = new BN(i);
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('offer'), offerIdBN.toArrayLike(Buffer, 'le', 8)],
    offerProgram
  );
  
  if (pda.equals(expectedPDA)) {
    console.log(`  Found match! offer_id=${i} generates the expected PDA`);
    break;
  }
  
  if (i === 999) {
    console.log('  No match found in range 0-999');
  }
}