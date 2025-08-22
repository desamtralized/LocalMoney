const { PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');

console.log('Testing PDA calculation for offer program...\n');

const offerProgram = new PublicKey('48rVnWh2DrKFUF1YS7A9cPNs6CZsTtQwodEGfT8xV2JB');

// Test with offer ID 1
const offerId = 1;
const BN = anchor.BN;
const offerIdBN = new BN(offerId);

// Method 1: Using toArrayLike with 'le' and 8 bytes (what the test is using)
const [pda1, bump1] = PublicKey.findProgramAddressSync(
  [Buffer.from('offer'), offerIdBN.toArrayLike(Buffer, 'le', 8)],
  offerProgram
);
console.log('Method 1 (toArrayLike le, 8 bytes):');
console.log('  PDA:', pda1.toString());
console.log('  Bump:', bump1);
console.log('  Seed bytes:', offerIdBN.toArrayLike(Buffer, 'le', 8));

// Method 2: Using toBuffer with 'le' and 8 bytes
const [pda2, bump2] = PublicKey.findProgramAddressSync(
  [Buffer.from('offer'), offerIdBN.toBuffer('le', 8)],
  offerProgram
);
console.log('\nMethod 2 (toBuffer le, 8 bytes):');
console.log('  PDA:', pda2.toString());
console.log('  Bump:', bump2);
console.log('  Seed bytes:', offerIdBN.toBuffer('le', 8));

// Method 3: Direct buffer creation from number
const buffer = Buffer.alloc(8);
buffer.writeBigUInt64LE(BigInt(offerId));
const [pda3, bump3] = PublicKey.findProgramAddressSync(
  [Buffer.from('offer'), buffer],
  offerProgram
);
console.log('\nMethod 3 (direct BigUInt64LE):');
console.log('  PDA:', pda3.toString());
console.log('  Bump:', bump3);
console.log('  Seed bytes:', buffer);

// Method 4: Using regular number as array (what might be expected)
const offerIdBytes = Buffer.from([offerId, 0, 0, 0, 0, 0, 0, 0]);
const [pda4, bump4] = PublicKey.findProgramAddressSync(
  [Buffer.from('offer'), offerIdBytes],
  offerProgram
);
console.log('\nMethod 4 (manual byte array):');
console.log('  PDA:', pda4.toString());
console.log('  Bump:', bump4);
console.log('  Seed bytes:', offerIdBytes);

console.log('\n\nExpected PDA from error message: Bh59PHySGkxbBvvKmaixJoFDhGCMVPNEEt6f3rkRL3hx');
